-- Self-service configuration for credit cards and goal funding.
-- Financial history remains immutable: "deleting" a card only archives it.

create table jaeger.credit_cards (
  card_code text primary key,
  display_name text not null,
  issuer text,
  last_four text not null,
  network text not null default 'other',
  card_style text not null default 'generic-card',
  active boolean not null default true,
  sort_order integer not null default 0,
  request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  constraint credit_cards_code_check check (card_code ~ '^[A-Z0-9][A-Z0-9_-]{1,15}$'),
  constraint credit_cards_name_check check (length(btrim(display_name)) between 1 and 80),
  constraint credit_cards_last_four_check check (last_four ~ '^[0-9]{4}$'),
  constraint credit_cards_network_check check (network in ('visa','mastercard','amex','diners','discover','other')),
  constraint credit_cards_style_check check (card_style in (
    'visa-card','mc-card','sky-card','emerald-card','violet-card','graphite-card','generic-card'
  )),
  constraint credit_cards_sort_order_check check (sort_order >= 0),
  constraint credit_cards_row_version_check check (row_version > 0)
);

alter table jaeger.credit_cards enable row level security;
alter table jaeger.credit_cards force row level security;
revoke all on table jaeger.credit_cards from public, anon, authenticated;
grant select, insert, update, delete on table jaeger.credit_cards to service_role;

create index credit_cards_active_order_idx
  on jaeger.credit_cards (active, sort_order, card_code);

insert into jaeger.credit_cards (
  card_code, display_name, issuer, last_four, network, card_style, active, sort_order
) values
  ('VISA', 'Visa Personal', 'Banco Internacional', '4894', 'visa', 'visa-card', true, 1),
  ('MC', 'Mastercard Gold GC', 'Banco Internacional', '9593', 'mastercard', 'mc-card', true, 2)
on conflict (card_code) do nothing;

insert into jaeger.credit_cards (
  card_code, display_name, issuer, last_four, network, card_style, active, sort_order
)
select
  codes.card_code,
  codes.card_code,
  null,
  '0000',
  'other',
  'generic-card',
  true,
  100 + row_number() over (order by codes.card_code)
from (
  select card_code from jaeger.card_events
  union
  select card_code from jaeger.card_history_monthly
  union
  select card_code from jaeger.card_installments
) codes
where codes.card_code is not null
on conflict (card_code) do nothing;

create trigger credit_cards_touch
before update on jaeger.credit_cards
for each row execute function jaeger_private.touch_operational_row();

create trigger credit_cards_audit
after insert or update or delete on jaeger.credit_cards
for each row execute function jaeger_private.audit_operational_row('card_code');

create table jaeger.goal_asset_allocations (
  goal_key text not null,
  balance_id text not null references jaeger.balance_items(balance_id) on update cascade on delete restrict,
  allocated_amount numeric(18,2) not null,
  request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  primary key (goal_key, balance_id),
  constraint goal_asset_allocations_goal_check check (goal_key in ('japan')),
  constraint goal_asset_allocations_amount_check check (allocated_amount > 0),
  constraint goal_asset_allocations_row_version_check check (row_version > 0)
);

alter table jaeger.goal_asset_allocations enable row level security;
alter table jaeger.goal_asset_allocations force row level security;
revoke all on table jaeger.goal_asset_allocations from public, anon, authenticated;
grant select, insert, update, delete on table jaeger.goal_asset_allocations to service_role;

create index goal_asset_allocations_balance_idx
  on jaeger.goal_asset_allocations (balance_id, goal_key);

create trigger goal_asset_allocations_touch
before update on jaeger.goal_asset_allocations
for each row execute function jaeger_private.touch_operational_row();

create trigger goal_asset_allocations_audit
after insert or update or delete on jaeger.goal_asset_allocations
for each row execute function jaeger_private.audit_operational_row('goal_key','balance_id');

-- Every configured card receives a zero baseline for every available month.
-- Imported history is then layered on top, followed by operational events and installments.
create or replace view jaeger.card_history_effective
with (security_invoker = true)
as
with recursive
base as (
  select
    c.card_code,
    m.year::integer as year_number,
    m.month_number::integer as month_number,
    m.month_key,
    coalesce(max(h.amount) filter (where h.concept = 'Saldo anterior'), 0)::numeric as base_previous,
    coalesce(max(h.amount) filter (where h.concept = 'Consumos'), 0)::numeric as base_charges,
    coalesce(max(h.amount) filter (where h.concept = U&'Pagos / Cr\00E9ditos'), 0)::numeric as base_payments,
    coalesce(max(h.amount) filter (where h.concept = 'Saldo Diferido'), 0)::numeric as base_deferred
  from jaeger.credit_cards c
  cross join jaeger.months m
  left join jaeger.card_history_monthly h
    on h.card_code = c.card_code
   and h.year = m.year
   and h.month_number = m.month_number
  group by c.card_code, m.year, m.month_number, m.month_key
),
events as (
  select
    e.card_code,
    m.year::integer as year_number,
    m.month_number::integer as month_number,
    coalesce(sum(e.amount) filter (where e.event_type = 'cargo'), 0)::numeric as charges,
    coalesce(sum(e.amount) filter (where e.event_type = 'abono'), 0)::numeric as payments_display,
    coalesce(sum(e.amount) filter (
      where e.event_type = 'abono' and e.installment_legacy_id is null
    ), 0)::numeric as payments_rotative
  from jaeger.card_events e
  join jaeger.months m on m.month_key = e.month_key
  group by e.card_code, m.year, m.month_number
),
prepared as (
  select
    b.*,
    row_number() over (partition by b.card_code, b.year_number order by b.month_number) as sequence_number,
    round(b.base_charges + coalesce(e.charges, 0), 2) as charges,
    round(b.base_payments + coalesce(e.payments_display, 0), 2) as payments_display,
    round(b.base_payments + coalesce(e.payments_rotative, 0), 2) as payments_rotative,
    case
      when abs(b.base_deferred) > 0.004 then
        round(greatest(0, b.base_deferred
          - coalesce(iv.imported_liquidated_offset, 0)
          + coalesce(iv.operational_deferred, 0)), 2)
      else round(coalesce(iv.full_deferred, 0), 2)
    end as deferred
  from base b
  left join events e using (card_code, year_number, month_number)
  left join lateral (
    select
      sum(x.remaining_amount) filter (where not x.stops_after_liquidation) as full_deferred,
      sum(x.remaining_amount) filter (
        where x.source_kind = 'supabase' and not x.stops_after_liquidation
      ) as operational_deferred,
      sum(x.remaining_amount) filter (
        where x.source_kind is distinct from 'supabase' and x.stops_after_liquidation
      ) as imported_liquidated_offset
    from (
      select
        i.source_kind,
        greatest(0::numeric, i.initial_balance - i.installment_amount * greatest(
          0,
          i.installments_at_base_month +
            ((b.year_number * 12 + b.month_number - 1) -
             (base_month.year * 12 + base_month.month_number - 1))
        )) as remaining_amount,
        i.state = 'liquidado'
          and liquidation_month.month_key is not null
          and (b.year_number * 12 + b.month_number - 1) >
              (liquidation_month.year * 12 + liquidation_month.month_number - 1)
          as stops_after_liquidation
      from jaeger.card_installments i
      join jaeger.months base_month on base_month.month_key = i.base_month
      left join jaeger.months liquidation_month on liquidation_month.month_key = i.liquidation_month
      where i.card_code = b.card_code
        and (b.year_number * 12 + b.month_number - 1) >=
            (base_month.year * 12 + base_month.month_number - 1) -
            greatest(0, i.installments_at_base_month - 1)
    ) x
  ) iv on true
),
calculated as (
  select
    p.card_code, p.year_number, p.month_number, p.month_key, p.sequence_number,
    round(p.base_previous, 2) as previous_balance,
    p.charges, p.payments_display, p.payments_rotative, p.deferred,
    round(p.base_previous + p.charges - p.payments_rotative, 2) as rotative
  from prepared p
  where p.sequence_number = 1

  union all

  select
    p.card_code, p.year_number, p.month_number, p.month_key, p.sequence_number,
    c.rotative, p.charges, p.payments_display, p.payments_rotative, p.deferred,
    round(c.rotative + p.charges - p.payments_rotative, 2)
  from calculated c
  join prepared p
    on p.card_code = c.card_code
   and p.year_number = c.year_number
   and p.sequence_number = c.sequence_number + 1
)
select
  c.card_code,
  c.year_number::smallint as year,
  c.month_number::smallint as month_number,
  c.month_key,
  row_value.sort_order,
  row_value.concept,
  row_value.amount::numeric(18,2) as amount
from calculated c
cross join lateral (
  values
    (1::smallint, 'Saldo anterior'::text, c.previous_balance),
    (2::smallint, 'Consumos'::text, c.charges),
    (3::smallint, U&'Pagos / Cr\00E9ditos'::text, c.payments_display),
    (4::smallint, 'Total/ Saldo Rotativo'::text, c.rotative),
    (5::smallint, 'Saldo Diferido'::text, c.deferred),
    (6::smallint, 'Saldo Real'::text, round(c.rotative + c.deferred, 2))
) as row_value(sort_order, concept, amount);

revoke all on table jaeger.card_history_effective from public, anon, authenticated;
grant select on table jaeger.card_history_effective to service_role;

create or replace function public.jaeger_card_read_source(
  p_fn text,
  p_args jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_card text;
  v_result jsonb;
begin
  if p_fn not in ('getTarjetasState','parseTarjetas','getMovimientosTarjeta') then
    raise exception 'Lectura de tarjetas no permitida';
  end if;
  if jsonb_typeof(coalesce(p_args, '[]'::jsonb)) <> 'array' then
    raise exception 'Argumentos invalidos';
  end if;
  v_card := nullif(btrim(coalesce(p_args ->> 1, p_args -> 0 ->> 'tarjeta', '')), '');
  v_result := jsonb_build_object(
    'fn', p_fn,
    'args', coalesce(p_args, '[]'::jsonb),
    'generatedAt', now(),
    'timezone', 'America/Guayaquil'
  );
  return v_result || jsonb_build_object(
    'cards', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order, x.card_code)
      from (
        select card_code, display_name, issuer, last_four, network, card_style, active, sort_order
        from jaeger.credit_cards where active
      ) x
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.card_code, x.year, x.month_number, x.sort_order)
      from (
        select card_code, year, month_number, month_key, sort_order, concept, amount
        from jaeger.card_history_effective
      ) x
    ), '[]'::jsonb),
    'installments', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.card_code, x.source_row_number)
      from (
        select legacy_id, source_row_number, card_code, name, initial_balance,
               installment_amount, installments_at_base_month, base_month, state,
               liquidation_month, balance_id
        from jaeger.card_installments
      ) x
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.source_row_number)
      from (
        select legacy_id, source_row_number, recorded_at, month_key, card_code,
               event_type, amount, transaction_date, notes, origin,
               movement_legacy_id, category, subcategory, charge_legacy_id,
               installment_legacy_id
        from jaeger.card_events
        where v_card is null or card_code = v_card
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.jaeger_card_read_source(text,jsonb) from public, anon, authenticated;
grant execute on function public.jaeger_card_read_source(text,jsonb) to service_role;

create or replace function public.jaeger_goal_read_source(
  p_fn text,
  p_args jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_fn <> 'getViajeJapon' then
    raise exception 'Lectura de meta no permitida';
  end if;
  return jsonb_build_object(
    'fn', p_fn,
    'args', coalesce(p_args, '[]'::jsonb),
    'generatedAt', now(),
    'timezone', 'America/Guayaquil',
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.source_row_number, x.section)
      from (
        select source_row_number, section, name, budget, actual, remaining
        from jaeger.japan_budget_items
      ) x
    ), '[]'::jsonb),
    'allocations', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.asset_name, x.balance_id)
      from (
        select
          a.balance_id,
          b.name as asset_name,
          b.group_name,
          a.allocated_amount,
          b.current_value as asset_value,
          b.active as asset_active,
          case when b.active then least(a.allocated_amount, greatest(b.current_value, 0)) else 0 end
            as effective_amount
        from jaeger.goal_asset_allocations a
        join jaeger.balance_items b on b.balance_id = a.balance_id
        where a.goal_key = 'japan'
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.jaeger_goal_read_source(text,jsonb) from public, anon, authenticated;
grant execute on function public.jaeger_goal_read_source(text,jsonb) to service_role;

create or replace function public.jaeger_configuration_source(
  p_fn text,
  p_args jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_fn <> 'getConfiguracion' then
    raise exception 'Lectura de configuracion no permitida';
  end if;
  return jsonb_build_object(
    'fn', p_fn,
    'args', coalesce(p_args, '[]'::jsonb),
    'generatedAt', now(),
    'timezone', 'America/Guayaquil',
    'activeSource', 'supabase',
    'cards', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order, x.card_code)
      from (
        select card_code, display_name, issuer, last_four, network, card_style,
               active, sort_order, row_version
        from jaeger.credit_cards
      ) x
    ), '[]'::jsonb),
    'assets', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.group_name, x.sort_order, x.asset_name)
      from (
        select
          b.balance_id,
          b.name as asset_name,
          b.group_name,
          b.current_value as asset_value,
          b.active as asset_active,
          b.sort_order
        from jaeger.balance_items b
        where b.balance_type = 'Activo'
          and (b.active or exists (
            select 1 from jaeger.goal_asset_allocations a where a.balance_id = b.balance_id
          ))
      ) x
    ), '[]'::jsonb),
    'allocations', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.balance_id)
      from (
        select
          a.goal_key,
          a.balance_id,
          a.allocated_amount,
          case when b.active then least(a.allocated_amount, greatest(b.current_value, 0)) else 0 end
            as effective_amount
        from jaeger.goal_asset_allocations a
        join jaeger.balance_items b on b.balance_id = a.balance_id
        where a.goal_key = 'japan'
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.jaeger_configuration_source(text,jsonb) from public, anon, authenticated;
grant execute on function public.jaeger_configuration_source(text,jsonb) to service_role;

create or replace function public.jaeger_config_write(
  p_operation text,
  p_request_id uuid,
  p_payload_hash text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_allowed constant text[] := array[
    'guardarTarjetaConfiguracion','eliminarTarjetaConfiguracion',
    'ordenarTarjetaConfiguracion','guardarAsignacionMeta'
  ];
  v_existing jaeger.operation_requests%rowtype;
  v_card jaeger.credit_cards%rowtype;
  v_neighbor jaeger.credit_cards%rowtype;
  v_asset jaeger.balance_items%rowtype;
  v_result jsonb := jsonb_build_object('ok', true);
  v_code text;
  v_name text;
  v_issuer text;
  v_last_four text;
  v_network text;
  v_style text;
  v_goal text;
  v_balance_id text;
  v_amount numeric;
  v_order integer;
  v_direction integer;
  v_active boolean;
  v_linked_events integer;
  v_linked_installments integer;
begin
  if not (p_operation = any(v_allowed)) then
    raise exception 'Escritura de configuracion no implementada: %', p_operation;
  end if;
  if p_request_id is null or btrim(coalesce(p_payload_hash, '')) = '' then
    raise exception 'Falta la clave de idempotencia';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Carga de configuracion invalida';
  end if;

  insert into jaeger.operation_requests(request_id, operation, payload_hash, status)
  values (p_request_id, p_operation, p_payload_hash, 'pending')
  on conflict (request_id) do nothing;
  select * into v_existing
  from jaeger.operation_requests
  where request_id = p_request_id
  for update;
  if v_existing.operation <> p_operation or v_existing.payload_hash <> p_payload_hash then
    raise exception 'La clave de idempotencia ya fue usada con otra operacion';
  end if;
  if v_existing.status = 'completed' then
    return v_existing.response;
  end if;
  perform set_config('jaeger.request_id', p_request_id::text, true);

  if p_operation = 'guardarTarjetaConfiguracion' then
    v_code := upper(btrim(coalesce(p_payload ->> 'codigo', '')));
    v_name := btrim(coalesce(p_payload ->> 'nombre', ''));
    v_issuer := nullif(btrim(coalesce(p_payload ->> 'emisor', '')), '');
    v_last_four := regexp_replace(coalesce(p_payload ->> 'ultimos4', ''), '\D', '', 'g');
    v_network := lower(btrim(coalesce(p_payload ->> 'red', 'other')));
    v_style := lower(btrim(coalesce(p_payload ->> 'estilo', 'generic-card')));
    v_active := coalesce((p_payload ->> 'activo')::boolean, true);
    if v_code !~ '^[A-Z0-9][A-Z0-9_-]{1,15}$' then
      raise exception 'El codigo debe tener entre 2 y 16 letras, numeros, guion o guion bajo';
    end if;
    if length(v_name) < 1 or length(v_name) > 80 then
      raise exception 'Escribe un nombre valido para la tarjeta';
    end if;
    if v_last_four !~ '^[0-9]{4}$' then
      raise exception 'Los ultimos cuatro digitos son obligatorios';
    end if;
    if v_network not in ('visa','mastercard','amex','diners','discover','other') then
      raise exception 'Red de tarjeta no valida';
    end if;
    if v_style not in ('visa-card','mc-card','sky-card','emerald-card','violet-card','graphite-card','generic-card') then
      raise exception 'Estilo de tarjeta no valido';
    end if;
    select * into v_card from jaeger.credit_cards where card_code = v_code for update;
    if found then
      update jaeger.credit_cards
      set display_name = v_name,
          issuer = v_issuer,
          last_four = v_last_four,
          network = v_network,
          card_style = v_style,
          active = v_active,
          request_id = p_request_id
      where card_code = v_code;
    else
      select coalesce(max(sort_order), 0) + 1 into v_order from jaeger.credit_cards;
      insert into jaeger.credit_cards (
        card_code, display_name, issuer, last_four, network, card_style,
        active, sort_order, request_id
      ) values (
        v_code, v_name, v_issuer, v_last_four, v_network, v_style,
        true, v_order, p_request_id
      );
    end if;
    v_result := jsonb_build_object('ok', true, 'codigo', v_code, 'activo', v_active);

  elsif p_operation = 'eliminarTarjetaConfiguracion' then
    v_code := upper(btrim(coalesce(p_payload ->> 'codigo', '')));
    select * into v_card from jaeger.credit_cards where card_code = v_code for update;
    if not found then raise exception 'Tarjeta no encontrada'; end if;
    if v_card.active and (select count(*) from jaeger.credit_cards where active) <= 1 then
      raise exception 'Debe permanecer al menos una tarjeta activa';
    end if;
    select count(*) into v_linked_events from jaeger.card_events where card_code = v_code;
    select count(*) into v_linked_installments from jaeger.card_installments where card_code = v_code;
    update jaeger.credit_cards
    set active = false, request_id = p_request_id
    where card_code = v_code;
    v_result := jsonb_build_object(
      'ok', true,
      'codigo', v_code,
      'archivada', true,
      'eventosConservados', v_linked_events,
      'diferidosConservados', v_linked_installments
    );

  elsif p_operation = 'ordenarTarjetaConfiguracion' then
    v_code := upper(btrim(coalesce(p_payload ->> 'codigo', '')));
    v_direction := case when coalesce((p_payload ->> 'direccion')::integer, 1) < 0 then -1 else 1 end;
    select * into v_card from jaeger.credit_cards where card_code = v_code for update;
    if not found then raise exception 'Tarjeta no encontrada'; end if;
    if v_direction < 0 then
      select * into v_neighbor
      from jaeger.credit_cards
      where active and (sort_order < v_card.sort_order or (sort_order = v_card.sort_order and card_code < v_card.card_code))
      order by sort_order desc, card_code desc limit 1 for update;
    else
      select * into v_neighbor
      from jaeger.credit_cards
      where active and (sort_order > v_card.sort_order or (sort_order = v_card.sort_order and card_code > v_card.card_code))
      order by sort_order, card_code limit 1 for update;
    end if;
    if found then
      update jaeger.credit_cards set sort_order = v_neighbor.sort_order, request_id = p_request_id
      where card_code = v_card.card_code;
      update jaeger.credit_cards set sort_order = v_card.sort_order, request_id = p_request_id
      where card_code = v_neighbor.card_code;
    end if;
    v_result := jsonb_build_object('ok', true, 'codigo', v_code);

  elsif p_operation = 'guardarAsignacionMeta' then
    v_goal := lower(btrim(coalesce(p_payload ->> 'meta', 'japan')));
    v_balance_id := btrim(coalesce(p_payload ->> 'balanceCodigo', ''));
    v_amount := round(greatest(replace(btrim(coalesce(p_payload ->> 'monto', '0')), ',', '.')::numeric, 0), 2);
    if v_goal <> 'japan' then raise exception 'Meta no permitida'; end if;
    if v_balance_id = '' then raise exception 'Selecciona un activo'; end if;
    if v_amount <= 0 then
      delete from jaeger.goal_asset_allocations
      where goal_key = v_goal and balance_id = v_balance_id;
      v_result := jsonb_build_object('ok', true, 'meta', v_goal, 'balanceCodigo', v_balance_id, 'eliminada', true);
    else
      select * into v_asset
      from jaeger.balance_items
      where balance_id = v_balance_id and balance_type = 'Activo' and active
      for update;
      if not found then raise exception 'Activo no encontrado o inactivo'; end if;
      if v_amount - v_asset.current_value > 0.004 then
        raise exception 'La asignacion no puede superar el valor actual del activo (%)', v_asset.current_value;
      end if;
      insert into jaeger.goal_asset_allocations (
        goal_key, balance_id, allocated_amount, request_id
      ) values (
        v_goal, v_balance_id, v_amount, p_request_id
      )
      on conflict (goal_key, balance_id) do update
      set allocated_amount = excluded.allocated_amount,
          request_id = excluded.request_id;
      v_result := jsonb_build_object(
        'ok', true,
        'meta', v_goal,
        'balanceCodigo', v_balance_id,
        'monto', v_amount
      );
    end if;
  end if;

  update jaeger.operation_requests
  set status = 'completed', response = v_result, error_message = null,
      completed_at = now(), updated_at = now()
  where request_id = p_request_id;
  perform public.jaeger_invalidate_api_cache();
  return v_result;
end;
$$;

revoke all on function public.jaeger_config_write(text,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.jaeger_config_write(text,uuid,text,jsonb)
  to service_role;

update jaeger.system_settings
set setting_value = jsonb_set(
  jsonb_set(
    setting_value,
    '{native_read_operations}',
    coalesce(setting_value -> 'native_read_operations', '[]'::jsonb) || '"getConfiguracion"'::jsonb,
    true
  ),
  '{native_write_operations}',
  coalesce(setting_value -> 'native_write_operations', '[]'::jsonb) ||
    '["guardarTarjetaConfiguracion","eliminarTarjetaConfiguracion","ordenarTarjetaConfiguracion","guardarAsignacionMeta"]'::jsonb,
  true
)
where setting_key in ('migration.state','native_read.state');

update jaeger.system_settings
set setting_value = jsonb_set(
  setting_value,
  '{operations}',
  coalesce(setting_value -> 'operations', '[]'::jsonb) ||
    '["guardarTarjetaConfiguracion","eliminarTarjetaConfiguracion","ordenarTarjetaConfiguracion","guardarAsignacionMeta"]'::jsonb,
  true
)
where setting_key = 'native_write.state';

comment on table jaeger.credit_cards is
  'Catalogo administrable de tarjetas. Archivar conserva eventos, diferidos e historia financiera.';
comment on table jaeger.goal_asset_allocations is
  'Montos de activos del Balance destinados a metas; no duplican ni mueven dinero.';
comment on function public.jaeger_config_write(text,uuid,text,jsonb) is
  'Configuracion autoservicio transaccional e idempotente, exclusiva de service_role.';

do $$
begin
  perform public.jaeger_invalidate_api_cache();
end;
$$;
