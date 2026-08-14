create table if not exists public.jaeger_read_parity_checks (
  check_id bigint generated always as identity primary key,
  fn text not null,
  args jsonb not null default '[]'::jsonb,
  matches boolean not null,
  diff_count integer not null default 0,
  diff_paths jsonb not null default '[]'::jsonb,
  sheets_hash text not null,
  native_hash text not null,
  sheets_ms integer,
  native_ms integer,
  source_refreshed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.jaeger_read_parity_checks enable row level security;
alter table public.jaeger_read_parity_checks force row level security;

revoke all on table public.jaeger_read_parity_checks from public, anon, authenticated;
grant insert, select on table public.jaeger_read_parity_checks to service_role;
grant usage, select on sequence public.jaeger_read_parity_checks_check_id_seq to service_role;

create index if not exists jaeger_read_parity_checks_fn_created_idx
  on public.jaeger_read_parity_checks (fn, created_at desc);

create or replace function public.jaeger_native_read_source(
  p_fn text,
  p_args jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month text;
  v_card text;
  v_result jsonb;
begin
  if p_fn not in (
    'getMesesDisponibles', 'getMesData', 'getMovimientosMes',
    'getPinturasMes', 'getViajeJapon', 'getFlujoCaja',
    'getBalanceGeneral', 'getTarjetasState', 'parseTarjetas',
    'getMovimientosTarjeta', 'getDesgloseSub'
  ) then
    raise exception 'Lectura nativa no permitida';
  end if;

  if jsonb_typeof(coalesce(p_args, '[]'::jsonb)) <> 'array' then
    raise exception 'Argumentos invalidos';
  end if;

  v_month := nullif(btrim(coalesce(p_args ->> 0, p_args -> 0 ->> 'mes', '')), '');
  v_card := nullif(btrim(coalesce(p_args ->> 1, p_args -> 0 ->> 'tarjeta', '')), '');

  v_result := jsonb_build_object(
    'fn', p_fn,
    'args', coalesce(p_args, '[]'::jsonb),
    'generatedAt', now(),
    'timezone', 'America/Guayaquil'
  );

  if p_fn = 'getMesesDisponibles' then
    return v_result || jsonb_build_object(
      'months', coalesce((
        select jsonb_agg(month_key order by year_number, month_number)
        from (
          select distinct m.month_key,
            2000 + right(m.month_key, 2)::integer as year_number,
            array_position(
              array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
              split_part(m.month_key, ' ', 1)
            ) as month_number
          from jaeger.monthly_plan_items m
        ) months
      ), '[]'::jsonb)
    );
  end if;

  if p_fn in ('getMesData', 'getMovimientosMes', 'getDesgloseSub') then
    return v_result || jsonb_build_object(
      'month', v_month,
      'planItems', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number, x.section)
        from (
          select source_row_number, section, name, budget, actual, remaining, due_text
          from jaeger.monthly_plan_items where month_key = v_month
        ) x
      ), '[]'::jsonb),
      'summaryValues', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number)
        from (
          select source_row_number, metric, budget, actual
          from jaeger.monthly_summary_values where month_key = v_month
        ) x
      ), '[]'::jsonb),
      'distributionMetrics', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number)
        from (
          select source_row_number, metric, estimated_pct, estimated_value, actual_pct, actual_value
          from jaeger.monthly_distribution_metrics where month_key = v_month
        ) x
      ), '[]'::jsonb),
      'movements', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number)
        from (
          select legacy_id, source_row_number, recorded_at, economic_month, kind, category,
                 subcategory, amount, transaction_date, notes, cash_month
          from jaeger.financial_movements where economic_month = v_month
        ) x
      ), '[]'::jsonb),
      'cashFlow', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number)
        from (
          select source_row_number, label, monthly_values, total from jaeger.cash_flow_rows
        ) x
      ), '[]'::jsonb),
      'allMovementTotals', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.month_number, x.kind, x.subcategory)
        from (
          select array_position(
                   array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
                   split_part(economic_month, ' ', 1)
                 ) month_number,
                 economic_month, kind, subcategory, sum(amount) amount
          from jaeger.financial_movements
          group by economic_month, kind, subcategory
        ) x
      ), '[]'::jsonb)
    );
  end if;

  if p_fn = 'getPinturasMes' then
    return v_result || jsonb_build_object(
      'month', v_month,
      'painting', coalesce((
        select to_jsonb(x) from (
          select opening_stock, added_stock, current_stock, self_consumption, discounted
          from jaeger.paintings_months where month_key = v_month limit 1
        ) x
      ), '{}'::jsonb)
    );
  end if;

  if p_fn = 'getViajeJapon' then
    return v_result || jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number, x.section)
        from (
          select source_row_number, section, name, budget, actual, remaining
          from jaeger.japan_budget_items
        ) x
      ), '[]'::jsonb)
    );
  end if;

  if p_fn = 'getFlujoCaja' then
    return v_result || jsonb_build_object(
      'cashFlow', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number)
        from (select source_row_number, label, monthly_values, total from jaeger.cash_flow_rows) x
      ), '[]'::jsonb),
      'movementTotals', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.month_number, x.kind, x.subcategory)
        from (
          select array_position(
                   array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
                   split_part(economic_month, ' ', 1)
                 ) month_number,
                 kind, subcategory, sum(amount) amount
          from jaeger.financial_movements
          group by month_number, kind, subcategory
        ) x
      ), '[]'::jsonb)
    );
  end if;

  if p_fn = 'getBalanceGeneral' then
    return v_result || jsonb_build_object(
      'groups', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.balance_type, x.sort_order)
        from (select balance_type, name, sort_order, active from jaeger.balance_groups) x
      ), '[]'::jsonb),
      'items', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.balance_type, x.sort_order, x.source_row_number)
        from (
          select balance_id, source_row_number, name, balance_type, current_value,
                 group_name, sort_order, active, custom
          from jaeger.balance_items
        ) x
      ), '[]'::jsonb),
      'changes', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number desc)
        from (
          select source_row_number, source_timestamp, balance_id, name, balance_type,
                 action, previous_value, new_value, note
          from jaeger.balance_log order by source_row_number desc limit 6
        ) x
      ), '[]'::jsonb),
      'cashFlow', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number)
        from (select source_row_number, label, monthly_values, total from jaeger.cash_flow_rows) x
      ), '[]'::jsonb),
      'movementTotals', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.month_number, x.kind, x.subcategory)
        from (
          select array_position(
                   array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
                   split_part(economic_month, ' ', 1)
                 ) month_number,
                 kind, subcategory, sum(amount) amount
          from jaeger.financial_movements
          group by month_number, kind, subcategory
        ) x
      ), '[]'::jsonb)
    );
  end if;

  if p_fn in ('getTarjetasState', 'parseTarjetas', 'getMovimientosTarjeta') then
    return v_result || jsonb_build_object(
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
          where (v_card is null or card_code = v_card)
        ) x
      ), '[]'::jsonb)
    );
  end if;

  raise exception 'Lectura nativa sin implementacion';
end;
$$;

revoke all on function public.jaeger_native_read_source(text, jsonb) from public, anon, authenticated;
grant execute on function public.jaeger_native_read_source(text, jsonb) to service_role;

comment on function public.jaeger_native_read_source(text, jsonb) is
  'Fuente normalizada para lecturas nativas en modo sombra. Solo service_role; nunca se llama desde el cliente.';
