-- Allow the general history to delete a cash movement that belongs to a card
-- payment. The card event, its allocations and the financial movement are
-- removed atomically, so neither history surface can retain an orphan.

do $$
begin
  if to_regprocedure('public.jaeger_write_delete_legacy(text,uuid,text,jsonb)') is null then
    alter function public.jaeger_write(text,uuid,text,jsonb)
      rename to jaeger_write_delete_legacy;
  end if;
end;
$$;

create or replace function public.jaeger_write(
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
  v_existing jaeger.operation_requests%rowtype;
  v_movement jaeger.financial_movements%rowtype;
  v_result jsonb;
  v_id text;
  v_card_event_ids text[];
  v_card text;
  v_card_month text;
begin
  if p_operation <> 'eliminarMovimiento' then
    return public.jaeger_write_delete_legacy(
      p_operation, p_request_id, p_payload_hash, p_payload
    );
  end if;

  if p_request_id is null or btrim(coalesce(p_payload_hash, '')) = '' then
    raise exception 'Falta la clave de idempotencia';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Carga de escritura inválida';
  end if;

  v_id := btrim(coalesce(p_payload->>'id', ''));
  if v_id = '' then
    raise exception 'Selecciona el movimiento a eliminar';
  end if;

  select array_agg(e.legacy_id order by e.legacy_id), min(e.card_code), min(e.month_key)
    into v_card_event_ids, v_card, v_card_month
  from jaeger.card_events e
  where e.movement_legacy_id = v_id;

  if coalesce(array_length(v_card_event_ids, 1), 0) = 0 then
    return public.jaeger_write_delete_legacy(
      p_operation, p_request_id, p_payload_hash, p_payload
    );
  end if;

  -- A liquidation changes installment, catalog, asset and liability state. It
  -- must not be partially undone through the generic history delete action.
  if exists (
    select 1
    from jaeger.card_events e
    where e.legacy_id = any(v_card_event_ids)
      and e.installment_legacy_id is not null
      and e.origin in ('liquidacion', 'externo')
  ) then
    raise exception 'La liquidación de un diferido debe revertirse desde Tarjetas';
  end if;

  insert into jaeger.operation_requests(request_id, operation, payload_hash, status)
  values(p_request_id, p_operation, p_payload_hash, 'pending')
  on conflict(request_id) do nothing;

  select * into v_existing
  from jaeger.operation_requests
  where request_id = p_request_id
  for update;

  if v_existing.operation <> p_operation or v_existing.payload_hash <> p_payload_hash then
    raise exception 'La clave de idempotencia ya fue usada con otra operación';
  end if;
  if v_existing.status = 'completed' then
    return v_existing.response;
  end if;

  perform set_config('jaeger.request_id', p_request_id::text, true);

  select * into v_movement
  from jaeger.financial_movements
  where legacy_id = v_id
  for update;
  if not found then
    raise exception 'Movimiento no encontrado';
  end if;

  perform 1
  from jaeger.card_events
  where legacy_id = any(v_card_event_ids)
  order by legacy_id
  for update;

  delete from jaeger.card_charge_allocations
  where payment_event_id = any(v_card_event_ids)
     or charge_event_id = any(v_card_event_ids);

  update jaeger.card_events
  set charge_legacy_id = null,
      request_id = p_request_id
  where charge_legacy_id = any(v_card_event_ids);

  delete from jaeger.card_events
  where legacy_id = any(v_card_event_ids);

  v_result := jaeger_private.delete_movement(v_id, p_request_id, true)
    || jsonb_build_object(
      'cardId', v_card,
      'mesAplicado', v_card_month,
      'mesCaja', v_movement.cash_month,
      'linkedMovement', true,
      'linkedCardEvents', array_length(v_card_event_ids, 1)
    );

  update jaeger.operation_requests
  set status = 'completed',
      response = v_result,
      error_message = null,
      completed_at = now(),
      updated_at = now()
  where request_id = p_request_id;

  perform public.jaeger_invalidate_api_cache();
  return v_result;
end;
$$;

revoke all on function public.jaeger_write(text,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.jaeger_write(text,uuid,text,jsonb)
  to service_role;

comment on function public.jaeger_write(text,uuid,text,jsonb) is
  'Escrituras transaccionales de Jaeger Spend. El historial elimina también el evento de tarjeta vinculado.';
