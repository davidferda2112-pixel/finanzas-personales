const {
  getCachedResponse: getSupabaseCachedResponse,
  invalidateAllCachedResponses,
  storeCachedResponse: storeSupabaseCachedResponse
} = require('../lib/jaeger-supabase-cache');
const {
  compareAndRecord,
  markNativeReadsStale,
  nativeRead,
  SUPPORTED_READS
} = require('../lib/jaeger-supabase-read');
const { nativeWrite, SUPPORTED_WRITES } = require('../lib/jaeger-supabase-write');

const READ_TTL_MS = {
  getBootState: 12 * 1000,
  getMesesDisponibles: 5 * 60 * 1000,
  getInitialState: 15 * 1000,
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
  'moverBalanceItemOrden',
  'repararCatalogoFinanciero',
  'congelarBalanceGeneral',
  'guardarBalanceGrupo',
  'renombrarBalanceGrupo',
  'ordenarBalanceGrupos',
  'limpiarPinturasMes',
  'actualizarBalance',
  'guardarBalanceItem',
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
  return null;
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

async function runShadowRead(fn, args, sheetsData, timing) {
  if (process.env.SUPABASE_SHADOW_READS === '0' || !SUPPORTED_READS.has(fn)) {
    return { status: 'unsupported' };
  }
  try {
    return await Promise.race([
      compareAndRecord(fn, args, sheetsData, timing),
      new Promise((resolve) => setTimeout(() => resolve({ status: 'timeout' }), 500))
    ]);
  } catch (_) {
    return { status: 'error' };
  }
}

async function runNativePrimary(fn, args) {
  if (process.env.SUPABASE_PRIMARY_READS === '0' || !SUPPORTED_READS.has(fn)) {
    return { ok: false, skipped: true };
  }
  try {
    return await Promise.race([
      nativeRead(fn, args, { requireFresh: true }),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), 1500))
    ]);
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
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
    let supabaseGeneration = null;
    let persistent = { configured: false, hit: false };

    if (WRITE_METHODS.has(body.fn) && SUPPORTED_WRITES.has(body.fn)) {
      let direct;
      try {
        direct = await nativeWrite(body.fn, args, body.requestId);
      } catch (error) {
        // Once a native write is attempted, never cross-fallback to Sheets: a
        // lost response could otherwise duplicate the financial operation.
        return res.status(502).json({
          ok: false,
          error: 'No se pudo confirmar el registro en Supabase. Reintenta la misma operación.'
        });
      }
      if (direct && direct.handled) {
        clearReadCache();
        await invalidateAllCachedResponses();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Jaeger-Source', 'supabase-native-write');
        if (direct.enrichmentDeferred) res.setHeader('X-Jaeger-State', 'refresh-deferred');
        return res.status(200).send(JSON.stringify(direct.response));
      }
    }

    if (WRITE_METHODS.has(body.fn)) {
      try {
        await markNativeReadsStale(`legacy_write:${body.fn}`);
      } catch (_) {
        return res.status(503).json({
          ok: false,
          error: 'No se pudo proteger la vigencia de los datos antes de registrar el cambio.'
        });
      }
    } else {
      const native = await runNativePrimary(body.fn, args);
      if (native.ok && native.data && native.data.ok !== false) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Jaeger-Source', 'supabase-native');
        res.setHeader('X-Jaeger-Native-Ms', String(native.durationMs || 0));
        return res.status(200).send(JSON.stringify(native.data));
      }
      if (native.stale) res.setHeader('X-Jaeger-Native', 'stale-fallback');
      else if (native.timeout) res.setHeader('X-Jaeger-Native', 'timeout-fallback');
      else if (native.error) res.setHeader('X-Jaeger-Native', 'error-fallback');
    }

    if (!WRITE_METHODS.has(body.fn) && READ_TTL_MS[body.fn]) {
      persistent = await getSupabaseCachedResponse(body.fn, args);
      supabaseGeneration = persistent.generation;
      if (persistent.hit) {
        const persistentText = JSON.stringify(persistent.response);
        storeReadCache(body.fn, args, persistentText);
        const shadow = await runShadowRead(body.fn, args, persistent.response, {
          sheetsMs: 0,
          sourceRefreshedAt: persistent.sourceRefreshedAt
        });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Jaeger-Cache', 'supabase');
        res.setHeader('X-Jaeger-Shadow', shadow.status);
        return res.status(200).send(persistentText);
      }
    }

    // The process-local cache is only safe when Supabase is not configured.
    // Across concurrent server instances, the shared generation is authoritative.
    if (!persistent.configured) {
      const cached = cachedResponse(body.fn, args);
      if (cached) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Jaeger-Cache', 'memory');
        return res.status(200).send(cached);
      }
    }

    const sheetsStartedAt = Date.now();
    const upstream = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token,
        fn: body.fn,
        args
      })
    });

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
      if (WRITE_METHODS.has(body.fn)) {
        clearReadCache();
        const invalidation = await invalidateAllCachedResponses();
        res.setHeader('X-Jaeger-Sync', invalidation.ok ? 'invalidated' : 'deferred');
      } else {
        storeReadCache(body.fn, args, text);
        try {
          const parsed = text ? JSON.parse(text) : null;
          const stored = await storeSupabaseCachedResponse(
            body.fn,
            args,
            parsed,
            READ_TTL_MS[body.fn],
            supabaseGeneration
          );
          res.setHeader('X-Jaeger-Sync', stored.ok ? 'stored' : 'deferred');
          const shadow = await runShadowRead(body.fn, args, parsed, {
            sheetsMs: Date.now() - sheetsStartedAt,
            sourceRefreshedAt: new Date().toISOString()
          });
          res.setHeader('X-Jaeger-Shadow', shadow.status);
        } catch (_) {
          res.setHeader('X-Jaeger-Sync', 'deferred');
          res.setHeader('X-Jaeger-Shadow', 'error');
        }
        res.setHeader('X-Jaeger-Cache', 'sheets');
      }
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

module.exports.READ_TTL_MS = READ_TTL_MS;
module.exports.WRITE_METHODS = WRITE_METHODS;
