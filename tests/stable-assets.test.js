const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {database}=require('./helpers/database.cjs'),{transformSource}=require('../lib/jaeger-supabase-read');
test('un activo nuevo conserva su identidad y saldo al pasar a un grupo nuevo',async()=>{
 const db=await database();
 const call=async(fn,payload,extended=false)=>(await db.query('select public.'+(extended?'jaeger_write_extended':'jaeger_write')+'($1,$2,$3,$4::jsonb) result',[fn,crypto.randomUUID(),crypto.randomUUID(),JSON.stringify(payload)])).rows[0].result;
 const value=async id=>Number((await db.query('select current_value from jaeger.balance_items where balance_id=$1',[id])).rows[0].current_value);
 const catalog=async()=>transformSource('getCatalogoFinanciero',[],(await db.query("select public.jaeger_native_read_source_extended('getCatalogoFinanciero','[]') data")).rows[0].data).data;
 try{
 await db.exec("insert into jaeger.months values('Octubre 26',2026,10,'2026-10-01')");
 await call('guardarBalanceGrupo',{tipo:'Activo',nombre:'Reserva nueva'},true);
 assert.ok((await catalog()).grupos.Activo.includes('Reserva nueva'));
 const id=(await call('guardarBalanceItem',{tipo:'Activo',grupo:'Reserva nueva',nombre:'Fondo nuevo',valor:'500'},true)).codigo;
 assert.equal((await catalog()).items.ahorro.find(x=>x.balanceId===id).nombre,'Fondo nuevo');
 const base={mes:'Octubre 26',fecha:'2026-10-23',tipo:'ahorro',subcategoria:'Fondo nuevo',balanceCodigo:id,monto:'25'};
 await call('registrarMovimiento',base);assert.equal(await value(id),525);
 const expense=await call('registrarMovimiento',{...base,tipo:'necesidad',subcategoria:'Salud',balanceCodigo:'',sourceAssetId:id,operationCode:'savings_expense',monto:'75'});
 assert.equal(await value(id),450);
 await call('guardarBalanceGrupo',{tipo:'Activo',nombre:'Grupo cambiado'},true);
 await call('guardarBalanceItem',{codigo:id,tipo:'Activo',grupo:'Grupo cambiado',nombre:'Fondo nuevo',valor:'500',preserveBalance:true},true);
 assert.equal(await value(id),450);
 const moved=(await catalog()).items.ahorro.find(x=>x.balanceId===id);assert.equal(moved.grupo,'Grupo cambiado');
 await call('registrarMovimiento',{...base,monto:'10'});assert.equal(await value(id),460);
 await call('actualizarMovimiento',{id:expense.id,mes:'Octubre 26',fecha:'2026-10-23',tipo:'necesidad',subcategoria:'Salud',sourceAssetId:id,operationCode:'savings_expense',monto:'80'});
 assert.equal(await value(id),455);
 await call('eliminarMovimiento',{id:expense.id});assert.equal(await value(id),535);
 const d=transformSource('getBalanceGeneral',[],(await db.query("select public.jaeger_native_read_source('getBalanceGeneral','[]') data")).rows[0].data);
 assert.ok(d.activos.some(x=>x.esGrupo&&x.nombre==='Reserva nueva'));assert.equal(d.activos.find(x=>x.codigo===id).grupo,'Grupo cambiado');
 }finally{await db.close();}
});
