-- Step 6: transactional and idempotent Supabase writes for movements and cards.
-- The feature flag remains disabled until the rollback-based validation suite passes.

insert into jaeger.system_settings (setting_key, setting_value, description)
values (
  'native_write.state',
  jsonb_build_object(
    'enabled', false,
    'operations', jsonb_build_array(
      'registrarMovimiento', 'actualizarMovimiento', 'eliminarMovimiento',
      'registrarMovimientoTarjeta', 'actualizarMovimientoTarjeta', 'eliminarMovimientoTarjeta'
    ),
    'updated_at', now()
  ),
  'Corte controlado de escrituras financieras hacia Supabase.'
)
on conflict (setting_key) do update
set setting_value = jaeger.system_settings.setting_value || excluded.setting_value,
    description = excluded.description,
    updated_at = now();

create or replace function jaeger_private.normalize_month(p_value text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_parts text[];
  v_name text;
  v_year text;
begin
  v_parts := regexp_split_to_array(btrim(coalesce(p_value, '')), '\s+');
  if coalesce(array_length(v_parts, 1), 0) < 2 then
    return btrim(coalesce(p_value, ''));
  end if;
  v_name := case lower(v_parts[1])
    when 'enero' then 'Enero' when 'ene' then 'Enero'
    when 'febrero' then 'Febrero' when 'feb' then 'Febrero'
    when 'marzo' then 'Marzo' when 'mar' then 'Marzo'
    when 'abril' then 'Abril' when 'abr' then 'Abril'
    when 'mayo' then 'Mayo' when 'may' then 'Mayo'
    when 'junio' then 'Junio' when 'jun' then 'Junio'
    when 'julio' then 'Julio' when 'jul' then 'Julio'
    when 'agosto' then 'Agosto' when 'ago' then 'Agosto'
    when 'septiembre' then 'Septiembre' when 'sep' then 'Septiembre'
    when 'octubre' then 'Octubre' when 'oct' then 'Octubre'
    when 'noviembre' then 'Noviembre' when 'nov' then 'Noviembre'
    when 'diciembre' then 'Diciembre' when 'dic' then 'Diciembre'
    else initcap(v_parts[1])
  end;
  v_year := regexp_replace(v_parts[2], '[^0-9]', '', 'g');
  if length(v_year) = 4 then v_year := right(v_year, 2); end if;
  if length(v_year) = 1 then v_year := '0' || v_year; end if;
  return v_name || ' ' || v_year;
end;
$$;

create or replace function jaeger_private.month_from_date(p_date date)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select (array['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[extract(month from p_date)::integer]
    || ' ' || to_char(p_date, 'YY')
$$;

create or replace function jaeger_private.stored_movement_sign(
  p_kind text, p_subcategory text, p_balance_id text
)
returns numeric
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_balance_id is null or btrim(p_balance_id) = '' then 0
    when p_kind = 'ahorro' then 1
    when p_kind = 'deuda' then -1
    when p_kind = 'necesidad' then 1
    when p_kind = 'ingreso' and lower(btrim(p_subcategory)) = lower('Devolución de ahorro') then -1
    when p_kind = 'ingreso' and lower(btrim(p_subcategory)) = lower('Préstamos recibidos') then 1
    else 0
  end
$$;

create or replace function jaeger_private.apply_balance_delta(
  p_balance_id text, p_delta numeric, p_request_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_balance_id is null or p_delta = 0 then return; end if;
  update jaeger.balance_items
  set adjustment_delta = adjustment_delta + p_delta,
      current_value = current_value + p_delta,
      request_id = p_request_id
  where balance_id = p_balance_id and active;
  if not found then
    raise exception 'Balance activo no encontrado: %', p_balance_id;
  end if;
end;
$$;

create or replace function jaeger_private.resolve_movement_effect(
  p_payload jsonb, p_request_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
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
    raise exception 'Tipo de movimiento inválido';
  end if;
  if v_sub = '' then raise exception 'Subcategoría requerida'; end if;

  if v_kind in ('ahorro','deuda') then
    select * into v_item
    from jaeger.catalog_items
    where kind = v_kind and state = 'activo' and lower(btrim(name)) = lower(v_sub)
    order by sort_order, legacy_id
    limit 1;
    if not found then
      raise exception 'No existe una asignación activa para %: %', v_kind, v_sub;
    end if;
    v_balance_code := v_item.balance_id;
    if v_balance_code is null and lower(coalesce(v_item.group_name,'')) = lower('Pasivos Fijos') then
      return jsonb_build_object('balanceId', null, 'balanceType', coalesce(v_item.balance_type,''),
        'balanceName', coalesce(v_item.balance_name,v_sub), 'balanceGroup', coalesce(v_item.group_name,''),
        'sign', 0, 'op', case when v_kind='ahorro' then 'activo' else 'pasivo' end);
    end if;
    v_sign := case when v_kind='ahorro' then 1 else -1 end;
  elsif v_kind = 'necesidad' and v_balance_code is not null then
    v_sign := 1;
  elsif v_kind = 'ingreso' and lower(v_sub) = lower('Devolución de ahorro') then
    if v_balance_code is null then raise exception 'Selecciona el ahorro de origen'; end if;
    v_sign := -1;
  elsif v_kind = 'ingreso' and lower(v_sub) = lower('Préstamos recibidos') then
    if v_new_name is not null then
      insert into jaeger.balance_items (
        name, balance_type, base_value, adjustment_delta, current_value, group_name,
        sort_order, active, custom, note, source_kind, request_id, source_row_number
      ) values (
        v_new_name, 'Pasivo', 0, 0, 0,
        coalesce(nullif(btrim(p_payload->>'balanceGrupoNuevo'),''), 'Préstamos'),
        (select coalesce(max(sort_order),0)+1 from jaeger.balance_items where balance_type='Pasivo'),
        true, true, 'Creado desde Préstamos recibidos', 'supabase', p_request_id,
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
  if v_kind in ('ahorro','necesidad') or (v_kind='ingreso' and lower(v_sub)=lower('Devolución de ahorro')) then
    if v_balance.balance_type <> 'Activo' then raise exception 'El balance seleccionado debe ser Activo'; end if;
  end if;
  if v_kind='deuda' or (v_kind='ingreso' and lower(v_sub)=lower('Préstamos recibidos')) then
    if v_balance.balance_type <> 'Pasivo' then raise exception 'El balance seleccionado debe ser Pasivo'; end if;
  end if;
  v_op := case when v_balance.balance_type='Activo' then 'activo' else 'pasivo' end;
  return jsonb_build_object('balanceId',v_balance.balance_id,'balanceType',v_balance.balance_type,
    'balanceName',v_balance.name,'balanceGroup',coalesce(v_balance.group_name,''),'sign',v_sign,'op',v_op);
end;
$$;

create or replace function jaeger_private.create_movement(
  p_payload jsonb, p_request_id uuid, p_forced_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id text := coalesce(nullif(btrim(p_forced_id),''), gen_random_uuid()::text);
  v_date date := nullif(btrim(coalesce(p_payload->>'fecha','')),'')::date;
  v_month text := jaeger_private.normalize_month(p_payload->>'mes');
  v_cash text;
  v_kind text := lower(btrim(coalesce(p_payload->>'tipo','')));
  v_category text;
  v_sub text := btrim(coalesce(p_payload->>'subcategoria',''));
  v_amount numeric := replace(btrim(coalesce(p_payload->>'monto','0')),',','.')::numeric;
  v_effect jsonb;
  v_order integer;
begin
  if v_amount <= 0 then raise exception 'Monto inválido'; end if;
  v_cash := jaeger_private.normalize_month(coalesce(nullif(p_payload->>'mesRegistro',''),
    case when v_date is not null then jaeger_private.month_from_date(v_date) end, v_month));
  if not exists(select 1 from jaeger.months where month_key=v_month) then raise exception 'Mes económico no encontrado: %',v_month; end if;
  if not exists(select 1 from jaeger.months where month_key=v_cash) then raise exception 'Mes de caja no encontrado: %',v_cash; end if;
  v_category := coalesce(nullif(btrim(p_payload->>'categoria'),''),v_kind);
  v_effect := jaeger_private.resolve_movement_effect(p_payload,p_request_id);
  select coalesce(max(source_row_number),1)+1 into v_order from jaeger.financial_movements;
  insert into jaeger.financial_movements (
    legacy_id, source_row_number, recorded_at, economic_month, kind, category, subcategory,
    amount, transaction_date, notes, cash_month, balance_id, balance_type, balance_name,
    balance_group, source_kind, request_id
  ) values (
    v_id,v_order,now(),v_month,v_kind,v_category,v_sub,v_amount,v_date,
    nullif(coalesce(p_payload->>'notas',''),''),v_cash,v_effect->>'balanceId',
    v_effect->>'balanceType',v_effect->>'balanceName',v_effect->>'balanceGroup','supabase',p_request_id
  );
  perform jaeger_private.apply_balance_delta(v_effect->>'balanceId',v_amount*(v_effect->>'sign')::numeric,p_request_id);
  return jsonb_build_object('ok',true,'id',v_id,'mesCaja',v_cash,'mes',v_month,
    'balanceImpactos',case when coalesce((v_effect->>'sign')::numeric,0)=0 then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('codigo',v_effect->>'balanceId','op',v_effect->>'op','signo',(v_effect->>'sign')::numeric)) end,
    'balanceMonto',v_amount);
end;
$$;

create or replace function jaeger_private.update_movement(
  p_payload jsonb, p_request_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old jaeger.financial_movements%rowtype;
  v_date date := nullif(btrim(coalesce(p_payload->>'fecha','')),'')::date;
  v_month text := jaeger_private.normalize_month(p_payload->>'mes');
  v_cash text;
  v_kind text := lower(btrim(coalesce(p_payload->>'tipo','')));
  v_category text;
  v_sub text := btrim(coalesce(p_payload->>'subcategoria',''));
  v_amount numeric := replace(btrim(coalesce(p_payload->>'monto','0')),',','.')::numeric;
  v_effect jsonb;
  v_old_sign numeric;
begin
  select * into v_old from jaeger.financial_movements where legacy_id=p_payload->>'id' for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if v_amount <= 0 then raise exception 'Monto inválido'; end if;
  v_cash := jaeger_private.normalize_month(coalesce(nullif(p_payload->>'mesRegistro',''),
    case when v_date is not null then jaeger_private.month_from_date(v_date) end,v_month));
  if not exists(select 1 from jaeger.months where month_key=v_month) then raise exception 'Mes económico no encontrado: %',v_month; end if;
  if not exists(select 1 from jaeger.months where month_key=v_cash) then raise exception 'Mes de caja no encontrado: %',v_cash; end if;
  v_category := coalesce(nullif(btrim(p_payload->>'categoria'),''),v_kind);
  v_effect := jaeger_private.resolve_movement_effect(p_payload,p_request_id);
  v_old_sign := jaeger_private.stored_movement_sign(v_old.kind,v_old.subcategory,v_old.balance_id);
  perform jaeger_private.apply_balance_delta(v_old.balance_id,-v_old.amount*v_old_sign,p_request_id);
  update jaeger.financial_movements set economic_month=v_month,kind=v_kind,category=v_category,
    subcategory=v_sub,amount=v_amount,transaction_date=v_date,notes=nullif(coalesce(p_payload->>'notas',''),''),
    cash_month=v_cash,balance_id=v_effect->>'balanceId',balance_type=v_effect->>'balanceType',
    balance_name=v_effect->>'balanceName',balance_group=v_effect->>'balanceGroup',request_id=p_request_id
  where legacy_id=v_old.legacy_id;
  perform jaeger_private.apply_balance_delta(v_effect->>'balanceId',v_amount*(v_effect->>'sign')::numeric,p_request_id);
  return jsonb_build_object('ok',true,'id',v_old.legacy_id,'mesCaja',v_cash,'mes',v_month,
    'oldMes',v_old.economic_month,'oldMesCaja',v_old.cash_month);
end;
$$;

create or replace function jaeger_private.delete_movement(
  p_id text, p_request_id uuid, p_allow_card_link boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old jaeger.financial_movements%rowtype;
  v_sign numeric;
begin
  select * into v_old from jaeger.financial_movements where legacy_id=p_id for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if not p_allow_card_link and exists(select 1 from jaeger.card_events where movement_legacy_id=p_id) then
    raise exception 'Movimiento vinculado a tarjeta; edítalo o elimínalo desde Tarjetas';
  end if;
  v_sign := jaeger_private.stored_movement_sign(v_old.kind,v_old.subcategory,v_old.balance_id);
  delete from jaeger.financial_movements where legacy_id=p_id;
  perform jaeger_private.apply_balance_delta(v_old.balance_id,-v_old.amount*v_sign,p_request_id);
  return jsonb_build_object('ok',true,'id',p_id,'mesCaja',v_old.cash_month,'mes',v_old.economic_month);
end;
$$;

create or replace function public.jaeger_native_write_status()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select setting_value from jaeger.system_settings where setting_key='native_write.state'),'{}'::jsonb)
    || jsonb_build_object('read_state',coalesce((select setting_value from jaeger.system_settings where setting_key='native_read.state'),'{}'::jsonb))
$$;

create or replace function public.jaeger_set_native_writes_enabled(p_enabled boolean, p_reason text default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_state jsonb;
begin
  update jaeger.system_settings
  set setting_value=setting_value||jsonb_build_object('enabled',p_enabled,'reason',left(coalesce(p_reason,''),160),'updated_at',now()),updated_at=now()
  where setting_key='native_write.state'
  returning setting_value into v_state;
  update jaeger.system_settings
  set setting_value=setting_value||jsonb_build_object('active_write_source',case when p_enabled then 'supabase' else 'google_sheets' end,
    'write_cutover_completed',p_enabled,'phase',case when p_enabled then 6 else greatest(coalesce((setting_value->>'phase')::integer,5),5) end),updated_at=now()
  where setting_key='migration.state';
  return v_state;
end;
$$;

create or replace function public.jaeger_write(
  p_operation text, p_request_id uuid, p_payload_hash text, p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing jaeger.operation_requests%rowtype;
  v_result jsonb;
  v_old_card jaeger.card_events%rowtype;
  v_id text;
  v_movement_id text;
  v_type text;
  v_card text;
  v_month text;
  v_expense_month text;
  v_cash_month text;
  v_date date;
  v_amount numeric;
  v_origin text;
  v_charge text;
  v_installment text;
  v_order integer;
  v_movement_payload jsonb;
begin
  if p_operation not in ('registrarMovimiento','actualizarMovimiento','eliminarMovimiento',
    'registrarMovimientoTarjeta','actualizarMovimientoTarjeta','eliminarMovimientoTarjeta') then
    raise exception 'Escritura nativa no implementada: %',p_operation;
  end if;
  insert into jaeger.operation_requests(request_id,operation,payload_hash,status)
  values(p_request_id,p_operation,p_payload_hash,'pending') on conflict(request_id) do nothing;
  select * into v_existing from jaeger.operation_requests where request_id=p_request_id for update;
  if v_existing.operation<>p_operation or v_existing.payload_hash<>p_payload_hash then
    raise exception 'La clave de idempotencia ya fue usada con otra operación';
  end if;
  if v_existing.status='completed' then return v_existing.response; end if;
  perform set_config('jaeger.request_id',p_request_id::text,true);

  if p_operation='registrarMovimiento' then
    v_result:=jaeger_private.create_movement(p_payload,p_request_id);
  elsif p_operation='actualizarMovimiento' then
    v_result:=jaeger_private.update_movement(p_payload,p_request_id);
  elsif p_operation='eliminarMovimiento' then
    v_result:=jaeger_private.delete_movement(coalesce(p_payload->>'id',p_payload#>>'{}'),p_request_id,false);
  else
    if p_operation='actualizarMovimientoTarjeta' then
      select * into v_old_card from jaeger.card_events where legacy_id=p_payload->>'id' for update;
      if not found then raise exception 'Movimiento TDC no encontrado'; end if;
    elsif p_operation='eliminarMovimientoTarjeta' then
      select * into v_old_card from jaeger.card_events where legacy_id=coalesce(p_payload->>'id',p_payload#>>'{}') for update;
      if not found then raise exception 'Movimiento TDC no encontrado'; end if;
      delete from jaeger.card_charge_allocations where payment_event_id=v_old_card.legacy_id or charge_event_id=v_old_card.legacy_id;
      update jaeger.card_events set charge_legacy_id=null,request_id=p_request_id where charge_legacy_id=v_old_card.legacy_id;
      delete from jaeger.card_events where legacy_id=v_old_card.legacy_id;
      if v_old_card.movement_legacy_id is not null then
        perform jaeger_private.delete_movement(v_old_card.movement_legacy_id,p_request_id,true);
      end if;
      v_result:=jsonb_build_object('ok',true,'id',v_old_card.legacy_id,'mesCaja',
        case when v_old_card.movement_legacy_id is not null then (select cash_month from jaeger.financial_movements where false) else null end,
        'mesAplicado',v_old_card.month_key,'cardId',v_old_card.card_code,
        'linkedMovement',v_old_card.movement_legacy_id is not null);
    end if;

    if p_operation in ('registrarMovimientoTarjeta','actualizarMovimientoTarjeta') then
      v_type:=lower(btrim(coalesce(p_payload->>'tipo',v_old_card.event_type,'')));
      v_card:=upper(btrim(coalesce(p_payload->>'tarjeta',v_old_card.card_code,'')));
      v_date:=nullif(btrim(coalesce(p_payload->>'fecha','')),'')::date;
      v_month:=jaeger_private.normalize_month(coalesce(p_payload->>'mesPagoCredito',p_payload->>'mesTarjeta',p_payload->>'mesAplica',p_payload->>'mesAplicado',p_payload->>'mes',v_old_card.month_key));
      v_expense_month:=jaeger_private.normalize_month(coalesce(p_payload->>'mesGasto',p_payload->>'mesRegistroGasto',p_payload->>'mesBase',p_payload->>'mesSeleccionado',p_payload->>'mesCaja',p_payload->>'mesRegistro',p_payload->>'mes',v_month));
      v_cash_month:=jaeger_private.normalize_month(coalesce(nullif(p_payload->>'mesRegistro',''),case when v_date is not null then jaeger_private.month_from_date(v_date) end,p_payload->>'mes',v_old_card.month_key));
      v_amount:=replace(btrim(coalesce(p_payload->>'monto','0')),',','.')::numeric;
      v_origin:=btrim(coalesce(p_payload->>'origen',''));
      v_charge:=nullif(btrim(coalesce(p_payload->>'cargoId','')),'');
      v_installment:=nullif(btrim(coalesce(p_payload->>'diferidoId','')),'');
      if v_type not in ('cargo','abono') then raise exception 'Tipo TDC inválido'; end if;
      if v_card not in ('VISA','MC') then raise exception 'Tarjeta inválida'; end if;
      if v_amount<=0 then raise exception 'Monto inválido'; end if;
      if not exists(select 1 from jaeger.months where month_key=v_month) then raise exception 'Mes de tarjeta no encontrado: %',v_month; end if;
      if v_charge is not null and not exists(select 1 from jaeger.card_events where legacy_id=v_charge and event_type='cargo' and card_code=v_card) then
        raise exception 'Cargo de tarjeta no encontrado o incompatible';
      end if;
      if v_installment is not null and not exists(select 1 from jaeger.card_installments where legacy_id=v_installment and card_code=v_card) then
        raise exception 'Diferido no encontrado o incompatible';
      end if;
      v_movement_payload:=jsonb_build_object('mes',v_expense_month,'mesRegistro',v_cash_month,
        'tipo',coalesce(nullif(p_payload->>'egresoTipo',''),'deuda'),'categoria',coalesce(nullif(p_payload->>'egresoTipo',''),'deuda'),
        'subcategoria',coalesce(nullif(p_payload->>'subcategoria',''),'Préstamos TDC'),'monto',v_amount,
        'fecha',coalesce(p_payload->>'fecha',''),'notas',case when coalesce(p_payload->>'notas','')='' then 'Abono '||v_card else p_payload->>'notas'||' · Abono '||v_card end);

      if p_operation='registrarMovimientoTarjeta' then
        if v_type='abono' and v_origin='egreso' then
          v_result:=jaeger_private.create_movement(v_movement_payload,p_request_id);
          v_movement_id:=v_result->>'id';
        end if;
        v_id:=gen_random_uuid()::text;
        select coalesce(max(source_row_number),1)+1 into v_order from jaeger.card_events;
        insert into jaeger.card_events(legacy_id,source_row_number,recorded_at,month_key,card_code,event_type,amount,
          transaction_date,notes,origin,movement_legacy_id,category,subcategory,charge_legacy_id,installment_legacy_id,source_kind,request_id)
        values(v_id,v_order,now(),v_month,v_card,v_type,v_amount,v_date,nullif(coalesce(p_payload->>'notas',''),''),
          nullif(v_origin,''),v_movement_id,nullif(coalesce(p_payload->>'egresoTipo',''),''),nullif(coalesce(p_payload->>'subcategoria',''),''),
          v_charge,v_installment,'supabase',p_request_id);
      else
        v_id:=v_old_card.legacy_id;
        v_movement_id:=v_old_card.movement_legacy_id;
        if v_movement_id is not null and not (v_type='abono' and v_origin='egreso') then
          update jaeger.card_events set movement_legacy_id=null,request_id=p_request_id where legacy_id=v_id;
          perform jaeger_private.delete_movement(v_movement_id,p_request_id,true);
          v_movement_id:=null;
        elsif v_type='abono' and v_origin='egreso' then
          if v_movement_id is null then
            v_result:=jaeger_private.create_movement(v_movement_payload,p_request_id);
            v_movement_id:=v_result->>'id';
          else
            v_movement_payload:=v_movement_payload||jsonb_build_object('id',v_movement_id);
            perform jaeger_private.update_movement(v_movement_payload,p_request_id);
          end if;
        end if;
        delete from jaeger.card_charge_allocations where payment_event_id=v_id;
        if v_old_card.event_type='cargo' and v_type<>'cargo' then
          delete from jaeger.card_charge_allocations where charge_event_id=v_id;
          update jaeger.card_events set charge_legacy_id=null,request_id=p_request_id where charge_legacy_id=v_id;
        end if;
        update jaeger.card_events set month_key=v_month,card_code=v_card,event_type=v_type,amount=v_amount,
          transaction_date=v_date,notes=nullif(coalesce(p_payload->>'notas',''),''),origin=nullif(v_origin,''),
          movement_legacy_id=v_movement_id,category=nullif(coalesce(p_payload->>'egresoTipo',''),''),
          subcategory=nullif(coalesce(p_payload->>'subcategoria',''),''),charge_legacy_id=v_charge,
          installment_legacy_id=v_installment,request_id=p_request_id where legacy_id=v_id;
      end if;
      if v_type='abono' and v_charge is not null then
        insert into jaeger.card_charge_allocations(payment_event_id,charge_event_id,amount,allocation_kind,source_kind,request_id)
        values(v_id,v_charge,v_amount,'collection','supabase',p_request_id)
        on conflict(payment_event_id,charge_event_id,allocation_kind) do update set amount=excluded.amount,request_id=excluded.request_id;
      end if;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'registroId',coalesce(v_movement_id,''),
        'mesCaja',v_cash_month,'mesAplicado',v_month,'mesGasto',v_expense_month,'cardId',v_card,
        'linkedMovement',v_movement_id is not null);
    end if;
  end if;

  update jaeger.operation_requests set status='completed',response=v_result,error_message=null,
    completed_at=now(),updated_at=now() where request_id=p_request_id;
  perform public.jaeger_invalidate_api_cache();
  return v_result;
end;
$$;

revoke all on function jaeger_private.normalize_month(text) from public, anon, authenticated;
revoke all on function jaeger_private.month_from_date(date) from public, anon, authenticated;
revoke all on function jaeger_private.stored_movement_sign(text,text,text) from public, anon, authenticated;
revoke all on function jaeger_private.apply_balance_delta(text,numeric,uuid) from public, anon, authenticated;
revoke all on function jaeger_private.resolve_movement_effect(jsonb,uuid) from public, anon, authenticated;
revoke all on function jaeger_private.create_movement(jsonb,uuid,text) from public, anon, authenticated;
revoke all on function jaeger_private.update_movement(jsonb,uuid) from public, anon, authenticated;
revoke all on function jaeger_private.delete_movement(text,uuid,boolean) from public, anon, authenticated;
grant execute on function jaeger_private.normalize_month(text) to service_role;
grant execute on function jaeger_private.month_from_date(date) to service_role;
grant execute on function jaeger_private.stored_movement_sign(text,text,text) to service_role;
grant execute on function jaeger_private.apply_balance_delta(text,numeric,uuid) to service_role;
grant execute on function jaeger_private.resolve_movement_effect(jsonb,uuid) to service_role;
grant execute on function jaeger_private.create_movement(jsonb,uuid,text) to service_role;
grant execute on function jaeger_private.update_movement(jsonb,uuid) to service_role;
grant execute on function jaeger_private.delete_movement(text,uuid,boolean) to service_role;

revoke all on function public.jaeger_native_write_status() from public, anon, authenticated;
revoke all on function public.jaeger_set_native_writes_enabled(boolean,text) from public, anon, authenticated;
revoke all on function public.jaeger_write(text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.jaeger_native_write_status() to service_role;
grant execute on function public.jaeger_set_native_writes_enabled(boolean,text) to service_role;
grant execute on function public.jaeger_write(text,uuid,text,jsonb) to service_role;

comment on function public.jaeger_write(text,uuid,text,jsonb) is
  'Escrituras financieras transaccionales e idempotentes para movimientos y tarjetas.';
