import app from './index-docs.js';

const ALLOWED_ORIGIN = 'https://hxcor.github.io';
const DOCUMENT_TABLE = 'EXPEDIENTES_DOCUMENTOS';
const PROVIDER_TABLE = 'Proveedores';
const BANK_TABLE = 'BANCOS';
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const QA_TEST_TYPE = 'QA_TEST_DOCUMENT';
const REQUIRED_TYPES = new Set([
  'ACTA_CONSTITUTIVA',
  'INE_REPRESENTANTE',
  'COMPROBANTE_DOMICILIO',
  'OPINION_CUMPLIMIENTO',
  'CARATULA_BANCARIA',
]);
const SENSITIVE_TYPES = new Set(['INE_REPRESENTANTE', 'CARATULA_BANCARIA']);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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
      'X-Content-Type-Options': 'nosniff',
      ...cors(request),
    },
  });
}

function fail(request, status, error) {
  return json(request, { ok: false, error }, status);
}

function fromBase64Url(value) {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifySession(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !token.includes('.')) return null;
  const [payloadPart, signaturePart] = token.split('.', 2);
  try {
    const actual = fromBase64Url(signaturePart);
    const secrets = [...new Set([env.SESSION_SECRET, env.AIRTABLE_TOKEN].filter(Boolean).map(String))];
    let valid = false;
    for (const secret of secrets) {
      const expected = await hmacSha256(secret, payloadPart);
      if (timingSafeEqual(expected, actual)) {
        valid = true;
        break;
      }
    }
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(fromBase64Url(payloadPart)));
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= now || !payload.user || !payload.rol) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseAllowedRfcs(value) {
  return new Set(String(value || '')
    .split(/[\s,;]+/)
    .map(item => item.trim().toUpperCase())
    .filter(Boolean));
}

function canAccessProvider(session, providerRfc) {
  if (session.rol === 'admin') return true;
  return parseAllowedRfcs(session.emp).has(String(providerRfc || '').trim().toUpperCase());
}

function airtableUrl(env, table, recordId = '') {
  return `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}${recordId ? `/${recordId}` : ''}`;
}

async function airtableRequest(env, table, { method = 'GET', recordId = '', body, query = '' } = {}) {
  const response = await fetch(airtableUrl(env, table, recordId) + query, {
    method,
    headers: {
      'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.error || `Airtable ${response.status}`);
  return data;
}

async function listAllRecords(env, table) {
  const records = [];
  let offset = '';
  do {
    const query = new URLSearchParams({ pageSize: '100' });
    if (offset) query.set('offset', offset);
    const data = await airtableRequest(env, table, { query: `?${query}` });
    records.push(...(Array.isArray(data.records) ? data.records : []));
    offset = data.offset || '';
  } while (offset);
  return records;
}

async function getProvider(env, providerId) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(providerId)) return null;
  try {
    return await airtableRequest(env, env.AIRTABLE_TABLE_PROVEEDORES || PROVIDER_TABLE, { recordId: providerId });
  } catch {
    return null;
  }
}

async function getBank(env, bankId) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(bankId)) return null;
  try {
    return await airtableRequest(env, env.AIRTABLE_TABLE_BANCOS || BANK_TABLE, { recordId: bankId });
  } catch {
    return null;
  }
}

function safeFilename(value) {
  const clean = String(value || 'documento')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .trim()
    .slice(0, 100);
  return clean || 'documento';
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function documentStatus(fields) {
  if (fields['Estado Documento'] !== 'Activo') return 'historial';
  const expires = String(fields['Fecha Vencimiento'] || '');
  if (!expires) return 'cargado';
  const expiry = new Date(`${expires}T23:59:59Z`).getTime();
  if (!Number.isFinite(expiry)) return 'cargado';
  const remaining = expiry - Date.now();
  if (remaining < 0) return 'vencido';
  if (remaining <= 30 * 86400000) return 'por_vencer';
  return 'cargado';
}

function publicDocument(record, session) {
  const fields = record.fields || {};
  const type = String(fields['Tipo Documento'] || '');
  const sensitive = Boolean(fields.Sensible) || SENSITIVE_TYPES.has(type);
  return {
    id: record.id,
    tipo: type,
    nombreArchivo: String(fields['Nombre Archivo'] || ''),
    tipoMime: String(fields['Tipo MIME'] || ''),
    tamanoBytes: Number(fields['Tamaño Bytes'] || 0),
    fechaCarga: String(fields['Fecha Carga'] || record.createdTime || ''),
    fechaVencimiento: String(fields['Fecha Vencimiento'] || ''),
    estado: documentStatus(fields),
    estadoVersion: String(fields['Estado Documento'] || ''),
    usuario: String(fields.Usuario || ''),
    bancoIds: Array.isArray(fields['Cuenta Bancaria']) ? fields['Cuenta Bancaria'] : [],
    version: Number(fields['Versión'] || 1),
    sensible: sensitive,
    puedeVer: session.rol === 'admin' || !sensitive,
  };
}

function isSameSlot(fields, type, bankId) {
  if (String(fields['Tipo Documento'] || '') !== type) return false;
  const bankIds = Array.isArray(fields['Cuenta Bancaria']) ? fields['Cuenta Bancaria'] : [];
  if (type === 'CARATULA_BANCARIA') return bankIds.includes(bankId);
  return true;
}

async function listDocuments(request, env, session, url) {
  const providerId = String(url.searchParams.get('proveedorId') || '').trim();
  const provider = await getProvider(env, providerId);
  if (!provider) return fail(request, 404, 'Empresa no encontrada');
  const providerRfc = String(provider.fields?.RFC || '').trim().toUpperCase();
  if (!canAccessProvider(session, providerRfc)) return fail(request, 403, 'Sin acceso a esta empresa');

  const table = env.AIRTABLE_TABLE_EXPEDIENTES || DOCUMENT_TABLE;
  const records = (await listAllRecords(env, table))
    .filter(record => {
      const fields = record.fields || {};
      const links = Array.isArray(fields.Proveedor) ? fields.Proveedor : [];
      return links.includes(providerId) || String(fields['Proveedor RFC'] || '').trim().toUpperCase() === providerRfc;
    })
    .map(record => publicDocument(record, session))
    .filter(doc => session.rol === 'admin' || !doc.sensible)
    .sort((a, b) => String(b.fechaCarga).localeCompare(String(a.fechaCarga)));

  return json(request, {
    ok: true,
    provider: { id: providerId, rfc: providerRfc },
    requiredTypes: [...REQUIRED_TYPES],
    records,
  });
}

async function uploadAttachment(env, recordId, file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const attachmentField = env.AIRTABLE_FIELD_EXPEDIENTE_ARCHIVO || 'fldOAQeVTqu44u1Bd';
  const endpoint = `https://content.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${recordId}/${attachmentField}/uploadAttachment`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contentType: file.type,
      file: bytesToBase64(bytes),
      filename: safeFilename(file.name),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.error || `Carga Airtable ${response.status}`);
  return { data, bytes };
}

async function uploadDocument(request, env, session) {
  if (session.rol !== 'admin') return fail(request, 403, 'Solo administradores pueden cargar o reemplazar documentos');
  let form;
  try {
    form = await request.formData();
  } catch {
    return fail(request, 400, 'Formulario inválido');
  }

  const providerId = String(form.get('proveedorId') || '').trim();
  const type = String(form.get('tipo') || '').trim().toUpperCase();
  const bankId = String(form.get('bancoId') || '').trim();
  const expires = String(form.get('fechaVencimiento') || '').trim();
  const file = form.get('file');

  const isQaUpload = type === QA_TEST_TYPE && String(session.user || '').toLowerCase() === 'qa-hx-test';
  if (!REQUIRED_TYPES.has(type) && !isQaUpload) return fail(request, 400, 'Tipo de documento inválido');
  if (!(file instanceof File)) return fail(request, 400, 'Archivo requerido');
  if (!ALLOWED_TYPES.has(file.type)) return fail(request, 415, 'Solo se permiten PDF, JPG y PNG');
  if (!file.size || file.size > MAX_FILE_BYTES) return fail(request, 413, 'El archivo debe pesar máximo 8 MB');
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return fail(request, 400, 'Fecha de vencimiento inválida');

  const provider = await getProvider(env, providerId);
  if (!provider) return fail(request, 404, 'Empresa no encontrada');
  const providerRfc = String(provider.fields?.RFC || '').trim().toUpperCase();

  if (type === 'CARATULA_BANCARIA') {
    const bank = await getBank(env, bankId);
    const providerLinks = Array.isArray(bank?.fields?.Proveedor) ? bank.fields.Proveedor : [];
    if (!bank || !providerLinks.includes(providerId)) {
      return fail(request, 400, 'Selecciona una cuenta bancaria válida de esta empresa');
    }
  }

  const table = env.AIRTABLE_TABLE_EXPEDIENTES || DOCUMENT_TABLE;
  const records = (await listAllRecords(env, table)).filter(record => {
    const fields = record.fields || {};
    const links = Array.isArray(fields.Proveedor) ? fields.Proveedor : [];
    return links.includes(providerId) && isSameSlot(fields, type, bankId);
  });
  const version = Math.max(0, ...records.map(record => Number(record.fields?.['Versión'] || 0))) + 1;
  const now = new Date().toISOString();
  const title = `${providerRfc || providerId}-${type}-v${version}`;
  const digest = await crypto.subtle.digest('SHA-256', await file.slice(0, file.size).arrayBuffer());
  const checksum = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  const fields = {
    'Documento': title,
    'Proveedor': [providerId],
    'Proveedor RFC': providerRfc,
    'Tipo Documento': type,
    'Nombre Archivo': safeFilename(file.name),
    'Tipo MIME': file.type,
    'Tamaño Bytes': file.size,
    'Fecha Carga': now,
    'Estado Documento': 'Activo',
    'Usuario': String(session.user || ''),
    'Sensible': SENSITIVE_TYPES.has(type),
    'Versión': version,
    'SHA-256': checksum,
  };
  if (expires) fields['Fecha Vencimiento'] = expires;
  if (type === 'CARATULA_BANCARIA') fields['Cuenta Bancaria'] = [bankId];

  let created;
  try {
    created = await airtableRequest(env, table, { method: 'POST', body: { fields } });
    await uploadAttachment(env, created.id, file);
  } catch (error) {
    if (created?.id) {
      try { await airtableRequest(env, table, { method: 'DELETE', recordId: created.id }); } catch {}
    }
    throw error;
  }

  for (const previous of records.filter(record => record.fields?.['Estado Documento'] === 'Activo')) {
    await airtableRequest(env, table, {
      method: 'PATCH',
      recordId: previous.id,
      body: { fields: { 'Estado Documento': 'Reemplazado' } },
    });
  }

  const saved = await airtableRequest(env, table, { recordId: created.id });
  return json(request, { ok: true, record: publicDocument(saved, session) }, 201);
}

async function getDocumentRecord(request, env, session, recordId) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) return { response: fail(request, 400, 'Documento inválido') };
  let record;
  try {
    record = await airtableRequest(env, env.AIRTABLE_TABLE_EXPEDIENTES || DOCUMENT_TABLE, { recordId });
  } catch {
    return { response: fail(request, 404, 'Documento no encontrado') };
  }
  const fields = record.fields || {};
  const providerRfc = String(fields['Proveedor RFC'] || '').trim().toUpperCase();
  if (!canAccessProvider(session, providerRfc)) return { response: fail(request, 403, 'Sin acceso a este documento') };
  const type = String(fields['Tipo Documento'] || '');
  if ((Boolean(fields.Sensible) || SENSITIVE_TYPES.has(type)) && session.rol !== 'admin') {
    return { response: fail(request, 403, 'Documento sensible restringido') };
  }
  return { record };
}

async function serveDocument(request, env, session, recordId, url) {
  const lookup = await getDocumentRecord(request, env, session, recordId);
  if (lookup.response) return lookup.response;
  const fields = lookup.record.fields || {};
  const attachments = Array.isArray(fields.Archivo) ? fields.Archivo : [];
  const attachment = attachments[0];
  if (!attachment?.url) return fail(request, 404, 'El archivo no está disponible');
  const upstream = await fetch(attachment.url, { redirect: 'follow' });
  if (!upstream.ok || !upstream.body) return fail(request, 502, 'No se pudo recuperar el archivo');
  const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
  const filename = safeFilename(fields['Nombre Archivo'] || attachment.filename || 'documento');
  const type = ALLOWED_TYPES.has(fields['Tipo MIME']) ? fields['Tipo MIME'] : 'application/octet-stream';
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...cors(request),
      'Content-Type': type,
      'Content-Disposition': `${disposition}; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (!path.startsWith('/expedientes')) return app.fetch(request, env, ctx);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
    if (!env.AIRTABLE_TOKEN || !env.AIRTABLE_BASE_ID) return fail(request, 500, 'Backend no configurado');
    const session = await verifySession(request, env);
    if (!session) return fail(request, 401, 'No autorizado');

    try {
      if (path === '/expedientes' && request.method === 'GET') return listDocuments(request, env, session, url);
      if (path === '/expedientes/upload' && request.method === 'POST') return uploadDocument(request, env, session);
      const match = path.match(/^\/expedientes\/(rec[A-Za-z0-9]{14})\/file$/);
      if (match && request.method === 'GET') return serveDocument(request, env, session, match[1], url);
      return fail(request, 404, 'Ruta de expediente no encontrada');
    } catch (error) {
      console.error('EXPEDIENTE DIGITAL:', error?.stack || error?.message || error);
      return fail(request, 500, 'No se pudo completar la operación del expediente');
    }
  },
};
