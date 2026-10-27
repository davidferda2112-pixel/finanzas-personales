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
test('el flujo conserva la tabla general y su total muestra el disponible actual',t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-23T18:00:00Z')});
 const d=transformSource('getFlujoCaja',[],fixture(75,2.5)).data;
 assert.equal(d.cashAvailable,37.75);
 assert.equal(d.filas.find(x=>x.label==='TOTAL INGRESOS').total,0);
 assert.equal(d.filas.find(x=>x.label==='FLUJO DE CAJA ACUMULADO').valores[9],-114);
 assert.equal(d.filas.find(x=>x.label==='FLUJO DE CAJA ACUMULADO').total,37.75);
 assert.ok(!d.filas.some(x=>/FINANCI|CONFIRMADO/.test(x.label)));
 assert.equal(d.balanceCalculation,undefined);assert.equal(d.cashBasis,undefined);
});

test('el flujo general excluye activos, retiros y gastos financiados; las operaciones mixtas incluyen solo la parte general',t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-26T18:00:00Z')});
 const source={cashFlow:[],movementTotals:[
  {month_number:10,kind:'ingreso',subcategory:'Sueldo',amount:100},
  {month_number:10,kind:'necesidad',amount:25},
  {month_number:10,kind:'necesidad',amount:75,funding_source:'savings'},
  {month_number:10,kind:'deseo',amount:80,funded_amount:60},
  {month_number:10,kind:'ingreso',amount:170,operation_code:'asset_transfer',funding_source:'asset_transfer'},
  {month_number:10,kind:'ingreso',amount:16,operation_code:'savings_withdrawal'},
  {month_number:10,kind:'ingreso',amount:20,operation_code:'loan_collection',funding_source:'asset_transfer'},
  {month_number:10,kind:'ingreso',amount:30,operation_code:'ordinary',funding_source:'asset_transfer'}
 ]};
 const d=transformSource('getFlujoCaja',[],source).data,r=l=>d.filas.find(x=>x.label===l);
 assert.equal(r('TOTAL INGRESOS').total,100);assert.equal(r('TOTAL EGRESOS').total,45);
 assert.equal(r('NECESIDADES').total,25);assert.equal(r('DESEOS').total,20);
 assert.equal(r('FLUJO OPERATIVO').total,55);assert.equal(r('FLUJO DE CAJA ACUMULADO').total,55);
 for(let i=0;i<12;i++)assert.ok(Math.abs(r('SALDO INICIAL').valores[i]+r('TOTAL INGRESOS').valores[i]-r('TOTAL EGRESOS').valores[i]-r('FLUJO DE CAJA ACUMULADO').valores[i])<.001);
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
