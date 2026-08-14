-- Effective card history calculated from the imported base, operational card
-- events and installment state. The result preserves the six official rows.

create or replace view jaeger.card_history_effective
with (security_invoker = true)
as
with recursive
base as (
  select
    h.card_code,
    h.year::integer as year_number,
    h.month_number::integer as month_number,
    m.month_key,
    coalesce(max(h.amount) filter (where h.concept = 'Saldo anterior'), 0)::numeric as base_previous,
    coalesce(max(h.amount) filter (where h.concept = 'Consumos'), 0)::numeric as base_charges,
    coalesce(max(h.amount) filter (where h.concept = U&'Pagos / Cr\00E9ditos'), 0)::numeric as base_payments,
    coalesce(max(h.amount) filter (where h.concept = 'Saldo Diferido'), 0)::numeric as base_deferred
  from jaeger.card_history_monthly h
  join jaeger.months m
    on m.year = h.year
   and m.month_number = h.month_number
  group by h.card_code, h.year, h.month_number, m.month_key
),
events as (
  select
    e.card_code,
    m.year::integer as year_number,
    m.month_number::integer as month_number,
    coalesce(sum(e.amount) filter (where e.event_type = 'cargo'), 0)::numeric as charges,
    coalesce(sum(e.amount) filter (where e.event_type = 'abono'), 0)::numeric as payments_display,
    coalesce(sum(e.amount) filter (
      where e.event_type = 'abono'
        and e.installment_legacy_id is null
    ), 0)::numeric as payments_rotative
  from jaeger.card_events e
  join jaeger.months m on m.month_key = e.month_key
  group by e.card_code, m.year, m.month_number
),
prepared as (
  select
    b.*,
    row_number() over (
      partition by b.card_code, b.year_number
      order by b.month_number
    ) as sequence_number,
    round(b.base_charges + coalesce(e.charges, 0), 2) as charges,
    round(b.base_payments + coalesce(e.payments_display, 0), 2) as payments_display,
    round(b.base_payments + coalesce(e.payments_rotative, 0), 2) as payments_rotative,
    case
      when abs(b.base_deferred) > 0.004 then round(b.base_deferred, 2)
      else round(coalesce((
        select sum(greatest(
          0,
          i.initial_balance - i.installment_amount * greatest(
            0,
            i.installments_at_base_month +
              ((b.year_number * 12 + b.month_number - 1) -
               (base_month.year * 12 + base_month.month_number - 1))
          )
        ))
        from jaeger.card_installments i
        join jaeger.months base_month on base_month.month_key = i.base_month
        left join jaeger.months liquidation_month
          on liquidation_month.month_key = i.liquidation_month
        where i.card_code = b.card_code
          and (b.year_number * 12 + b.month_number - 1) >=
              (base_month.year * 12 + base_month.month_number - 1) -
              greatest(0, i.installments_at_base_month - 1)
          and not (
            i.state = 'liquidado'
            and liquidation_month.month_key is not null
            and (b.year_number * 12 + b.month_number - 1) >=
                (liquidation_month.year * 12 + liquidation_month.month_number - 1)
          )
      ), 0), 2)
    end as deferred
  from base b
  left join events e using (card_code, year_number, month_number)
),
calculated as (
  select
    p.card_code,
    p.year_number,
    p.month_number,
    p.month_key,
    p.sequence_number,
    round(p.base_previous, 2) as previous_balance,
    p.charges,
    p.payments_display,
    p.payments_rotative,
    p.deferred,
    round(p.base_previous + p.charges - p.payments_rotative, 2) as rotative
  from prepared p
  where p.sequence_number = 1

  union all

  select
    p.card_code,
    p.year_number,
    p.month_number,
    p.month_key,
    p.sequence_number,
    c.rotative,
    p.charges,
    p.payments_display,
    p.payments_rotative,
    p.deferred,
    round(c.rotative + p.charges - p.payments_rotative, 2)
  from calculated c
  join prepared p
    on p.card_code = c.card_code
   and p.year_number = c.year_number
   and p.sequence_number = c.sequence_number + 1
)
select
  c.card_code,
  c.year_number::smallint as year,
  c.month_number::smallint as month_number,
  c.month_key,
  row_value.sort_order,
  row_value.concept,
  row_value.amount::numeric(18,2) as amount
from calculated c
cross join lateral (
  values
    (1::smallint, 'Saldo anterior'::text, c.previous_balance),
    (2::smallint, 'Consumos'::text, c.charges),
    (3::smallint, U&'Pagos / Cr\00E9ditos'::text, c.payments_display),
    (4::smallint, 'Total/ Saldo Rotativo'::text, c.rotative),
    (5::smallint, 'Saldo Diferido'::text, c.deferred),
    (6::smallint, 'Saldo Real'::text, round(c.rotative + c.deferred, 2))
) as row_value(sort_order, concept, amount);

revoke all on table jaeger.card_history_effective from public, anon, authenticated;
grant select on table jaeger.card_history_effective to service_role;

comment on view jaeger.card_history_effective is
  'Historial efectivo de tarjetas con exactamente seis conceptos. Saldo Real = Total/ Saldo Rotativo + Saldo Diferido.';
