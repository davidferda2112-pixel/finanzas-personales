-- The opening balance in History follows payment dates as well. A card
-- payment recognized in another accounting month must be shifted in the
-- history running balance without changing the confirmed cash calculation.
create or replace function public.jaeger_native_read_source(
  p_fn text, p_args jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $body$
declare
  result jsonb;
  history_month text;
begin
  result := public.jaeger_native_read_source_financing(p_fn, p_args);

  if p_fn = 'getMovimientosMes' then
    history_month := result->>'month';
    result := result || jsonb_build_object('historyBaseAdjustment', coalesce((
      select sum(case
        when economic.starts_on < viewed.starts_on and cash.starts_on >= viewed.starts_on
          then m.amount
        when cash.starts_on < viewed.starts_on and economic.starts_on >= viewed.starts_on
          then -m.amount
        else 0
      end)
      from jaeger.financial_movements m
      join jaeger.months economic on economic.month_key = m.economic_month
      join jaeger.months cash on cash.month_key = m.cash_month
      join jaeger.months viewed on viewed.month_key = history_month
      where exists (
        select 1 from jaeger.card_events c
        where c.movement_legacy_id = m.legacy_id
          and c.event_type = 'abono' and c.origin = 'egreso'
      )
    ), 0));
    result := result || jsonb_build_object('movements', coalesce((
      select jsonb_agg(
        to_jsonb(m) || jsonb_build_object(
          'economic_month', case when card.is_card_payment then m.cash_month else m.economic_month end,
          'funded_amount', coalesce((
            select sum(a.amount)
            from jaeger.funding_allocations a
            join jaeger.funding_operations o using(operation_id)
            where a.movement_id = m.legacy_id and o.state <> 'cancelled'
          ), 0),
          'funding_links', (
            select coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object(
              'allocated_amount', a.amount, 'source_name', b.name
            )), '[]'::jsonb)
            from jaeger.funding_allocations a
            join jaeger.funding_operations o using(operation_id)
            left join jaeger.balance_items b on b.balance_id = o.source_asset_id
            where a.movement_id = m.legacy_id and o.state <> 'cancelled'
          )
        ) order by m.source_row_number
      )
      from jaeger.financial_movements m
      left join lateral (
        select true as is_card_payment
        from jaeger.card_events c
        where c.movement_legacy_id = m.legacy_id
          and c.event_type = 'abono' and c.origin = 'egreso'
        limit 1
      ) card on true
      where (coalesce(card.is_card_payment, false) and m.cash_month = history_month)
         or (not coalesce(card.is_card_payment, false) and m.economic_month = history_month)
    ), '[]'::jsonb));
  end if;

  if p_fn = 'getBalanceGeneral' then
    result := result || jsonb_build_object('reconciliationCases', coalesce((
      select jsonb_agg(to_jsonb(c) || jsonb_build_object('account_name', b.name) order by c.case_key)
      from jaeger.reconciliation_cases c
      left join jaeger.balance_items b on b.balance_id = c.balance_id
    ), '[]'::jsonb));
  end if;
  if p_fn in ('getMesData', 'getBalanceGeneral', 'getMovimientosMes', 'getFlujoCaja') then
    result := result || jsonb_build_object('cashObservation', (
      select evidence->'cash_observation'
      from jaeger.reconciliation_cases
      where balance_id = '10101.05' and evidence ? 'cash_observation'
      order by updated_at desc limit 1
    ));
  end if;
  return result;
end $body$;

revoke all on function public.jaeger_native_read_source(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.jaeger_native_read_source(text, jsonb)
  to service_role;
select public.jaeger_invalidate_api_cache();
