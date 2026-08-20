import app from './index-divisas.js';

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

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

async function authenticated(request, env, ctx) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const probeUrl = new URL(request.url);
  probeUrl.pathname = '/divisas/quotes';
  probeUrl.search = '';
  const probe = new Request(probeUrl.toString(), {
    method: 'GET',
    headers: {
      Authorization: auth,
      Origin: request.headers.get('Origin') || ALLOWED_ORIGIN,
    },
  });
  const response = await app.fetch(probe, env, ctx);
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

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (path === '/divisas/quotes/status') return updateQuoteDelivery(request, env, ctx);
    return app.fetch(request, env, ctx);
  },
};
