begin;

do $$
declare
  v_liability_before numeric;
  v_asset_before numeric;
  v_result jsonb;
  v_id text;
begin
  select current_value into v_liability_before
  from jaeger.balance_items where balance_id='2010401.3';
  select current_value into v_asset_before
  from jaeger.balance_items where balance_id='10102.06';

  v_result := public.jaeger_write(
    'registrarMovimiento',
    '70000000-0000-4000-8000-000000000001',
    'land-return-create',
    '{"mes":"Septiembre 26","mesRegistro":"Septiembre 26","tipo":"deuda","categoria":"deuda","subcategoria":"Devolución Terreno","monto":"1","fecha":"2026-09-08"}'::jsonb
  );
  v_id := v_result->>'id';
  assert v_id is not null;
  assert jsonb_array_length(v_result->'balanceImpactos')=2;
  assert (select current_value from jaeger.balance_items where balance_id='2010401.3')=v_liability_before-1;
  assert (select current_value from jaeger.balance_items where balance_id='10102.06')=v_asset_before+1;

  v_result := public.jaeger_write(
    'actualizarMovimiento',
    '70000000-0000-4000-8000-000000000002',
    'land-return-update',
    jsonb_build_object(
      'id',v_id,'mes','Septiembre 26','mesRegistro','Septiembre 26','tipo','deuda',
      'categoria','deuda','subcategoria','Devolución Terreno','monto','2','fecha','2026-09-08'
    )
  );
  assert (select current_value from jaeger.balance_items where balance_id='2010401.3')=v_liability_before-2;
  assert (select current_value from jaeger.balance_items where balance_id='10102.06')=v_asset_before+2;

  perform public.jaeger_write(
    'eliminarMovimiento',
    '70000000-0000-4000-8000-000000000003',
    'land-return-delete',
    jsonb_build_object('id',v_id)
  );
  assert (select current_value from jaeger.balance_items where balance_id='2010401.3')=v_liability_before;
  assert (select current_value from jaeger.balance_items where balance_id='10102.06')=v_asset_before;
end $$;

rollback;
