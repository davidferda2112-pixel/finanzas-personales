const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { database } = require('./helpers/database.cjs');

test('crear AMEX conserva VISA y editar exige versión vigente', async () => {
  const db = await database();
  try {
    await db.exec(fs.readFileSync(path.join(__dirname,
      '../supabase/migrations/20261124173000_safe_credit_card_creation.sql'), 'utf8'));
    await db.exec(`insert into jaeger.credit_cards
      (card_code, display_name, issuer, last_four, network, card_style, active, sort_order)
      values ('VISA', 'Visa Personal', 'Banco Internacional', '4894', 'visa', 'visa-card', true, 1)`);
    const call = async payload => db.query(
      'select public.jaeger_config_write($1,$2::uuid,$3,$4::jsonb) as result',
      ['guardarTarjetaConfiguracion', randomUUID(), randomUUID(), JSON.stringify(payload)]
    );
    const visa = { codigo: 'VISA', nombre: 'Visa Personal', emisor: 'Banco Internacional',
      ultimos4: '4894', red: 'visa', estilo: 'visa-card', activo: true };
    await assert.rejects(call({ ...visa, modo: 'crear' }), /Ya existe una tarjeta/);
    await assert.rejects(call({ ...visa, nombre: 'Sobrescrita' }), /Indica si vas a crear o editar/);

    await call({ codigo: 'AMEX', nombre: 'Christian David', emisor: 'Banco Guayaquil',
      ultimos4: '0716', red: 'amex', estilo: 'emerald-card', activo: true, modo: 'crear' });
    const cards = (await db.query(`select card_code, display_name, issuer, last_four, network,
      row_version from jaeger.credit_cards where card_code in ('VISA','AMEX') order by card_code`)).rows;
    assert.equal(cards.length, 2);
    assert.equal(cards[0].network, 'amex');
    assert.equal(cards[1].issuer, 'Banco Internacional');
    assert.equal(cards[1].last_four, '4894');

    await assert.rejects(call({ ...visa, modo: 'editar', version: 0 }), /La tarjeta cambió/);
    await call({ ...visa, modo: 'editar', version: Number(cards[1].row_version),
      nombre: 'Visa Personal Actualizada' });
    const edited = (await db.query("select display_name from jaeger.credit_cards where card_code='VISA'"))
      .rows[0].display_name;
    assert.equal(edited, 'Visa Personal Actualizada');
    assert.equal((await db.query("select display_name from jaeger.credit_cards where card_code='AMEX'"))
      .rows[0].display_name, 'Christian David');

    await db.exec(`insert into jaeger.card_events
      (legacy_id, month_key, card_code, event_type, amount, transaction_date, origin)
      values ('amex-test-event', 'Noviembre 26', 'AMEX', 'cargo', 12.50, '2026-11-24', 'externo')`);
    assert.equal((await db.query("select card_code from jaeger.card_events where legacy_id='amex-test-event'"))
      .rows[0].card_code, 'AMEX');
  } finally {
    await db.close();
  }
});
