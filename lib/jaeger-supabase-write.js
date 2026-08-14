const crypto = require('crypto');
const { restRequest, stableStringify } = require('./jaeger-supabase-cache');
const { nativeRead } = require('./jaeger-supabase-read');

const SUPPORTED_WRITES = new Set([
  'registrarMovimiento', 'actualizarMovimiento', 'eliminarMovimiento',
  'registrarMovimientoTarjeta', 'actualizarMovimientoTarjeta', 'eliminarMovimientoTarjeta'
]);

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function normalizeMonth(value) {
  const parts = String(value || '').trim().replace(/\s+/g, ' ').split(' ');
  if (parts.length < 2) return String(value || '').trim();
  const plain = parts[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const index = MONTHS.findIndex((month) => month.toLowerCase().startsWith(plain.slice(0, 3)));
  let year = String(parts[1]).replace(/\D/g, '');
  if (year.length === 4) year = year.slice(-2);
  if (year.length === 1) year = `0${year}`;
  return `${index >= 0 ? MONTHS[index] : parts[0]} ${year}`;
}

function nextMonth(value) {
  const [name, year] = normalizeMonth(value).split(' ');
  const date = new Date(Date.UTC(2000 + Number(year || 0), MONTHS.indexOf(name) + 1, 1));
  return `${MONTHS[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(-2)}`;
}

async function getNativeWriteStatus() {
  const result = await restRequest('rpc/jaeger_native_write_status', { method: 'POST', body: '{}' });
  const state = result.text ? JSON.parse(result.text) : {};
  return {
    enabled: state.enabled === true,
    fresh: state.read_state && state.read_state.enabled === true && state.read_state.fresh === true,
    state
  };
}

async function readData(fn, args) {
  const result = await nativeRead(fn, args, { requireFresh: true });
  return result.ok ? result.data : null;
}

async function enrichResponse(fn, params, response) {
  if (!params.returnState) return response;
  const isCard = fn.endsWith('MovimientoTarjeta');
  const homeMes = normalizeMonth(params.homeMes || params.mesInicio || response.mesCaja || response.mesGasto);
  const histMes = normalizeMonth(params.histMes || params.mesHist || response.mesGasto || response.mes || homeMes);
  const state = { ok: true, homeMes, histMes };
  const includeHome = isCard ? response.linkedMovement === true : params.includeHome !== false;

  if (includeHome && homeMes) {
    const home = await readData('getMesData', [homeMes]);
    if (home) state.home = home;
  }
  if (!isCard && params.includeMovimientos === true && histMes) {
    const movements = await readData('getMovimientosMes', [histMes]);
    if (movements) state.movimientos = movements;
  }
  if (isCard) {
    const cardMes = normalizeMonth(params.cardMes || params.tcMes || response.mesAplicado || homeMes);
    const cardId = String(response.cardId || params.tarjeta || '').trim();
    if (cardMes && cardId) {
      const [current, applied] = await Promise.all([
        readData('getMovimientosTarjeta', [cardMes, cardId]),
        readData('getMovimientosTarjeta', [nextMonth(cardMes), cardId])
      ]);
      if (current) state.tdcMovs = current;
      if (applied) state.tdcMovsAplicados = applied;
      state.tdcKey = `${cardId}|${cardMes}`;
    }
  }
  return Object.assign({}, response, { state });
}

async function callWriteRpc(fn, params, requestId) {
  const payloadHash = crypto.createHash('sha256')
    .update(`${fn}:${stableStringify(params)}`)
    .digest('hex');
  const body = JSON.stringify({
    p_operation: fn,
    p_request_id: requestId,
    p_payload_hash: payloadHash,
    p_payload: params
  });
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await restRequest('rpc/jaeger_write', { method: 'POST', body });
      return result.text ? JSON.parse(result.text) : { ok: false, error: 'Respuesta vacía de Supabase' };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function nativeWrite(fn, args, requestId) {
  if (!SUPPORTED_WRITES.has(fn)) return { handled: false, reason: 'unsupported' };
  let status;
  try {
    status = await getNativeWriteStatus();
  } catch (error) {
    return { handled: false, reason: 'status_error', error: error.message || String(error) };
  }
  if (!status.enabled || !status.fresh) {
    return { handled: false, reason: status.enabled ? 'stale' : 'disabled', status: status.state };
  }
  const params = args && args[0] && typeof args[0] === 'object'
    ? args[0]
    : { id: args && args[0] };
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestId || ''))
    ? String(requestId)
    : crypto.randomUUID();
  const response = await callWriteRpc(fn, params, id);
  if (!response || response.ok === false) return { handled: true, response };
  try {
    return { handled: true, response: await enrichResponse(fn, params, response), requestId: id };
  } catch (_) {
    // The transaction already committed. Return its durable response and let the
    // existing background refresh update the screen; never fall back to Sheets.
    return { handled: true, response, requestId: id, enrichmentDeferred: true };
  }
}

module.exports = { SUPPORTED_WRITES, getNativeWriteStatus, nativeWrite };
