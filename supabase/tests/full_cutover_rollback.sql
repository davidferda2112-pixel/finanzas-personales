-- Execute inside BEGIN/ROLLBACK only. It exercises every remaining native write
-- without retaining any financial, catalog, balance, or card change.
do $$
declare
  r jsonb;
  r2 jsonb;
  balance_id text;
  deferred_id text;
begin
  r:=public.jaeger_write_extended('guardarBalanceItem','10000000-0000-4000-8000-000000000001','test-01',
    '{"tipo":"Activo","nombre":"QA Balance","valor":"2","grupo":"Activos Financieros"}'::jsonb);
  balance_id:=r->>'codigo';
  assert balance_id is not null;
  perform public.jaeger_write_extended('actualizarBalance','10000000-0000-4000-8000-000000000002','test-02',
    jsonb_build_object('codigo',balance_id,'nombre','QA Balance 2','valor','3','grupo','Activos Financieros'));
  perform public.jaeger_write_extended('moverBalanceItemOrden','10000000-0000-4000-8000-000000000003','test-03',
    jsonb_build_object('codigo',balance_id,'dir',-1));
  perform public.jaeger_write_extended('eliminarBalanceItem','10000000-0000-4000-8000-000000000004','test-04',
    jsonb_build_object('codigo',balance_id,'nota','rollback QA'));

  perform public.jaeger_write_extended('guardarBalanceGrupo','10000000-0000-4000-8000-000000000005','test-05',
    '{"tipo":"Activo","nombre":"QA Grupo"}'::jsonb);
  perform public.jaeger_write_extended('renombrarBalanceGrupo','10000000-0000-4000-8000-000000000006','test-06',
    '{"tipo":"Activo","oldNombre":"QA Grupo","nombre":"QA Grupo 2"}'::jsonb);
  perform public.jaeger_write_extended('ordenarBalanceGrupos','10000000-0000-4000-8000-000000000007','test-07',
    '{"tipo":"Activo","grupos":["Efectivo y Equivalentes","Activos Financieros","QA Grupo 2"]}'::jsonb);
  perform public.jaeger_write_extended('congelarBalanceGeneral','10000000-0000-4000-8000-000000000008','test-08','{}'::jsonb);
  perform public.jaeger_write_extended('repararCatalogoFinanciero','10000000-0000-4000-8000-000000000009','test-09','{}'::jsonb);

  perform public.jaeger_write_extended('actualizarJapon','10000000-0000-4000-8000-000000000010','test-10',
    '{"item":"Formulario DS-160","monto":"185"}'::jsonb);
  perform public.jaeger_write_extended('guardarPinturasMes','10000000-0000-4000-8000-000000000011','test-11',
    '{"mes":"Agosto 26","stockInicial":"26","stockAgregado":"10","stockActual":"36","autoconsumo":"0","descuento":"0"}'::jsonb);
  perform public.jaeger_write_extended('limpiarPinturasMes','10000000-0000-4000-8000-000000000012','test-12',
    '{"id":"Agosto 26"}'::jsonb);
  perform public.jaeger_write_extended('marcarNotifLeida','10000000-0000-4000-8000-000000000013','test-13',
    '{"id":"999999999"}'::jsonb);

  perform public.jaeger_write_extended('gestionarItemCategoria','10000000-0000-4000-8000-000000000014','test-14',
    '{"accion":"agregar","mes":"Agosto 26","categoria":"Necesidades","nombre":"QA Temporal","presupuesto":"5"}'::jsonb);
  perform public.jaeger_write_extended('gestionarItemCategoria','10000000-0000-4000-8000-000000000015','test-15',
    '{"accion":"editar","mes":"Agosto 26","categoria":"Necesidades","oldNombre":"QA Temporal","nombre":"QA Temporal 2","presupuesto":"6"}'::jsonb);
  perform public.jaeger_write_extended('gestionarItemCategoria','10000000-0000-4000-8000-000000000016','test-16',
    '{"accion":"eliminar","mes":"Agosto 26","categoria":"Necesidades","oldNombre":"QA Temporal 2"}'::jsonb);
  perform public.jaeger_write_extended('crearMesNuevo','10000000-0000-4000-8000-000000000017','test-17',
    '{"id":"Octubre 26"}'::jsonb);

  r:=public.jaeger_write_extended('registrarDiferidoTdc','10000000-0000-4000-8000-000000000018','test-18',
    '{"tarjeta":"VISA","nombre":"QA Diferido","inicial":"1","cuota":"1","mesInicio":"Agosto 26","balanceNombreNuevo":"QA Pasivo","grupo":"Tarjeta de Crédito"}'::jsonb);
  deferred_id:=r->>'id';
  assert deferred_id is not null;
  r2:=public.jaeger_write_extended('registrarDiferidoTdc','10000000-0000-4000-8000-000000000018','test-18',
    '{"tarjeta":"VISA","nombre":"QA Diferido","inicial":"1","cuota":"1","mesInicio":"Agosto 26","balanceNombreNuevo":"QA Pasivo","grupo":"Tarjeta de Crédito"}'::jsonb);
  assert r=r2;
  perform public.jaeger_write_extended('liquidarDiferidoTdc','10000000-0000-4000-8000-000000000019','test-19',
    jsonb_build_object('tarjeta','VISA','diferidoId',deferred_id,'total','1','montoSaldo','0',
      'montoActivo','1','activoId','10101.01','mesPago','Agosto 26','fecha','2026-08-14'));

  assert (select count(*) from jaeger.operation_requests where request_id between
    '10000000-0000-4000-8000-000000000001'::uuid and '10000000-0000-4000-8000-000000000019'::uuid)=19;
end $$;
