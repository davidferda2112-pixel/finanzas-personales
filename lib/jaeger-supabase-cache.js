const crypto = require('crypto');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function makeCacheKey(fn, args) {
  return crypto
    .createHash('sha256')
    .update(`${fn}:${stableStringify(args || [])}`)
    .digest('hex');
}

function getConfig() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  // Keep the established service-role name working while preferring the
  // current secret-key name. Both values stay server-side in Vercel.
  const configuredSecret = String(process.env.SUPABASE_SECRET_KEY || '');
  const configuredServiceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  const secretKey = configuredSecret || configuredServiceRole;
  return {
    url,
    secretKey,
    configured: Boolean(url && secretKey),
    keySource: configuredSecret ? 'secret' : (configuredServiceRole ? 'service_role' : 'missing')
  };
}

function makeHeaders(secretKey, extra) {
  const headers = Object.assign({
    apikey: secretKey,
    'Content-Type': 'application/json'
  }, extra || {});

  // Modern sb_secret_* keys must be sent only through apikey. Legacy
  // service_role JWTs still require the Authorization header.
  if (!secretKey.startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${secretKey}`;
  }
  return headers;
}

async function restRequest(path, options) {
  const config = getConfig();
  if (!config.configured) {
    return { ok: false, skipped: true, error: 'Supabase no configurado' };
  }

  const response = await fetch(`${config.url}/rest/v1/${path}`, Object.assign({}, options, {
    headers: makeHeaders(config.secretKey, options && options.headers)
  }));
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase respondio HTTP ${response.status}`);
  }
  return { ok: true, response, text };
}

async function getCacheGeneration() {
  const result = await restRequest(
    'jaeger_cache_control?id=eq.1&select=generation&limit=1',
    { method: 'GET' }
  );
  if (!result.ok) return null;
  const rows = result.text ? JSON.parse(result.text) : [];
  return rows[0] && Number.isFinite(Number(rows[0].generation))
    ? Number(rows[0].generation)
    : null;
}

async function getCachedResponse(fn, args) {
  const config = getConfig();
  if (!config.configured) return { hit: false, configured: false };

  const key = makeCacheKey(fn, args);
  try {
    const generation = await getCacheGeneration();
    if (generation === null) return { hit: false, configured: true };
    const result = await restRequest(
      `jaeger_api_cache?cache_key=eq.${key}&generation=eq.${generation}&select=response,expires_at,source_refreshed_at&limit=1`,
      { method: 'GET' }
    );
    const rows = result.text ? JSON.parse(result.text) : [];
    const row = rows[0];
    if (!row || !row.expires_at || Date.parse(row.expires_at) <= Date.now()) {
      return { hit: false, configured: true, generation };
    }
    return {
      hit: true,
      configured: true,
      generation,
      response: row.response,
      sourceRefreshedAt: row.source_refreshed_at
    };
  } catch (error) {
    return { hit: false, configured: true, error: error.message || String(error) };
  }
}

async function storeCachedResponse(fn, args, responseBody, ttlMs, expectedGeneration) {
  const config = getConfig();
  if (!config.configured || !ttlMs || !responseBody || responseBody.ok === false) {
    return { ok: false, skipped: true };
  }

  const now = new Date();
  let generation;
  try {
    generation = await getCacheGeneration();
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
  if (generation === null || (
    expectedGeneration !== null && expectedGeneration !== undefined &&
    Number.isFinite(Number(expectedGeneration)) && generation !== Number(expectedGeneration)
  )) {
    return { ok: false, skipped: true, staleGeneration: true };
  }
  const payload = {
    cache_key: makeCacheKey(fn, args),
    fn,
    args: args || [],
    response: responseBody,
    response_hash: crypto.createHash('sha256').update(stableStringify(responseBody)).digest('hex'),
    generation,
    source_refreshed_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttlMs).toISOString(),
    updated_at: now.toISOString()
  };

  try {
    await restRequest('jaeger_api_cache?on_conflict=cache_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(payload)
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

async function invalidateAllCachedResponses() {
  const config = getConfig();
  if (!config.configured) return { ok: false, skipped: true };
  try {
    const result = await restRequest('rpc/jaeger_invalidate_api_cache', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' }
    });
    return { ok: true, generation: result.text ? Number(JSON.parse(result.text)) : null };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

module.exports = {
  getConfig,
  getCacheGeneration,
  getCachedResponse,
  invalidateAllCachedResponses,
  makeCacheKey,
  restRequest,
  stableStringify,
  storeCachedResponse
};
