-- Final cutover flag. Apply only after the extended RPCs and the Vercel bridge
-- are deployed and the rollback validation suite has passed.
update jaeger.system_settings
set setting_value=setting_value||jsonb_build_object(
      'enabled',true,
      'strict',true,
      'operations',jsonb_build_array(
        'moverBalanceItemOrden','repararCatalogoFinanciero','congelarBalanceGeneral',
        'guardarBalanceGrupo','renombrarBalanceGrupo','ordenarBalanceGrupos',
        'limpiarPinturasMes','actualizarBalance','guardarBalanceItem','eliminarBalanceItem',
        'actualizarJapon','guardarPinturasMes',
        'registrarMovimientoTarjeta','actualizarMovimientoTarjeta','eliminarMovimientoTarjeta',
        'registrarMovimiento','actualizarMovimiento','eliminarMovimiento',
        'gestionarItemCategoria','marcarNotifLeida','crearMesNuevo',
        'registrarDiferidoTdc','liquidarDiferidoTdc'
      ),
      'reason','Corte completo validado con transacciones revertidas el 2026-08-14',
      'updated_at',now()
    ),
    updated_at=now()
where setting_key='native_write.state';

update jaeger.system_settings
set setting_value=setting_value||jsonb_build_object(
      'enabled',true,'fresh',true,'phase',7,'writes_source','supabase',
      'strict_source',true,'validated_at',now(),
      'validation_reason','full_supabase_cutover_after_rollback_suite'
    ),
    updated_at=now()
where setting_key='native_read.state';

update jaeger.system_settings
set setting_value=setting_value||jsonb_build_object(
      'phase',7,
      'active_source','supabase',
      'active_read_source','supabase',
      'active_write_source','supabase',
      'target_source','supabase',
      'backup_source','google_sheets',
      'cutover_completed',true,
      'read_cutover_completed',true,
      'write_cutover_completed',true,
      'completed_at',now()
    ),
    updated_at=now()
where setting_key='migration.state';
