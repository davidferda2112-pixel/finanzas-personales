-- The liquidation was made for July 2026, but the previous modal selected the
-- following month while calculating July's balance. Repair the economic month
-- without changing the amount, funding source or transaction date.

do $$
declare
  v_event_id text;
  v_request_id uuid;
begin
  select e.legacy_id, e.request_id
    into v_event_id, v_request_id
  from jaeger.card_events e
  join jaeger.card_installments i
    on i.legacy_id = e.installment_legacy_id
  where i.legacy_id = 'DIF-MC-1'
    and i.card_code = 'MC'
    and i.state = 'liquidado'
    and i.liquidation_month = 'Agosto 26'
    and e.event_type = 'abono'
    and e.origin = 'externo'
    and e.month_key = 'Agosto 26'
    and abs(e.amount - 138.31) < 0.005
  order by e.recorded_at desc
  limit 1
  for update of e, i;

  if v_event_id is null then
    if exists (
      select 1
      from jaeger.card_installments i
      join jaeger.card_events e on e.installment_legacy_id = i.legacy_id
      where i.legacy_id = 'DIF-MC-1'
        and i.card_code = 'MC'
        and i.state = 'liquidado'
        and i.liquidation_month = 'Julio 26'
        and e.event_type = 'abono'
        and e.month_key = 'Julio 26'
        and abs(e.amount - 138.31) < 0.005
    ) then
      return;
    end if;
    raise exception 'No coincide la liquidación de Television Said que debe corregirse a Julio 26';
  end if;

  perform jaeger_private.ensure_month('Julio 26');

  update jaeger.card_events
  set month_key = 'Julio 26'
  where legacy_id = v_event_id;

  update jaeger.card_installments
  set liquidation_month = 'Julio 26'
  where legacy_id = 'DIF-MC-1'
    and card_code = 'MC';

  if v_request_id is not null then
    update jaeger.operation_requests
    set response = jsonb_set(coalesce(response, '{}'::jsonb), '{mesAplicado}', '"Julio 26"'::jsonb, true),
        updated_at = now()
    where request_id = v_request_id
      and operation = 'liquidarDiferidoTdc';
  end if;

  perform public.jaeger_invalidate_api_cache();
end;
$$;
