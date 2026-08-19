const encoder = new TextEncoder();
const decoder = new TextDecoder();

const SESSION_TTL_SECONDS = 8 * 60 * 60;
const PBKDF2_ITERATIONS = 310000;
const HASH_PREFIX = "pbkdf2-sha256";
const ALLOWED_ORIGINS = new Set([
  "https://hxcor.github.io",
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://hxcor.github.io";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request),
    },
  });
}

function fail(request, status, message) {
  return json(request, { ok: false, error: message }, status);
}

function base64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

function sessionSecret(env) {
  // SESSION_SECRET is preferred. AIRTABLE_TOKEN fallback keeps the existing Worker
  // deployable before a dedicated secret is added in Cloudflare.
  return env.SESSION_SECRET || env.AIRTABLE_TOKEN;
}

async function issueToken(env, user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    user: user.usuario,
    rol: user.rol,
    emp: user.empresasPermitidas || "",
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const encoded = base64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await hmacSha256(sessionSecret(env), encoded);
  return `${encoded}.${base64Url(sig)}`;
}

async function verifyToken(env, token) {
  if (!token || !token.includes(".")) return null;
  const [encoded, signature] = token.split(".", 2);
  try {
    const expected = await hmacSha256(sessionSecret(env), encoded);
    const actual = fromBase64Url(signature);
    if (!timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(decoder.decode(fromBase64Url(encoded)));
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= now || !payload.user || !payload.rol) return null;
    return payload;
  } catch {
    return null;
  }
}

async function requireSession(request, env, adminOnly = false) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const session = await verifyToken(env, token);
  if (!session) return { response: fail(request, 401, "No autorizado") };
  if (adminOnly && session.rol !== "admin") {
    return { response: fail(request, 403, "Acceso restringido") };
  }
  return { session };
}

function envTable(env, key, fallback) {
  return env[key] || fallback;
}

function airtableUrl(env, table, recordId = "") {
  const base = env.AIRTABLE_BASE_ID;
  const encodedTable = encodeURIComponent(table);
  return `https://api.airtable.com/v0/${base}/${encodedTable}${recordId ? `/${recordId}` : ""}`;
}

async function airtableRequest(env, table, { method = "GET", recordId = "", body, query = "" } = {}) {
  const url = airtableUrl(env, table, recordId) + query;
  const response = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${env.AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) {
    const detail = data?.error?.message || data?.error?.type || `Airtable ${response.status}`;
    throw new Error(detail);
  }
  return data;
}

async function listAllRecords(env, table) {
  const records = [];
  let offset = "";
  do {
    const query = offset ? `?pageSize=100&offset=${encodeURIComponent(offset)}` : "?pageSize=100";
    const data = await airtableRequest(env, table, { query });
    records.push(...(data.records || []));
    offset = data.offset || "";
  } while (offset);
  return records;
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function parseAllowedRfcs(value) {
  return [...new Set(
    String(value || "")
      .split(/[\s,;]+/)
      .map(v => v.trim().toUpperCase())
      .filter(Boolean)
  )];
}

function publicUser(record) {
  const f = record.fields || {};
  return {
    id: record.id,
    fields: {
      "Nombre completo": f["Nombre completo"] || "",
      "Usuario": f["Usuario"] || f["Usuario (login)"] || "",
      "Usuario (login)": f["Usuario (login)"] || f["Usuario"] || "",
      "Empresas permitidas": f["Empresas permitidas"] || "",
      "Rol": f["Rol"] || "viewer",
      "Status": f["Status"] || undefined,
    },
  };
}

async function derivePbkdf2(password, salt, iterations = PBKDF2_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `${HASH_PREFIX}$${PBKDF2_ITERATIONS}$${base64Url(salt)}$${base64Url(hash)}`;
}

async function verifyPassword(password, stored) {
  try {
    const [prefix, iterationsRaw, saltRaw, hashRaw] = String(stored || "").split("$");
    if (prefix !== HASH_PREFIX) return false;
    const iterations = Number(iterationsRaw);
    if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) return false;
    const salt = fromBase64Url(saltRaw);
    const expected = fromBase64Url(hashRaw);
    const actual = await derivePbkdf2(password, salt, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function safePlaintextCompare(a, b) {
  const aa = encoder.encode(String(a || ""));
  const bb = encoder.encode(String(b || ""));
  return timingSafeEqual(aa, bb);
}

async function handleLogin(request, env) {
  let body;
  try { body = await request.json(); } catch { return fail(request, 400, "Solicitud inválida"); }
  const usuario = normalizeUsername(body?.usuario);
  const password = String(body?.password || "");
  if (!usuario || !password) return fail(request, 400, "Usuario y contraseña requeridos");

  const table = envTable(env, "AIRTABLE_TABLE_USUARIOS", "USUARIOS");
  const records = await listAllRecords(env, table);
  const record = records.find(r => {
    const f = r.fields || {};
    return normalizeUsername(f["Usuario"] || f["Usuario (login)"]) === usuario;
  });
  if (!record) return fail(request, 401, "Credenciales inválidas");

  const f = record.fields || {};
  const storedHash = String(f["Password Hash"] || "");
  const legacyPassword = String(f["Contraseña"] || "");

  let valid = false;
  if (storedHash) {
    valid = await verifyPassword(password, storedHash);
  } else if (legacyPassword) {
    valid = safePlaintextCompare(password, legacyPassword);
    if (valid) {
      const migratedHash = await hashPassword(password);
      await airtableRequest(env, table, {
        method: "PATCH",
        recordId: record.id,
        body: { fields: { "Password Hash": migratedHash, "Contraseña": null } },
      });
    }
  }

  if (!valid) return fail(request, 401, "Credenciales inválidas");

  const loginUser = {
    id: record.id,
    usuario: f["Usuario"] || f["Usuario (login)"] || "",
    nombre: f["Nombre completo"] || "",
    rol: f["Rol"] || "viewer",
    empresasPermitidas: f["Empresas permitidas"] || "",
  };
  const token = await issueToken(env, loginUser);
  return json(request, { ok: true, token, usuario: loginUser });
}

async function prepareUserFieldsForWrite(fields, isCreate) {
  const clean = { ...(fields || {}) };
  delete clean["Password Hash"];
  const password = String(clean["Contraseña"] || "");
  if (password) {
    clean["Password Hash"] = await hashPassword(password);
    clean["Contraseña"] = null;
  } else {
    delete clean["Contraseña"];
    if (isCreate) throw new Error("La contraseña es obligatoria para un usuario nuevo");
  }
  return clean;
}

async function handleUsers(request, env) {
  const auth = await requireSession(request, env, true);
  if (auth.response) return auth.response;
  const table = envTable(env, "AIRTABLE_TABLE_USUARIOS", "USUARIOS");

  if (request.method === "GET") {
    const records = await listAllRecords(env, table);
    return json(request, { ok: true, records: records.map(publicUser) });
  }

  let body = {};
  try { body = await request.json(); } catch { return fail(request, 400, "Solicitud inválida"); }

  if (request.method === "POST") {
    let fields;
    try { fields = await prepareUserFieldsForWrite(body.fields, true); }
    catch (e) { return fail(request, 400, e.message); }
    const created = await airtableRequest(env, table, { method: "POST", body: { fields } });
    return json(request, { ok: true, data: publicUser(created), record: publicUser(created) }, 201);
  }

  if (request.method === "PUT" || request.method === "PATCH") {
    if (!body.recordId) return fail(request, 400, "recordId requerido");
    let fields;
    try { fields = await prepareUserFieldsForWrite(body.fields, false); }
    catch (e) { return fail(request, 400, e.message); }
    const updated = await airtableRequest(env, table, {
      method: "PATCH",
      recordId: body.recordId,
      body: { fields },
    });
    return json(request, { ok: true, data: publicUser(updated), record: publicUser(updated) });
  }

  if (request.method === "DELETE") {
    if (!body.recordId) return fail(request, 400, "recordId requerido");
    const existing = await airtableRequest(env, table, { recordId: body.recordId });
    const username = normalizeUsername(existing?.fields?.["Usuario"] || existing?.fields?.["Usuario (login)"]);
    if (username === "admin") return fail(request, 403, "El administrador principal no se puede eliminar");
    const deleted = await airtableRequest(env, table, { method: "DELETE", recordId: body.recordId });
    return json(request, { ok: true, data: deleted });
  }

  return fail(request, 405, "Método no permitido");
}

async function filterProvidersForSession(env, records, session) {
  if (session.rol === "admin") return records;
  const allowed = new Set(parseAllowedRfcs(session.emp));
  if (!allowed.size) return [];
  return records.filter(r => allowed.has(String(r.fields?.RFC || "").trim().toUpperCase()));
}

async function allowedProviderIds(env, session) {
  if (session.rol === "admin") return null;
  const table = envTable(env, "AIRTABLE_TABLE_PROVEEDORES", "Proveedores");
  const providers = await filterProvidersForSession(env, await listAllRecords(env, table), session);
  return new Set(providers.map(r => r.id));
}

async function handleGenericCrud(request, env, type) {
  const writeMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  const auth = await requireSession(request, env, writeMethod);
  if (auth.response) return auth.response;
  const session = auth.session;

  const tableKey = type === "proveedores" ? "AIRTABLE_TABLE_PROVEEDORES" : "AIRTABLE_TABLE_BANCOS";
  const fallback = type === "proveedores" ? "Proveedores" : "BANCOS";
  const table = envTable(env, tableKey, fallback);

  if (request.method === "GET") {
    let records = await listAllRecords(env, table);
    if (type === "proveedores") {
      records = await filterProvidersForSession(env, records, session);
    } else if (session.rol !== "admin") {
      const allowedIds = await allowedProviderIds(env, session);
      records = records.filter(r => {
        const links = Array.isArray(r.fields?.Proveedor) ? r.fields.Proveedor : [];
        return links.some(id => allowedIds.has(id));
      });
    }
    return json(request, { ok: true, records });
  }

  let body = {};
  try { body = await request.json(); } catch { return fail(request, 400, "Solicitud inválida"); }

  if (request.method === "POST") {
    const created = await airtableRequest(env, table, { method: "POST", body: { fields: body.fields || {} } });
    return json(request, { ok: true, data: created, record: created }, 201);
  }

  if (request.method === "PUT" || request.method === "PATCH") {
    if (!body.recordId) return fail(request, 400, "recordId requerido");
    const updated = await airtableRequest(env, table, {
      method: "PATCH",
      recordId: body.recordId,
      body: { fields: body.fields || {} },
    });
    return json(request, { ok: true, data: updated, record: updated });
  }

  if (request.method === "DELETE") {
    if (!body.recordId) return fail(request, 400, "recordId requerido");
    const deleted = await airtableRequest(env, table, { method: "DELETE", recordId: body.recordId });
    return json(request, { ok: true, data: deleted });
  }

  return fail(request, 405, "Método no permitido");
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }

      if (!env.AIRTABLE_TOKEN || !env.AIRTABLE_BASE_ID) {
        return fail(request, 500, "Backend no configurado");
      }

      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (path === "/") {
        return json(request, { ok: true, service: "CATALOGO-HX backend", security: "pbkdf2-sha256" });
      }
      if (path === "/login" && request.method === "POST") return await handleLogin(request, env);
      if (path === "/usuarios") return await handleUsers(request, env);
      if (path === "/proveedores") return await handleGenericCrud(request, env, "proveedores");
      if (path === "/bancos") return await handleGenericCrud(request, env, "bancos");

      return fail(request, 404, "Ruta no encontrada");
    } catch (error) {
      console.error("Worker error:", error);
      return fail(request, 500, "Error interno del backend");
    }
  },
};
