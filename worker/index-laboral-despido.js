import app from './index-docs.js';

const ALLOWED_ORIGIN = 'https://hxcor.github.io';
const DISCLAIMER = 'Resultado exclusivamente informativo y estimativo. No constituye asesoría jurídica, laboral, fiscal o contable, ni una determinación oficial de autoridad. No debe utilizarse por sí solo como documento para exigir, reclamar o acreditar el pago de cantidad alguna. Los conceptos aplicables dependen de los hechos, contrato, pruebas, procedimiento y resolución de autoridad competente.';

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

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function positive(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function delegatedRequest(request, pathname, method = 'GET', body = null) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = '';
  const headers = {
    Authorization: request.headers.get('Authorization') || '',
    Origin: request.headers.get('Origin') || ALLOWED_ORIGIN,
  };
  if (body !== null) headers['Content-Type'] = 'application/json';
  return new Request(url.toString(), {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
  });
}

async function adminAuthenticated(request, env, ctx) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const response = await app.fetch(delegatedRequest(request, '/usuarios'), env, ctx);
  return response.ok;
}

async function readParameters(request, env, ctx) {
  const response = await app.fetch(delegatedRequest(request, '/laboral/parameters'), env, ctx);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || 'No fue posible obtener parámetros laborales');
  return data.values || {};
}

async function baseSettlement(request, env, ctx, body) {
  const baseBody = {
    scenario: 'prestaciones',
    employeeName: body.employeeName,
    startDate: body.startDate,
    endDate: body.endDate,
    monthlySalary: body.monthlySalary,
    dailySalary: body.dailySalary,
    region: body.region,
    unpaidSalaryDays: body.unpaidSalaryDays,
    pendingVacationDays: body.pendingVacationDays,
    aguinaldoDays: body.aguinaldoDays,
    vacationPremiumPct: body.vacationPremiumPct,
    contractualVacationDays: body.contractualVacationDays,
    plantWorker: body.plantWorker !== false,
  };
  const response = await app.fetch(delegatedRequest(request, '/laboral/calculate', 'POST', baseBody), env, ctx);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || 'No fue posible calcular el finiquito base');
  return data.result;
}

async function calculateDismissal(request, env, ctx) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
  if (request.method !== 'POST') return json(request, { ok: false, error: 'Método no permitido' }, 405);
  if (!(await adminAuthenticated(request, env, ctx))) return json(request, { ok: false, error: 'No autorizado' }, 403);

  let body = {};
  try { body = await request.json(); } catch { return json(request, { ok: false, error: 'Solicitud inválida' }, 400); }

  const scenario = String(body.scenario || '').trim().toLowerCase();
  if (!['despido_injustificado', 'despido_justificado'].includes(scenario)) {
    return json(request, { ok: false, error: 'Escenario de despido inválido' }, 400);
  }

  const relationType = String(body.relationType || 'indeterminado').trim().toLowerCase();
  if (relationType !== 'indeterminado') {
    return json(request, { ok: false, error: 'Esta versión calcula despido para relaciones por tiempo indeterminado. Los contratos por tiempo determinado se incorporarán en una etapa posterior.' }, 400);
  }

  try {
    const [base, params] = await Promise.all([
      baseSettlement(request, env, ctx, body),
      readParameters(request, env, ctx),
    ]);

    const c = base.calculations || {};
    const i = base.inputsApplied || {};
    const service = base.service || {};
    const dailyBase = positive(base.dailySalary);
    const exactYears = positive(service.exactYears);
    const annualVacationDays = positive(i.annualVacationDays || i.legalVacationDays);
    const aguinaldoDays = positive(i.aguinaldoDays, 15);
    const vacationPremiumPct = positive(i.vacationPremiumPct, 25);

    const minimumIntegratedDaily = dailyBase * (1 + (aguinaldoDays / 365) + ((annualVacationDays * (vacationPremiumPct / 100)) / 365));
    const integratedOverride = positive(body.integratedDailySalary);
    const indemnityDailySalary = roundMoney(integratedOverride > 0 ? Math.max(integratedOverride, dailyBase) : minimumIntegratedDaily);
    const integratedSalarySource = integratedOverride > 0 ? 'Capturado por usuario' : 'Estimación mínima con salario y prestaciones capturadas';

    const finiquito = roundMoney(positive(c.salaryPending) + positive(c.aguinaldo) + positive(c.vacaciones) + positive(c.primaVacacional));

    const minimumWage = positive(i.minimumWage);
    const seniorityBase = roundMoney(Math.min(Math.max(dailyBase, minimumWage), minimumWage * 2));
    const plantWorker = body.plantWorker !== false;
    const seniorityDaysPerYear = positive(params.PRIMA_ANTIGUEDAD_DIAS_ANIO, 12);
    const primaAntiguedad = plantWorker ? roundMoney(seniorityBase * seniorityDaysPerYear * exactYears) : 0;

    const unjustified = scenario === 'despido_injustificado';
    const constitutionalMonths = positive(params.INDEMNIZACION_CONSTITUCIONAL_MESES, 3);
    const indemnizacionConstitucional = unjustified ? roundMoney(indemnityDailySalary * 30 * constitutionalMonths) : 0;

    const art49Confirmed = unjustified && body.art49Confirmed === true;
    const art50Days = positive(params.ART50_DIAS_ANIO_INDETERMINADO, 20);
    const indemnizacionArt50 = art49Confirmed ? roundMoney(indemnityDailySalary * art50Days * exactYears) : 0;

    const backPayMonthsRequested = Math.min(positive(params.SALARIOS_VENCIDOS_MAX_MESES, 12), positive(body.backPayMonths));
    const salariosVencidosSimulados = unjustified && backPayMonthsRequested > 0
      ? roundMoney(indemnityDailySalary * 30 * backPayMonthsRequested)
      : 0;

    const totalBaseEstimado = roundMoney(finiquito + primaAntiguedad + indemnizacionConstitucional + indemnizacionArt50);

    const legalBasis = [
      { concept: 'Finiquito y prestaciones devengadas', law: 'Ley Federal del Trabajo', articles: '76, 79, 80 y 87', note: 'Vacaciones proporcionales, prima vacacional y aguinaldo según datos capturados.' },
      { concept: 'Prima de antigüedad', law: 'Ley Federal del Trabajo', articles: '162, 485 y 486', note: plantWorker ? 'Aplicada por separación del empleo; base limitada conforme a la Ley.' : 'No aplicada porque el cálculo fue marcado como trabajador no de planta.' },
      { concept: unjustified ? 'Despido injustificado' : 'Rescisión justificada', law: 'Ley Federal del Trabajo', articles: unjustified ? '48' : '46 y 47', note: unjustified ? 'La indemnización constitucional de tres meses se muestra como estimación base; reinstalación y demás consecuencias dependen del caso.' : 'El artículo 47 enumera causas de rescisión sin responsabilidad para el patrón y exige aviso de rescisión.' },
      { concept: 'Salario para indemnizaciones', law: 'Ley Federal del Trabajo', articles: '84 y 89', note: integratedSalarySource === 'Capturado por usuario' ? 'Se utilizó el salario diario integrado capturado.' : 'Se utilizó una estimación mínima con prestaciones capturadas; otras percepciones pueden modificar la base.' },
    ];

    if (art49Confirmed) {
      legalBasis.push({ concept: 'Componente Art. 49/50', law: 'Ley Federal del Trabajo', articles: '49 y 50', note: 'Se agregó únicamente porque el usuario confirmó que su supuesto jurídico requiere la indemnización del artículo 50. No corresponde automáticamente a todo despido injustificado.' });
    }

    if (salariosVencidosSimulados > 0) {
      legalBasis.push({ concept: 'Salarios vencidos — simulación separada', law: 'Ley Federal del Trabajo', articles: '48', note: `Simulación de ${backPayMonthsRequested} mes(es). Es contingente al procedimiento y no forma parte del total base estimado.` });
    }

    return json(request, {
      ok: true,
      result: {
        scenario,
        relationType,
        employeeName: String(body.employeeName || '').trim(),
        startDate: base.startDate,
        endDate: base.endDate,
        service,
        salary: {
          dailyBase: roundMoney(dailyBase),
          indemnityDailySalary,
          integratedSalarySource,
        },
        calculations: {
          finiquito,
          salaryPending: positive(c.salaryPending),
          aguinaldo: positive(c.aguinaldo),
          vacaciones: positive(c.vacaciones),
          primaVacacional: positive(c.primaVacacional),
          primaAntiguedad,
          seniorityBase,
          indemnizacionConstitucional,
          indemnizacionArt50,
          art49Confirmed,
          totalBaseEstimado,
          salariosVencidosSimulados,
          backPayMonthsRequested,
        },
        legalBasis,
        legalVersion: 'LFT última reforma DOF 14-05-2026',
        disclaimer: DISCLAIMER,
        warnings: [
          'Los veinte días por año del artículo 50 no se agregan automáticamente a todo despido injustificado.',
          'Los salarios vencidos e intereses del artículo 48 son contingentes al procedimiento y resolución; la simulación se presenta separada del total base.',
          integratedOverride > 0 ? 'La base de indemnización usa el salario diario integrado capturado por el usuario.' : 'La base de indemnización es una estimación mínima; captura el salario diario integrado si existen otras prestaciones o percepciones.',
        ],
      },
    });
  } catch (error) {
    return json(request, { ok: false, error: error?.message || 'No fue posible calcular el escenario' }, 400);
  }
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (path === '/laboral/dismissal') return calculateDismissal(request, env, ctx);
    return app.fetch(request, env, ctx);
  },
};
