-- Complete Jaeger Spend's native Supabase source. This migration adds the
-- remaining reads and transactional/idempotent writes while keeping the
-- imported Google Sheets snapshot as historical provenance.

alter table jaeger.monthly_plan_items
  alter column source_snapshot_id drop not null,
  alter column source_row_number drop not null,
  add column if not exists source_kind text not null default 'supabase',
  add column if not exists request_id uuid references jaeger.operation_requests(request_id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists row_version bigint not null default 1;

alter table jaeger.monthly_summary_values
  alter column source_snapshot_id drop not null,
  alter column source_row_number drop not null,
  add column if not exists source_kind text not null default 'supabase',
  add column if not exists request_id uuid references jaeger.operation_requests(request_id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists row_version bigint not null default 1;

alter table jaeger.monthly_distribution_metrics
  alter column source_snapshot_id drop not null,
  alter column source_row_number drop not null,
  add column if not exists source_kind text not null default 'supabase',
  add column if not exists request_id uuid references jaeger.operation_requests(request_id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists row_version bigint not null default 1;

alter table jaeger.japan_budget_items
  alter column source_snapshot_id drop not null,
  alter column source_row_number drop not null,
  add column if not exists source_kind text not null default 'supabase',
  add column if not exists request_id uuid references jaeger.operation_requests(request_id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists row_version bigint not null default 1;

alter table jaeger.paintings_months
  alter column source_snapshot_id drop not null,
  alter column source_row_number drop not null,
  add column if not exists source_kind text not null default 'supabase',
  add column if not exists request_id uuid references jaeger.operation_requests(request_id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists row_version bigint not null default 1;

alter table jaeger.balance_log
  alter column source_snapshot_id drop not null,
  alter column source_row_number drop not null,
  add column if not exists source_kind text not null default 'supabase',
  add column if not exists request_id uuid references jaeger.operation_requests(request_id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

update jaeger.monthly_plan_items set source_kind='google_sheets' where source_snapshot_id is not null;
update jaeger.monthly_summary_values set source_kind='google_sheets' where source_snapshot_id is not null;
update jaeger.monthly_distribution_metrics set source_kind='google_sheets' where source_snapshot_id is not null;
update jaeger.japan_budget_items set source_kind='google_sheets' where source_snapshot_id is not null;
update jaeger.paintings_months set source_kind='google_sheets' where source_snapshot_id is not null;
update jaeger.balance_log set source_kind='google_sheets' where source_snapshot_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='monthly_plan_items_source_kind_check') then
    alter table jaeger.monthly_plan_items add constraint monthly_plan_items_source_kind_check
      check (source_kind in ('google_sheets','supabase'));
  end if;
  if not exists (select 1 from pg_constraint where conname='monthly_summary_values_source_kind_check') then
    alter table jaeger.monthly_summary_values add constraint monthly_summary_values_source_kind_check
      check (source_kind in ('google_sheets','supabase'));
  end if;
  if not exists (select 1 from pg_constraint where conname='monthly_distribution_metrics_source_kind_check') then
    alter table jaeger.monthly_distribution_metrics add constraint monthly_distribution_metrics_source_kind_check
      check (source_kind in ('google_sheets','supabase'));
  end if;
  if not exists (select 1 from pg_constraint where conname='japan_budget_items_source_kind_check') then
    alter table jaeger.japan_budget_items add constraint japan_budget_items_source_kind_check
      check (source_kind in ('google_sheets','supabase'));
  end if;
  if not exists (select 1 from pg_constraint where conname='paintings_months_source_kind_check') then
    alter table jaeger.paintings_months add constraint paintings_months_source_kind_check
      check (source_kind in ('google_sheets','supabase'));
  end if;
end $$;

drop trigger if exists monthly_plan_items_touch on jaeger.monthly_plan_items;
create trigger monthly_plan_items_touch before update on jaeger.monthly_plan_items
for each row execute function jaeger_private.touch_operational_row();
drop trigger if exists monthly_plan_items_audit on jaeger.monthly_plan_items;
create trigger monthly_plan_items_audit after insert or update or delete on jaeger.monthly_plan_items
for each row execute function jaeger_private.audit_operational_row('id');

drop trigger if exists monthly_summary_values_touch on jaeger.monthly_summary_values;
create trigger monthly_summary_values_touch before update on jaeger.monthly_summary_values
for each row execute function jaeger_private.touch_operational_row();
drop trigger if exists monthly_summary_values_audit on jaeger.monthly_summary_values;
create trigger monthly_summary_values_audit after insert or update or delete on jaeger.monthly_summary_values
for each row execute function jaeger_private.audit_operational_row('id');

drop trigger if exists monthly_distribution_metrics_touch on jaeger.monthly_distribution_metrics;
create trigger monthly_distribution_metrics_touch before update on jaeger.monthly_distribution_metrics
for each row execute function jaeger_private.touch_operational_row();
drop trigger if exists monthly_distribution_metrics_audit on jaeger.monthly_distribution_metrics;
create trigger monthly_distribution_metrics_audit after insert or update or delete on jaeger.monthly_distribution_metrics
for each row execute function jaeger_private.audit_operational_row('id');

drop trigger if exists japan_budget_items_touch on jaeger.japan_budget_items;
create trigger japan_budget_items_touch before update on jaeger.japan_budget_items
for each row execute function jaeger_private.touch_operational_row();
drop trigger if exists japan_budget_items_audit on jaeger.japan_budget_items;
create trigger japan_budget_items_audit after insert or update or delete on jaeger.japan_budget_items
for each row execute function jaeger_private.audit_operational_row('id');

drop trigger if exists paintings_months_audit on jaeger.paintings_months;
create trigger paintings_months_audit after insert or update or delete on jaeger.paintings_months
for each row execute function jaeger_private.audit_operational_row('month_key');

create index if not exists monthly_plan_items_month_section_name_idx
  on jaeger.monthly_plan_items (month_key, section, lower(btrim(name)));
create index if not exists catalog_items_kind_name_idx
  on jaeger.catalog_items (kind, lower(btrim(name)));
create index if not exists card_installments_card_state_idx
  on jaeger.card_installments (card_code, state);

create or replace function jaeger_private.month_start(p_value text)
returns date
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_month text := jaeger_private.normalize_month(p_value);
  v_number integer;
  v_year integer;
begin
  v_number := array_position(array['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'], split_part(v_month,' ',1));
  v_year := 2000 + right(v_month,2)::integer;
  if v_number is null then raise exception 'Mes inválido: %', p_value; end if;
  return make_date(v_year,v_number,1);
end;
$$;

create or replace function jaeger_private.month_name(p_date date)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select (array['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[extract(month from p_date)::integer]
    || ' ' || to_char(p_date,'YY')
$$;

create or replace function jaeger_private.ensure_month(p_value text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_month text := jaeger_private.normalize_month(p_value);
  v_start date := jaeger_private.month_start(p_value);
begin
  insert into jaeger.months(month_key,year,month_number,starts_on)
  values(v_month,extract(year from v_start)::smallint,extract(month from v_start)::smallint,v_start)
  on conflict(month_key) do nothing;
  return v_month;
end;
$$;

create or replace function jaeger_private.new_balance_item(
  p_type text, p_name text, p_value numeric, p_group text, p_note text, p_request_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id text := 'ITEM-' || case when p_type='Pasivo' then 'P-' else 'A-' end ||
    floor(extract(epoch from clock_timestamp())*1000)::bigint::text || '-' || left(gen_random_uuid()::text,8);
  v_order integer;
begin
  if btrim(coalesce(p_name,''))='' then raise exception 'Escribe el nombre'; end if;
  select coalesce(max(sort_order),0)+1 into v_order from jaeger.balance_items
  where balance_type=p_type and coalesce(group_name,'')=coalesce(p_group,'') and active;
  insert into jaeger.balance_items(balance_id,name,balance_type,base_value,adjustment_delta,current_value,
    group_name,sort_order,active,custom,note,source_kind,request_id,source_row_number)
  values(v_id,btrim(p_name),p_type,greatest(coalesce(p_value,0),0),0,greatest(coalesce(p_value,0),0),
    coalesce(nullif(btrim(p_group),''),case when p_type='Pasivo' then 'Préstamos' else 'Activos Financieros' end),
    v_order,true,true,nullif(btrim(coalesce(p_note,'')),''),'supabase',p_request_id,
    (select coalesce(max(source_row_number),0)+1 from jaeger.balance_items));
  return v_id;
end;
$$;

create or replace function jaeger_private.record_balance_change(
  p_balance_id text,p_name text,p_type text,p_action text,p_previous numeric,p_new numeric,p_note text,p_request_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into jaeger.balance_log(source_row_number,source_timestamp,balance_id,name,balance_type,action,
    previous_value,new_value,note,source_kind,request_id)
  values((select coalesce(max(source_row_number),0)+1 from jaeger.balance_log),
    to_char(now() at time zone 'America/Guayaquil','YYYY-MM-DD HH24:MI:SS'),p_balance_id,p_name,p_type,
    p_action,p_previous,p_new,nullif(btrim(coalesce(p_note,'')),''),'supabase',p_request_id);
end;
$$;

create or replace function jaeger_private.upsert_catalog_item(p_payload jsonb,p_request_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_kind text := lower(btrim(coalesce(p_payload->>'tipo','')));
  v_name text := btrim(coalesce(p_payload->>'nombre',''));
  v_old text := btrim(coalesce(p_payload->>'oldNombre',p_payload->>'item',v_name));
  v_state text := case when lower(coalesce(p_payload->>'estado','activo'))='inactivo' then 'inactivo' else 'activo' end;
  v_type text;
  v_balance_id text := nullif(btrim(coalesce(p_payload->>'balanceCodigo','')),'');
  v_new_balance text := nullif(btrim(coalesce(p_payload->>'balanceNombreNuevo','')),'');
  v_group text := nullif(btrim(coalesce(p_payload->>'balanceGrupo',p_payload->>'grupo','')),'');
  v_balance_name text;
  v_item jaeger.catalog_items%rowtype;
  v_id text;
  v_order integer;
begin
  if v_kind not in ('ahorro','deuda') then return jsonb_build_object('ok',true); end if;
  if v_name='' then raise exception 'Escribe el nombre'; end if;
  v_type := case when v_kind='ahorro' then 'Activo' else 'Pasivo' end;
  v_group := coalesce(v_group,case when v_type='Pasivo' then 'Préstamos' else 'Activos Financieros' end);
  if v_new_balance is not null then
    v_balance_id := jaeger_private.new_balance_item(v_type,v_new_balance,0,v_group,'Creado desde catálogo',p_request_id);
  end if;
  if v_balance_id is null and not (v_kind='deuda' and lower(v_group)=lower('Pasivos Fijos')) then
    raise exception 'Asigna un % del balance',case when v_type='Activo' then 'activo' else 'pasivo' end;
  end if;
  if v_balance_id is not null then
    select name into v_balance_name from jaeger.balance_items
    where balance_id=v_balance_id and balance_type=v_type and active for share;
    if not found then raise exception 'Destino de balance no encontrado'; end if;
  end if;
  select * into v_item from jaeger.catalog_items where kind=v_kind and lower(btrim(name))=lower(v_old)
  order by sort_order,legacy_id limit 1 for update;
  if not found then
    select * into v_item from jaeger.catalog_items where kind=v_kind and lower(btrim(name))=lower(v_name)
    order by sort_order,legacy_id limit 1 for update;
  end if;
  select coalesce(nullif((p_payload->>'orden')::integer,0),coalesce(max(sort_order),0)+1)
    into v_order from jaeger.catalog_items where kind=v_kind;
  if found and v_item.legacy_id is not null then
    update jaeger.catalog_items set name=v_name,state=v_state,balance_type=v_type,balance_id=v_balance_id,
      balance_name=v_balance_name,group_name=v_group,sort_order=coalesce(nullif((p_payload->>'orden')::integer,0),v_item.sort_order),
      note=nullif(btrim(coalesce(p_payload->>'nota','')),''),source_kind='supabase',request_id=p_request_id
    where legacy_id=v_item.legacy_id returning legacy_id into v_id;
  else
    v_id := 'CAT-'||v_kind||'-'||left(gen_random_uuid()::text,18);
    insert into jaeger.catalog_items(legacy_id,kind,name,state,balance_type,balance_id,balance_name,group_name,
      sort_order,note,source_kind,request_id,source_row_number)
    values(v_id,v_kind,v_name,v_state,v_type,v_balance_id,v_balance_name,v_group,v_order,
      nullif(btrim(coalesce(p_payload->>'nota','')),''),'supabase',p_request_id,
      (select coalesce(max(source_row_number),0)+1 from jaeger.catalog_items));
  end if;
  return jsonb_build_object('ok',true,'item',jsonb_build_object('id',v_id,'tipo',v_kind,'nombre',v_name,
    'estado',v_state,'balanceTipo',v_type,'balanceId',coalesce(v_balance_id,''),
    'balanceNombre',coalesce(v_balance_name,''),'grupo',v_group));
end;
$$;

create or replace function public.jaeger_native_read_source_extended(
  p_fn text,p_args jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_card text := upper(nullif(btrim(coalesce(p_args->>0,'')),''));
  v_result jsonb := jsonb_build_object('fn',p_fn,'args',coalesce(p_args,'[]'::jsonb),
    'generatedAt',now(),'timezone','America/Guayaquil');
begin
  if jsonb_typeof(coalesce(p_args,'[]'::jsonb))<>'array' then raise exception 'Argumentos inválidos'; end if;
  if p_fn='getCatalogoFinanciero' then
    return v_result||jsonb_build_object(
      'catalog',coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order,x.name) from (
        select legacy_id,kind,name,state,balance_type,balance_id,balance_name,group_name,sort_order,note
        from jaeger.catalog_items) x),'[]'::jsonb),
      'groups',coalesce((select jsonb_agg(to_jsonb(x) order by x.balance_type,x.sort_order) from (
        select balance_type,name,sort_order,active from jaeger.balance_groups) x),'[]'::jsonb),
      'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.balance_type,x.sort_order,x.source_row_number) from (
        select balance_id,source_row_number,name,balance_type,current_value,group_name,sort_order,active,custom
        from jaeger.balance_items) x),'[]'::jsonb),
      'cashFlow',coalesce((select jsonb_agg(to_jsonb(x) order by x.source_row_number) from (
        select source_row_number,label,monthly_values,total from jaeger.cash_flow_rows) x),'[]'::jsonb),
      'movementTotals',coalesce((select jsonb_agg(to_jsonb(x) order by x.month_number,x.kind,x.subcategory) from (
        select array_position(array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],split_part(economic_month,' ',1)) month_number,
          kind,subcategory,sum(amount) amount from jaeger.financial_movements group by 1,kind,subcategory) x),'[]'::jsonb)
    );
  elsif p_fn='getDiferidosTdc' then
    return v_result||jsonb_build_object('installments',coalesce((select jsonb_agg(to_jsonb(x) order by x.source_row_number) from (
      select legacy_id,source_row_number,card_code,name,initial_balance,installment_amount,
        installments_at_base_month,base_month,state,liquidation_month,balance_id
      from jaeger.card_installments where state='activo' and (v_card is null or card_code=v_card)) x),'[]'::jsonb));
  elsif p_fn='getNotificaciones' then
    return v_result||jsonb_build_object('notifications',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at) from (
      select notification_id,title,message,occurred_at,business_date,read_at from jaeger.notifications
      where expires_at is null or expires_at>now()) x),'[]'::jsonb));
  end if;
  raise exception 'Lectura nativa extendida no implementada: %',p_fn;
end;
$$;

revoke all on function jaeger_private.month_start(text) from public,anon,authenticated;
revoke all on function jaeger_private.month_name(date) from public,anon,authenticated;
revoke all on function jaeger_private.ensure_month(text) from public,anon,authenticated;
revoke all on function jaeger_private.new_balance_item(text,text,numeric,text,text,uuid) from public,anon,authenticated;
revoke all on function jaeger_private.record_balance_change(text,text,text,text,numeric,numeric,text,uuid) from public,anon,authenticated;
revoke all on function jaeger_private.upsert_catalog_item(jsonb,uuid) from public,anon,authenticated;
revoke all on function public.jaeger_native_read_source_extended(text,jsonb) from public,anon,authenticated;
grant execute on function jaeger_private.month_start(text) to service_role;
grant execute on function jaeger_private.month_name(date) to service_role;
grant execute on function jaeger_private.ensure_month(text) to service_role;
grant execute on function jaeger_private.new_balance_item(text,text,numeric,text,text,uuid) to service_role;
grant execute on function jaeger_private.record_balance_change(text,text,text,text,numeric,numeric,text,uuid) to service_role;
grant execute on function jaeger_private.upsert_catalog_item(jsonb,uuid) to service_role;
grant execute on function public.jaeger_native_read_source_extended(text,jsonb) to service_role;

grant select,insert,update,delete on jaeger.monthly_plan_items to service_role;
grant select,insert,update,delete on jaeger.monthly_summary_values to service_role;
grant select,insert,update,delete on jaeger.monthly_distribution_metrics to service_role;
grant select,insert,update,delete on jaeger.japan_budget_items to service_role;
grant select,insert,update,delete on jaeger.paintings_months to service_role;
grant select,insert on jaeger.balance_log to service_role;
grant usage,select on all sequences in schema jaeger to service_role;

comment on function public.jaeger_native_read_source_extended(text,jsonb) is
  'Lecturas restantes de Jaeger Spend; solo service_role y sin credenciales en el cliente.';
