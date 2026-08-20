-- Permit installment liquidations funded partly or entirely from external money.
-- External money clears the related liability and card charge without reducing
-- personal cash or an asset in the balance sheet.

do $$
begin
  -- Keep the migration safe to re-run from the SQL editor or a future
  -- migration deployment.  Once the legacy implementation exists, only the
  -- wrapper below needs to be refreshed.
  if to_regprocedure('public.jaeger_write_extended_legacy(text,uuid,text,jsonb)') is null then
    alter function public.jaeger_write_extended(text,uuid,text,jsonb)
      rename to jaeger_write_extended_legacy;
  end if;
end;
$$;

create or replace function public.jaeger_write_extended(
  p_operation text,p_request_id uuid,p_payload_hash text,p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing jaeger.operation_requests%rowtype;
  v_result jsonb := jsonb_build_object('ok',true);
  v_item jaeger.balance_items%rowtype;
  v_liability jaeger.balance_items%rowtype;
  v_installment jaeger.card_installments%rowtype;
  v_card text;
  v_id text;
  v_month text;
  v_asset_id text;
  v_movement_id text;
  v_total numeric;
  v_cash_amount numeric;
  v_asset_amount numeric;
  v_external_amount numeric;
  v_non_cash_amount numeric;
  v_date date;
  v_order integer;
  v_payload2 jsonb;
begin
  v_external_amount:=replace(btrim(coalesce(p_payload->>'montoExterno','0')),',','.')::numeric;
  if p_operation<>'liquidarDiferidoTdc' or v_external_amount<=0 then
    return public.jaeger_write_extended_legacy(p_operation,p_request_id,p_payload_hash,p_payload);
  end if;

  if p_request_id is null or btrim(coalesce(p_payload_hash,''))='' then
    raise exception 'Falta la clave de idempotencia';
  end if;
  if jsonb_typeof(coalesce(p_payload,'{}'::jsonb))<>'object' then
    raise exception 'Carga de escritura inválida';
  end if;

  insert into jaeger.operation_requests(request_id,operation,payload_hash,status)
  values(p_request_id,p_operation,p_payload_hash,'pending') on conflict(request_id) do nothing;
  select * into v_existing from jaeger.operation_requests where request_id=p_request_id for update;
  if v_existing.operation<>p_operation or v_existing.payload_hash<>p_payload_hash then
    raise exception 'La clave de idempotencia ya fue usada con otra operación';
  end if;
  if v_existing.status='completed' then return v_existing.response; end if;
  perform set_config('jaeger.request_id',p_request_id::text,true);

  v_card:=upper(btrim(coalesce(p_payload->>'tarjeta','')));
  v_id:=btrim(coalesce(p_payload->>'diferidoId',''));
  v_month:=jaeger_private.normalize_month(p_payload->>'mesPago');
  v_total:=replace(btrim(coalesce(p_payload->>'total','0')),',','.')::numeric;
  v_cash_amount:=replace(btrim(coalesce(p_payload->>'montoSaldo','0')),',','.')::numeric;
  v_asset_amount:=replace(btrim(coalesce(p_payload->>'montoActivo','0')),',','.')::numeric;
  v_asset_id:=nullif(btrim(coalesce(p_payload->>'activoId','')),'');
  v_date:=nullif(btrim(coalesce(p_payload->>'fecha','')),'')::date;
  if v_card not in ('VISA','MC') then raise exception 'Tarjeta inválida'; end if;
  if v_total<=0 or v_cash_amount<0 or v_asset_amount<0 or v_external_amount<=0 or
     abs(v_cash_amount+v_asset_amount+v_external_amount-v_total)>0.01 then
    raise exception 'Los orígenes deben sumar el total a liquidar';
  end if;
  if v_asset_amount>0 and v_asset_id is null then
    raise exception 'Selecciona el activo de donde sale el dinero';
  end if;

  select * into v_installment from jaeger.card_installments
    where legacy_id=v_id and card_code=v_card for update;
  if not found or v_installment.state<>'activo' then
    raise exception 'Diferido no encontrado o ya liquidado';
  end if;
  perform jaeger_private.ensure_month(v_month);
  perform 1 from jaeger.balance_items
    where balance_id in (v_asset_id,v_installment.balance_id) order by balance_id for update;
  if v_asset_amount>0 and not exists(
    select 1 from jaeger.balance_items where balance_id=v_asset_id and balance_type='Activo' and active
  ) then
    raise exception 'Activo de origen no encontrado';
  end if;

  if v_cash_amount>0 then
    v_payload2:=jsonb_build_object(
      'mes',jaeger_private.normalize_month(coalesce(p_payload->>'mesGasto',p_payload->>'homeMes',v_month)),
      'mesRegistro',jaeger_private.normalize_month(coalesce(
        case when v_date is not null then jaeger_private.month_from_date(v_date) end,p_payload->>'homeMes',v_month
      )),
      'tipo','deuda','categoria','deuda','subcategoria',v_installment.name,'monto',v_cash_amount,
      'fecha',coalesce(p_payload->>'fecha',''),'notas','Liquidación '||v_installment.name||' · '||v_card
    );
    v_result:=jaeger_private.create_movement(v_payload2,p_request_id);
    v_movement_id:=v_result->>'id';
  end if;

  if v_asset_amount>0 then
    select * into v_item from jaeger.balance_items where balance_id=v_asset_id;
    perform jaeger_private.apply_balance_delta(v_asset_id,-v_asset_amount,p_request_id);
    perform jaeger_private.record_balance_change(v_asset_id,v_item.name,'Activo','liquidar diferido',
      v_item.current_value,v_item.current_value-v_asset_amount,v_installment.name,p_request_id);
  end if;

  v_non_cash_amount:=v_asset_amount+v_external_amount;
  if v_non_cash_amount>0 and v_installment.balance_id is not null then
    select * into v_liability from jaeger.balance_items where balance_id=v_installment.balance_id and active;
    if not found then raise exception 'Pasivo relacionado no encontrado'; end if;
    if v_liability.current_value+0.01<v_non_cash_amount then
      raise exception 'El pasivo relacionado no cubre el monto externo a liquidar';
    end if;
    perform jaeger_private.apply_balance_delta(v_installment.balance_id,-v_non_cash_amount,p_request_id);
    perform jaeger_private.record_balance_change(v_installment.balance_id,v_liability.name,'Pasivo','liquidar diferido',
      v_liability.current_value,v_liability.current_value-v_non_cash_amount,v_card,p_request_id);
  end if;

  delete from jaeger.card_charge_allocations a using jaeger.card_events e
    where (a.charge_event_id=e.legacy_id or a.payment_event_id=e.legacy_id)
      and e.installment_legacy_id=v_id and e.event_type='cargo'
      and jaeger_private.month_start(e.month_key)>=jaeger_private.month_start(v_month);
  update jaeger.card_events p set charge_legacy_id=null,request_id=p_request_id
    where p.charge_legacy_id in (
      select e.legacy_id from jaeger.card_events e where e.installment_legacy_id=v_id
        and e.event_type='cargo' and jaeger_private.month_start(e.month_key)>=jaeger_private.month_start(v_month)
    );
  delete from jaeger.card_events e where e.installment_legacy_id=v_id and e.event_type='cargo'
    and jaeger_private.month_start(e.month_key)>=jaeger_private.month_start(v_month);
  select coalesce(max(source_row_number),0)+1 into v_order from jaeger.card_events;
  insert into jaeger.card_events(legacy_id,source_row_number,recorded_at,month_key,card_code,event_type,amount,
    transaction_date,notes,origin,movement_legacy_id,category,subcategory,installment_legacy_id,source_kind,request_id)
  values(gen_random_uuid()::text,v_order,now(),v_month,v_card,'abono',v_total,v_date,'Liquidación '||v_installment.name,
    case when v_cash_amount=0 and v_asset_amount=0 then 'externo' else 'liquidacion' end,
    v_movement_id,'deuda',v_installment.name,v_id,'supabase',p_request_id);
  update jaeger.card_installments set state='liquidado',liquidation_month=v_month,
    source_timestamp=to_char(now() at time zone 'America/Guayaquil','YYYY-MM-DD HH24:MI:SS'),request_id=p_request_id
    where legacy_id=v_id;
  update jaeger.catalog_items set state='inactivo',request_id=p_request_id
    where kind='deuda' and lower(btrim(name))=lower(btrim(v_installment.name));
  if v_installment.balance_id is not null then
    update jaeger.balance_items set active=false,request_id=p_request_id where balance_id=v_installment.balance_id;
  end if;
  v_result:=jsonb_build_object('ok',true,'id',v_id,'registroId',coalesce(v_movement_id,''),'cardId',v_card,
    'mesAplicado',v_month,'linkedMovement',v_movement_id is not null,'montoExterno',v_external_amount);

  update jaeger.operation_requests set status='completed',response=v_result,error_message=null,
    completed_at=now(),updated_at=now() where request_id=p_request_id;
  perform public.jaeger_invalidate_api_cache();
  return v_result;
end;
$$;

revoke all on function public.jaeger_write_extended(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.jaeger_write_extended(text,uuid,text,jsonb) to service_role;

comment on function public.jaeger_write_extended(text,uuid,text,jsonb) is
  'Escrituras de Jaeger Spend. La liquidación de diferidos admite dinero externo sin reducir efectivo ni activos propios.';
