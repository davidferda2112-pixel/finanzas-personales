const READ_TTL_MS = {
  getMesesDisponibles: 5 * 60 * 1000,
  getMesData: 18 * 1000,
  getMovimientosMes: 18 * 1000,
  getTarjetasState: 18 * 1000,
  getMovimientosTarjeta: 18 * 1000,
  parseTarjetas: 45 * 1000,
  getFlujoCaja: 30 * 1000,
  getBalanceGeneral: 30 * 1000,
  getViajeJapon: 45 * 1000,
  getPinturasMes: 30 * 1000,
  getDesgloseSub: 18 * 1000,
  getNotificaciones: 12 * 1000
};

const WRITE_METHODS = new Set([
  'actualizarBalance',
  'eliminarBalanceItem',
  'actualizarJapon',
  'guardarPinturasMes',
  'registrarMovimientoTarjeta',
  'actualizarMovimientoTarjeta',
  'eliminarMovimientoTarjeta',
  'registrarMovimiento',
  'actualizarMovimiento',
  'eliminarMovimiento',
  'gestionarItemCategoria',
  'marcarNotifLeida',
  'crearMesNuevo'
]);

const STALE_MAX_MS = 10 * 60 * 1000;
const READ_TIMEOUT_MS = 9500;

function getCache() {
  if (!globalThis.__jaegerAppsScriptCache) {
    globalThis.__jaegerAppsScriptCache = new Map();
  }
  return globalThis.__jaegerAppsScriptCache;
}

function makeCacheKey(fn, args) {
  return `${fn}:${JSON.stringify(args || [])}`;
}

function clearReadCache() {
  getCache().clear();
}

function cachedResponse(fn, args) {
  const ttl = READ_TTL_MS[fn];
  if (!ttl) return null;
  const item = getCache().get(makeCacheKey(fn, args));
  if (!item) return null;
  const age = Date.now() - item.savedAt;
  if (age > ttl) return null;
  return item.text;
}

function staleResponse(fn, args) {
  const ttl = READ_TTL_MS[fn];
  if (!ttl) return null;
  const item = getCache().get(makeCacheKey(fn, args));
  if (!item) return null;
  const age = Date.now() - item.savedAt;
  if (age > STALE_MAX_MS) return null;
  try {
    const data = JSON.parse(item.text);
    data._stale = true;
    data._staleReason = 'Apps Script no respondio a tiempo';
    return JSON.stringify(data);
  } catch (_) {
    return item.text;
  }
}

function storeReadCache(fn, args, text) {
  if (!READ_TTL_MS[fn] || !text) return;
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.ok === false) return;
  } catch (_) {
    return;
  }
  getCache().set(makeCacheKey(fn, args), { savedAt: Date.now(), text });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  const token = process.env.APPS_SCRIPT_TOKEN;
  const accessKey = process.env.APP_ACCESS_KEY;

  if (!appsScriptUrl || !token) {
    return res.status(500).json({
      ok: false,
      error: 'Faltan APPS_SCRIPT_URL o APPS_SCRIPT_TOKEN en las variables de entorno de Vercel.'
    });
  }

  if (accessKey && req.headers['x-app-key'] !== accessKey) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (!body.fn || typeof body.fn !== 'string') {
      return res.status(400).json({ ok: false, error: 'Funcion no valida' });
    }
    const args = Array.isArray(body.args) ? body.args : [];
    const cached = cachedResponse(body.fn, args);
    if (cached) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('X-Jaeger-Cache', 'hit');
      return res.status(200).send(cached);
    }

    const controller = READ_TTL_MS[body.fn] ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), READ_TIMEOUT_MS) : null;
    let upstream;
    try {
      upstream = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        signal: controller ? controller.signal : undefined,
        body: JSON.stringify({
          token,
          fn: body.fn,
          args
        })
      });
    } finally {
      if (timer) clearTimeout(timer);
    }

    const text = await upstream.text();
    if (!upstream.ok) {
      const stale = staleResponse(body.fn, args);
      if (stale) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Jaeger-Cache', 'stale');
        return res.status(200).send(stale);
      }
    }
    if (upstream.ok) {
      if (WRITE_METHODS.has(body.fn)) clearReadCache();
      else storeReadCache(body.fn, args, text);
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res
      .status(upstream.ok ? 200 : 502)
      .send(text || JSON.stringify({ ok: false, error: 'Respuesta vacia de Apps Script' }));
  } catch (error) {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const args = Array.isArray(body.args) ? body.args : [];
      const stale = staleResponse(body.fn, args);
      if (stale) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Jaeger-Cache', 'stale');
        return res.status(200).send(stale);
      }
    } catch (_) {}
    return res.status(502).json({ ok: false, error: error.message || String(error) });
  }
};
