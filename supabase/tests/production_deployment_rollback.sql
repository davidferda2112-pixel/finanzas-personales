-- Production verification for Jaeger Spend.
-- The two financial writes run inside a PL/pgSQL subtransaction that is always
-- rolled back before the final result is shown. This works in the Supabase SQL
-- editor, which wraps the complete submitted script in its own transaction.

drop table if exists pg_temp.jaeger_deploy_verify;

create temporary table jaeger_deploy_verify (
  target_month text not null,
  cache_generation bigint not null,
  movement_count bigint not null,
  active_installment_count bigint not null,
  movement_id text,
  installment_id text,
  installment_card text,
  installment_amount numeric,
  external_test_result text not null default 'PENDING'
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

do $verify$
declare
  v_check jaeger_deploy_verify%rowtype;
  v_create_response jsonb;
  v_liquidation_response jsonb;
  v_external_request uuid;
  v_test_id text;
  v_test_card text;
  v_test_balance_id text;
  v_test_name text;
  v_test_amount numeric;
  v_liability_before numeric;
  v_liability_after numeric;
  v_external_verified boolean := false;
begin
  select * into v_check from jaeger_deploy_verify limit 1;

  begin
    if v_check.movement_id is not null then
      perform public.jaeger_write(
        'eliminarMovimiento',
        gen_random_uuid(),
        'deployment-rollback-delete-' || v_check.movement_id,
        jsonb_build_object('id', v_check.movement_id)
      );
    end if;

    if v_check.installment_id is not null then
      v_test_id := v_check.installment_id;
      v_test_card := v_check.installment_card;
      v_test_amount := v_check.installment_amount;
    else
      v_test_card := 'VISA';
      v_test_amount := 1;
      v_test_name := 'QA externo ' || left(gen_random_uuid()::text, 8);
      v_create_response := public.jaeger_write_extended(
        'registrarDiferidoTdc',
        gen_random_uuid(),
        'deployment-rollback-create-' || v_test_name,
        jsonb_build_object(
          'tarjeta', v_test_card,
          'nombre', v_test_name,
          'inicial', v_test_amount,
          'cuota', v_test_amount,
          'mesInicio', v_check.target_month,
          'balanceNombreNuevo', 'QA pasivo ' || v_test_name,
          'grupo', 'Tarjeta de Crédito'
        )
      );
      v_test_id := v_create_response->>'id';
    end if;

    select i.balance_id, b.current_value
      into v_test_balance_id, v_liability_before
    from jaeger.card_installments i
    join jaeger.balance_items b on b.balance_id = i.balance_id and b.active
    where i.legacy_id = v_test_id and i.card_code = v_test_card;
    if v_test_balance_id is null or v_liability_before + 0.01 < v_test_amount then
      raise exception 'El pasivo de prueba no cubre la liquidación externa';
    end if;

    v_external_request := gen_random_uuid();
    v_liquidation_response := public.jaeger_write_extended(
      'liquidarDiferidoTdc',
      v_external_request,
      'deployment-rollback-external-' || v_test_id,
      jsonb_build_object(
        'tarjeta', v_test_card,
        'diferidoId', v_test_id,
        'total', v_test_amount,
        'montoSaldo', 0,
        'montoActivo', 0,
        'montoExterno', v_test_amount,
        'activoId', '',
        'mesPago', v_check.target_month,
        'mesGasto', v_check.target_month,
        'homeMes', v_check.target_month,
        'fecha', to_char((now() at time zone 'America/Guayaquil')::date, 'YYYY-MM-DD')
      )
    );

    select current_value into v_liability_after
    from jaeger.balance_items where balance_id = v_test_balance_id;
    if coalesce((v_liquidation_response->>'ok')::boolean, false) is not true
       or (v_liquidation_response->>'montoExterno')::numeric <> v_test_amount
       or coalesce((v_liquidation_response->>'linkedMovement')::boolean, true) is not false
       or abs((0 + 0 + v_test_amount) - v_test_amount) > 0.01
       or abs((v_liability_before - v_liability_after) - v_test_amount) > 0.01
       or exists (
         select 1 from jaeger.financial_movements where request_id = v_external_request
       )
       or not exists (
         select 1 from jaeger.card_installments
         where legacy_id = v_test_id and state = 'liquidado'
       )
       or not exists (
         select 1 from jaeger.card_events
         where request_id = v_external_request and event_type = 'abono'
           and origin = 'externo' and amount = v_test_amount
           and movement_legacy_id is null
       )
       or exists (
         select 1 from jaeger.balance_items
         where balance_id = v_test_balance_id and active
       ) then
      raise exception 'La identidad financiera de la liquidación externa no se cumplió';
    end if;
    v_external_verified := true;

    raise exception 'JAEGER_DEPLOYMENT_ROLLBACK';
  exception
    when raise_exception then
      if sqlerrm <> 'JAEGER_DEPLOYMENT_ROLLBACK' then
        raise;
      end if;
  end;

  if v_external_verified then
    update jaeger_deploy_verify set external_test_result = 'OK';
  end if;
end;
$verify$;

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
  case when v.external_test_result = 'OK'
      and (select count(*) from jaeger.card_installments where state = 'activo') = v.active_installment_count
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
