const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body;
}

function normalizeMonth(name) {
  const raw = String(name || '').trim().replace(/\s+/g, ' ');
  const parts = raw.split(' ');
  if (parts.length < 2) return raw;
  const lower = parts[0].toLowerCase();
  const idx = MONTHS.findIndex((m) => m.toLowerCase() === lower || m.slice(0, 3).toLowerCase() === lower.slice(0, 3));
  const yy = String(parts[1]).replace(/\D/g, '').slice(-2).padStart(2, '0');
  return `${idx >= 0 ? MONTHS[idx] : parts[0]} ${yy}`;
}

function monthMeta(name) {
  const normalized = normalizeMonth(name);
  const [monthName, yy] = normalized.split(' ');
  const monthIndex = MONTHS.indexOf(monthName) + 1 || null;
  const year = yy ? 2000 + Number(yy) : null;
  return {
    key: normalized.toLowerCase().replace(/\s+/g, '_'),
    name: normalized,
    year,
    monthIndex
  };
}

function nextMonthKey(name) {
  const meta = monthMeta(name);
  if (!meta.monthIndex || !meta.year) return null;
  const nextIndex = meta.monthIndex === 12 ? 1 : meta.monthIndex + 1;
  const nextYear = meta.monthIndex === 12 ? meta.year + 1 : meta.year;
  return monthMeta(`${MONTHS[nextIndex - 1]} ${String(nextYear).slice(-2)}`).key;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOrNull(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return text;
  const local = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (local) {
    const [, d, m, y] = local;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function unwrap(result) {
  if (!result || result.ok === false) {
    throw new Error((result && result.error) || 'Respuesta invalida de Apps Script');
  }
  return result.data !== undefined ? result.data : result;
}

async function callAppsScript(fn, args) {
  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  const token = process.env.APPS_SCRIPT_TOKEN;
  if (!appsScriptUrl || !token) {
    throw new Error('Faltan APPS_SCRIPT_URL o APPS_SCRIPT_TOKEN.');
  }
  const response = await fetch(appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token, fn, args: Array.isArray(args) ? args : [] })
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text || '{}');
  } catch (error) {
    throw new Error(`Apps Script no devolvio JSON valido: ${text.slice(0, 180)}`);
  }
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Apps Script respondio ${response.status}`);
  }
  return unwrap(data);
}

async function supabaseRequest(table, rows, options = {}) {
  if (!rows || !rows.length) return 0;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.jaegerkey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Faltan SUPABASE_URL o jaegerkey en las variables de entorno de Vercel.');
  }
  const url = new URL(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}`);
  if (options.onConflict) url.searchParams.set('on_conflict', options.onConflict);
  const prefer = options.onConflict ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: prefer
    },
    body: JSON.stringify(rows)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase ${table}: ${response.status} ${text}`);
  }
  return rows.length;
}

function buildRows(snapshot) {
  const now = new Date().toISOString();
  const monthEntries = Array.isArray(snapshot.meses) ? snapshot.meses : [];
  const availableMonths = Array.isArray(snapshot.mesesDisponibles) ? snapshot.mesesDisponibles : [];
  const monthNames = Array.from(new Set([...availableMonths, ...monthEntries.map((m) => m.mes)].filter(Boolean)));

  const months = monthNames.map((name) => {
    const meta = monthMeta(name);
    const entry = monthEntries.find((m) => normalizeMonth(m.mes) === meta.name) || null;
    return {
      month_key: meta.key,
      name: meta.name,
      year: meta.year,
      month_index: meta.monthIndex,
      payload: entry || {},
      synced_at: now
    };
  });

  const movements = [];
  const creditCardMonths = [];
  const creditCardEvents = [];
  const paintings = [];

  monthEntries.forEach((entry) => {
    const meta = monthMeta(entry.mes);
    const movs = entry.movimientos && Array.isArray(entry.movimientos.data) ? entry.movimientos.data : [];
    movs.forEach((mov, index) => {
      const cashMeta = mov.mesCaja ? monthMeta(mov.mesCaja) : meta;
      movements.push({
        id: String(mov.id || `${meta.key}_${index}`),
        month_key: meta.key,
        cash_month_key: cashMeta.key,
        movement_date: dateOrNull(mov.fecha),
        type: mov.tipo || null,
        category: mov.categoria || null,
        subcategory: mov.subcategoria || null,
        amount: numberOrNull(mov.monto),
        balance_after: numberOrNull(mov.saldoDespues),
        payload: mov,
        synced_at: now
      });
    });

    const cards = Array.isArray(entry.tarjetas) ? entry.tarjetas : [];
    cards.forEach((card) => {
      const cardId = String(card.tarjeta || '').toUpperCase();
      creditCardMonths.push({
        card_month_key: `${cardId}_${meta.key}`,
        card_id: cardId,
        month_key: meta.key,
        year: entry.anio || meta.year,
        payload: card.state || card,
        synced_at: now
      });

      const events = card.movimientos && Array.isArray(card.movimientos.data) ? card.movimientos.data : [];
      events.forEach((event, index) => {
        creditCardEvents.push({
          id: String(event.id || `${cardId}_${meta.key}_${index}`),
          card_id: cardId,
          month_key: meta.key,
          applied_month_key: event.mes ? monthMeta(event.mes).key : meta.key,
          movement_date: dateOrNull(event.fecha),
          type: event.tipo || null,
          amount: numberOrNull(event.monto),
          linked_movement_id: event.registroId || null,
          charge_id: event.cargoId || null,
          payload: event,
          synced_at: now
        });
      });
    });

    if (entry.pinturas) {
      paintings.push({
        month_key: meta.key,
        payload: entry.pinturas,
        synced_at: now
      });
    }
  });

  return {
    months,
    movements,
    creditCardMonths,
    creditCardEvents,
    balanceSnapshots: [{ id: 'latest', payload: snapshot.balance || {}, synced_at: now }],
    cashflowSnapshots: [{ id: 'latest', payload: snapshot.flujo || {}, synced_at: now }],
    japanGoal: [{ id: 'latest', payload: snapshot.japon || {}, synced_at: now }],
    paintings,
    appSnapshots: [{
      source: snapshot.source || 'apps_script',
      exported_at: snapshot.exportedAt || now,
      payload: snapshot
    }]
  };
}

function countRows(rows) {
  return Object.fromEntries(Object.entries(rows).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0]));
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const accessKey = process.env.APP_ACCESS_KEY;
  if (accessKey && req.headers['x-app-key'] !== accessKey) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  let runId = null;
  const startedAt = new Date().toISOString();

  try {
    const body = parseBody(req);
    const snapshot = await callAppsScript('exportarSnapshotSupabase', [{ meses: body.meses || [] }]);
    const rows = buildRows(snapshot);
    const counts = countRows(rows);

    if (body.dryRun) {
      return res.status(200).json({ ok: true, dryRun: true, counts, exportedAt: snapshot.exportedAt });
    }

    await supabaseRequest('jaeger_app_snapshots', rows.appSnapshots);
    await supabaseRequest('jaeger_months', rows.months, { onConflict: 'month_key' });
    await supabaseRequest('jaeger_movements', rows.movements, { onConflict: 'id' });
    await supabaseRequest('jaeger_credit_card_months', rows.creditCardMonths, { onConflict: 'card_month_key' });
    await supabaseRequest('jaeger_credit_card_events', rows.creditCardEvents, { onConflict: 'id' });
    await supabaseRequest('jaeger_balance_snapshots', rows.balanceSnapshots, { onConflict: 'id' });
    await supabaseRequest('jaeger_cashflow_snapshots', rows.cashflowSnapshots, { onConflict: 'id' });
    await supabaseRequest('jaeger_japan_goal', rows.japanGoal, { onConflict: 'id' });
    await supabaseRequest('jaeger_paintings_months', rows.paintings, { onConflict: 'month_key' });

    await supabaseRequest('jaeger_sync_runs', [{
      status: 'ok',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      counts
    }]);

    return res.status(200).json({ ok: true, counts, exportedAt: snapshot.exportedAt, runId });
  } catch (error) {
    try {
      await supabaseRequest('jaeger_sync_runs', [{
        status: 'error',
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        counts: {},
        error: error.message || String(error)
      }]);
    } catch (_) {
      // If the error is missing Supabase config or missing tables, the original error is more useful.
    }
    return res.status(500).json({ ok: false, error: error.message || String(error) });
  }
};
