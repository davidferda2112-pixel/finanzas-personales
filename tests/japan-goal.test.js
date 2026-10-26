const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {database}=require('./helpers/database.cjs'),{transformSource}=require('../lib/jaeger-supabase-read');
test('Japón: activos completos siguen el saldo y las partidas conservan identidad al editar o eliminar',async()=>{
 const db=await database();
 const call=async(p,payload)=>(await db.query('select public.jaeger_goal_write($1,$2,$3,$4::jsonb) r',[p,crypto.randomUUID(),crypto.randomUUID(),JSON.stringify(payload)])).rows[0].r;
 const read=async()=>transformSource('getViajeJapon',[],(await db.query("select public.jaeger_goal_read_source('getViajeJapon','[]') d")).rows[0].d);
 try{
 await db.exec("insert into jaeger.balance_items(balance_id,name,balance_type,group_name,base_value,current_value,active,custom,source_row_number) values('fund','Reserva','Activo','Grupo A',100,100,true,true,1)");
 await call('guardarAsignacionMeta',{balanceCodigo:'fund',modo:'full',monto:'0'});
 assert.equal((await read()).totalVinculado,100);
 await db.exec("update jaeger.balance_items set current_value=160,group_name='Grupo B' where balance_id='fund'");
 assert.equal((await read()).totalVinculado,160);assert.equal((await read()).asignaciones[0].grupo,'Grupo B');
 await db.exec("update jaeger.balance_items set current_value=0 where balance_id='fund'");
 assert.equal((await read()).asignaciones.length,1);assert.equal((await read()).totalVinculado,0);
 await db.exec("update jaeger.balance_items set current_value=200 where balance_id='fund'");
 const trip=await call('gestionarItemJapon',{seccion:'viaje',nombre:'Vuelo',presupuesto:'300',actual:'25'});
 const procedure=await call('gestionarItemJapon',{seccion:'tramites',nombre:'Pasaporte',presupuesto:'100',actual:'50'});
 let d=await read();assert.equal(d.totalPresupuesto,400);assert.equal(d.totalActual,275);assert.equal(d.porcentaje,68.75);
 await call('gestionarItemJapon',{id:trip.id,seccion:'viaje',nombre:'Vuelo actualizado',presupuesto:'500',actual:'25'});
 d=await read();assert.equal(d.items[0].id,String(trip.id));assert.equal(d.totalPresupuesto,600);
 await call('gestionarItemJapon',{id:procedure.id,accion:'eliminar'});
 d=await read();assert.equal(d.tramites.length,0);assert.equal(d.totalPresupuesto,500);assert.equal(d.totalActual,225);
 const stored=(await db.query('select active,actual from jaeger.japan_budget_items where id=$1',[procedure.id])).rows[0];assert.equal(stored.active,false);assert.equal(Number(stored.actual),50);
 await assert.rejects(call('gestionarItemJapon',{seccion:'viaje',nombre:'Malo',presupuesto:'-1',actual:'0'}),/Importes/);
 const request=crypto.randomUUID(),payload={seccion:'tramites',nombre:'Único',presupuesto:'0',actual:'0'};
 const run=()=>db.query('select public.jaeger_goal_write($1,$2,$3,$4::jsonb) r',['gestionarItemJapon',request,'same',JSON.stringify(payload)]);
 const one=await run(),two=await run();assert.deepEqual(one.rows,two.rows);assert.equal((await read()).tramites.length,1);
 await call('guardarAsignacionMeta',{balanceCodigo:'fund',modo:'fixed',monto:'40'});
 await db.exec("update jaeger.balance_items set current_value=250 where balance_id='fund'");assert.equal((await read()).totalVinculado,40);
 await call('guardarAsignacionMeta',{balanceCodigo:'fund',eliminar:true});assert.equal((await read()).totalVinculado,0);
 }finally{await db.close();}
});
test('historial previo a la nueva lógica no requiere conciliación',()=>{
 const data=transformSource('getBalanceGeneral',[],{groups:[],items:[],changes:[{created_at:'2026-08-20T10:00:00Z',source_timestamp:'2026-08-20',reconciliation_state:'pending'},{created_at:'2026-10-26T10:00:00Z',source_timestamp:'2026-10-26',reconciliation_state:'reconciled'}]});
 assert.equal(data.cambios[0].estado,'reconciled');assert.equal(data.cambios[1].estado,'historical');
});

