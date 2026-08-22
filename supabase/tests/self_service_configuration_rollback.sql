begin;

create temporary table jaeger_configuration_verify (
  card_code text not null,
  asset_id text not null,
  card_count integer not null,
  allocation_count integer not null,
  cache_generation bigint not null
) on commit drop;

insert into jaeger_configuration_verify
select
  'QA_CARD',
  (select balance_id from jaeger.balance_items
   where balance_type = 'Activo' and active and current_value >= 1
   order by balance_id limit 1),
  (select count(*) from jaeger.credit_cards),
  (select count(*) from jaeger.goal_asset_allocations),
  generation
from public.jaeger_cache_control
where id = 1;

select public.jaeger_config_write(
  'guardarTarjetaConfiguracion',
  '31111111-1111-4111-8111-111111111111'::uuid,
  'configuration-card-create',
  '{"codigo":"QA_CARD","nombre":"QA Card","emisor":"QA","ultimos4":"9999","red":"other","estilo":"generic-card","activo":true}'::jsonb
);

select public.jaeger_config_write(
  'guardarAsignacionMeta',
  '32222222-2222-4222-8222-222222222222'::uuid,
  'configuration-goal-allocation',
  jsonb_build_object(
    'meta', 'japan',
    'balanceCodigo', v.asset_id,
    'monto', '1'
  )
)
from jaeger_configuration_verify v;

do $$
declare
  v jaeger_configuration_verify%rowtype;
  v_history_rows integer;
  v_identity_errors integer;
begin
  select * into v from jaeger_configuration_verify;

  if not exists (
    select 1 from jaeger.credit_cards where card_code = v.card_code and active
  ) then
    raise exception 'La tarjeta de prueba no fue creada';
  end if;

  select count(*) into v_history_rows
  from jaeger.card_history_effective
  where card_code = v.card_code;
  if v_history_rows <> 144 then
    raise exception 'La tarjeta nueva debe proyectar 144 filas, obtuvo %', v_history_rows;
  end if;

  if not exists (
    select 1 from jaeger.goal_asset_allocations
    where goal_key = 'japan' and balance_id = v.asset_id and allocated_amount = 1
  ) then
    raise exception 'La asignacion de meta no fue creada';
  end if;

  with card_months as (
    select card_code, year, month_number,
      max(amount) filter (where concept = 'Total/ Saldo Rotativo') as revolving,
      max(amount) filter (where concept = 'Saldo Diferido') as deferred,
      max(amount) filter (where concept = 'Saldo Real') as real_balance
    from jaeger.card_history_effective
    group by card_code, year, month_number
  )
  select count(*) into v_identity_errors
  from card_months
  where abs(real_balance - revolving - deferred) > 0.004;
  if v_identity_errors <> 0 then
    raise exception 'La identidad de tarjetas fallo en % meses', v_identity_errors;
  end if;

  if jsonb_array_length(public.jaeger_configuration_source('getConfiguracion', '[]'::jsonb) -> 'cards') < 3 then
    raise exception 'La lectura de configuracion no incluye la tarjeta creada';
  end if;
end;
$$;

rollback;

select
  case when not exists (select 1 from jaeger.credit_cards where card_code = 'QA_CARD')
    then 'OK' else 'ERROR' end as tarjeta_reversible,
  case when not exists (
    select 1 from jaeger.goal_asset_allocations where request_id = '32222222-2222-4222-8222-222222222222'::uuid
  ) then 'OK' else 'ERROR' end as asignacion_reversible,
  case when not exists (
    select 1 from jaeger.operation_requests
    where request_id in (
      '31111111-1111-4111-8111-111111111111'::uuid,
      '32222222-2222-4222-8222-222222222222'::uuid
    )
  ) then 'OK' else 'ERROR' end as idempotencia_reversible;
