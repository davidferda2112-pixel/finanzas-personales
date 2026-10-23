-- Run in a single session. All test rows, requests and audit entries roll back.
begin;
do $$
declare v_id text; v_result jsonb; v_req uuid:=gen_random_uuid(); v_payload jsonb;
begin
 insert into jaeger.balance_items(balance_id,name,balance_type,base_value,current_value,group_name,active,custom)
 values('TEST-SAVINGS-ASSET','Prueba transaccional','Activo',300,300,'Activos Financieros',true,true),
       ('TEST-SAVINGS-DEBT','Prueba deuda','Pasivo',200,200,'Préstamos',true,true);
 v_payload:='{"mes":"Octubre 26","fecha":"2026-10-22","tipo":"necesidad","subcategoria":"Salud","monto":"75","sourceAssetId":"TEST-SAVINGS-ASSET","operationCode":"savings_expense"}';
 v_result:=public.jaeger_write('registrarMovimiento',v_req,'rollback-savings',v_payload);
 v_id:=v_result->>'id';
 assert public.jaeger_write('registrarMovimiento',v_req,'rollback-savings',v_payload)=v_result;
 assert (select current_value from jaeger.balance_items where balance_id='TEST-SAVINGS-ASSET')=225;
 assert (select amount from jaeger.financial_movements where legacy_id=v_id)=75;
 assert exists(select 1 from jaeger.balance_log where movement_id=v_id and previous_value=300 and new_value=225);
 assert exists(select 1 from jaeger.funding_allocations where movement_id=v_id and amount=75);
 perform public.jaeger_write('actualizarMovimiento',gen_random_uuid(),'rollback-edit',v_payload||jsonb_build_object('id',v_id,'monto','80'));
 assert (select current_value from jaeger.balance_items where balance_id='TEST-SAVINGS-ASSET')=220;
 perform public.jaeger_write('eliminarMovimiento',gen_random_uuid(),'rollback-delete',jsonb_build_object('id',v_id));
 assert (select current_value from jaeger.balance_items where balance_id='TEST-SAVINGS-ASSET')=300;
 begin
   perform public.jaeger_write('registrarMovimiento',gen_random_uuid(),'rollback-overdraw',v_payload||'{"monto":"301"}');
   raise exception 'Overdraft accepted';
 exception when others then
   if sqlerrm='Overdraft accepted' then raise; end if;
 end;
 v_result:=public.jaeger_write('registrarMovimiento',gen_random_uuid(),'rollback-debt',v_payload||
   '{"tipo":"deuda","subcategoria":"Préstamo","balanceCodigo":"TEST-SAVINGS-DEBT","monto":"85","interestAmount":"5"}');
 assert (select current_value from jaeger.balance_items where balance_id='TEST-SAVINGS-ASSET')=215;
 assert (select current_value from jaeger.balance_items where balance_id='TEST-SAVINGS-DEBT')=120;
 assert jaeger_private.stored_movement_sign('ingreso','Devolución de ahorro','TEST-SAVINGS-ASSET')=-1;
 assert jaeger_private.stored_movement_sign('ingreso','Préstamos recibidos','TEST-SAVINGS-DEBT')=1;
 assert jaeger_private.stored_movement_sign('ingreso','DevoluciÃ³n de ahorro','TEST-SAVINGS-ASSET')=-1;
end $$;
rollback;
