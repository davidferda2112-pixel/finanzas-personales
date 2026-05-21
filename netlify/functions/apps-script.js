exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { Allow: 'POST', 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };
  }

  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  const token = process.env.APPS_SCRIPT_TOKEN;
  const accessKey = process.env.APP_ACCESS_KEY;

  if (!appsScriptUrl || !token) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: false, error: 'Faltan APPS_SCRIPT_URL o APPS_SCRIPT_TOKEN.' })
    };
  }

  if (accessKey && event.headers['x-app-key'] !== accessKey) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: false, error: 'No autorizado' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    if (!body.fn || typeof body.fn !== 'string') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ ok: false, error: 'Funcion no valida' })
      };
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
    return {
      statusCode: upstream.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      body: text || JSON.stringify({ ok: false, error: 'Respuesta vacia de Apps Script' })
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: false, error: error.message || String(error) })
    };
  }
};
