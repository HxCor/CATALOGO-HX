import app from './index-laboral-despido.js';

const ALLOWED_ORIGIN = 'https://hxcor.github.io';
const LSS_URL = 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LSS.pdf';
const INFONAVIT_URL = 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LIFNVT.pdf';
const CEAV_SOURCE_URL = 'https://cronica.diputados.gob.mx/pdf/64/2021/feb/210217-6.pdf';
const DISCLAIMER = 'RESULTADO ESTIMADO · NO ES DETERMINACIÓN OFICIAL. Este cálculo tiene fines exclusivamente informativos y de planeación. No constituye una cédula de determinación del IMSS, SUA, SIPARE, INFONAVIT, asesoría fiscal, contable o jurídica, ni sustituye la prima de riesgo registrada, incidencias, ausentismos, variables salariales, topes, criterios o sistemas oficiales aplicables al patrón y a la persona trabajadora.';

const DEFAULT = Object.freeze({
  UMA_DIARIA_2026: 117.31,
  SMG_GENERAL_2026: 315.04,
  SMG_FRONTERA_2026: 440.87,
  AGUINALDO_MIN_DIAS: 15,
  PRIMA_VACACIONAL_MIN_PCT: 25,
  SBC_MAX_UMA: 25,
  IMSS_EM_FIXED_PATRON_PCT_UMA: 20.4,
  IMSS_EM_EXCESS_THRESHOLD_UMA: 3,
  IMSS_EM_EXCESS_PATRON_PCT: 1.1,
  IMSS_EM_EXCESS_WORKER_PCT: 0.4,
  IMSS_EM_CASH_PATRON_PCT: 0.7,
  IMSS_EM_CASH_WORKER_PCT: 0.25,
  IMSS_EM_PENSIONERS_PATRON_PCT: 1.05,
  IMSS_EM_PENSIONERS_WORKER_PCT: 0.375,
  IMSS_IV_PATRON_PCT: 1.75,
  IMSS_IV_WORKER_PCT: 0.625,
  IMSS_RETIREMENT_PATRON_PCT: 2,
  IMSS_CEAV_WORKER_PCT: 1.125,
  IMSS_GUARDERIAS_PATRON_PCT: 1,
  INFONAVIT_PATRON_PCT: 5,
  RISK_CLASS_I_PCT: 0.54355,
  RISK_CLASS_II_PCT: 1.13065,
  RISK_CLASS_III_PCT: 2.5984,
  RISK_CLASS_IV_PCT: 4.65325,
  RISK_CLASS_V_PCT: 7.58875,
  CEAV_2026_1_00_SM_PCT: 3.15,
  CEAV_2026_1_01_SM_TO_1_50_UMA_PCT: 3.676,
  CEAV_2026_1_51_TO_2_00_UMA_PCT: 4.851,
  CEAV_2026_2_01_TO_2_50_UMA_PCT: 5.556,
  CEAV_2026_2_51_TO_3_00_UMA_PCT: 6.026,
  CEAV_2026_3_01_TO_3_50_UMA_PCT: 6.361,
  CEAV_2026_3_51_TO_4_00_UMA_PCT: 6.613,
  CEAV_2026_4_01_PLUS_UMA_PCT: 7.513,
});

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
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(request) },
  });
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

async function sessionAuthenticated(request, env, ctx) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const response = await app.fetch(delegatedRequest(request, '/proveedores'), env, ctx);
  return response.ok;
}

async function readParameters(request, env, ctx) {
  const response = await app.fetch(delegatedRequest(request, '/laboral/parameters'), env, ctx);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) return { values: { ...DEFAULT }, source: 'fallback-interno' };
  return { values: { ...DEFAULT, ...(data.values || {}) }, source: data.source || 'LABORAL_PARAMETROS' };
}

function n(value, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function positive(value, fallback = 0) {
  const x = n(value, fallback);
  return x >= 0 ? x : fallback;
}

function money(value) {
  return Math.round((n(value) + Number.EPSILON) * 100) / 100;
}

function pctAmount(base, pct) {
  return base * (pct / 100);
}

function vacationDaysForServiceYear(serviceYear) {
  const year = Math.max(1, Math.floor(n(serviceYear, 1)));
  if (year <= 5) return 10 + (2 * year);
  return 22 + (2 * Math.floor((year - 6) / 5));
}

function ceavRateFor2026(sbc, minimumWage, uma, p) {
  if (sbc <= minimumWage + 0.01) return { rate: p.CEAV_2026_1_00_SM_PCT, band: '1.00 SM' };
  const ratio = sbc / uma;
  if (ratio <= 1.5) return { rate: p.CEAV_2026_1_01_SM_TO_1_50_UMA_PCT, band: '1.01 SM a 1.50 UMA' };
  if (ratio <= 2) return { rate: p.CEAV_2026_1_51_TO_2_00_UMA_PCT, band: '1.51 a 2.00 UMA' };
  if (ratio <= 2.5) return { rate: p.CEAV_2026_2_01_TO_2_50_UMA_PCT, band: '2.01 a 2.50 UMA' };
  if (ratio <= 3) return { rate: p.CEAV_2026_2_51_TO_3_00_UMA_PCT, band: '2.51 a 3.00 UMA' };
  if (ratio <= 3.5) return { rate: p.CEAV_2026_3_01_TO_3_50_UMA_PCT, band: '3.01 a 3.50 UMA' };
  if (ratio <= 4) return { rate: p.CEAV_2026_3_51_TO_4_00_UMA_PCT, band: '3.51 a 4.00 UMA' };
  return { rate: p.CEAV_2026_4_01_PLUS_UMA_PCT, band: '4.01 UMA en adelante' };
}

function riskRate(body, p) {
  const custom = positive(body.riskPremiumPct);
  if (custom > 0) {
    if (custom < 0.5 || custom > 15) throw new Error('La prima de riesgo capturada debe estar entre 0.50000% y 15.00000% conforme al rango legal del artículo 74.');
    return { rate: custom, source: 'Prima vigente capturada por el usuario', className: 'Personalizada' };
  }
  const cls = String(body.riskClass || 'I').trim().toUpperCase();
  const map = {
    I: p.RISK_CLASS_I_PCT,
    II: p.RISK_CLASS_II_PCT,
    III: p.RISK_CLASS_III_PCT,
    IV: p.RISK_CLASS_IV_PCT,
    V: p.RISK_CLASS_V_PCT,
  };
  if (!(cls in map)) throw new Error('Clase de riesgo inválida.');
  return { rate: map[cls], source: `Prima media inicial · Clase ${cls}`, className: cls };
}

function line(label, daily, days, annualDays = 365) {
  return { label, daily: money(daily), monthly: money(daily * days), annual: money(daily * annualDays) };
}

async function calculateImss(request, env, ctx) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
  if (request.method !== 'POST') return json(request, { ok: false, error: 'Método no permitido' }, 405);
  if (!(await sessionAuthenticated(request, env, ctx))) return json(request, { ok: false, error: 'No autorizado' }, 401);

  let body = {};
  try { body = await request.json(); } catch { return json(request, { ok: false, error: 'Solicitud inválida' }, 400); }

  try {
    const config = await readParameters(request, env, ctx);
    const p = config.values;
    const region = String(body.region || 'general') === 'frontera' ? 'frontera' : 'general';
    const minimumWage = region === 'frontera' ? p.SMG_FRONTERA_2026 : p.SMG_GENERAL_2026;
    const uma = positive(p.UMA_DIARIA_2026, 117.31);
    const monthlySalaryInput = positive(body.monthlySalary);
    const dailySalaryInput = positive(body.dailySalary);
    const dailySalary = dailySalaryInput > 0 ? dailySalaryInput : monthlySalaryInput / 30;
    if (!(dailySalary > 0)) throw new Error('Captura un sueldo mensual o diario mayor a cero.');
    const monthlySalary = monthlySalaryInput > 0 ? monthlySalaryInput : dailySalary * 30;

    const serviceYear = Math.max(1, Math.floor(positive(body.serviceYear, 1)));
    const legalVacationDays = vacationDaysForServiceYear(serviceYear);
    const capturedVacationDays = positive(body.vacationDays);
    const vacationDays = Math.max(legalVacationDays, capturedVacationDays || 0);
    const aguinaldoDays = Math.max(positive(p.AGUINALDO_MIN_DIAS, 15), positive(body.aguinaldoDays, 15));
    const vacationPremiumPct = Math.max(positive(p.PRIMA_VACACIONAL_MIN_PCT, 25), positive(body.vacationPremiumPct, 25));
    const otherIntegrableDaily = positive(body.otherIntegrableDaily);
    const integrationFactor = 1 + (aguinaldoDays / 365) + ((vacationDays * (vacationPremiumPct / 100)) / 365);
    const estimatedSbc = (dailySalary * integrationFactor) + otherIntegrableDaily;
    const knownSbc = positive(body.knownSbcDaily);
    const sbcSource = knownSbc > 0 ? 'SBC diario capturado por el usuario' : 'SBC estimado con sueldo y prestaciones fijas capturadas';
    const sbcBeforeLimits = knownSbc > 0 ? knownSbc : estimatedSbc;
    const maxSbc = uma * positive(p.SBC_MAX_UMA, 25);
    const sbc = Math.min(Math.max(sbcBeforeLimits, minimumWage), maxSbc);
    const floorApplied = sbcBeforeLimits < minimumWage;
    const capApplied = sbcBeforeLimits > maxSbc;

    const days = Math.min(31, Math.max(1, positive(body.daysCotized, 30.4)));
    const excessThreshold = uma * positive(p.IMSS_EM_EXCESS_THRESHOLD_UMA, 3);
    const excessBase = Math.max(0, sbc - excessThreshold);
    const ceav = ceavRateFor2026(sbc, minimumWage, uma, p);
    const risk = riskRate(body, p);

    const employerPartsDaily = {
      emFixed: uma * (p.IMSS_EM_FIXED_PATRON_PCT_UMA / 100),
      emExcess: pctAmount(excessBase, p.IMSS_EM_EXCESS_PATRON_PCT),
      emCash: pctAmount(sbc, p.IMSS_EM_CASH_PATRON_PCT),
      emPensioners: pctAmount(sbc, p.IMSS_EM_PENSIONERS_PATRON_PCT),
      risk: pctAmount(sbc, risk.rate),
      invalidityLife: pctAmount(sbc, p.IMSS_IV_PATRON_PCT),
      retirement: pctAmount(sbc, p.IMSS_RETIREMENT_PATRON_PCT),
      ceav: pctAmount(sbc, ceav.rate),
      daycare: pctAmount(sbc, p.IMSS_GUARDERIAS_PATRON_PCT),
    };
    const workerPartsDaily = {
      emExcess: pctAmount(excessBase, p.IMSS_EM_EXCESS_WORKER_PCT),
      emCash: pctAmount(sbc, p.IMSS_EM_CASH_WORKER_PCT),
      emPensioners: pctAmount(sbc, p.IMSS_EM_PENSIONERS_WORKER_PCT),
      invalidityLife: pctAmount(sbc, p.IMSS_IV_WORKER_PCT),
      ceav: pctAmount(sbc, p.IMSS_CEAV_WORKER_PCT),
    };

    const employerOwnDaily = Object.values(employerPartsDaily).reduce((a, b) => a + b, 0);
    const workerCalculatedDaily = Object.values(workerPartsDaily).reduce((a, b) => a + b, 0);
    const minimumWageWorker = Math.abs(dailySalary - minimumWage) <= 0.02;
    const workerAbsorbedByEmployerDaily = minimumWageWorker ? workerCalculatedDaily : 0;
    const workerWithheldDaily = minimumWageWorker ? 0 : workerCalculatedDaily;
    const employerImssDaily = employerOwnDaily + workerAbsorbedByEmployerDaily;
    const infonavitDaily = pctAmount(sbc, p.INFONAVIT_PATRON_PCT);
    const employerSocialDaily = employerImssDaily + infonavitDaily;

    const employerImssMonthly = employerImssDaily * days;
    const infonavitMonthly = infonavitDaily * days;
    const socialMonthly = employerSocialDaily * days;
    const workerQuotaMonthly = workerWithheldDaily * days;
    const employerCostMonthly = monthlySalary + socialMonthly;
    const employerImssAnnual = employerImssDaily * 365;
    const infonavitAnnual = infonavitDaily * 365;
    const socialAnnual = employerSocialDaily * 365;
    const salaryAnnual = monthlySalary * 12;
    const employerCostAnnual = salaryAnnual + socialAnnual;

    const employerBreakdown = [
      line('E&M · cuota fija', employerPartsDaily.emFixed, days),
      line('E&M · excedente 3 UMA', employerPartsDaily.emExcess, days),
      line('E&M · prestaciones en dinero', employerPartsDaily.emCash, days),
      line('E&M · gastos médicos pensionados', employerPartsDaily.emPensioners, days),
      line(`Riesgos de trabajo · ${risk.source}`, employerPartsDaily.risk, days),
      line('Invalidez y vida', employerPartsDaily.invalidityLife, days),
      line('Retiro', employerPartsDaily.retirement, days),
      line(`Cesantía y vejez · ${ceav.band} · ${ceav.rate}%`, employerPartsDaily.ceav, days),
      line('Guarderías y prestaciones sociales', employerPartsDaily.daycare, days),
    ];
    if (minimumWageWorker) employerBreakdown.push(line('Cuota obrera absorbida por patrón · Art. 36', workerAbsorbedByEmployerDaily, days));

    const workerBreakdown = [
      line('E&M · excedente 3 UMA', workerPartsDaily.emExcess, days),
      line('E&M · prestaciones en dinero', workerPartsDaily.emCash, days),
      line('E&M · gastos médicos pensionados', workerPartsDaily.emPensioners, days),
      line('Invalidez y vida', workerPartsDaily.invalidityLife, days),
      line('Cesantía y vejez', workerPartsDaily.ceav, days),
    ];

    const warnings = [
      'La prima de Riesgos de Trabajo real debe sustituir la prima media de clase cuando el patrón ya cuenta con prima determinada conforme a su siniestralidad.',
      'El SBC estimado sólo integra aguinaldo, vacaciones, prima vacacional y el importe diario adicional capturado; percepciones variables u otros conceptos integrables del artículo 27 pueden modificarlo.',
      'INFONAVIT se muestra como provisión patronal del 5%; amortizaciones de créditos de trabajadores no forman parte del costo patronal mostrado.',
      'Los días de cotización mensuales son un supuesto de planeación. Para determinación y pago deben utilizarse incidencias, días reales y sistemas oficiales como SUA/SIPARE.',
      'No se calcula ISR, Impuesto Sobre Nóminas estatal, créditos INFONAVIT, incapacidades, ausentismos, variables bimestrales ni otros conceptos particulares.',
    ];
    if (floorApplied) warnings.unshift('Se aplicó el límite inferior del SBC equivalente al salario mínimo de la región seleccionada. Revisa jornadas reducidas o supuestos especiales antes de usar el resultado.');
    if (capApplied) warnings.unshift(`Se aplicó el tope de ${p.SBC_MAX_UMA} UMA al SBC estimado.`);
    if (dailySalary < minimumWage - 0.02) warnings.unshift('El sueldo diario capturado es inferior al salario mínimo de la región. El cálculo aplicó el piso de SBC, pero requiere revisión profesional del caso concreto.');
    if (minimumWageWorker) warnings.unshift('La cuota obrera calculada fue absorbida por el patrón conforme al artículo 36 de la LSS porque el salario diario capturado coincide con el salario mínimo seleccionado.');

    return json(request, {
      ok: true,
      result: {
        employeeName: String(body.employeeName || '').trim(),
        region,
        assumptions: {
          daysCotized: days,
          serviceYear,
          aguinaldoDays,
          vacationDays,
          legalVacationDays,
          vacationPremiumPct,
          otherIntegrableDaily: money(otherIntegrableDaily),
          riskClass: risk.className,
          riskPremiumPct: risk.rate,
          riskSource: risk.source,
          ceavBand: ceav.band,
          ceavEmployerPct: ceav.rate,
          minimumWageWorker,
        },
        salary: {
          monthly: money(monthlySalary),
          daily: money(dailySalary),
          integrationFactor: Number(integrationFactor.toFixed(6)),
          estimatedSbcBeforeLimits: money(estimatedSbc),
          sbcBeforeLimits: money(sbcBeforeLimits),
          sbcDaily: money(sbc),
          sbcMonthlyReference: money(sbc * 30.4),
          sbcSource,
          minimumWage: money(minimumWage),
          maxSbc: money(maxSbc),
          umaDaily: money(uma),
          floorApplied,
          capApplied,
        },
        calculations: {
          employerImssMonthly: money(employerImssMonthly),
          workerQuotaCalculatedMonthly: money(workerCalculatedDaily * days),
          workerQuotaWithheldMonthly: money(workerQuotaMonthly),
          workerQuotaAbsorbedMonthly: money(workerAbsorbedByEmployerDaily * days),
          infonavitMonthly: money(infonavitMonthly),
          employerSocialBurdenMonthly: money(socialMonthly),
          employerCostMonthly: money(employerCostMonthly),
          salaryAnnual: money(salaryAnnual),
          employerImssAnnual: money(employerImssAnnual),
          infonavitAnnual: money(infonavitAnnual),
          employerSocialBurdenAnnual: money(socialAnnual),
          employerCostAnnual: money(employerCostAnnual),
          socialBurdenPctOfSalary: monthlySalary > 0 ? Number(((socialMonthly / monthlySalary) * 100).toFixed(3)) : 0,
        },
        employerBreakdown,
        workerBreakdown,
        legalBasis: [
          { concept: 'Integración y límites del SBC', law: 'Ley del Seguro Social', articles: '27 y 28', source: LSS_URL, note: 'El SBC integra pagos y prestaciones; el cálculo aplica límites y permite capturar un SBC conocido.' },
          { concept: 'Cuota obrera en salario mínimo', law: 'Ley del Seguro Social', articles: '36', source: LSS_URL, note: minimumWageWorker ? 'La cuota obrera fue trasladada al costo del patrón.' : 'No se activó porque el salario diario capturado no coincide con el salario mínimo seleccionado.' },
          { concept: 'Enfermedades y maternidad', law: 'Ley del Seguro Social', articles: '25, 106, 107 y Décimo Noveno transitorio', source: LSS_URL, note: 'Cuota fija, excedente, prestaciones en dinero y gastos médicos de pensionados.' },
          { concept: 'Riesgos de trabajo', law: 'Ley del Seguro Social', articles: '72, 73 y 74', source: LSS_URL, note: 'La prima media de clase es sólo inicial; la prima vigente del patrón depende de siniestralidad.' },
          { concept: 'Invalidez y vida', law: 'Ley del Seguro Social', articles: '147', source: LSS_URL, note: 'Cuotas patronal y obrera sobre el SBC.' },
          { concept: 'Retiro, cesantía y vejez', law: 'Ley del Seguro Social y régimen transitorio de reforma pensionaria', articles: '168 y transitorios DOF 16-12-2020', source: CEAV_SOURCE_URL, note: `Para 2026 se aplicó la tasa patronal gradual ${ceav.rate}% correspondiente al rango ${ceav.band}.` },
          { concept: 'Guarderías y prestaciones sociales', law: 'Ley del Seguro Social', articles: '211 y 212', source: LSS_URL, note: 'Prima del 1% a cargo del patrón.' },
          { concept: 'Aportación de vivienda', law: 'Ley del INFONAVIT', articles: '29, fracción II', source: INFONAVIT_URL, note: 'Aportación patronal del 5% sobre la base aplicable.' },
        ],
        parameterSource: config.source,
        legalVersion: 'LSS vigente · última reforma DOF 15-01-2026 · CEAV gradual 2026 · Ley INFONAVIT vigente DOF 21-02-2025',
        disclaimer: DISCLAIMER,
        warnings,
      },
    });
  } catch (error) {
    return json(request, { ok: false, error: error?.message || 'No fue posible calcular IMSS / costo patronal' }, 400);
  }
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (path === '/laboral/imss-cost') return calculateImss(request, env, ctx);
    return app.fetch(request, env, ctx);
  },
};
