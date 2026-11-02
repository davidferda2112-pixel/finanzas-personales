const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { database } = require('./helpers/database.cjs');

test('Historial usa mes de caja para abonos de tarjeta sin recalcular Flujo ni Inicio', async () => {
  const db = await database();
  try {
    await db.exec(`
      insert into jaeger.months values
        ('Septiembre 26', 2026, 9, '2026-09-01'),
        ('Octubre 26', 2026, 10, '2026-10-01');
      insert into jaeger.financial_movements
        (legacy_id, source_row_number, economic_month, cash_month, kind, subcategory, amount, transaction_date)
      values ('card-payment-test', 2, 'Septiembre 26', 'Octubre 26', 'deseo', 'Entretenimiento', 66.66, '2026-10-05');
      insert into jaeger.card_events
        (legacy_id, month_key, card_code, event_type, amount, transaction_date, origin, movement_legacy_id)
      values ('card-event-test', 'Octubre 26', 'VISA', 'abono', 66.66, '2026-10-05', 'egreso', 'card-payment-test');
    `);
    const read = async (fn, month) => (await db.query(
      'select public.jaeger_native_read_source($1,$2::jsonb) as source',
      [fn, JSON.stringify([month])]
    )).rows[0].source;
    const beforeFlow = await read('getFlujoCaja', 'Octubre 26');
    const beforeSeptember = await read('getMesData', 'Septiembre 26');
    await db.exec(fs.readFileSync(path.join(__dirname,
      '../supabase/migrations/20261102210000_card_payment_history_uses_cash_month.sql'), 'utf8'));
    const september = await read('getMovimientosMes', 'Septiembre 26');
    const october = await read('getMovimientosMes', 'Octubre 26');
    const afterFlow = await read('getFlujoCaja', 'Octubre 26');
    const afterSeptember = await read('getMesData', 'Septiembre 26');
    assert.ok(!september.movements.some(m => m.legacy_id === 'card-payment-test'));
    assert.equal(october.movements.find(m => m.legacy_id === 'card-payment-test').economic_month, 'Octubre 26');
    assert.ok(afterSeptember.movements.some(m => m.legacy_id === 'card-payment-test'));
    assert.deepEqual(afterSeptember.movements, beforeSeptember.movements);
    assert.deepEqual(afterFlow.movementTotals, beforeFlow.movementTotals);
    assert.deepEqual(afterFlow.cashFlow, beforeFlow.cashFlow);
  } finally {
    await db.close();
  }
});
