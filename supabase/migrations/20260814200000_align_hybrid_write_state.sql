-- Native reads remain fresh after the six transactional Supabase writes.
-- Other administrative writes still invalidate and fall back through Sheets.
update jaeger.system_settings
set setting_value = setting_value || jsonb_build_object(
      'writes_source', 'hybrid_guarded',
      'native_write_operations', jsonb_build_array(
        'registrarMovimiento', 'actualizarMovimiento', 'eliminarMovimiento',
        'registrarMovimientoTarjeta', 'actualizarMovimientoTarjeta', 'eliminarMovimientoTarjeta'
      )
    ),
    updated_at = now()
where setting_key = 'native_read.state';
