-- Reclassify linked card payments paid from monthly cash into the same
-- economic month as their cash movement. The card statement month remains
-- on jaeger.card_events and is deliberately unchanged.
-- Safe to rerun: rows already aligned do not match the UPDATE predicate.
begin;

update jaeger.financial_movements as m
set economic_month = m.cash_month
from jaeger.card_events as c
where c.movement_legacy_id = m.legacy_id
  and c.event_type = 'abono'
  and c.origin = 'egreso'
  and m.economic_month is distinct from m.cash_month
  and m.cash_month = jaeger_private.month_from_date(m.transaction_date)
  and c.transaction_date = m.transaction_date;

select public.jaeger_invalidate_api_cache();
commit;
