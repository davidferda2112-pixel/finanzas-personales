const test = require('node:test');
const assert = require('node:assert/strict');
const { transformSource } = require('../lib/jaeger-supabase-read');

test('Inicio suma movimientos del mes aunque todavía no exista un presupuesto', () => {
  const month = transformSource('getMesData', ['Octubre 26'], {
    month: 'Octubre 26',
    planItems: [], summaryValues: [], distributionMetrics: [], cashFlow: [],
    movements: [
      { kind: 'ingreso', subcategory: 'Sueldo', amount: 280 },
      { kind: 'ahorro', subcategory: 'Devolución Ahorro 1', amount: 70 }
    ]
  });

  assert.equal(month.ingresos.totalActual, 280);
  assert.equal(month.planConfigured, false);
  assert.deepEqual(month.ingresos.items.map(({ nombre, actual }) => [nombre, actual]), [['Sueldo', 280]]);
  assert.equal(month.ahorros.total, 70);
  assert.equal(month.ahorros.totalCalculado, 70);
  assert.deepEqual(month.ahorros.items.map(({ nombre, actual }) => [nombre, actual]), [['Devolución Ahorro 1', 70]]);
  assert.equal(month.vistaGeneral.ingresos.actual, 280);
  assert.equal(month.vistaGeneral.ahorros.actual, 70);
});

test('Inicio suma una categoría sin plan y evita duplicar movimientos en filas repetidas', () => {
  const month = transformSource('getMesData', ['Octubre 26'], {
    month: 'Octubre 26', summaryValues: [], distributionMetrics: [], cashFlow: [],
    planItems: [
      { section: 'ingreso', name: 'Sueldo', budget: 300, actual: 0 },
      { section: 'ingreso', name: 'sueldo', budget: 100, actual: 0 },
      { section: 'ahorro', name: 'Viaje', budget: 100, actual: 10 }
    ],
    movements: [
      { kind: 'ingreso', subcategory: 'Sueldo', amount: 280 },
      { kind: 'ahorro', subcategory: 'Devolución Ahorro 1', amount: 70 }
    ]
  });

  assert.equal(month.ingresos.totalActual, 280);
  assert.equal(month.planConfigured, true);
  assert.equal(month.ingresos.items.filter((item) => item.actual === 280).length, 1);
  assert.equal(month.ahorros.total, 80);
  assert.equal(month.ahorros.items.find((item) => item.nombre === 'Devolución Ahorro 1').actual, 70);
});
