-- A Devolucion Terreno payment is a transfer between two balance accounts:
-- it reduces the outstanding liability and capitalizes the same amount in
-- Pago Terreno. Keep the two postings inside the movement transaction so
-- create, update and delete can never leave the balances out of sync.

create or replace function jaeger_private.apply_movement_balance_impacts(
  p_kind text,
  p_subcategory text,
  p_balance_id text,
  p_amount numeric,
  p_direction numeric,
  p_request_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_primary_sign numeric := jaeger_private.stored_movement_sign(
    p_kind, p_subcategory, p_balance_id
  );
  v_primary_type text;
  v_primary_op text;
  v_impacts jsonb := '[]'::jsonb;
  v_land_asset_id constant text := '10102.06';
  v_land_liability_id constant text := '2010401.3';
  v_land_asset_type text;
begin
  if coalesce(p_amount, 0) < 0 then
    raise exception 'El monto de impacto no puede ser negativo';
  end if;
  if p_direction not in (-1, 1) then
    raise exception 'Direccion de impacto invalida';
  end if;

  if coalesce(v_primary_sign, 0) <> 0 then
    select balance_type into v_primary_type
    from jaeger.balance_items
    where balance_id = p_balance_id and active;
    if not found then
      raise exception 'Balance activo no encontrado: %', p_balance_id;
    end if;
    v_primary_op := case when v_primary_type = 'Activo' then 'activo' else 'pasivo' end;
    perform jaeger_private.apply_balance_delta(
      p_balance_id,
      p_amount * v_primary_sign * p_direction,
      p_request_id
    );
    v_impacts := v_impacts || jsonb_build_array(jsonb_build_object(
      'codigo', p_balance_id,
      'op', v_primary_op,
      'signo', v_primary_sign * p_direction
    ));
  end if;

  if lower(btrim(coalesce(p_kind, ''))) = 'deuda'
     and p_balance_id = v_land_liability_id then
    select balance_type into v_land_asset_type
    from jaeger.balance_items
    where balance_id = v_land_asset_id and active;
    if not found or v_land_asset_type <> 'Activo' then
      raise exception 'El activo Pago Terreno no esta disponible: %', v_land_asset_id;
    end if;
    perform jaeger_private.apply_balance_delta(
      v_land_asset_id,
      p_amount * p_direction,
      p_request_id
    );
    v_impacts := v_impacts || jsonb_build_array(jsonb_build_object(
      'codigo', v_land_asset_id,
      'op', 'activo',
      'signo', p_direction
    ));
  end if;

  return v_impacts;
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
  v_impacts jsonb;
  v_order integer;
begin
  if v_amount <= 0 then raise exception 'Monto invalido'; end if;
  v_cash := jaeger_private.normalize_month(coalesce(nullif(p_payload->>'mesRegistro',''),
    case when v_date is not null then jaeger_private.month_from_date(v_date) end, v_month));
  if not exists(select 1 from jaeger.months where month_key=v_month) then raise exception 'Mes economico no encontrado: %',v_month; end if;
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
  v_impacts := jaeger_private.apply_movement_balance_impacts(
    v_kind, v_sub, v_effect->>'balanceId', v_amount, 1, p_request_id
  );
  return jsonb_build_object('ok',true,'id',v_id,'mesCaja',v_cash,'mes',v_month,
    'balanceImpactos',v_impacts,'balanceMonto',v_amount);
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
  v_impacts jsonb;
begin
  select * into v_old from jaeger.financial_movements where legacy_id=p_payload->>'id' for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if v_amount <= 0 then raise exception 'Monto invalido'; end if;
  v_cash := jaeger_private.normalize_month(coalesce(nullif(p_payload->>'mesRegistro',''),
    case when v_date is not null then jaeger_private.month_from_date(v_date) end,v_month));
  if not exists(select 1 from jaeger.months where month_key=v_month) then raise exception 'Mes economico no encontrado: %',v_month; end if;
  if not exists(select 1 from jaeger.months where month_key=v_cash) then raise exception 'Mes de caja no encontrado: %',v_cash; end if;
  v_category := coalesce(nullif(btrim(p_payload->>'categoria'),''),v_kind);
  v_effect := jaeger_private.resolve_movement_effect(p_payload,p_request_id);
  perform jaeger_private.apply_movement_balance_impacts(
    v_old.kind, v_old.subcategory, v_old.balance_id, v_old.amount, -1, p_request_id
  );
  update jaeger.financial_movements set economic_month=v_month,kind=v_kind,category=v_category,
    subcategory=v_sub,amount=v_amount,transaction_date=v_date,notes=nullif(coalesce(p_payload->>'notas',''),''),
    cash_month=v_cash,balance_id=v_effect->>'balanceId',balance_type=v_effect->>'balanceType',
    balance_name=v_effect->>'balanceName',balance_group=v_effect->>'balanceGroup',request_id=p_request_id
  where legacy_id=v_old.legacy_id;
  v_impacts := jaeger_private.apply_movement_balance_impacts(
    v_kind, v_sub, v_effect->>'balanceId', v_amount, 1, p_request_id
  );
  return jsonb_build_object('ok',true,'id',v_old.legacy_id,'mesCaja',v_cash,'mes',v_month,
    'oldMes',v_old.economic_month,'oldMesCaja',v_old.cash_month,
    'balanceImpactos',v_impacts,'balanceMonto',v_amount);
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
  v_impacts jsonb;
begin
  select * into v_old from jaeger.financial_movements where legacy_id=p_id for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if not p_allow_card_link and exists(select 1 from jaeger.card_events where movement_legacy_id=p_id) then
    raise exception 'Movimiento vinculado a tarjeta; editalo o eliminalo desde Tarjetas';
  end if;
  delete from jaeger.financial_movements where legacy_id=p_id;
  v_impacts := jaeger_private.apply_movement_balance_impacts(
    v_old.kind, v_old.subcategory, v_old.balance_id, v_old.amount, -1, p_request_id
  );
  return jsonb_build_object('ok',true,'id',p_id,'mesCaja',v_old.cash_month,'mes',v_old.economic_month,
    'balanceImpactos',v_impacts,'balanceMonto',v_old.amount);
end;
$$;

revoke all on function jaeger_private.apply_movement_balance_impacts(text,text,text,numeric,numeric,uuid)
  from public, anon, authenticated;
grant execute on function jaeger_private.apply_movement_balance_impacts(text,text,text,numeric,numeric,uuid)
  to service_role;

-- Reconcile only native Supabase movements that did not already leave an
-- audited update on Pago Terreno. The liability already contains these debits.
do $$
declare
  v_request_id constant uuid := '6fcfe89f-70d8-4c7a-8df3-5d98a94fbf5e';
  v_missing numeric := 0;
  v_previous numeric;
  v_new numeric;
  v_movement_ids jsonb := '[]'::jsonb;
begin
  if exists(select 1 from jaeger.operation_requests where request_id=v_request_id) then
    return;
  end if;

  select coalesce(sum(m.amount),0),
         coalesce(jsonb_agg(m.legacy_id order by m.created_at),'[]'::jsonb)
    into v_missing, v_movement_ids
  from jaeger.financial_movements m
  where m.source_kind='supabase'
    and m.kind='deuda'
    and m.balance_id='2010401.3'
    and not exists (
      select 1
      from jaeger.audit_events e
      where e.request_id=m.request_id
        and e.entity_type='jaeger.balance_items'
        and e.entity_id='10102.06'
        and e.action='update'
    );

  insert into jaeger.operation_requests(
    request_id,operation,payload_hash,status,created_at,updated_at
  ) values (
    v_request_id,'reconcileDevolucionTerrenoPagoTerreno',
    'migration-20260908133716','pending',now(),now()
  );

  select current_value into v_previous
  from jaeger.balance_items where balance_id='10102.06' and active for update;
  if not found then raise exception 'El activo Pago Terreno no esta disponible'; end if;

  if v_missing > 0 then
    perform jaeger_private.apply_balance_delta('10102.06',v_missing,v_request_id);
    v_new := v_previous + v_missing;
    perform jaeger_private.record_balance_change(
      '10102.06','Pago Terreno','Activo','recalculo automatico',v_previous,v_new,
      'Completa pagos de Devolucion Terreno omitidos desde el corte a Supabase',v_request_id
    );
  else
    v_new := v_previous;
  end if;

  update jaeger.operation_requests
  set status='completed',
      response=jsonb_build_object(
        'ok',true,'amount',v_missing,'previous',v_previous,'current',v_new,
        'movementIds',v_movement_ids,'liabilityChanged',false
      ),
      updated_at=now(),completed_at=now()
  where request_id=v_request_id;
end;
$$;
