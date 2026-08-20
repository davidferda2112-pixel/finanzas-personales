-- Production verification for Jaeger Spend.
-- The two financial writes run inside an explicit transaction that is always
-- rolled back before the final result is shown.

drop table if exists pg_temp.jaeger_deploy_verify;

create temporary table jaeger_deploy_verify (
  target_month text not null,
  cache_generation bigint not null,
  movement_count bigint not null,
  active_installment_count bigint not null,
  movement_id text,
  installment_id text,
  installment_card text,
  installment_amount numeric
) on commit preserve rows;

with context as (
  select jaeger_private.month_name((now() at time zone 'America/Guayaquil')::date) as target_month
), installment_values as (
  select
    ci.legacy_id,
    ci.card_code,
    ci.balance_id,
    round(greatest(
      0::numeric,
      ci.initial_balance - ci.installment_amount * greatest(
        0,
        ci.installments_at_base_month +
        (
          extract(year from jaeger_private.month_start(c.target_month))::integer * 12 +
          extract(month from jaeger_private.month_start(c.target_month))::integer -
          extract(year from jaeger_private.month_start(ci.base_month))::integer * 12 -
          extract(month from jaeger_private.month_start(ci.base_month))::integer
        )
      )
    ), 2) as remaining_amount
  from jaeger.card_installments ci
  cross join context c
  where ci.state = 'activo'
), eligible_installment as (
  select i.*
  from installment_values i
  join jaeger.balance_items b
    on b.balance_id = i.balance_id
   and b.balance_type = 'Pasivo'
   and b.active
   and b.current_value + 0.01 >= i.remaining_amount
  where i.remaining_amount > 0.004
  order by i.legacy_id
  limit 1
), eligible_movement as (
  select m.legacy_id
  from jaeger.financial_movements m
  where not exists (
    select 1 from jaeger.card_events e where e.movement_legacy_id = m.legacy_id
  )
  order by m.recorded_at desc, m.source_row_number desc
  limit 1
)
insert into jaeger_deploy_verify (
  target_month, cache_generation, movement_count, active_installment_count,
  movement_id, installment_id, installment_card, installment_amount
)
select
  c.target_month,
  cc.generation,
  (select count(*) from jaeger.financial_movements),
  (select count(*) from jaeger.card_installments where state = 'activo'),
  (select legacy_id from eligible_movement),
  (select legacy_id from eligible_installment),
  (select card_code from eligible_installment),
  (select remaining_amount from eligible_installment)
from context c
cross join public.jaeger_cache_control cc
where cc.id = 1;

begin;

do $verify$
declare
  v_check jaeger_deploy_verify%rowtype;
begin
  select * into v_check from jaeger_deploy_verify limit 1;

  if v_check.movement_id is not null then
    perform public.jaeger_write(
      'eliminarMovimiento',
      gen_random_uuid(),
      'deployment-rollback-delete-' || v_check.movement_id,
      jsonb_build_object('id', v_check.movement_id)
    );
  end if;

  if v_check.installment_id is not null then
    perform public.jaeger_write_extended(
      'liquidarDiferidoTdc',
      gen_random_uuid(),
      'deployment-rollback-external-' || v_check.installment_id,
      jsonb_build_object(
        'tarjeta', v_check.installment_card,
        'diferidoId', v_check.installment_id,
        'total', v_check.installment_amount,
        'montoSaldo', 0,
        'montoActivo', 0,
        'montoExterno', v_check.installment_amount,
        'activoId', '',
        'mesPago', v_check.target_month,
        'mesGasto', v_check.target_month,
        'homeMes', v_check.target_month,
        'fecha', to_char((now() at time zone 'America/Guayaquil')::date, 'YYYY-MM-DD')
      )
    );
  end if;
end;
$verify$;

rollback;

with card_state as (
  select public.jaeger_native_read_source(
    'getTarjetasState',
    jsonb_build_array(jsonb_build_object(
      'mes', v.target_month,
      'idx', 0,
      'anio', 2000 + right(v.target_month, 2)::integer
    ))
  ) as value
  from jaeger_deploy_verify v
)
select
  case when to_regprocedure('public.jaeger_write(text,uuid,text,jsonb)') is not null
    then 'OK' else 'ERROR' end as escritura_nativa,
  case when position(
    'montoExterno' in pg_get_functiondef(
      'public.jaeger_write_extended(text,uuid,text,jsonb)'::regprocedure
    )
  ) > 0 then 'OK' else 'ERROR' end as liquidacion_externa,
  case when position(
    'generation < next_generation' in lower(pg_get_functiondef(
      'public.jaeger_invalidate_api_cache()'::regprocedure
    ))
  ) > 0 then 'OK' else 'ERROR' end as cache_segura,
  case when v.movement_id is null then 'OMITIDO_SIN_CANDIDATO'
    when exists (select 1 from jaeger.financial_movements m where m.legacy_id = v.movement_id)
      and (select count(*) from jaeger.financial_movements) = v.movement_count
    then 'OK' else 'ERROR' end as eliminacion_reversible,
  case when v.installment_id is null then 'OMITIDO_SIN_CANDIDATO'
    when exists (
      select 1 from jaeger.card_installments i
      where i.legacy_id = v.installment_id and i.state = 'activo'
    ) and (select count(*) from jaeger.card_installments where state = 'activo') = v.active_installment_count
    then 'OK' else 'ERROR' end as diferido_externo_reversible,
  case when cc.generation = v.cache_generation then 'OK' else 'ERROR' end as rollback_cache,
  case when cs.value->>'timezone' = 'America/Guayaquil'
      and jsonb_typeof(cs.value->'history') = 'array'
      and jsonb_typeof(cs.value->'installments') = 'array'
      and jsonb_typeof(cs.value->'events') = 'array'
    then 'OK' else 'ERROR' end as get_tarjetas_state,
  jsonb_array_length(cs.value->'history') as filas_historial_tarjetas,
  jsonb_array_length(cs.value->'events') as movimientos_tarjetas,
  jsonb_array_length(cs.value->'installments') as diferidos_totales
from jaeger_deploy_verify v
cross join public.jaeger_cache_control cc
cross join card_state cs
where cc.id = 1;
