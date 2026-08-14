-- Keep every status surface consistent with the completed 16-read/23-write cutover.
with operations as (
  select jsonb_build_array(
    'moverBalanceItemOrden','repararCatalogoFinanciero','congelarBalanceGeneral',
    'guardarBalanceGrupo','renombrarBalanceGrupo','ordenarBalanceGrupos',
    'limpiarPinturasMes','actualizarBalance','guardarBalanceItem','eliminarBalanceItem',
    'actualizarJapon','guardarPinturasMes',
    'registrarMovimientoTarjeta','actualizarMovimientoTarjeta','eliminarMovimientoTarjeta',
    'registrarMovimiento','actualizarMovimiento','eliminarMovimiento',
    'gestionarItemCategoria','marcarNotifLeida','crearMesNuevo',
    'registrarDiferidoTdc','liquidarDiferidoTdc'
  ) value
), reads as (
  select jsonb_build_array(
    'getBootState','getInitialState','getMesesDisponibles','getMesData','getMovimientosMes',
    'getPinturasMes','getViajeJapon','getFlujoCaja','getBalanceGeneral','getTarjetasState',
    'parseTarjetas','getMovimientosTarjeta','getDesgloseSub','getCatalogoFinanciero',
    'getDiferidosTdc','getNotificaciones'
  ) value
)
update jaeger.system_settings s
set setting_value=s.setting_value||jsonb_build_object(
      'native_write_operations',o.value,
      'native_read_operations',r.value,
      'updated_at',now()
    ),updated_at=now()
from operations o,reads r
where s.setting_key in ('native_read.state','migration.state');
