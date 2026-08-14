-- Core movement/card writes are native, but the remaining administrative
-- writes still use Apps Script. Keep the global state explicitly hybrid.

create or replace function public.jaeger_set_native_writes_enabled(
  p_enabled boolean, p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state jsonb;
  v_operations jsonb := jsonb_build_array(
    'registrarMovimiento', 'actualizarMovimiento', 'eliminarMovimiento',
    'registrarMovimientoTarjeta', 'actualizarMovimientoTarjeta', 'eliminarMovimientoTarjeta'
  );
begin
  update jaeger.system_settings
  set setting_value = setting_value || jsonb_build_object(
        'enabled', p_enabled,
        'reason', left(coalesce(p_reason, ''), 160),
        'updated_at', now()
      ),
      updated_at = now()
  where setting_key = 'native_write.state'
  returning setting_value into v_state;

  update jaeger.system_settings
  set setting_value = setting_value || jsonb_build_object(
        'active_write_source', case when p_enabled then 'hybrid_guarded' else 'google_sheets' end,
        'native_write_operations', case when p_enabled then v_operations else '[]'::jsonb end,
        'write_cutover_completed', false,
        'phase', case when p_enabled then 6 else greatest(coalesce((setting_value->>'phase')::integer, 5), 5) end
      ),
      updated_at = now()
  where setting_key = 'migration.state';
  return v_state;
end;
$$;

revoke all on function public.jaeger_set_native_writes_enabled(boolean,text)
  from public, anon, authenticated;
grant execute on function public.jaeger_set_native_writes_enabled(boolean,text)
  to service_role;
