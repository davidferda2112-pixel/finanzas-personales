const crypto = require('crypto');
const { restRequest, stableStringify } = require('./jaeger-supabase-cache');
const { nativeRead } = require('./jaeger-supabase-read');

const SUPPORTED_WRITES = new Set([
  'registrarMovimiento', 'actualizarMovimiento', 'eliminarMovimiento',
  'registrarMovimientoTarjeta', 'actualizarMovimientoTarjeta', 'eliminarMovimientoTarjeta',
  'moverBalanceItemOrden', 'repararCatalogoFinanciero', 'congelarBalanceGeneral',
  'guardarBalanceGrupo', 'renombrarBalanceGrupo', 'ordenarBalanceGrupos',
  'limpiarPinturasMes', 'actualizarBalance', 'guardarBalanceItem', 'eliminarBalanceItem',
  'actualizarJapon', 'guardarPinturasMes', 'gestionarItemCategoria', 'marcarNotifLeida',
  'crearMesNuevo', 'registrarDiferidoTdc', 'liquidarDiferidoTdc',
  'guardarTarjetaConfiguracion', 'eliminarTarjetaConfiguracion',
  'ordenarTarjetaConfiguracion', 'guardarAsignacionMeta'
]);

const CORE_WRITES = new Set([
  'registrarMovimiento', 'actualizarMovimiento', 'eliminarMovimiento',
  'registrarMovimientoTarjeta', 'actualizarMovimientoTarjeta', 'eliminarMovimientoTarjeta'
]);

const CONFIG_WRITES = new Set([
  'guardarTarjetaConfiguracion', 'eliminarTarjetaConfiguracion',
  'ordenarTarjetaConfiguracion', 'guardarAsignacionMeta'
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
  if (!result.ok) {
    throw new Error(result.error || 'Supabase no esta configurado para escrituras');
  }
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
  if (CONFIG_WRITES.has(fn)) {
    const requests = [readData('getConfiguracion', [])];
    if (fn === 'guardarAsignacionMeta') requests.push(readData('getViajeJapon', []));
    else requests.push(readData('getTarjetasState', [{
      mes: normalizeMonth(params.cardMes || params.homeMes || 'Agosto 26'),
      idx: Number(params.cardIdx || 0),
      anio: Number(params.cardYear || 2026)
    }]));
    const values = await Promise.all(requests);
    return Object.assign({}, response, { configuracion: values[0] },
      fn === 'guardarAsignacionMeta' ? { japon: values[1] } : { tarjetas: values[1] });
  }
  if (['actualizarBalance', 'guardarBalanceItem', 'eliminarBalanceItem', 'moverBalanceItemOrden',
    'congelarBalanceGeneral'].includes(fn)) {
    const balance = await readData('getBalanceGeneral', []);
    return Object.assign({}, response, balance ? { balance } : {});
  }
  if (['guardarBalanceGrupo', 'renombrarBalanceGrupo', 'ordenarBalanceGrupos'].includes(fn)) {
    return (await readData('getCatalogoFinanciero', [])) || response;
  }
  if (fn === 'repararCatalogoFinanciero') {
    const [catalogo, balance] = await Promise.all([
      readData('getCatalogoFinanciero', []), readData('getBalanceGeneral', [])
    ]);
    return Object.assign({}, response, { catalogo, balance });
  }
  if (fn === 'guardarPinturasMes' || fn === 'limpiarPinturasMes') {
    const month = normalizeMonth(params.mes || params.id);
    return (await readData('getPinturasMes', [month])) || response;
  }
  if (fn === 'gestionarItemCategoria') {
    const mesData = await readData('getMesData', [normalizeMonth(params.mes)]);
    return Object.assign({}, response, mesData ? { mesData } : {});
  }
  if (fn === 'registrarDiferidoTdc' || fn === 'liquidarDiferidoTdc') {
    const homeMes = normalizeMonth(params.homeMes || params.mesGasto || params.mesInicio || params.mesPago);
    const histMes = normalizeMonth(params.histMes || homeMes);
    const cardMes = normalizeMonth(params.cardMes || params.mesGasto || params.mesInicio || params.mesPago);
    const cardId = String(params.tarjeta || response.cardId || '').trim();
    const includeHome = fn === 'liquidarDiferidoTdc' && Number(params.montoSaldo || 0) > 0;
    const includeBalance = fn === 'liquidarDiferidoTdc' &&
      (Number(params.montoActivo || 0) > 0 || Number(params.montoExterno || 0) > 0);
    const requests = [];
    if (includeHome && homeMes) requests.push(['home', readData('getMesData', [homeMes])]);
    if (includeBalance) requests.push(['balance', readData('getBalanceGeneral', [])]);
    if (cardMes && cardId) {
      requests.push(['tdcMovs', readData('getMovimientosTarjeta', [cardMes, cardId])]);
      requests.push(['tdcMovsAplicados', readData('getMovimientosTarjeta', [nextMonth(cardMes), cardId])]);
    }
    const settled = await Promise.all(requests.map(async ([key, promise]) => [key, await promise]));
    const state = { ok: true, homeMes, histMes, tdcKey: `${cardId}|${cardMes}` };
    settled.forEach(([key, value]) => { if (value) state[key] = value; });
    return Object.assign({}, response, { state });
  }
  if (!params.returnState) return response;
  const isCard = fn.endsWith('MovimientoTarjeta') ||
    (fn === 'eliminarMovimiento' && Number(response.linkedCardEvents || 0) > 0);
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
      const rpc = CORE_WRITES.has(fn)
        ? 'rpc/jaeger_write'
        : CONFIG_WRITES.has(fn)
          ? 'rpc/jaeger_config_write'
          : 'rpc/jaeger_write_extended';
      const result = await restRequest(rpc, { method: 'POST', body });
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
    throw new Error(`No se pudo confirmar el estado de escritura de Supabase: ${error.message || String(error)}`);
  }
  if (!status.enabled || !status.fresh) {
    throw new Error(status.enabled
      ? 'Supabase no está marcado como vigente para escribir'
      : 'Las escrituras nativas de Supabase están deshabilitadas');
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
