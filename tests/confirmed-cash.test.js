const test=require('node:test'),assert=require('node:assert/strict');
const {transformSource}=require('../lib/jaeger-supabase-read');
function fixture(funded=0,extra=0){
 return {month:'Octubre 26',planItems:[],cashFlow:[{label:'SALDO INICIAL',monthly_values:[-50]}],
 cashObservation:{month:'Octubre 26',amount:40.25,reference_flow:-111.5},
 movements:[{kind:'necesidad',subcategory:'Salud',amount:61.5+extra+funded,funded_amount:funded}],
 movementTotals:[{month_number:10,kind:'necesidad',subcategory:'Salud',amount:61.5+extra+funded,funded_amount:funded}]};
}
test('un saldo confirmado prevalece sobre la reconstrucción histórica sin crear ingresos',()=>{
 const d=transformSource('getMesData',[],fixture());assert.equal(d.vistaGeneral.saldoFinal.actual,40.25);assert.equal(d.ingresos.totalActual,0);
});
test('el saldo confirmado entra como base explícita y el cierre mensual cuadra con el anual',t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-23T18:00:00Z')});
 const d=transformSource('getFlujoCaja',[],fixture(75,2.5)).data;
 assert.equal(d.cashAvailable,37.75);
 assert.equal(d.filas.find(x=>x.label==='TOTAL INGRESOS').total,0);
 assert.equal(d.filas.find(x=>x.label==='FLUJO DE CAJA ACUMULADO').valores[9],37.75);
 assert.equal(d.filas.find(x=>x.label==='BASE DE SALDO CONFIRMADO').valores[9],151.75);
 assert.equal(d.filas.find(x=>x.label==='FLUJO DE CAJA ACUMULADO').total,37.75);
});

test('cada mes y el acumulado cuadran sin duplicar la confirmación en Inicio, balance o historial',t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-26T18:00:00Z')});
 const source=fixture(75,2.5);source.month='Noviembre 26';
 source.movementTotals.push({month_number:11,kind:'ingreso',operation_code:'loan_received',funding_source:'monthly_income',amount:12});
 const data=transformSource('getFlujoCaja',[],source).data;
 const r=label=>data.filas.find(item=>item.label===label);
 for(let i=0;i<12;i++){
  assert.ok(Math.abs(r('FLUJO OPERATIVO').valores[i]-(r('TOTAL INGRESOS').valores[i]-r('TOTAL EGRESOS').valores[i]))<0.001);
  const close=r('SALDO INICIAL').valores[i]+r('TOTAL INGRESOS').valores[i]+r('FINANCIACIÓN RECIBIDA').valores[i]-r('TOTAL EGRESOS').valores[i]+r('BASE DE SALDO CONFIRMADO').valores[i];
  assert.ok(Math.abs(close-r('FLUJO DE CAJA ACUMULADO').valores[i])<0.001,'Cierre del mes '+i);
  if(i>0)assert.equal(r('SALDO INICIAL').valores[i],r('FLUJO DE CAJA ACUMULADO').valores[i-1]);
 }
 const c=data.balanceCalculation;
 assert.ok(Math.abs(c.initial+c.income+c.financing-c.expenses+c.historicalDifference-c.total)<0.001);
 assert.equal(c.initial,-50);assert.equal(c.total,49.75);
 assert.equal(transformSource('getMesData',[],source).vistaGeneral.saldoFinal.actual,49.75);
 assert.equal(transformSource('getMovimientosMes',[],{...source,movements:[]}).saldoBase,37.75);
 assert.equal(data.cashBasis.netSinceConfirmation,9.5);
});

test('el total vigente admite cero y no incorpora ingresos de meses futuros',t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-26T18:00:00Z')});
 const source=fixture(75,40.25);
 source.movementTotals.push({month_number:12,kind:'ingreso',subcategory:'Sueldo',amount:100});
 const d=transformSource('getFlujoCaja',[],source).data;
 assert.equal(d.cashAvailable,0);
 assert.equal(d.filas.find(x=>x.label==='FLUJO DE CAJA ACUMULADO').total,0);
 assert.notEqual(d.filas.find(x=>x.label==='FLUJO DE CAJA ACUMULADO').valores[11],0);
});

test('la tabla usa el saldo vigente en su última celda, incluso cuando es cero',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
 const start=source.indexOf('function renderFlujo(d){'),end=source.indexOf('\nfunction ',start+1);
 for(const available of [37.75,0]){
  const elements={},context={window:{},G:{},eid:id=>elements[id]||(elements[id]={}),fmt:v=>'$'+Number(v).toFixed(2),ensureChartJs:()=>Promise.resolve(),showToast:()=>{}};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  context.renderFlujo({meses:Array(12).fill('Mes'),cashAvailable:available,filas:[{label:'FLUJO DE CAJA ACUMULADO',valores:Array(12).fill(-114),total:available}]});
  const row=elements['fl-tabla'].innerHTML.match(/Flujo Acumulado<\/td>(.*?)<\/tr>/)[1];
  assert.ok(row.endsWith('>$'+available.toFixed(2)+'</td>'));
 }
});
test('un gasto desde ahorros conserva el efectivo confirmado; un gasto corriente lo reduce',()=>{
 assert.equal(transformSource('getMesData',[],fixture(75)).vistaGeneral.saldoFinal.actual,40.25);
 assert.equal(transformSource('getMesData',[],fixture(0,10)).vistaGeneral.saldoFinal.actual,30.25);
});
test('el historial usa la fecha del evento y no mezcla los contadores de auditoría',()=>{
 const data=transformSource('getBalanceGeneral',[],{groups:[],items:[],changes:[
 {source_timestamp:'2/08/2026 9:00:00',history_id:'old'},
 {source_timestamp:'2026-10-23 07:06:00',history_id:'new'},
 {source_timestamp:'12/08/2026 10:00:00',history_id:'middle'}]});
 assert.deepEqual(data.cambios.map(x=>x.id),['new','middle','old']);
});
