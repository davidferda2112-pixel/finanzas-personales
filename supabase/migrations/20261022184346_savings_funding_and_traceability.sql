-- Snapshot legacy effects BEFORE correcting text classification. Never replay imports.
alter table jaeger.financial_movements
  add column operation_code text not null default 'legacy',
  add column funding_source text not null default 'monthly_income',
  add column source_asset_id text references jaeger.balance_items(balance_id),
  add column destination_asset_id text references jaeger.balance_items(balance_id),
  add column principal_amount numeric(16,2) not null default 0,
  add column interest_amount numeric(16,2) not null default 0,
  add column applied_impacts jsonb not null default '[]',
  add column reconciliation_state text not null default 'pending';
update jaeger.financial_movements m set applied_impacts =
  case when m.balance_id is not null and m.source_kind='supabase' then
    case when jaeger_private.stored_movement_sign(m.kind,m.subcategory,m.balance_id)<>0
      then jsonb_build_array(jsonb_build_object('id',m.balance_id,'delta',
        m.amount*jaeger_private.stored_movement_sign(m.kind,m.subcategory,m.balance_id))) else '[]'::jsonb end
    || case when m.kind='deuda' and m.balance_id='2010401.3'
      then jsonb_build_array(jsonb_build_object('id','10102.06','delta',m.amount)) else '[]'::jsonb end
  else '[]'::jsonb end;
create table jaeger.funding_operations (
  operation_id uuid primary key default gen_random_uuid(),
  source_movement_id text references jaeger.financial_movements(legacy_id) on delete set null,
  source_asset_id text references jaeger.balance_items(balance_id),
  destination_asset_id text references jaeger.balance_items(balance_id),
  operation_code text not null,
  amount numeric(16,2) not null check(amount>0),
  economic_date date,
  state text not null check(state in ('reconciled','adjusted','partial','pending','cancelled')),
  note text not null default '',
  evidence jsonb not null default '{}',
  request_id uuid,
  created_at timestamptz not null default now()
);
create table jaeger.funding_allocations (
  allocation_id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references jaeger.funding_operations(operation_id),
  movement_id text references jaeger.financial_movements(legacy_id),
  amount numeric(16,2) not null check(amount>0),
  category text not null,
  note text not null default '',
  unique(operation_id,movement_id)
);
create index funding_operations_movement_idx on jaeger.funding_operations(source_movement_id);
create index funding_operations_source_idx on jaeger.funding_operations(source_asset_id);
create index funding_operations_destination_idx on jaeger.funding_operations(destination_asset_id);
create index funding_allocations_movement_idx on jaeger.funding_allocations(movement_id);
create index financial_movements_source_idx on jaeger.financial_movements(source_asset_id);
create index financial_movements_destination_idx on jaeger.financial_movements(destination_asset_id);
alter table jaeger.funding_operations enable row level security;
alter table jaeger.funding_allocations enable row level security;
revoke all on jaeger.funding_operations,jaeger.funding_allocations from public,anon,authenticated;
grant all on jaeger.funding_operations,jaeger.funding_allocations to service_role;
create trigger audit_funding_operations after insert or update or delete on jaeger.funding_operations
  for each row execute function jaeger_private.audit_operational_row('operation_id');
create trigger audit_funding_allocations after insert or update or delete on jaeger.funding_allocations
  for each row execute function jaeger_private.audit_operational_row('allocation_id');

alter table jaeger.balance_log
  add column movement_id text,
  add column operation_id uuid references jaeger.funding_operations(operation_id),
  add column reconciliation_state text not null default 'pending';
create index balance_log_movement_idx on jaeger.balance_log(movement_id);
create index balance_log_operation_idx on jaeger.balance_log(operation_id);
create index balance_log_period_idx on jaeger.balance_log(created_at desc);

-- Legacy labels are normalized ONLY at the input boundary. Stored operation codes are ASCII.
create or replace function jaeger_private.financial_label(p_text text) returns text
language plpgsql immutable set search_path='' as $$
declare v text:=coalesce(p_text,'');
begin
  v:=replace(replace(replace(replace(replace(replace(v,'Ã³','ó'),'Ã©','é'),'Ã¡','á'),'Ã­','í'),'Ãº','ú'),'Ã±','ñ');
  return regexp_replace(normalize(lower(btrim(v)),NFD),U&'[\0300-\036f]','','g');
end $$;
create or replace function jaeger_private.movement_code(p_kind text,p_sub text,p_balance text)
returns text language sql immutable set search_path='' as $$
select case
 when p_sub in ('savings_withdrawal','loan_received','loan_collection') then p_sub
 when p_kind='ingreso' and jaeger_private.financial_label(p_sub)='devolucion de ahorro' then 'savings_withdrawal'
 when p_kind='ingreso' and jaeger_private.financial_label(p_sub)='prestamos recibidos' then 'loan_received'
 when p_kind='ingreso' and jaeger_private.financial_label(p_sub)='cobro prestamos' then 'loan_collection'
 when p_kind='ahorro' then 'savings_contribution'
 when p_kind='deuda' then 'debt_payment'
 when p_kind='necesidad' and p_balance is not null then 'asset_contribution'
 else 'ordinary' end
$$;
create or replace function jaeger_private.stored_movement_sign(p_kind text,p_subcategory text,p_balance_id text)
returns numeric language sql immutable set search_path='' as $$
select case when nullif(btrim(p_balance_id),'') is null then 0 else
 case jaeger_private.movement_code(p_kind,p_subcategory,p_balance_id)
 when 'savings_contribution' then 1 when 'asset_contribution' then 1
 when 'debt_payment' then -1 when 'savings_withdrawal' then -1
 when 'loan_received' then 1 when 'loan_collection' then -1 else 0 end end
$$;
-- Prevent concurrent allocations from exceeding either the source or the real expense.
create or replace function jaeger_private.validate_funding_allocation() returns trigger
language plpgsql set search_path='' as $$
declare v_limit numeric; v_used numeric;
begin
  perform pg_advisory_xact_lock(74123581);
  select amount into v_limit from jaeger.funding_operations where operation_id=new.operation_id for update;
  select coalesce(sum(amount),0) into v_used from jaeger.funding_allocations
    where operation_id=new.operation_id and allocation_id<>new.allocation_id;
  if v_used+new.amount>v_limit then raise exception 'La distribución supera el origen'; end if;
  if new.movement_id is not null then
    select amount into v_limit from jaeger.financial_movements where legacy_id=new.movement_id for update;
    select coalesce(sum(a.amount),0) into v_used from jaeger.funding_allocations a
      join jaeger.funding_operations o using(operation_id)
      where a.movement_id=new.movement_id and a.allocation_id<>new.allocation_id and o.state<>'cancelled';
    if v_used+new.amount>v_limit then raise exception 'La financiación supera el gasto'; end if;
  end if;
  return new;
end $$;
create trigger validate_allocation before insert or update on jaeger.funding_allocations
 for each row execute function jaeger_private.validate_funding_allocation();

-- All balance changes carry before/after evidence; request context links them to the transaction.
create or replace function jaeger_private.apply_balance_delta(p_balance_id text,p_delta numeric,p_request_id uuid)
returns void language plpgsql set search_path='' as $$
declare v jaeger.balance_items%rowtype;
begin
  if p_balance_id is null or p_delta=0 then return; end if;
  if p_delta is null or p_delta::text in ('NaN','Infinity','-Infinity') then raise exception 'Importe inválido'; end if;
  select * into v from jaeger.balance_items where balance_id=p_balance_id for update;
  if not found or not v.active then raise exception 'Cuenta no disponible: %',p_balance_id; end if;
  if v.current_value+p_delta<0 then raise exception 'Saldo insuficiente en %',v.name; end if;
  update jaeger.balance_items set adjustment_delta=adjustment_delta+p_delta,
    current_value=current_value+p_delta,request_id=p_request_id where balance_id=p_balance_id;
  insert into jaeger.balance_log(source_row_number,source_timestamp,balance_id,name,balance_type,action,
    previous_value,new_value,note,source_kind,request_id,movement_id,reconciliation_state)
  values((select coalesce(max(source_row_number),0)+1 from jaeger.balance_log),
    to_char(now() at time zone 'America/Guayaquil','YYYY-MM-DD HH24:MI:SS'),v.balance_id,v.name,v.balance_type,
    coalesce(nullif(current_setting('jaeger.operation_code',true),''),'automatic'),
    v.current_value,v.current_value+p_delta,nullif(current_setting('jaeger.operation_note',true),''),
    'supabase',p_request_id,nullif(current_setting('jaeger.movement_id',true),''),'reconciled');
end $$;

create or replace function jaeger_private.execute_impacts(p_impacts jsonb,p_direction numeric,p_request uuid)
returns void language plpgsql set search_path='' as $$
declare v record;
begin
  if p_direction not in (-1,1) then raise exception 'Dirección inválida'; end if;
  perform 1 from jaeger.balance_items where balance_id in
    (select x->>'id' from jsonb_array_elements(p_impacts) x) order by balance_id for update;
  for v in select x->>'id' as id,sum((x->>'delta')::numeric)*p_direction as delta
      from jsonb_array_elements(p_impacts) x group by 1 order by 1 loop
    perform jaeger_private.apply_balance_delta(v.id,v.delta,p_request);
  end loop;
end $$;
CREATE OR REPLACE FUNCTION jaeger_private.resolve_movement_effect(p_payload jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_kind text := lower(btrim(coalesce(p_payload->>'tipo', '')));
  v_sub text := btrim(coalesce(p_payload->>'subcategoria', ''));
  v_balance_code text := nullif(btrim(coalesce(p_payload->>'balanceCodigo', '')), '');
  v_new_name text := nullif(btrim(coalesce(p_payload->>'balanceNombreNuevo', '')), '');
  v_item record;
  v_balance record;
  v_sign numeric := 0;
  v_op text;
begin
  if v_kind not in ('ingreso','necesidad','deseo','deuda','ahorro') then
    raise exception 'Tipo de movimiento invÃ¡lido';
  end if;
  if v_sub = '' then raise exception 'SubcategorÃ­a requerida'; end if;

  if v_kind in ('ahorro','deuda') then
    select * into v_item
    from jaeger.catalog_items
    where kind = v_kind and state = 'activo' and lower(btrim(name)) = lower(v_sub)
    order by sort_order, legacy_id
    limit 1;
    if not found then
      raise exception 'No existe una asignaciÃ³n activa para %: %', v_kind, v_sub;
    end if;
    v_balance_code := v_item.balance_id;
    if v_balance_code is null and lower(coalesce(v_item.group_name,'')) = lower('Pasivos Fijos') then
      return jsonb_build_object('balanceId', null, 'balanceType', coalesce(v_item.balance_type,''),
        'balanceName', coalesce(v_item.balance_name,v_sub), 'balanceGroup', coalesce(v_item.group_name,''),
        'sign', 0, 'op', case when v_kind='ahorro' then 'activo' else 'pasivo' end);
    end if;
    v_sign := case when v_kind='ahorro' then 1 else -1 end;
  elsif v_kind = 'necesidad' and v_balance_code is not null then
    if (jaeger_private.financial_label(v_sub),v_balance_code) not in (('aporte seguro','10101.06'),('aporte caja','10101.01')) then raise exception 'Usa Gasto desde ahorros para consumir un activo'; end if;
    v_sign := 1;
  elsif jaeger_private.movement_code(v_kind,v_sub,v_balance_code) = 'loan_collection' then
    if v_balance_code is not null then v_sign := -1; end if;
  elsif v_kind = 'ingreso' and jaeger_private.movement_code(v_kind,v_sub,v_balance_code) = 'savings_withdrawal' then
    if v_balance_code is null then raise exception 'Selecciona el ahorro de origen'; end if;
    v_sign := -1;
  elsif v_kind = 'ingreso' and jaeger_private.movement_code(v_kind,v_sub,v_balance_code) = 'loan_received' then
    if v_new_name is not null then
      insert into jaeger.balance_items (
        name, balance_type, base_value, adjustment_delta, current_value, group_name,
        sort_order, active, custom, note, source_kind, request_id, source_row_number
      ) values (
        v_new_name, 'Pasivo', 0, 0, 0,
        coalesce(nullif(btrim(p_payload->>'balanceGrupoNuevo'),''), 'PrÃ©stamos'),
        (select coalesce(max(sort_order),0)+1 from jaeger.balance_items where balance_type='Pasivo'),
        true, true, 'Creado desde PrÃ©stamos recibidos', 'supabase', p_request_id,
        (select coalesce(max(source_row_number),1)+1 from jaeger.balance_items)
      ) returning balance_id into v_balance_code;
    end if;
    if v_balance_code is null then raise exception 'Selecciona o crea el pasivo de destino'; end if;
    v_sign := 1;
  end if;

  if v_balance_code is null then
    return jsonb_build_object('balanceId', null, 'balanceType', null, 'balanceName', null,
      'balanceGroup', null, 'sign', 0, 'op', null);
  end if;
  select balance_id, name, balance_type, group_name into v_balance
  from jaeger.balance_items where balance_id = v_balance_code and active;
  if not found then raise exception 'Balance activo no encontrado: %', v_balance_code; end if;
  if v_kind in ('ahorro','necesidad') or (v_kind='ingreso' and jaeger_private.movement_code(v_kind,v_sub,v_balance_code) = 'savings_withdrawal') then
    if v_balance.balance_type <> 'Activo' then raise exception 'El balance seleccionado debe ser Activo'; end if;
  end if;
  if jaeger_private.movement_code(v_kind,v_sub,v_balance_code)='loan_collection' and v_balance.balance_type<>'Activo' then raise exception 'Selecciona la cuenta por cobrar'; end if;
  if v_kind='deuda' or (v_kind='ingreso' and jaeger_private.movement_code(v_kind,v_sub,v_balance_code) = 'loan_received') then
    if v_balance.balance_type <> 'Pasivo' then raise exception 'El balance seleccionado debe ser Pasivo'; end if;
  end if;
  v_op := case when v_balance.balance_type='Activo' then 'activo' else 'pasivo' end;
  return jsonb_build_object('balanceId',v_balance.balance_id,'balanceType',v_balance.balance_type,
    'balanceName',v_balance.name,'balanceGroup',coalesce(v_balance.group_name,''),'sign',v_sign,'op',v_op);
end;
$function$;

create or replace function jaeger_private.save_financed_movement(p_payload jsonb,p_request_id uuid,p_id text,p_update boolean)
returns jsonb language plpgsql set search_path='' as $$
declare
 v_old jaeger.financial_movements%rowtype;
 v_kind text:=lower(btrim(coalesce(p_payload->>'tipo','')));
 v_sub text:=btrim(coalesce(p_payload->>'subcategoria',''));
 v_amount numeric:=replace(coalesce(p_payload->>'monto','0'),',','.')::numeric;
 v_interest numeric:=replace(coalesce(nullif(p_payload->>'interestAmount',''),'0'),',','.')::numeric;
 v_principal numeric:=0;
 v_date date:=nullif(p_payload->>'fecha','')::date;
 v_month text:=jaeger_private.normalize_month(p_payload->>'mes');
 v_cash text;
 v_code text;
 v_source text:=nullif(p_payload->>'sourceAssetId','');
 v_destination text:=nullif(p_payload->>'destinationAssetId','');
 v_balance text; v_effect jsonb; v_impacts jsonb:='[]'; v_op uuid;
 v_item jaeger.balance_items%rowtype; v_funding text:='monthly_income';
 v_result jsonb; v_legacy jsonb;
begin
 perform pg_advisory_xact_lock(74123581);
 if p_update then
   select * into v_old from jaeger.financial_movements where legacy_id=p_id for update;
   if not found then raise exception 'Movimiento no encontrado'; end if;
   if exists(select 1 from jaeger.funding_operations where source_movement_id=p_id and evidence->>'historical'='true') then
     raise exception 'Esta corrección histórica está documentada; requiere conciliación de sus destinos'; end if;
 end if;
 if v_amount is null or v_amount::text in ('NaN','Infinity','-Infinity') or v_amount<=0
   or v_amount<>round(v_amount,2) or v_amount>=100000000000000 then raise exception 'Usa un importe positivo con máximo dos decimales'; end if;
 if v_interest is null or v_interest::text in ('NaN','Infinity','-Infinity') or v_interest<0
   or v_interest>v_amount or v_interest<>round(v_interest,2) then raise exception 'Intereses inválidos'; end if;
 if v_date is null then raise exception 'Fecha requerida'; end if;
 v_cash:=jaeger_private.normalize_month(coalesce(nullif(p_payload->>'mesRegistro',''),jaeger_private.month_from_date(v_date)));
 if not exists(select 1 from jaeger.months where month_key=v_month)
    or not exists(select 1 from jaeger.months where month_key=v_cash) then raise exception 'Mes no disponible'; end if;
 if v_kind not in ('ingreso','necesidad','deseo','deuda','ahorro') or v_sub='' then raise exception 'Tipo y subcategoría requeridos'; end if;

 v_code:=coalesce(nullif(p_payload->>'operationCode',''),
   case when p_update and v_old.funding_source='savings' then v_old.operation_code end,'');
 if v_code in ('savings_expense','savings_debt_payment') then
   v_source:=coalesce(v_source,v_old.source_asset_id);
   v_funding:='savings';
   if v_kind not in ('necesidad','deseo','deuda') then raise exception 'Selecciona necesidad, deseo o deuda'; end if;
   if v_kind in ('necesidad','deseo') and not exists(select 1 from jaeger.monthly_plan_items
       where section=v_kind and jaeger_private.financial_label(name)=jaeger_private.financial_label(v_sub))
       and v_sub not in ('Plan Celular','Aporte Seguro','Aporte caja','Comida Diaria','Salud','Transporte',
         'Arriendo','Internet','Pinturas','Comida Fuera','Ropa','Gastos Familia','Fútbol','Entretenimiento',
         'Cerveza','Tabaco','Gastos Bancarios','Gasolina','Pagos Tienda','Gastos personales') then
     raise exception 'Categoría de gasto no disponible'; end if;
   v_code:=case when v_kind='deuda' then 'savings_debt_payment' else 'savings_expense' end;
   if v_kind<>'deuda' and v_interest<>0 then raise exception 'Solo las deudas admiten intereses'; end if;
   select * into v_item from jaeger.balance_items where balance_id=v_source and active and balance_type='Activo' for update;
   if not found or v_source='10101.05' or jaeger_private.financial_label(v_item.group_name) not in
     ('efectivo y equivalentes','activos financieros') then raise exception 'Selecciona un activo de ahorro elegible'; end if;
   v_impacts:=jsonb_build_array(jsonb_build_object('id',v_source,'delta',-v_amount));
   if v_kind='deuda' then
     v_balance:=coalesce(nullif(p_payload->>'balanceCodigo',''),v_old.balance_id,
       (select balance_id from jaeger.catalog_items where kind='deuda' and state='activo' and
         jaeger_private.financial_label(name)=jaeger_private.financial_label(v_sub) order by legacy_id limit 1));
     select * into v_item from jaeger.balance_items where balance_id=v_balance and active and balance_type='Pasivo' for update;
     if not found then raise exception 'Selecciona el pasivo a pagar'; end if;
     if v_balance='2010401.3' and v_source='10102.06' then
       raise exception 'Para Devolución Terreno selecciona un origen distinto de Pago Terreno'; end if;
     v_principal:=v_amount-v_interest;
     if v_principal>0 then
       v_impacts:=v_impacts||jsonb_build_array(jsonb_build_object('id',v_balance,'delta',-v_principal));
       if v_balance='2010401.3' then
         v_impacts:=v_impacts||jsonb_build_array(jsonb_build_object('id','10102.06','delta',v_principal));
       end if;
     end if;
   end if;
 elsif v_code in ('asset_transfer','savings_withdrawal') and v_source is not null then
   if v_destination is null or v_destination=v_source then raise exception 'Selecciona una cuenta de destino distinta'; end if;
   if v_interest<>0 then raise exception 'Registra las comisiones por separado'; end if;
   if (select count(*) from jaeger.balance_items where balance_id in (v_source,v_destination)
       and active and balance_type='Activo' and balance_id<>'10101.05')<>2 then
     raise exception 'Origen y destino deben ser activos disponibles'; end if;
   v_kind:='ingreso'; v_funding:='asset_transfer'; v_balance:=v_source;
   v_impacts:=jsonb_build_array(jsonb_build_object('id',v_source,'delta',-v_amount),
                              jsonb_build_object('id',v_destination,'delta',v_amount));
 else
   if v_code not in ('','ordinary','savings_contribution','debt_payment','asset_contribution',
       'savings_withdrawal','loan_received','loan_collection') then raise exception 'Operación no permitida'; end if;
   v_effect:=jaeger_private.resolve_movement_effect(p_payload,p_request_id);
   v_balance:=v_effect->>'balanceId';
   v_code:=jaeger_private.movement_code(v_kind,v_sub,v_balance);
   if v_interest<>0 then raise exception 'Usa el flujo de pago con capital e intereses'; end if;
   if (v_effect->>'sign')::numeric<>0 then
     v_impacts:=jsonb_build_array(jsonb_build_object('id',v_balance,'delta',v_amount*(v_effect->>'sign')::numeric));
   end if;
   if v_kind='deuda' then
     v_principal:=v_amount;
     if v_balance='2010401.3' then v_impacts:=v_impacts||jsonb_build_array(jsonb_build_object('id','10102.06','delta',v_amount)); end if;
   end if;
   if v_code='savings_withdrawal' then v_source:=v_balance; v_funding:='asset_transfer'; end if;
   if v_code in ('loan_collection','loan_received') and v_destination is not null then
     if not exists(select 1 from jaeger.balance_items where balance_id=v_destination and active and balance_type='Activo')
       or v_destination=v_balance then raise exception 'Destino de fondos inválido'; end if;
     v_impacts:=v_impacts||jsonb_build_array(jsonb_build_object('id',v_destination,'delta',v_amount));
     v_funding:='asset_transfer';
   end if;
 end if;

 perform set_config('jaeger.movement_id',p_id,true);
 perform set_config('jaeger.operation_code',case when p_update then 'reversal' else v_code end,true);
 perform set_config('jaeger.operation_note',coalesce(p_payload->>'notas',''),true);
 if p_update then
   -- Preserve externally reconciled allocations; never silently remove their financing.
   if exists(select 1 from jaeger.funding_allocations a join jaeger.funding_operations o using(operation_id)
     where a.movement_id=p_id and o.source_movement_id is distinct from p_id and o.state<>'cancelled') then
     if v_amount < (select sum(a.amount) from jaeger.funding_allocations a join jaeger.funding_operations o using(operation_id)
         where a.movement_id=p_id and o.state<>'cancelled') or v_kind<>v_old.kind or v_sub<>v_old.subcategory
       or v_impacts<>'[]'::jsonb then raise exception 'El gasto tiene financiación conciliada; conserva su destino e importe financiado'; end if;
   end if;
   perform jaeger_private.execute_impacts(v_old.applied_impacts,-1,p_request_id);
 end if;
 perform set_config('jaeger.operation_code',v_code,true);
 perform jaeger_private.execute_impacts(v_impacts,1,p_request_id);
 select * into v_item from jaeger.balance_items where balance_id=v_balance;
 if p_update then
   update jaeger.financial_movements set economic_month=v_month,cash_month=v_cash,kind=v_kind,
     category=coalesce(nullif(p_payload->>'categoria',''),v_kind),subcategory=v_sub,amount=v_amount,
     transaction_date=v_date,notes=nullif(p_payload->>'notas',''),balance_id=v_balance,
     balance_type=v_item.balance_type,balance_name=v_item.name,balance_group=v_item.group_name,
     operation_code=v_code,funding_source=v_funding,source_asset_id=v_source,destination_asset_id=v_destination,
     principal_amount=v_principal,interest_amount=v_interest,applied_impacts=v_impacts,request_id=p_request_id
     where legacy_id=p_id;
 else
   insert into jaeger.financial_movements(legacy_id,source_row_number,recorded_at,economic_month,cash_month,
     kind,category,subcategory,amount,transaction_date,notes,balance_id,balance_type,balance_name,balance_group,
     source_kind,request_id,operation_code,funding_source,source_asset_id,destination_asset_id,
     principal_amount,interest_amount,applied_impacts,reconciliation_state)
   values(p_id,(select coalesce(max(source_row_number),1)+1 from jaeger.financial_movements),now(),
     v_month,v_cash,v_kind,coalesce(nullif(p_payload->>'categoria',''),v_kind),v_sub,v_amount,v_date,
     nullif(p_payload->>'notas',''),v_balance,v_item.balance_type,v_item.name,v_item.group_name,
     'supabase',p_request_id,v_code,v_funding,v_source,v_destination,v_principal,v_interest,v_impacts,'reconciled');
 end if;
 select operation_id into v_op from jaeger.funding_operations where source_movement_id=p_id and state<>'cancelled' limit 1;
 if v_op is not null then
   delete from jaeger.funding_allocations where operation_id=v_op;
   update jaeger.funding_operations set amount=v_amount,source_asset_id=v_source,destination_asset_id=v_destination,
     operation_code=v_code,economic_date=v_date,note=coalesce(p_payload->>'notas',''),request_id=p_request_id where operation_id=v_op;
 elsif v_funding in ('savings','asset_transfer') then
   insert into jaeger.funding_operations(source_movement_id,source_asset_id,destination_asset_id,operation_code,
      amount,economic_date,state,note,request_id)
   values(p_id,v_source,v_destination,v_code,v_amount,v_date,
     case when v_code='savings_withdrawal' and v_destination is null then 'partial' else 'reconciled' end,
     coalesce(p_payload->>'notas',''),p_request_id) returning operation_id into v_op;
 end if;
 if v_funding='savings' then
   insert into jaeger.funding_allocations(operation_id,movement_id,amount,category) values(v_op,p_id,v_amount,v_sub);
 end if;
 if v_op is not null then update jaeger.balance_log set operation_id=v_op where request_id=p_request_id and movement_id=p_id; end if;
 select coalesce(jsonb_agg(jsonb_build_object('codigo',x->>'id','op',
   case when b.balance_type='Activo' then 'activo' else 'pasivo' end,'signo',(x->>'delta')::numeric/v_amount)), '[]')
   into v_result from jsonb_array_elements(v_impacts) x join jaeger.balance_items b on b.balance_id=x->>'id';
 return jsonb_build_object('ok',true,'id',p_id,'mes',v_month,'mesCaja',v_cash,'oldMes',v_old.economic_month,
   'oldMesCaja',v_old.cash_month,'balanceMonto',v_amount,'balanceImpactos',v_result,'operationId',v_op);
end $$;

create or replace function jaeger_private.create_movement(p_payload jsonb,p_request_id uuid,p_forced_id text default null)
returns jsonb language sql set search_path='' as $$
 select jaeger_private.save_financed_movement(p_payload,p_request_id,coalesce(p_forced_id,gen_random_uuid()::text),false)
$$;
create or replace function jaeger_private.update_movement(p_payload jsonb,p_request_id uuid)
returns jsonb language sql set search_path='' as $$
 select jaeger_private.save_financed_movement(p_payload,p_request_id,p_payload->>'id',true)
$$;
create or replace function jaeger_private.delete_movement(p_id text,p_request_id uuid,p_allow_card_link boolean default false)
returns jsonb language plpgsql set search_path='' as $$
declare v_old jaeger.financial_movements%rowtype; v_ops uuid[];
begin
 perform pg_advisory_xact_lock(74123581);
 select * into v_old from jaeger.financial_movements where legacy_id=p_id for update;
 if not found then raise exception 'Movimiento no encontrado'; end if;
 if not p_allow_card_link and exists(select 1 from jaeger.card_events where movement_legacy_id=p_id) then
   raise exception 'Movimiento vinculado a tarjeta; edítalo desde Tarjetas'; end if;
 if exists(select 1 from jaeger.funding_operations where source_movement_id=p_id and evidence->>'historical'='true') then
   raise exception 'El origen histórico tiene destinos conciliados; requiere revisión de conciliación'; end if;
 perform set_config('jaeger.movement_id',p_id,true);
 perform set_config('jaeger.operation_code','reversal',true);
 perform set_config('jaeger.operation_note','Anulación de movimiento',true);
 perform jaeger_private.execute_impacts(v_old.applied_impacts,-1,p_request_id);
 select array_agg(operation_id) into v_ops from jaeger.funding_operations where source_movement_id=p_id;
 -- Preserve evidence when deleting an expense already funded by a historical withdrawal.
 update jaeger.funding_operations set state='partial',note=note||' · Transacción anulada; vinculación pendiente'
   where operation_id in(select operation_id from jaeger.funding_allocations where movement_id=p_id)
     and source_movement_id is distinct from p_id;
 update jaeger.funding_allocations set movement_id=null,note=note||' · Transacción anulada: '||p_id where movement_id=p_id;
 update jaeger.funding_operations set state='cancelled',request_id=p_request_id where operation_id=any(v_ops);
 delete from jaeger.financial_movements where legacy_id=p_id;
 return jsonb_build_object('ok',true,'id',p_id,'mes',v_old.economic_month,'mesCaja',v_old.cash_month,
   'balanceImpactos','[]'::jsonb,'balanceMonto',v_old.amount);
end $$;
-- Private schema and service-only API: retain the existing authenticated server boundary.
revoke all on all functions in schema jaeger_private from public,anon,authenticated;
grant execute on all functions in schema jaeger_private to service_role;

create or replace view jaeger.balance_history with (security_invoker=true) as
 select l.source_row_number,l.source_timestamp,l.balance_id,l.name,l.balance_type,l.action,
 l.previous_value,l.new_value,l.note,l.request_id,l.created_at,l.movement_id,l.operation_id,l.reconciliation_state,
 'log:'||l.id as history_id from jaeger.balance_log l
 union all
 select a.audit_id::integer, to_char(a.occurred_at at time zone 'America/Guayaquil','YYYY-MM-DD HH24:MI:SS'),
 a.entity_id,coalesce(a.after_data->>'name',a.before_data->>'name'),
 coalesce(a.after_data->>'balance_type',a.before_data->>'balance_type'),
 case when a.action='insert' then 'create' when a.action='delete' then 'delete'
 when a.after_data->>'active'='false' and a.before_data->>'active'='true' then 'deactivate'
 else 'automatic' end,
 (a.before_data->>'current_value')::numeric,(a.after_data->>'current_value')::numeric,
 'Auditoría persistente de balance',a.request_id,a.occurred_at,null::text,null::uuid,'pending','audit:'||a.audit_id
 from jaeger.audit_events a where a.entity_type='jaeger.balance_items' and not exists(
 select 1 from jaeger.balance_log l where l.request_id=a.request_id and l.balance_id=a.entity_id
 and l.previous_value is not distinct from (a.before_data->>'current_value')::numeric
 and l.new_value is not distinct from (a.after_data->>'current_value')::numeric);
revoke all on jaeger.balance_history from public,anon,authenticated;
grant select on jaeger.balance_history to service_role;
CREATE OR REPLACE FUNCTION public.jaeger_native_read_source(p_fn text, p_args jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
          select source_row_number, section, name, budget, actual, remaining, due_text, source_kind
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
          select m.*, coalesce((select sum(a.amount) from jaeger.funding_allocations a join jaeger.funding_operations o using(operation_id) where a.movement_id=m.legacy_id and o.state<>'cancelled'),0) as funded_amount,
 (select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('allocated_amount',a.amount,'source_name',b.name)), '[]') from jaeger.funding_allocations a join jaeger.funding_operations o using(operation_id) left join jaeger.balance_items b on b.balance_id=o.source_asset_id where a.movement_id=m.legacy_id and o.state<>'cancelled') as funding_links
          from jaeger.financial_movements m where economic_month = v_month
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
                 economic_month, kind, subcategory, sum(amount) amount, source_kind, operation_code, funding_source,
 sum(case when funding_source='savings' then amount else coalesce((select sum(a.amount) from jaeger.funding_allocations a join jaeger.funding_operations o using(operation_id) where a.movement_id=financial_movements.legacy_id and o.state<>'cancelled'),0) end) as funded_amount
          from jaeger.financial_movements
          where right(economic_month,2)=right(coalesce(v_month,to_char(now() at time zone 'America/Guayaquil','YY')),2)
          group by economic_month, kind, subcategory, source_kind, operation_code, funding_source
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
                 kind, subcategory, sum(amount) amount, source_kind, operation_code, funding_source,
 sum(case when funding_source='savings' then amount else coalesce((select sum(a.amount) from jaeger.funding_allocations a join jaeger.funding_operations o using(operation_id) where a.movement_id=financial_movements.legacy_id and o.state<>'cancelled'),0) end) as funded_amount
          from jaeger.financial_movements
          where right(economic_month,2)=right(coalesce(v_month,to_char(now() at time zone 'America/Guayaquil','YY')),2)
          group by month_number, kind, subcategory, source_kind, operation_code, funding_source
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
      'fundingOperations',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object(
 'source_name',s.name,'destination_name',d.name,
 'allocations',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('month',m.economic_month,'date',m.transaction_date)),'[]')
 from jaeger.funding_allocations a left join jaeger.financial_movements m on m.legacy_id=a.movement_id where a.operation_id=o.operation_id)))
 from jaeger.funding_operations o left join jaeger.balance_items s on s.balance_id=o.source_asset_id
 left join jaeger.balance_items d on d.balance_id=o.destination_asset_id),'[]'),
      'changes', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number desc)
        from (
          select l.*, (select coalesce(jsonb_agg(jsonb_build_object('id',m.legacy_id,'month',m.economic_month,'subcategory',m.subcategory,'amount',m.amount)),'[]')
 from jaeger.financial_movements m where m.legacy_id=l.movement_id or (l.request_id is not null and m.request_id=l.request_id)) as transactions
 from jaeger.balance_history l order by l.created_at desc
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
                 kind, subcategory, sum(amount) amount, source_kind, operation_code, funding_source,
 sum(case when funding_source='savings' then amount else coalesce((select sum(a.amount) from jaeger.funding_allocations a join jaeger.funding_operations o using(operation_id) where a.movement_id=financial_movements.legacy_id and o.state<>'cancelled'),0) end) as funded_amount
          from jaeger.financial_movements
          where right(economic_month,2)=right(coalesce(v_month,to_char(now() at time zone 'America/Guayaquil','YY')),2)
          group by month_number, kind, subcategory, source_kind, operation_code, funding_source
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
$function$;

