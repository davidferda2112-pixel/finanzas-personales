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
