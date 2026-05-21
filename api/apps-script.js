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

    const upstream = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token,
        fn: body.fn,
        args: Array.isArray(body.args) ? body.args : []
      })
    });

    const text = await upstream.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res
      .status(upstream.ok ? 200 : 502)
      .send(text || JSON.stringify({ ok: false, error: 'Respuesta vacia de Apps Script' }));
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.message || String(error) });
  }
};
