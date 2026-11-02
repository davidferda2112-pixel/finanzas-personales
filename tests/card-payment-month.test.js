const test = require('node:test');
const assert = require('node:assert/strict');
const { alignCardPaymentMonth } = require('../lib/jaeger-supabase-write');

test('abono desde saldo registra el gasto en el mes de la fecha, sin mover el ciclo de tarjeta', () => {
  const input = {
    tipo: 'abono', origen: 'egreso', fecha: '2026-10-05',
    mesRegistro: 'Octubre 26', mesGasto: 'Septiembre 26',
    mesPagoCredito: 'Octubre 26', tarjeta: 'VISA', monto: '66.66'
  };
  const output = alignCardPaymentMonth('registrarMovimientoTarjeta', input);
  assert.equal(output.mesRegistro, 'Octubre 26');
  assert.equal(output.mesGasto, 'Octubre 26');
  assert.equal(output.mesPagoCredito, 'Octubre 26');
  assert.equal(input.mesGasto, 'Septiembre 26');
});

test('abonos ya correctos y cargos conservan su mes de tarjeta', () => {
  const correct = {
    tipo: 'abono', origen: 'egreso', fecha: '2026-11-02',
    mesRegistro: 'Noviembre 26', mesGasto: 'Noviembre 26', mesPagoCredito: 'Diciembre 26'
  };
  const output = alignCardPaymentMonth('actualizarMovimientoTarjeta', correct);
  assert.equal(output.mesGasto, 'Noviembre 26');
  assert.equal(output.mesPagoCredito, 'Diciembre 26');
  assert.equal(alignCardPaymentMonth('registrarMovimientoTarjeta', { ...correct, tipo: 'cargo', mesGasto: 'Octubre 26' }).mesGasto, 'Octubre 26');
  assert.equal(alignCardPaymentMonth('registrarMovimientoTarjeta', { ...correct, origen: 'externo', mesGasto: 'Octubre 26' }).mesGasto, 'Octubre 26');
});
