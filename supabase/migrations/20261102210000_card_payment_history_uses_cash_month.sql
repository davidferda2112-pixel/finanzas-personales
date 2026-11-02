-- Card payments funded from monthly cash appear in History on the payment
-- date. Their economic_month remains untouched: budgets, cash-flow snapshots,
-- and the confirmed available balance depend on that stored accounting month.

-- Undo the nine accounting-month edits made on 2026-11-02, if present.
-- The guard makes this safe for databases that never received that edit.
update jaeger.financial_movements as m
set economic_month = original.economic_month
from (values
  ('8914c16f-456d-4ca6-b685-37038c325b38', 'Octubre 26', 'Septiembre 26'),
  ('1279fac0-d110-444e-80e1-b894405e2642', 'Octubre 26', 'Septiembre 26'),
  ('f1bf4e58-3bbe-492c-af71-915d7f1c358d', 'Septiembre 26', 'Agosto 26'),
  ('1785800000969', 'Agosto 26', 'Julio 26'),
  ('1785799951580', 'Agosto 26', 'Julio 26'),
  ('1782942483215', 'Julio 26', 'Junio 26'),
  ('1780370486183', 'Mayo 26', 'Junio 26'),
  ('1779426423834', 'Mayo 26', 'Junio 26'),
  ('1779426241049', 'Mayo 26', 'Junio 26')
) as original(legacy_id, cash_month, economic_month)
where m.legacy_id = original.legacy_id
  and m.cash_month = original.cash_month
  and m.economic_month = original.cash_month
  and exists (
    select 1 from jaeger.card_events c
    where c.movement_legacy_id = m.legacy_id
      and c.event_type = 'abono' and c.origin = 'egreso'
  );

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
