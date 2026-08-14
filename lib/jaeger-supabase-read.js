const crypto = require('crypto');
const { restRequest, stableStringify } = require('./jaeger-supabase-cache');

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const SHORT_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const CARD_CONCEPTS = ['Saldo anterior', 'Consumos', 'Pagos / Créditos',
  'Total/ Saldo Rotativo', 'Saldo Diferido', 'Saldo Real'];

const SUPPORTED_READS = new Set([
  'getMesesDisponibles', 'getMesData', 'getMovimientosMes',
  'getPinturasMes', 'getViajeJapon', 'getFlujoCaja',
  'getBalanceGeneral', 'getTarjetasState', 'parseTarjetas',
  'getMovimientosTarjeta', 'getDesgloseSub'
]);

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  const rounded = Math.round((number(value) + Number.EPSILON) * 100) / 100;
  return Math.abs(rounded) < 0.005 ? 0 : rounded;
}

function normalizedKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeMonth(value) {
  const parts = String(value || '').trim().replace(/\s+/g, ' ').split(' ');
  if (parts.length < 2) return String(value || '').trim();
  const raw = normalizedKey(parts[0]);
  const index = MONTHS.findIndex((month) => normalizedKey(month).startsWith(raw.slice(0, 3)));
  let year = String(parts[1]).replace(/\D/g, '');
  if (year.length === 4) year = year.slice(-2);
  if (year.length === 1) year = `0${year}`;
  return `${index >= 0 ? MONTHS[index] : parts[0]} ${year}`;
}

function monthOrder(value) {
  const month = normalizeMonth(value).split(' ');
  return (2000 + number(month[1])) * 12 + MONTHS.indexOf(month[0]);
}

function nextMonth(value) {
  const normalized = normalizeMonth(value);
  const [name, shortYear] = normalized.split(' ');
  const index = MONTHS.indexOf(name);
  const date = new Date(Date.UTC(2000 + number(shortYear), index + 1, 1));
  return `${MONTHS[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(-2)}`;
}

function shortMonth(value) {
  const [name, year] = normalizeMonth(value).split(' ');
  return `${SHORT_MONTHS[MONTHS.indexOf(name)] || name.slice(0, 3)} ${year}`;
}

function status(budget, actual) {
  if (!number(actual) || !number(budget)) return 'empty';
  const ratio = number(actual) / number(budget);
  if (ratio <= 0.85) return 'ok';
  if (ratio <= 1) return 'warn';
  return 'over';
}

function dateText(value) {
  const raw = String(value || '').trim();
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (local) return `${String(local[1]).padStart(2, '0')}/${String(local[2]).padStart(2, '0')}/${local[3]}`;
  const iso = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : raw.split('T')[0];
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '');
}

function dateOrder(value) {
  const iso = String(value || '').split('T')[0];
  const timestamp = Date.parse(`${iso}T12:00:00-05:00`);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function buildCashFlow(source) {
  const months = SHORT_MONTHS.slice();
  const rows = (source.cashFlow || []).map((row) => ({
    label: row.label,
    valores: (row.monthly_values || []).map(number),
    total: number(row.total)
  }));
  const byLabel = new Map(rows.map((row) => [row.label, row]));
  const ensure = (label) => {
    if (!byLabel.has(label)) {
      const row = { label, valores: Array(12).fill(0), total: 0 };
      byLabel.set(label, row);
      rows.push(row);
    }
    return byLabel.get(label);
  };
  const labels = {
    ingreso: null,
    necesidad: 'NECESIDADES', deseo: 'DESEOS', deuda: 'DEUDAS', ahorro: 'AHORROS'
  };
  (source.movementTotals || source.allMovementTotals || []).forEach((item) => {
    const index = number(item.month_number) - 1;
    if (index < 0 || index > 11) return;
    let label = labels[item.kind];
    if (item.kind === 'ingreso') {
      if (item.subcategory === 'Sueldo') label = 'SUELDO';
      else if (item.subcategory === 'Pinturas') label = 'PINTURAS';
      else if (normalizedKey(item.subcategory) === 'prestamos tdc') label = 'PRESTAMOS RECIBIDOS';
      else label = 'OTROS INGRESOS';
    }
    if (label) ensure(label).valores[index] = number(ensure(label).valores[index]) + number(item.amount);
  });

  const initial = ensure('SALDO INICIAL');
  const income = ensure('TOTAL INGRESOS');
  const expense = ensure('TOTAL EGRESOS');
  const operating = ensure('FLUJO OPERATIVO');
  const accumulated = ensure('FLUJO DE CAJA ACUMULADO');
  const salary = ensure('SUELDO');
  const paintings = ensure('PINTURAS');
  const other = ensure('OTROS INGRESOS');
  const loans = ensure('PRESTAMOS RECIBIDOS');
  const needs = ensure('NECESIDADES');
  const wants = ensure('DESEOS');
  const debts = ensure('DEUDAS');
  const savings = ensure('AHORROS');
  const firstBalance = number(initial.valores[0]);

  for (let index = 0; index < 12; index += 1) {
    if (index > 0) initial.valores[index] = money(accumulated.valores[index - 1]);
    income.valores[index] = money(number(salary.valores[index]) + number(paintings.valores[index]) +
      number(other.valores[index]) + number(loans.valores[index]));
    expense.valores[index] = money(number(needs.valores[index]) + number(wants.valores[index]) +
      number(debts.valores[index]) + number(savings.valores[index]));
    operating.valores[index] = money(income.valores[index] - expense.valores[index]);
    accumulated.valores[index] = money((index === 0 ? firstBalance : initial.valores[index]) + operating.valores[index]);
  }

  rows.forEach((row) => {
    row.valores = row.valores.map(money);
    row.total = money(row.label === 'SALDO INICIAL' || row.label === 'FLUJO DE CAJA ACUMULADO'
      ? row.valores[11]
      : row.valores.reduce((sum, value) => sum + number(value), 0));
  });
  return { ok: true, data: { meses: months, filas: rows } };
}

function cashFlowValue(flow, label, month) {
  const index = MONTHS.indexOf(normalizeMonth(month).split(' ')[0]);
  const row = flow.data.filas.find((item) => item.label === label);
  return row && index >= 0 ? number(row.valores[index]) : null;
}

function buildMovements(source) {
  const month = normalizeMonth(source.month);
  const flow = buildCashFlow(source);
  const baseBalance = cashFlowValue(flow, 'SALDO INICIAL', month) || 0;
  const movements = (source.movements || []).map((row) => ({
    id: String(row.legacy_id || ''),
    orden: Math.max(0, number(row.source_row_number) - 1),
    timestamp: String(row.recorded_at || ''),
    mes: normalizeMonth(row.economic_month),
    mesCaja: normalizeMonth(row.cash_month || row.economic_month),
    tipo: String(row.kind || ''),
    categoria: String(row.category || ''),
    subcategoria: String(row.subcategory || ''),
    monto: number(row.amount),
    fecha: dateText(row.transaction_date),
    fechaOrden: dateOrder(row.transaction_date),
    notas: String(row.notes || '')
  }));
  const ascending = movements.slice().sort((a, b) => a.fechaOrden - b.fechaOrden || a.orden - b.orden);
  let balance = baseBalance;
  ascending.forEach((movement) => {
    balance += movement.tipo === 'ingreso' ? movement.monto : -movement.monto;
    movement.saldoDespues = money(balance);
  });
  movements.sort((a, b) => b.fechaOrden - a.fechaOrden || a.orden - b.orden);
  return { ok: true, data: movements, saldoBase: baseBalance };
}

function buildMonthData(source) {
  const plan = source.planItems || [];
  const movements = source.movements || [];
  const movementSums = new Map();
  movements.forEach((row) => {
    const key = `${row.kind}|${normalizedKey(row.subcategory)}`;
    movementSums.set(key, number(movementSums.get(key)) + number(row.amount));
  });
  const bySection = (section) => plan.filter((item) => item.section === section);
  const makeSection = (section) => {
    const items = bySection(section).map((item) => {
      const extra = number(movementSums.get(`${section}|${normalizedKey(item.name)}`));
      const actual = number(item.actual) + extra;
      if (section === 'deuda') {
        const result = { nombre: item.name, vence: item.due_text || null, préstamo: number(item.budget), actual,
          status: actual > 0 ? 'ok' : 'empty' };
        if (extra) {
          result.sobrante = number(item.budget) - actual;
          result.status = status(item.budget, actual);
        }
        return result;
      }
      if (section === 'ahorro') {
        const result = { nombre: item.name, presupuesto: number(item.budget), actual };
        if (extra) {
          result.sobrante = number(item.budget) - actual;
          result.status = status(item.budget, actual);
        }
        return result;
      }
      if (section === 'ingreso') return { nombre: item.name, presupuesto: number(item.budget), actual };
      return { nombre: item.name, presupuesto: number(item.budget), actual,
        sobrante: number(item.budget) - actual, status: status(item.budget, actual) };
    });
    const budgetKey = section === 'deuda' ? 'préstamo' : 'presupuesto';
    return {
      items,
      total: items.reduce((sum, item) => sum + number(item.actual), 0),
      totalPresupuesto: items.reduce((sum, item) => sum + number(item[budgetKey]), 0)
    };
  };

  const necesidades = makeSection('necesidad');
  const deseos = makeSection('deseo');
  const deudas = makeSection('deuda');
  const ahorros = makeSection('ahorro');
  const ingresos = makeSection('ingreso');
  ingresos.totalActual = ingresos.total;
  delete ingresos.total;
  ahorros.totalCalculado = bySection('ahorro').reduce((sum, item) => sum + number(item.actual), 0);

  const summary = Object.fromEntries((source.summaryValues || []).map((item) => [item.metric, item]));
  const vistaGeneral = {};
  const summaryKeys = {
    saldo_inicial: 'saldoInicial', ingresos: 'ingresos', necesidades_deudas: 'necesidadesDeudas',
    necesidades: 'necesidades', deseos: 'deseos', deudas: 'deudas', ahorros: 'ahorros', saldo_final: 'saldoFinal'
  };
  Object.entries(summaryKeys).forEach(([metric, key]) => {
    if (summary[metric]) vistaGeneral[key] = { presupuesto: number(summary[metric].budget), actual: number(summary[metric].actual) };
  });
  const flow = buildCashFlow(source);
  const initial = cashFlowValue(flow, 'SALDO INICIAL', source.month);
  const final = cashFlowValue(flow, 'FLUJO DE CAJA ACUMULADO', source.month);
  if (initial !== null) vistaGeneral.saldoInicial = {
    presupuesto: vistaGeneral.saldoInicial ? vistaGeneral.saldoInicial.presupuesto : initial,
    actual: initial
  };
  vistaGeneral.saldoFinal = {
    presupuesto: vistaGeneral.saldoFinal ? vistaGeneral.saldoFinal.presupuesto : 0,
    actual: final === null ? 0 : final
  };

  const metricMap = { ingresos: 'ingresos', necesidades_deudas: 'necDeudas', deseos: 'deseos', ahorros: 'ahorros', totales: 'totales' };
  const metricas = {};
  (source.distributionMetrics || []).forEach((item) => {
    const key = metricMap[item.metric];
    if (key) metricas[key] = { pctEst: number(item.estimated_pct), valEst: number(item.estimated_value),
      pctReal: number(item.actual_pct), valReal: number(item.actual_value) };
  });
  if (ingresos.totalActual) {
    if (metricas.necDeudas) {
      metricas.necDeudas.valReal = necesidades.total + deudas.total;
      metricas.necDeudas.pctReal = metricas.necDeudas.valReal / ingresos.totalActual;
    }
    if (metricas.deseos) {
      metricas.deseos.valReal = deseos.total;
      metricas.deseos.pctReal = deseos.total / ingresos.totalActual;
    }
    if (metricas.ahorros) {
      metricas.ahorros.valReal = ahorros.total;
      metricas.ahorros.pctReal = ahorros.total / ingresos.totalActual;
    }
  }
  return { ok: true, mes: normalizeMonth(source.month), vistaGeneral, necesidades, deseos, deudas, ahorros, ingresos, metricas };
}

function buildPaintings(source) {
  const row = source.painting || {};
  const stockInicial = Math.max(0, number(row.opening_stock));
  const stockAgregado = Math.max(0, number(row.added_stock));
  const stockActual = Math.max(0, number(row.current_stock));
  const autoconsumo = Math.max(0, number(row.self_consumption));
  const descuento = Math.max(0, number(row.discounted));
  const vendidas = Math.max(0, stockInicial + stockAgregado - stockActual);
  const ingresos = money(6.5 * vendidas - 2 * autoconsumo - 0.5 * descuento);
  const costo = money(4.5 * vendidas);
  return { ok: true, data: { stockInicial, stockAgregado, stockActual, autoconsumo, descuento,
    vendidas: money(vendidas), ingresos, costo, utilidad: money(ingresos - costo), mes: normalizeMonth(source.month) } };
}

function buildJapan(source) {
  const rows = source.items || [];
  const items = rows.filter((item) => item.section === 'viaje' &&
    !['Total', 'Presupuesto Real'].includes(item.name) && number(item.budget) > 0)
    .map((item) => ({ nombre: item.name, presupuesto: number(item.budget), actual: number(item.actual), faltante: number(item.remaining) }));
  const names = new Set(['Formulario DS-160', 'Integrity Fee', 'Visa Japonesa']);
  const tramites = rows.filter((item) => item.section === 'tramites' && names.has(item.name))
    .map((item) => ({ nombre: item.name, presupuesto: number(item.budget), actual: number(item.actual),
      faltante: number(item.remaining), pagado: number(item.actual) >= number(item.budget) && number(item.budget) > 0 }));
  const totalRow = rows.find((item) => item.section === 'viaje' && item.name === 'Total');
  const actualRow = rows.find((item) => item.section === 'tramites' && item.name === 'Viaje a Japón');
  const totalPresupuesto = totalRow ? number(totalRow.budget) : 4177;
  const totalActual = actualRow ? number(actualRow.actual) : 0;
  return { ok: true, items, tramites, totalPresupuesto, totalActual,
    faltante: totalPresupuesto - totalActual, porcentaje: totalPresupuesto ? totalActual / totalPresupuesto * 100 : 0 };
}

function buildCardEvents(source, month, card) {
  const normalizedMonth = normalizeMonth(month);
  return (source.events || []).filter((row) => normalizeMonth(row.month_key) === normalizedMonth && row.card_code === card)
    .map((row) => ({
      id: String(row.legacy_id || ''), orden: Math.max(0, number(row.source_row_number) - 1),
      timestamp: String(row.recorded_at || ''), mes: normalizeMonth(row.month_key), tarjeta: row.card_code,
      tipo: row.event_type, monto: number(row.amount), fecha: dateText(row.transaction_date),
      fechaOrden: dateOrder(row.transaction_date), notas: String(row.notes || ''), origen: String(row.origin || ''),
      registroId: String(row.movement_legacy_id || ''), categoria: String(row.category || ''),
      subcategoria: String(row.subcategory || ''), cargoId: String(row.charge_legacy_id || ''),
      diferidoId: String(row.installment_legacy_id || '')
    })).sort((a, b) => b.fechaOrden - a.fechaOrden || a.orden - b.orden);
}

function buildCards(source) {
  const historyRows = source.history || [];
  const installments = source.installments || [];
  const makeHistory = (card, year) => CARD_CONCEPTS.map((concept) => {
    const row = { concepto: concept };
    for (let index = 0; index < 12; index += 1) {
      const key = `${SHORT_MONTHS[index]} ${String(year).slice(-2)}`;
      const value = historyRows.find((item) => item.card_code === card && number(item.year) === year &&
        number(item.month_number) === index + 1 && item.concept === concept);
      row[key] = value ? number(value.amount) : 0;
    }
    return row;
  });
  const makeInstallments = (card) => installments.filter((item) => item.card_code === card).map((item) => ({
    id: String(item.legacy_id || ''), row: number(item.source_row_number), tarjeta: item.card_code,
    nombre: item.name, inicial: number(item.initial_balance), cuota: number(item.installment_amount),
    cuotasAlMesBase: number(item.installments_at_base_month), mesBase: shortMonth(item.base_month),
    estado: item.state || 'activo', mesLiquidacion: item.liquidation_month || '', balanceId: item.balance_id || ''
  }));
  return [
    { id: 'VISA', nombre: 'Visa Personal', numero: '**** **** **** 4894', clase: 'visa-card', logo: 'visa',
      historial2026: makeHistory('VISA', 2026), meses2026: SHORT_MONTHS.map((m) => `${m} 26`),
      historial2025: [], meses2025: [], diferidos: makeInstallments('VISA') },
    { id: 'MC', nombre: 'Mastercard Gold GC', numero: '**** **** **** 9593', clase: 'mc-card', logo: 'mc',
      historial2026: makeHistory('MC', 2026), meses2026: SHORT_MONTHS.map((m) => `${m} 26`),
      historial2025: makeHistory('MC', 2025), meses2025: SHORT_MONTHS.map((m) => `${m} 25`), diferidos: makeInstallments('MC') }
  ];
}

function buildBalance(source) {
  const flow = buildCashFlow(source);
  const current = new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', month: 'long', year: '2-digit' })
    .format(new Date()).replace(' de ', ' ');
  const currentMonth = normalizeMonth(current.charAt(0).toUpperCase() + current.slice(1));
  const available = cashFlowValue(flow, 'FLUJO DE CAJA ACUMULADO', currentMonth);
  const groups = (source.groups || []).filter((group) => group.active !== false);
  const items = (source.items || []).filter((item) => item.active !== false);
  const makeType = (type) => {
    const output = [];
    groups.filter((group) => group.balance_type === type).sort((a, b) => number(a.sort_order) - number(b.sort_order)).forEach((group) => {
      let sequence = 0;
      const baseItems = items.filter((item) => item.balance_type === type &&
        normalizedKey(item.group_name) === normalizedKey(group.name) && !item.custom)
        .sort((a, b) => number(a.source_row_number) - number(b.source_row_number));
      const customItems = items.filter((item) => item.balance_type === type &&
        normalizedKey(item.group_name) === normalizedKey(group.name) && item.custom)
        .sort((a, b) => number(a.sort_order) - number(b.sort_order) || String(a.name).localeCompare(String(b.name), 'es'));
      const placed = baseItems.map((item) => Object.assign({}, item, {
        effectiveOrder: number(item.sort_order) || ++sequence
      }));
      customItems.forEach((item) => placed.push(Object.assign({}, item, { effectiveOrder: ++sequence })));
      const children = placed
        .sort((a, b) => number(a.effectiveOrder) - number(b.effectiveOrder) || String(a.name).localeCompare(String(b.name), 'es'))
        .map((item, index) => {
          const value = item.balance_id === '10101.05' && available !== null ? available : number(item.current_value);
          const result = { codigo: item.balance_id, nombre: item.name, valor: value, tipo: type, esGrupo: false,
            grupo: group.name, orden: index + 1 };
          if (item.custom) { result.custom = true; result.manual = true; }
          return result;
        });
      if (!children.length) return;
      output.push({ codigo: `GRP-${type.charAt(0)}-${group.name.replace(/[^A-Za-z0-9]+/g, '-')}`,
        nombre: group.name, valor: children.reduce((sum, child) => sum + child.valor, 0), tipo: type,
        esGrupo: true, customGroup: false });
      output.push(...children);
    });
    return output;
  };
  const activos = makeType('Activo');
  const pasivos = makeType('Pasivo');
  const cambios = (source.changes || []).map((item) => ({
    fecha: dateText(item.source_timestamp), codigo: item.balance_id, nombre: item.name, tipo: item.balance_type,
    accion: item.action, anterior: number(item.previous_value), nuevo: number(item.new_value), nota: String(item.note || '')
  }));
  const totalActivos = activos.reduce((sum, item) => sum + (item.esGrupo ? 0 : item.valor), 0);
  const totalPasivos = pasivos.reduce((sum, item) => sum + (item.esGrupo ? 0 : item.valor), 0);
  return { ok: true, activos, totalActivos, pasivos, totalPasivos, patrimonioNeto: totalActivos - totalPasivos, cambios };
}

function transformSource(fn, args, source) {
  if (fn === 'getMesesDisponibles') return { ok: true, data: source.months || [] };
  if (fn === 'getMesData') return buildMonthData(source);
  if (fn === 'getMovimientosMes') return buildMovements(source);
  if (fn === 'getDesgloseSub') {
    const sub = normalizedKey(args[1]);
    const movements = buildMovements(source).data.filter((item) => normalizedKey(item.subcategoria) === sub)
      .map(({ id, tipo, categoria, subcategoria, fecha, monto, notas }) => ({ id, tipo, categoria, subcategoria, fecha, monto, notas }));
    return { ok: true, data: movements };
  }
  if (fn === 'getPinturasMes') return buildPaintings(source);
  if (fn === 'getViajeJapon') return buildJapan(source);
  if (fn === 'getFlujoCaja') return buildCashFlow(source);
  if (fn === 'getBalanceGeneral') return buildBalance(source);
  if (fn === 'getMovimientosTarjeta') return { ok: true, data: buildCardEvents(source, args[0], args[1]) };
  if (fn === 'parseTarjetas') return { ok: true, tarjetas: buildCards(source) };
  if (fn === 'getTarjetasState') {
    const options = args[0] || {};
    const cards = buildCards(source);
    let index = Number.parseInt(options.idx, 10);
    if (!Number.isFinite(index) || index < 0 || index >= cards.length) index = 0;
    const year = Number.parseInt(options.anio, 10) || 2026;
    const card = cards[index] || cards[0];
    let month = normalizeMonth(options.mes || 'Agosto 26');
    const available = (year === 2026 ? card.meses2026 : card.meses2025).map(normalizeMonth);
    if (available.length && !available.includes(month)) month = available[available.length - 1];
    return { ok: true, tarjetas: cards, tcIdx: index, tdcAnio: year, tcMesActual: month,
      tdcMovs: buildCardEvents(source, month, card.id),
      tdcMovsAplicados: buildCardEvents(source, nextMonth(month), card.id), tdcKey: `${card.id}|${month}` };
  }
  throw new Error(`Lectura nativa no implementada: ${fn}`);
}

async function nativeRead(fn, args) {
  if (!SUPPORTED_READS.has(fn)) return { ok: false, supported: false };
  const started = Date.now();
  const result = await restRequest('rpc/jaeger_native_read_source', {
    method: 'POST', body: JSON.stringify({ p_fn: fn, p_args: args || [] })
  });
  const source = result.text ? JSON.parse(result.text) : null;
  return { ok: true, supported: true, data: transformSource(fn, args || [], source || {}), durationMs: Date.now() - started };
}

function comparable(value, key) {
  if (['timestamp', 'generatedAt'].includes(key)) return undefined;
  if (Array.isArray(value)) return value.map((item) => comparable(item, '')).filter((item) => item !== undefined);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((childKey) => [childKey, comparable(value[childKey], childKey)])
      .filter(([, child]) => child !== undefined));
  }
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 1000000) / 1000000;
  return value;
}

function collectDiffs(left, right, path, output) {
  if (output.length >= 40) return;
  if (typeof left === 'number' && typeof right === 'number' && Math.abs(left - right) <= 0.005) return;
  if (left === right) return;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) output.push(`${path}.length`);
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) collectDiffs(left[index], right[index], `${path}[${index}]`, output);
    return;
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    [...keys].sort().forEach((key) => collectDiffs(left[key], right[key], path ? `${path}.${key}` : key, output));
    return;
  }
  output.push(path || '$');
}

function hash(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function compareResponses(sheetsData, nativeData) {
  const sheetsComparable = comparable(sheetsData, '');
  const nativeComparable = comparable(nativeData, '');
  const diffs = [];
  collectDiffs(sheetsComparable, nativeComparable, '', diffs);
  return { matches: diffs.length === 0, diffs, sheetsComparable, nativeComparable };
}

async function compareAndRecord(fn, args, sheetsData, timing) {
  const native = await nativeRead(fn, args);
  if (!native.supported) return { status: 'unsupported' };
  const comparison = compareResponses(sheetsData, native.data);
  const { sheetsComparable, nativeComparable, diffs } = comparison;
  const payload = {
    fn, args: args || [], matches: diffs.length === 0, diff_count: diffs.length,
    diff_paths: diffs, sheets_hash: hash(sheetsComparable), native_hash: hash(nativeComparable),
    sheets_ms: timing && timing.sheetsMs, native_ms: native.durationMs,
    source_refreshed_at: timing && timing.sourceRefreshedAt
  };
  try {
    await restRequest('jaeger_read_parity_checks', {
      method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload)
    });
  } catch (_) {}
  return { status: payload.matches ? 'match' : 'mismatch', diffCount: diffs.length, nativeMs: native.durationMs };
}

module.exports = { SUPPORTED_READS, compareAndRecord, compareResponses, nativeRead, transformSource };
