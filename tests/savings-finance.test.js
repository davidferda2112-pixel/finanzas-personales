const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { database } = require('./helpers/database.cjs');
const { transformSource } = require('../lib/jaeger-supabase-read');
let db;
before(async () => {
  db = await database();
  await db.exec(`
    insert into jaeger.months values ('Octubre 26',2026,10,'2026-10-01'),('Septiembre 26',2026,9,'2026-09-01');
    insert into jaeger.balance_items(balance_id,name,balance_type,base_value,current_value,group_name,active,custom) values
    ('bank','Banco','Activo',500,500,'Activos Financieros',true,true),
    ('xtb','XTB','Activo',300,300,'Activos Financieros',true,true),
    ('debt','Préstamo','Pasivo',200,200,'Préstamos',true,true),
    ('brackets','Brackets','Pasivo',25,25,'Pasivos Fijos',true,true),
    ('2010401.3','Devolución Terreno','Pasivo',200,200,'Préstamos',true,false),
    ('10102.06','Pago Terreno','Activo',20,20,'Activos Financieros',true,false),
    ('receivable','Cuenta por cobrar','Activo',200,200,'Cuentas por Cobrar',true,true);
    insert into jaeger.catalog_items(kind,name,state,balance_type,balance_id,group_name) values
    ('ahorro','Ahorro XTB','activo','Activo','xtb','Activos Financieros'),
    ('deuda','Préstamo','activo','Pasivo','debt','Préstamos'),
    ('deuda','Brackets','activo','Pasivo','brackets','Pasivos Fijos'),
    ('deuda','Devolución Terreno','activo','Pasivo','2010401.3','Préstamos');
  `);
});
after(async()=>{if(db)await db.close();});
const base={mes:'Octubre 26',mesRegistro:'Octubre 26',fecha:'2026-10-22',tipo:'necesidad',subcategoria:'Salud',monto:'75',sourceAssetId:'xtb',operationCode:'savings_expense'};
async function write(payload,operation='registrarMovimiento',request=crypto.randomUUID()){
  const hash=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return (await db.query('select public.jaeger_write($1,$2,$3,$4::jsonb) as result',[operation,request,hash,JSON.stringify(payload)])).rows[0].result;
}
async function balance(id){return Number((await db.query('select current_value from jaeger.balance_items where balance_id=$1',[id])).rows[0].current_value);}
async function source(fn='getMesData'){return (await db.query('select public.jaeger_native_read_source($1,$2::jsonb) as data',[fn,'["Octubre 26"]'])).rows[0].data;}
async function isolated(fn){await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}}
test('Unicode, NFD y mojibake conservan signos financieros',()=>isolated(async()=>{
  for(const name of ['Devolución de ahorro','DevoluciÃ³n de ahorro','Devolucio\u0301n de ahorro']){
    const r=await db.query("select jaeger_private.stored_movement_sign('ingreso',$1,'bank') as sign",[name]);assert.equal(Number(r.rows[0].sign),-1);
  }
  for(const [name,sign] of [['Préstamos recibidos',1],['PrÃ©stamos recibidos',1],['Cobro Préstamos',-1]]){
    const r=await db.query("select jaeger_private.stored_movement_sign('ingreso',$1,'bank') as sign",[name]);assert.equal(Number(r.rows[0].sign),sign);
  }
}));
test('75 desde ahorro consume activo, mantiene ingreso y disponible y registra un solo gasto',()=>isolated(async()=>{
  await write({...base,operationCode:'ordinary',sourceAssetId:'',tipo:'ingreso',subcategoria:'Sueldo',monto:'100'});
  await write({...base,operationCode:'ordinary',sourceAssetId:'',monto:'25'});
  await write(base);
  assert.equal(await balance('xtb'),225);
  const raw=await source();const month=transformSource('getMesData',[],raw);
  assert.equal(month.ingresos.totalActual,100);assert.equal(month.necesidades.total,25);
  assert.equal(month.necesidades.desdeAhorros,75);assert.equal(month.necesidades.totalGasto,100);
  assert.equal(month.vistaGeneral.saldoFinal.actual,75);
  const transactions=transformSource('getMovimientosMes',[],raw).data;
  assert.equal(transactions.filter(x=>x.fundedAmount===75).length,1);
  const hist=transformSource('getBalanceGeneral',[],await source('getBalanceGeneral'));
  assert.equal(hist.fundingOperations.length,1);assert.ok(hist.cambios.some(x=>x.anterior===300&&x.nuevo===225));
}));
test('aportación, retiro y transferencia conservan su naturaleza',()=>isolated(async()=>{
  await write({...base,tipo:'ahorro',subcategoria:'Ahorro XTB',operationCode:'',sourceAssetId:'',monto:'10.01'});
  assert.equal(await balance('xtb'),310.01);
  await write({...base,tipo:'ingreso',subcategoria:'Devolución de ahorro',operationCode:'',sourceAssetId:'',balanceCodigo:'xtb',monto:'16'});
  assert.equal(await balance('xtb'),294.01);
  const total=await balance('xtb')+await balance('bank');
  await write({...base,operationCode:'asset_transfer',destinationAssetId:'bank',monto:'25'});
  assert.equal(await balance('xtb')+await balance('bank'),total);
}));
test('pago parcial, liquidación e intereses separan capital y gasto',()=>isolated(async()=>{
  await write({...base,tipo:'deuda',subcategoria:'Préstamo',balanceCodigo:'debt',sourceAssetId:'bank',monto:'85',interestAmount:'5'});
  assert.equal(await balance('bank'),415);assert.equal(await balance('debt'),120);
  await write({...base,tipo:'deuda',subcategoria:'Préstamo',balanceCodigo:'debt',sourceAssetId:'bank',monto:'120'});
  assert.equal(await balance('debt'),0);assert.equal(await balance('bank'),295);
  const m=transformSource('getMesData',[],await source());assert.equal(m.financiacion.consumoReal,5);assert.equal(m.deudas.totalGasto,205);
}));
test('editar y anular revierten exactamente los impactos guardados',()=>isolated(async()=>{
  const r=await write(base);assert.equal(await balance('xtb'),225);
  await write({...base,id:r.id,monto:'80',sourceAssetId:'bank'},'actualizarMovimiento');
  assert.equal(await balance('xtb'),300);assert.equal(await balance('bank'),420);
  await write({id:r.id},'eliminarMovimiento');assert.equal(await balance('bank'),500);
  assert.equal((await db.query("select count(*)::int n from jaeger.funding_operations where state='cancelled'")).rows[0].n,1);
}));
test('la misma solicitud se ejecuta una sola vez',()=>isolated(async()=>{
  const id=crypto.randomUUID();const a=await write(base,'registrarMovimiento',id);const b=await write(base,'registrarMovimiento',id);
  assert.equal(a.id,b.id);assert.equal(await balance('xtb'),225);
}));
test('sobregiro e importes inválidos no dejan operaciones parciales',async()=>{
  for(const amount of ['301','NaN','Infinity','0','-1','0.001']){
    await db.exec('begin');await assert.rejects(write({...base,monto:amount}));await db.exec('rollback');assert.equal(await balance('xtb'),300);
  }
});
test('dos solicitudes en paralelo contra saldo limitado: solo una puede consumirlo',()=>isolated(async()=>{
  // PGlite queues sessions; the production suite additionally verifies real PostgreSQL lock contention.
  const results=await Promise.allSettled([write({...base,monto:'200'}),write({...base,monto:'200'})]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
}));
test('Devolución Terreno conserva el efecto dual y Brackets reduce su saldo real',()=>isolated(async()=>{
  await write({...base,tipo:'deuda',subcategoria:'Devolución Terreno',balanceCodigo:'2010401.3',monto:'16'});
  assert.equal(await balance('2010401.3'),184);assert.equal(await balance('10102.06'),36);assert.equal(await balance('xtb'),284);
  await write({...base,tipo:'deuda',subcategoria:'Brackets',balanceCodigo:'brackets',monto:'25'});assert.equal(await balance('brackets'),0);
}));
test('cobrar o recibir préstamos con destino vinculado no crea ingreso ordinario',()=>isolated(async()=>{
  await write({...base,tipo:'ingreso',subcategoria:'Cobro Préstamos',operationCode:'',sourceAssetId:'',balanceCodigo:'receivable',destinationAssetId:'bank',monto:'20'});
  assert.equal(await balance('receivable'),180);assert.equal(await balance('bank'),520);
  await write({...base,tipo:'ingreso',subcategoria:'Préstamos recibidos',operationCode:'',sourceAssetId:'',balanceCodigo:'debt',destinationAssetId:'bank',monto:'30'});
  assert.equal(await balance('debt'),230);assert.equal(await balance('bank'),550);
  assert.equal(transformSource('getMesData',[],await source()).ingresos.totalActual,0);
}));
test('los importes de Sheets poblados no se suman otra vez a sus movimientos',()=>{
  const raw={month:'Mayo 26',planItems:[{section:'necesidad',name:'Salud',budget:100,actual:40,source_kind:'google_sheets'}],movements:[{kind:'necesidad',subcategory:'Salud',amount:10,source_kind:'google_sheets'},{kind:'necesidad',subcategory:'Salud',amount:5,source_kind:'supabase'}]};
  assert.equal(transformSource('getMesData',[],raw).necesidades.total,45);
});
