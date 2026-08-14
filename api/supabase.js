const { READ_TTL_MS } = require('./apps-script');
const {
  getConfig,
  getCachedResponse,
  storeCachedResponse
} = require('../lib/jaeger-supabase-cache');
const { nativeRead, SUPPORTED_READS } = require('../lib/jaeger-supabase-read');

async function callAppsScript(fn, args) {
  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  const token = process.env.APPS_SCRIPT_TOKEN;
  if (!appsScriptUrl || !token) {
    throw new Error('Falta configurar el origen privado de Google Sheets.');
  }

  const upstream = await fetch(appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token, fn, args: args || [] })
  });
  const text = await upstream.text();
  if (!upstream.ok) throw new Error(`Google Sheets respondio HTTP ${upstream.status}`);
  const data = text ? JSON.parse(text) : null;
  if (!data) throw new Error('Google Sheets devolvio una respuesta vacia.');
  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const accessKey = process.env.APP_ACCESS_KEY;
  if (!accessKey) {
    return res.status(500).json({ ok: false, error: 'Falta configurar el acceso privado de la aplicacion.' });
  }
  if (req.headers['x-app-key'] !== accessKey) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  const config = getConfig();
  if (!config.configured) {
    return res.status(503).json({
      ok: false,
      error: 'La API privada de Supabase aun no esta configurada en Vercel.'
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const fn = body.fn;
    const args = Array.isArray(body.args) ? body.args : [];
    if (!fn || !READ_TTL_MS[fn]) {
      return res.status(400).json({ ok: false, error: 'Lectura no permitida' });
    }

    if (SUPPORTED_READS.has(fn)) {
      try {
        const native = await Promise.race([
          nativeRead(fn, args, { requireFresh: true }),
          new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), 1500))
        ]);
        if (native.ok && native.data && native.data.ok !== false) {
          res.setHeader('X-Jaeger-Source', 'supabase-native');
          res.setHeader('X-Jaeger-Native-Ms', String(native.durationMs || 0));
          return res.status(200).json(native.data);
        }
        return res.status(503).json({ ok: false,
          error: 'Supabase no pudo confirmar una lectura vigente. Google Sheets quedó solo como respaldo.' });
      } catch (_) {
        return res.status(503).json({ ok: false,
          error: 'No se pudo leer la fuente principal de Supabase.' });
      }
    }

    const cached = await getCachedResponse(fn, args);
    if (cached.hit) {
      res.setHeader('X-Jaeger-Cache', 'supabase');
      return res.status(200).json(cached.response);
    }

    const fresh = await callAppsScript(fn, args);
    if (fresh && fresh.ok !== false) {
      const stored = await storeCachedResponse(fn, args, fresh, READ_TTL_MS[fn], cached.generation);
      res.setHeader('X-Jaeger-Sync', stored.ok ? 'stored' : 'deferred');
    }
    res.setHeader('X-Jaeger-Cache', 'sheets');
    return res.status(200).json(fresh);
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.message || String(error) });
  }
};
