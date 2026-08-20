import baseWorker from './index-fast.js';

const SOURCE_URL = 'https://www.eldolar.info/es-MX/mexico/dia/hoy';
const SOURCE_BASE = 'https://www.eldolar.info/es-MX/mexico/dia/';
const CACHE_SECONDS = 420;
const ALLOWED_ORIGIN = 'https://hxcor.github.io';

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

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function numberAfter(text, pattern) {
  const m = text.match(pattern);
  return m ? Number(m[1]) : null;
}

function parseEntities(text) {
  const names = [
    'Afirme', 'Banco Azteca', 'Banco de México, FIX',
    'Banco de México, Interbancario 48 hrs apertura',
    'Banco de México, Interbancario 48 hrs máximo',
    'Banco de México, Interbancario 48 hrs mínimo',
    'Bank of America', 'Banorte', 'DOF, Diario Oficial de la Federación',
    'Grupo Financiero Multiva', 'Para pagos de obligaciones',
    'SAT, Servicio de Administración Tributaria', 'Ve por mas'
  ];
  const rows = [];
  for (const name of names) {
    const idx = text.toLowerCase().indexOf(name.toLowerCase());
    if (idx < 0) continue;
    const segment = text.slice(idx + name.length, idx + name.length + 180);
    const nums = [...segment.matchAll(/\b(1[0-9](?:\.\d{1,4})?)\b/g)].map(m => Number(m[1]));
    if (!nums.length) continue;
    rows.push({
      entidad: name,
      compra: nums.length >= 2 ? nums[0] : null,
      venta: nums.length >= 2 ? nums[1] : null,
      referencia: nums.length === 1 ? nums[0] : null,
    });
  }
  return rows;
}

function parseSource(html, sourceUrl = SOURCE_URL) {
  const text = stripHtml(html);
  const average = numberAfter(text, /1\s*D[oó]lar\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*Pesos/i);
  const compra = numberAfter(text, /Compra\s*([0-9]+(?:\.[0-9]+)?)/i);
  const venta = numberAfter(text, /Venta\s*([0-9]+(?:\.[0-9]+)?)/i);
  const variationMatch = text.match(/Pesos\s*(?:⇩|⇧|⇨|↓|↑|→)?\s*([+-]?[0-9]+(?:\.[0-9]+)?)\s*([+-]?[0-9]+(?:\.[0-9]+)?)%/i);
  if (![average, compra, venta].every(Number.isFinite)) throw new Error('No fue posible interpretar el tipo de cambio de la fuente');
  return {
    source: 'eldolar.info',
    sourceUrl,
    base: 'USD',
    quote: 'MXN',
    average,
    buy: compra,
    sell: venta,
    change: variationMatch ? Number(variationMatch[1]) : null,
    changePct: variationMatch ? Number(variationMatch[2]) : null,
    entities: parseEntities(text),
    fetchedAt: new Date().toISOString(),
    refreshSeconds: CACHE_SECONDS,
    referenceOnly: true,
  };
}

async function airtable(env, table, { method = 'GET', recordId = '', body, query = '' } = {}) {
  const baseId = env.AIRTABLE_BASE_ID;
  const token = env.AIRTABLE_TOKEN;
  if (!baseId || !token) throw new Error('Airtable no configurado');
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${recordId ? `/${recordId}` : ''}${query}`;
  const response = await fetch(url, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) throw new Error(data?.error?.message || data?.error?.type || `Airtable ${response.status}`);
  return data;
}

async function listTable(env, table, { size = 50, sortField = '', direction = 'desc' } = {}) {
  let query = `?pageSize=${Math.min(100, Math.max(1, size))}`;
  if (sortField) query += `&sort%5B0%5D%5Bfield%5D=${encodeURIComponent(sortField)}&sort%5B0%5D%5Bdirection%5D=${direction}`;
  return (await airtable(env, table, { query })).records || [];
}

async function authProbe(request, env, ctx) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const url = new URL(request.url);
  url.pathname = '/proveedores';
  url.search = '';
  const probe = new Request(url.toString(), {
    method: 'GET',
    headers: { 'Authorization': auth, 'Origin': request.headers.get('Origin') || ALLOWED_ORIGIN },
  });
  const response = await baseWorker.fetch(probe, env, ctx);
  if (!response.ok) return null;
  try {
    const token = auth.slice(7).trim();
    const payload = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), c => c.charCodeAt(0))));
  } catch {
    return { user: 'usuario' };
  }
}

async function lastKnown(env) {
  try {
    const table = env.AIRTABLE_TABLE_DIVISAS_LOG || 'DIVISAS_LOG';
    const records = await listTable(env, table, { size: 1, sortField: 'FechaHora' });
    const f = records[0]?.fields || {};
    if (!records.length) return null;
    return {
      source: f.Fuente || 'eldolar.info', sourceUrl: SOURCE_URL, base: 'USD', quote: 'MXN',
      average: Number(f.Promedio), buy: Number(f.Compra), sell: Number(f.Venta),
      change: f.Variacion == null ? null : Number(f.Variacion), changePct: null,
      entities: (() => { try { return JSON.parse(f.EntidadesJSON || '[]'); } catch { return []; } })(),
      fetchedAt: f.FechaHora || null, refreshSeconds: CACHE_SECONDS, referenceOnly: true,
      stale: true, sourceStatus: 'last-known',
    };
  } catch { return null; }
}

async function logRate(env, data) {
  try {
    const table = env.AIRTABLE_TABLE_DIVISAS_LOG || 'DIVISAS_LOG';
    await airtable(env, table, {
      method: 'POST',
      body: { fields: {
        FechaHora: data.fetchedAt,
        Fuente: 'eldolar.info',
        Promedio: data.average,
        Compra: data.buy,
        Venta: data.sell,
        Variacion: data.change ?? 0,
        EntidadesJSON: JSON.stringify(data.entities || []),
        EstadoFuente: 'OK',
      } },
    });
  } catch (error) { console.error('DIVISAS_LOG:', error?.message || error); }
}

async function currentRate(request, env, ctx, force = false) {
  const cache = caches.default;
  const key = new Request('https://catalogo-hx.internal/divisas/current');
  if (!force) {
    const hit = await cache.match(key);
    if (hit) {
      const data = await hit.json();
      data.cached = true;
      return data;
    }
  }
  try {
    const response = await fetch(SOURCE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CatalogoHX/1.0; +https://hxcor.github.io/CATALOGO-HX/)' },
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });
    if (!response.ok) throw new Error(`Fuente HTTP ${response.status}`);
    const data = parseSource(await response.text());
    data.cached = false;
    const cached = new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public,max-age=${CACHE_SECONDS}` } });
    ctx.waitUntil(cache.put(key, cached));
    ctx.waitUntil(logRate(env, data));
    return data;
  } catch (error) {
    const fallback = await lastKnown(env);
    if (fallback) return fallback;
    throw error;
  }
}

function ymd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function history(days) {
  const span = [7, 30, 90].includes(days) ? days : 7;
  const maxPoints = span === 7 ? 7 : span === 30 ? 15 : 23;
  const step = Math.max(1, Math.ceil(span / maxPoints));
  const dates = [];
  const now = new Date();
  for (let offset = span - 1; offset >= 0; offset -= step) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
    dates.push(date);
  }
  if (dates[dates.length - 1]?.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10)) dates.push(now);
  const points = await Promise.all(dates.map(async date => {
    const url = `${SOURCE_BASE}${ymd(date)}`;
    try {
      const r = await fetch(url, { cf: { cacheTtl: 21600, cacheEverything: true } });
      if (!r.ok) return null;
      const parsed = parseSource(await r.text(), url);
      return { date: date.toISOString().slice(0, 10), average: parsed.average, buy: parsed.buy, sell: parsed.sell };
    } catch { return null; }
  }));
  return points.filter(Boolean);
}

function tableNames(env) {
  return {
    quotes: env.AIRTABLE_TABLE_DIVISAS_COTIZACIONES || 'DIVISAS_COTIZACIONES',
    alerts: env.AIRTABLE_TABLE_DIVISAS_ALERTAS || 'DIVISAS_ALERTAS',
  };
}

async function handleQuotes(request, env, ctx, session) {
  const table = tableNames(env).quotes;
  if (request.method === 'GET') {
    const records = await listTable(env, table, { size: 50, sortField: 'FechaHora' });
    return json(request, { ok: true, records });
  }
  if (request.method !== 'POST') return json(request, { ok: false, error: 'Método no permitido' }, 405);
  let body;
  try { body = await request.json(); } catch { return json(request, { ok: false, error: 'Solicitud inválida' }, 400); }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return json(request, { ok: false, error: 'Monto inválido' }, 400);
  const rateData = await currentRate(request, env, ctx, false);
  const type = ['buy', 'sell', 'average'].includes(body.rateType) ? body.rateType : 'sell';
  const rate = type === 'buy' ? rateData.buy : type === 'average' ? rateData.average : rateData.sell;
  const origin = String(body.origin || 'USD').toUpperCase();
  const destination = String(body.destination || 'MXN').toUpperCase();
  let result;
  if (origin === 'USD' && destination === 'MXN') result = amount * rate;
  else if (origin === 'MXN' && destination === 'USD') result = amount / rate;
  else return json(request, { ok: false, error: 'Conversión no soportada' }, 400);
  const adjustmentPct = Number(body.adjustmentPct || 0);
  if (Number.isFinite(adjustmentPct) && adjustmentPct !== 0) result *= (1 + adjustmentPct / 100);
  const now = new Date().toISOString();
  const folio = `HX-${Date.now().toString().slice(-8)}`;
  const fields = {
    Folio: folio,
    Proveedor: String(body.provider || 'HX'),
    RFC: String(body.rfc || ''),
    ClienteProyecto: String(body.clientProject || ''),
    MonedaOrigen: origin,
    MonedaDestino: destination,
    ImporteOriginal: amount,
    TipoCambioUsado: rate,
    TipoAplicado: type === 'buy' ? 'Compra' : type === 'average' ? 'Promedio' : 'Venta',
    ResultadoConvertido: Number(result.toFixed(2)),
    Fuente: 'eldolar.info',
    FechaHora: now,
    Estado: 'Borrador',
    Usuario: String(session?.user || ''),
    ComisionAjuste: Number.isFinite(adjustmentPct) ? adjustmentPct : 0,
  };
  const record = await airtable(env, table, { method: 'POST', body: { fields } });
  return json(request, { ok: true, record, rate: rateData }, 201);
}

async function handleAlerts(request, env, session) {
  const table = tableNames(env).alerts;
  if (request.method === 'GET') {
    const records = await listTable(env, table, { size: 50 });
    return json(request, { ok: true, records });
  }
  if (request.method === 'DELETE') {
    let body = {};
    try { body = await request.json(); } catch {}
    if (!body.recordId) return json(request, { ok: false, error: 'recordId requerido' }, 400);
    const deleted = await airtable(env, table, { method: 'DELETE', recordId: body.recordId });
    return json(request, { ok: true, deleted });
  }
  if (request.method !== 'POST') return json(request, { ok: false, error: 'Método no permitido' }, 405);
  let body;
  try { body = await request.json(); } catch { return json(request, { ok: false, error: 'Solicitud inválida' }, 400); }
  const value = Number(body.value);
  if (!Number.isFinite(value)) return json(request, { ok: false, error: 'Valor inválido' }, 400);
  const condition = ['gt', 'lt', 'pct'].includes(body.condition) ? body.condition : 'gt';
  const fields = {
    Regla: String(body.rule || `USD/MXN ${condition} ${value}`),
    Condicion: condition,
    Valor: value,
    Estado: 'Activa',
    MedioNotificacion: String(body.channel || 'Panel'),
    Usuario: String(session?.user || ''),
  };
  const record = await airtable(env, table, { method: 'POST', body: { fields } });
  return json(request, { ok: true, record }, 201);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (!path.startsWith('/divisas')) return baseWorker.fetch(request, env, ctx);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });

    const session = await authProbe(request, env, ctx);
    if (!session) return json(request, { ok: false, error: 'No autorizado' }, 401);

    try {
      if (path === '/divisas/current' && request.method === 'GET') {
        const force = url.searchParams.get('refresh') === '1';
        return json(request, { ok: true, data: await currentRate(request, env, ctx, force) });
      }
      if (path === '/divisas/history' && request.method === 'GET') {
        const days = Number(url.searchParams.get('days') || 7);
        return json(request, { ok: true, days, points: await history(days) });
      }
      if (path === '/divisas/quotes') return await handleQuotes(request, env, ctx, session);
      if (path === '/divisas/alerts') return await handleAlerts(request, env, session);
      return json(request, { ok: false, error: 'Ruta de divisas no encontrada' }, 404);
    } catch (error) {
      console.error('DIVISAS HX PRO:', error?.stack || error?.message || error);
      return json(request, { ok: false, error: error?.message || 'Error interno de Divisas HX Pro' }, 500);
    }
  },
};
