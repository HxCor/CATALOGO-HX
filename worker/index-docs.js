import app from './index-divisas.js';

const ALLOWED_ORIGIN = 'https://hxcor.github.io';
const MS_DAY = 86400000;
const DEFAULT_LABORAL_PARAMS = Object.freeze({
  UMA_DIARIA_2026: 117.31,
  UMA_MENSUAL_2026: 3566.22,
  UMA_ANUAL_2026: 42794.64,
  SMG_GENERAL_2026: 315.04,
  SMG_FRONTERA_2026: 440.87,
  AGUINALDO_MIN_DIAS: 15,
  PRIMA_VACACIONAL_MIN_PCT: 25,
  PRIMA_ANTIGUEDAD_DIAS_ANIO: 12,
});

const LABORAL_LEGAL_VERSION = 'LFT última reforma DOF 14-05-2026';
const LABORAL_DISCLAIMER = 'Resultado exclusivamente informativo y estimativo. No constituye asesoría jurídica, laboral, fiscal o contable, ni una determinación oficial de autoridad. No debe utilizarse por sí solo como documento para exigir, reclamar o acreditar el pago de cantidad alguna. El resultado depende de los datos capturados y de las circunstancias particulares de la relación laboral.';

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...cors(request),
    },
  });
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function delegatedRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = '';
  return new Request(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: request.headers.get('Authorization') || '',
      Origin: request.headers.get('Origin') || ALLOWED_ORIGIN,
    },
  });
}

async function authenticated(request, env, ctx) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const response = await app.fetch(delegatedRequest(request, '/divisas/quotes'), env, ctx);
  return response.ok;
}

async function adminAuthenticated(request, env, ctx) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const response = await app.fetch(delegatedRequest(request, '/usuarios'), env, ctx);
  return response.ok;
}

async function updateQuoteDelivery(request, env, ctx) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
  if (request.method !== 'POST') return json(request, { ok: false, error: 'Método no permitido' }, 405);
  if (!(await authenticated(request, env, ctx))) return json(request, { ok: false, error: 'No autorizado' }, 401);

  let body = {};
  try { body = await request.json(); } catch { return json(request, { ok: false, error: 'Solicitud inválida' }, 400); }

  const recordId = String(body.recordId || '').trim();
  if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) return json(request, { ok: false, error: 'recordId inválido' }, 400);

  const fields = {};
  const email = String(body.email || '').trim();
  if (email) {
    if (!validEmail(email)) return json(request, { ok: false, error: 'Correo inválido' }, 400);
    fields.EmailDestinatario = email;
  }

  if (body.status) {
    const allowed = ['Borrador', 'Enviada', 'Aprobada', 'Cancelada'];
    if (!allowed.includes(body.status)) return json(request, { ok: false, error: 'Estado inválido' }, 400);
    fields.Estado = body.status;
    if (body.status === 'Enviada') fields.EnviadoEn = new Date().toISOString();
  }

  if (!Object.keys(fields).length) return json(request, { ok: false, error: 'No hay cambios' }, 400);

  const baseId = env.AIRTABLE_BASE_ID;
  const token = env.AIRTABLE_TOKEN;
  const table = env.AIRTABLE_TABLE_DIVISAS_COTIZACIONES || 'DIVISAS_COTIZACIONES';
  if (!baseId || !token) return json(request, { ok: false, error: 'Airtable no configurado' }, 500);

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${recordId}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return json(request, { ok: false, error: data?.error?.message || data?.error?.type || `Airtable ${response.status}` }, 502);

  return json(request, {
    ok: true,
    record: {
      id: data.id,
      fields: {
        EmailDestinatario: data.fields?.EmailDestinatario || '',
        Estado: data.fields?.Estado || '',
        EnviadoEn: data.fields?.EnviadoEn || '',
      },
    },
  });
}

async function listAirtableRecords(env, table) {
  if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_TOKEN) throw new Error('Airtable no configurado');
  const records = [];
  let offset = '';
  do {
    const url = new URL(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || data?.error?.type || `Airtable ${response.status}`);
    records.push(...(data.records || []));
    offset = data.offset || '';
  } while (offset);
  return records;
}

async function loadLaboralParameters(env) {
  const values = { ...DEFAULT_LABORAL_PARAMS };
  let records = [];
  let source = 'fallback-interno';
  try {
    records = await listAirtableRecords(env, env.AIRTABLE_TABLE_LABORAL_PARAMETROS || 'LABORAL_PARAMETROS');
    for (const record of records) {
      const key = String(record.fields?.Clave || '').trim();
      const value = Number(record.fields?.Valor);
      if (key && Number.isFinite(value)) values[key] = value;
    }
    source = 'Airtable · LABORAL_PARAMETROS';
  } catch (error) {
    console.warn('Laboral parameters fallback:', error?.message || error);
  }
  return { values, records, source };
}

function parseIsoDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [y, m, d] = text.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function diffDays(a, b) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / MS_DAY));
}

function daysInYear(year) {
  return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function anniversary(start, year) {
  const month = start.getUTCMonth();
  const day = Math.min(start.getUTCDate(), lastDayOfMonth(year, month));
  return new Date(Date.UTC(year, month, day));
}

function completedServiceYears(start, end) {
  let years = end.getUTCFullYear() - start.getUTCFullYear();
  const candidate = anniversary(start, start.getUTCFullYear() + years);
  if (candidate > end) years -= 1;
  return Math.max(0, years);
}

function vacationDaysForServiceYear(serviceYear) {
  const year = Math.max(1, Math.floor(Number(serviceYear) || 1));
  if (year <= 5) return 10 + (2 * year);
  return 22 + (2 * Math.floor((year - 6) / 5));
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function positive(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function calculateLaboral(body, params) {
  const scenario = String(body.scenario || 'renuncia').trim().toLowerCase();
  if (!['renuncia', 'prestaciones'].includes(scenario)) throw new Error('Escenario todavía no disponible');

  const start = parseIsoDate(body.startDate);
  const end = parseIsoDate(body.endDate);
  if (!start || !end) throw new Error('Fecha de ingreso y fecha de baja válidas son obligatorias');
  if (end < start) throw new Error('La fecha de baja no puede ser anterior a la fecha de ingreso');

  const monthlySalary = positive(body.monthlySalary);
  const inputDailySalary = positive(body.dailySalary);
  const dailySalary = inputDailySalary > 0 ? inputDailySalary : monthlySalary / 30;
  if (!(dailySalary > 0)) throw new Error('Captura un salario mensual o diario mayor a cero');

  const region = String(body.region || 'general') === 'frontera' ? 'frontera' : 'general';
  const minimumWage = region === 'frontera' ? params.SMG_FRONTERA_2026 : params.SMG_GENERAL_2026;
  const aguinaldoDays = Math.max(params.AGUINALDO_MIN_DIAS, positive(body.aguinaldoDays, params.AGUINALDO_MIN_DIAS));
  const vacationPremiumPct = Math.max(params.PRIMA_VACACIONAL_MIN_PCT, positive(body.vacationPremiumPct, params.PRIMA_VACACIONAL_MIN_PCT));
  const unpaidSalaryDays = positive(body.unpaidSalaryDays);
  const pendingVacationDays = positive(body.pendingVacationDays);
  const plantWorker = body.plantWorker !== false;

  const completedYears = completedServiceYears(start, end);
  const exactServiceYears = diffDays(start, end) / 365.2425;
  const currentServiceYear = completedYears + 1;
  const legalVacationDays = vacationDaysForServiceYear(currentServiceYear);
  const contractualVacationDays = positive(body.contractualVacationDays);
  const annualVacationDays = Math.max(legalVacationDays, contractualVacationDays || 0);

  let periodStart = start;
  let periodEnd = anniversary(start, start.getUTCFullYear() + 1);
  if (completedYears > 0) {
    periodStart = anniversary(start, start.getUTCFullYear() + completedYears);
    periodEnd = anniversary(start, start.getUTCFullYear() + completedYears + 1);
  }
  const periodLength = Math.max(1, diffDays(periodStart, periodEnd));
  const elapsedInPeriod = Math.min(periodLength, diffDays(periodStart, end) + 1);
  const proportionalVacationDays = annualVacationDays * (elapsedInPeriod / periodLength);
  const totalVacationDays = proportionalVacationDays + pendingVacationDays;

  const calendarYear = end.getUTCFullYear();
  const yearStart = new Date(Date.UTC(calendarYear, 0, 1));
  const aguinaldoStart = start > yearStart ? start : yearStart;
  const workedDaysThisYear = Math.max(0, diffDays(aguinaldoStart, end) + 1);
  const aguinaldoFraction = workedDaysThisYear / daysInYear(calendarYear);

  const salaryPending = roundMoney(dailySalary * unpaidSalaryDays);
  const aguinaldo = roundMoney(dailySalary * aguinaldoDays * aguinaldoFraction);
  const vacaciones = roundMoney(dailySalary * totalVacationDays);
  const primaVacacional = roundMoney(vacaciones * (vacationPremiumPct / 100));

  const seniorityEligible = scenario === 'renuncia' && plantWorker && exactServiceYears >= 15;
  const senioritySalaryBase = Math.min(Math.max(dailySalary, minimumWage), minimumWage * 2);
  const primaAntiguedad = seniorityEligible
    ? roundMoney(senioritySalaryBase * params.PRIMA_ANTIGUEDAD_DIAS_ANIO * exactServiceYears)
    : 0;

  const total = roundMoney(salaryPending + aguinaldo + vacaciones + primaVacacional + primaAntiguedad);

  return {
    scenario,
    employeeName: String(body.employeeName || '').trim(),
    startDate: String(body.startDate),
    endDate: String(body.endDate),
    region,
    dailySalary: roundMoney(dailySalary),
    monthlySalary: roundMoney(monthlySalary || dailySalary * 30),
    service: {
      completedYears,
      exactYears: Number(exactServiceYears.toFixed(4)),
      currentServiceYear,
    },
    inputsApplied: {
      aguinaldoDays,
      vacationPremiumPct,
      annualVacationDays,
      legalVacationDays,
      pendingVacationDays,
      unpaidSalaryDays,
      plantWorker,
      minimumWage,
    },
    calculations: {
      salaryPending,
      aguinaldo,
      vacationProportionalDays: Number(proportionalVacationDays.toFixed(4)),
      vacationTotalDays: Number(totalVacationDays.toFixed(4)),
      vacaciones,
      primaVacacional,
      primaAntiguedad,
      seniorityEligible,
      senioritySalaryBase: roundMoney(senioritySalaryBase),
      total,
    },
    legalBasis: [
      { concept: 'Vacaciones proporcionales', law: 'Ley Federal del Trabajo', articles: '76 y 79', note: 'Días mínimos por antigüedad y pago proporcional al terminar la relación.' },
      { concept: 'Prima vacacional', law: 'Ley Federal del Trabajo', articles: '80', note: 'Prima mínima del 25% sobre salarios correspondientes al periodo vacacional.' },
      { concept: 'Aguinaldo', law: 'Ley Federal del Trabajo', articles: '87', note: 'Mínimo 15 días y parte proporcional cuando no se labora el año completo.' },
      { concept: 'Prima de antigüedad', law: 'Ley Federal del Trabajo', articles: '162, 485 y 486', note: seniorityEligible ? 'Aplicada por retiro voluntario con al menos 15 años de servicios y tope salarial legal.' : 'No aplicada en este cálculo; revisar requisitos del artículo 162.' },
    ],
    legalVersion: LABORAL_LEGAL_VERSION,
    disclaimer: LABORAL_DISCLAIMER,
    exclusions: ['ISR y retenciones fiscales', 'descuentos o adeudos particulares', 'comisiones o bonos no capturados', 'prestaciones contractuales no capturadas', 'indemnizaciones por despido'],
  };
}

async function handleLaboralParameters(request, env, ctx) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
  if (request.method !== 'GET') return json(request, { ok: false, error: 'Método no permitido' }, 405);
  if (!(await adminAuthenticated(request, env, ctx))) return json(request, { ok: false, error: 'Acceso restringido' }, 403);
  const loaded = await loadLaboralParameters(env);
  return json(request, {
    ok: true,
    year: 2026,
    source: loaded.source,
    values: loaded.values,
    legalVersion: LABORAL_LEGAL_VERSION,
    disclaimer: LABORAL_DISCLAIMER,
  });
}

async function handleLaboralCalculate(request, env, ctx) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
  if (request.method !== 'POST') return json(request, { ok: false, error: 'Método no permitido' }, 405);
  if (!(await adminAuthenticated(request, env, ctx))) return json(request, { ok: false, error: 'Acceso restringido' }, 403);

  let body = {};
  try { body = await request.json(); } catch { return json(request, { ok: false, error: 'Solicitud inválida' }, 400); }
  try {
    const loaded = await loadLaboralParameters(env);
    const result = calculateLaboral(body, loaded.values);
    return json(request, { ok: true, result, parametersSource: loaded.source });
  } catch (error) {
    return json(request, { ok: false, error: error?.message || 'No se pudo realizar el cálculo' }, 400);
  }
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (path === '/divisas/quotes/status') return updateQuoteDelivery(request, env, ctx);
    if (path === '/laboral/parameters') return handleLaboralParameters(request, env, ctx);
    if (path === '/laboral/calculate') return handleLaboralCalculate(request, env, ctx);
    return app.fetch(request, env, ctx);
  },
};