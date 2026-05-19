module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const appsScriptUrl = process.env.APPS_SCRIPT_URL ||
    'https://script.google.com/macros/s/AKfycbyqNs78f1YpbW_ksjF56rNl6VSd9dN8d9kFU0ka352bbzeJ1L_A9zaigqvAOVihNxlRHw/exec';
  const token = process.env.APPS_SCRIPT_TOKEN || 'finper_2026_Christian_JaegerSpend_9b7c4d2f6a';

  if (!appsScriptUrl) {
    return res.status(500).json({
      ok: false,
      error: 'Falta APPS_SCRIPT_URL en las variables de entorno de Vercel.'
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const upstream = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, fn: body.fn, args: body.args || [] })
    });

    const text = await upstream.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(upstream.ok ? 200 : 502).send(text || JSON.stringify({ ok: false, error: 'Respuesta vacia de Apps Script' }));
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.message || String(error) });
  }
};
