-- Production verification for the two regressions reported on 2026-08-20.
-- The linked deletion is exercised inside a subtransaction and always rolled
-- back. The projection checks are read-only.

drop table if exists pg_temp.jaeger_regression_verify;

create temporary table jaeger_regression_verify (
  linked_movement_id text not null,
  linked_event_count bigint not null,
  movement_count bigint not null,
  card_event_count bigint not null,
  cache_generation bigint not null,
  linked_delete_result text not null default 'PENDING'
) on commit preserve rows;

insert into jaeger_regression_verify (
  linked_movement_id,
  linked_event_count,
  movement_count,
  card_event_count,
  cache_generation
)
select
  m.legacy_id,
  count(*),
  (select count(*) from jaeger.financial_movements),
  (select count(*) from jaeger.card_events),
  cc.generation
from jaeger.financial_movements m
join jaeger.card_events e on e.movement_legacy_id = m.legacy_id
cross join public.jaeger_cache_control cc
where cc.id = 1
  and not (
    e.installment_legacy_id is not null
    and e.origin in ('liquidacion', 'externo')
  )
group by m.legacy_id, cc.generation
order by max(m.recorded_at) desc
limit 1;

do $verify$
declare
  v_check jaeger_regression_verify%rowtype;
  v_response jsonb;
  v_verified boolean := false;
begin
  select * into v_check from jaeger_regression_verify limit 1;
  if not found then
    raise exception 'No existe un movimiento de tarjeta elegible para la prueba reversible';
  end if;

  begin
    v_response := public.jaeger_write(
      'eliminarMovimiento',
      gen_random_uuid(),
      'deployment-rollback-linked-delete-' || v_check.linked_movement_id,
      jsonb_build_object('id', v_check.linked_movement_id)
    );

    if coalesce((v_response->>'ok')::boolean, false) is not true
       or coalesce((v_response->>'linkedCardEvents')::integer, 0) <> v_check.linked_event_count
       or exists (
         select 1 from jaeger.financial_movements
         where legacy_id = v_check.linked_movement_id
       )
       or exists (
         select 1 from jaeger.card_events
         where movement_legacy_id = v_check.linked_movement_id
       ) then
      raise exception 'La eliminación vinculada no fue atómica';
    end if;

    v_verified := true;
    raise exception 'JAEGER_REGRESSION_ROLLBACK';
  exception
    when raise_exception then
      if sqlerrm <> 'JAEGER_REGRESSION_ROLLBACK' then
        raise;
      end if;
  end;

  if v_verified then
    update jaeger_regression_verify set linked_delete_result = 'OK';
  end if;
end;
$verify$;

with mc_liquidation as (
  select
    i.legacy_id,
    i.initial_balance,
    i.installment_amount,
    i.installments_at_base_month,
    i.base_month,
    i.liquidation_month,
    base_month.year as base_year,
    base_month.month_number as base_month_number,
    liquidation_month.year as liquidation_year,
    liquidation_month.month_number as liquidation_month_number
  from jaeger.card_installments i
  join jaeger.months base_month on base_month.month_key = i.base_month
  join jaeger.months liquidation_month on liquidation_month.month_key = i.liquidation_month
  where i.card_code = 'MC'
    and i.state = 'liquidado'
    and i.liquidation_month = 'Julio 26'
  order by i.source_timestamp desc nulls last, i.source_row_number desc
  limit 1
),
future_projection as (
  select
    h.month_key,
    max(h.amount) filter (where h.concept = 'Saldo Diferido') as effective_deferred,
    max(base.amount) filter (where base.concept = 'Saldo Diferido') as base_deferred,
    greatest(
      0::numeric,
      l.initial_balance - l.installment_amount * greatest(
        0,
        l.installments_at_base_month +
          ((h.year * 12 + h.month_number - 1) -
           (l.base_year * 12 + l.base_month_number - 1))
      )
    ) as liquidated_contribution
  from jaeger.card_history_effective h
  join jaeger.card_history_monthly base
    on base.card_code = h.card_code
   and base.year = h.year
   and base.month_number = h.month_number
  cross join mc_liquidation l
  where h.card_code = 'MC'
    and (h.year * 12 + h.month_number - 1) >
        (l.liquidation_year * 12 + l.liquidation_month_number - 1)
  group by h.month_key, h.year, h.month_number,
    l.initial_balance, l.installment_amount, l.installments_at_base_month,
    l.base_year, l.base_month_number
),
card_identities as (
  select
    r.card_code,
    r.year,
    r.month_number,
    max(r.amount) filter (where r.concept = 'Total/ Saldo Rotativo') as rotative,
    max(r.amount) filter (where r.concept = 'Saldo Diferido') as deferred,
    max(r.amount) filter (where r.concept = 'Saldo Real') as real_balance
  from jaeger.card_history_effective r
  group by r.card_code, r.year, r.month_number
)
select
  case when v.linked_delete_result = 'OK'
      and exists (
        select 1 from jaeger.financial_movements
        where legacy_id = v.linked_movement_id
      )
      and (select count(*) from jaeger.card_events
           where movement_legacy_id = v.linked_movement_id) = v.linked_event_count
      and (select count(*) from jaeger.financial_movements) = v.movement_count
      and (select count(*) from jaeger.card_events) = v.card_event_count
    then 'OK' else 'ERROR' end as eliminacion_vinculada_reversible,
  case when cc.generation = v.cache_generation
    then 'OK' else 'ERROR' end as rollback_cache,
  case when exists (select 1 from mc_liquidation)
      and not exists (
        select 1
        from future_projection p
        where p.liquidated_contribution > 0.004
          and p.effective_deferred >
              greatest(0, p.base_deferred - p.liquidated_contribution) + 0.01
      )
    then 'OK' else 'ERROR' end as diferido_fuera_de_meses_futuros,
  case when not exists (
      select 1 from card_identities
      where abs(real_balance - (rotative + deferred)) > 0.01
    ) then 'OK' else 'ERROR' end as identidad_saldo_real
from jaeger_regression_verify v
cross join public.jaeger_cache_control cc
where cc.id = 1;
