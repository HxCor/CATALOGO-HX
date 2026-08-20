(() => {
  'use strict';

  const USERS_KEY = 'hx_users';
  const sensitiveKeys = new Set(['pass', 'password', 'contraseña', 'contrasena', 'password hash']);

  function sanitize(value) {
    if (Array.isArray(value)) return value.map(sanitize);
    if (!value || typeof value !== 'object') return value;

    const clean = {};
    for (const [key, child] of Object.entries(value)) {
      if (sensitiveKeys.has(String(key).trim().toLowerCase())) continue;
      clean[key] = sanitize(child);
    }
    return clean;
  }

  // Elimina credenciales que versiones anteriores pudieran haber dejado en localStorage.
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      localStorage.setItem(USERS_KEY, JSON.stringify(sanitize(parsed)));
    }
  } catch (error) {
    console.warn('No se pudo sanear el almacenamiento local de usuarios.', error);
  }

  // Impide que futuras escrituras de usuarios persistan contraseñas o hashes en el navegador.
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    if (this === window.localStorage && key === USERS_KEY) {
      try {
        value = JSON.stringify(sanitize(JSON.parse(value)));
      } catch (_) {
        // Si el valor no es JSON válido, se conserva el comportamiento normal.
      }
    }
    return originalSetItem.call(this, key, value);
  };

  function requestInfo(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    let headers;
    try {
      headers = new Headers((init && init.headers) || (input && input.headers) || undefined);
    } catch (_) {
      headers = new Headers();
    }
    return { url, method, authorized: Boolean(headers.get('Authorization')) };
  }

  // Evita la consulta /usuarios antes del login. La UI no necesita esa lista para autenticar;
  // el administrador la recarga inmediatamente después de obtener una sesión válida.
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const info = requestInfo(input, init);
    const isUsersRead = info.method === 'GET' && /\/usuarios(?:[/?#]|$)/i.test(info.url);

    if (isUsersRead && !info.authorized) {
      return new Response(JSON.stringify({ ok: true, records: [] }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      });
    }

    const response = await originalFetch(input, init);

    try {
      const isJson = (response.headers.get('content-type') || '').toLowerCase().includes('application/json');
      if (isUsersRead && isJson) {
        const data = await response.clone().json();
        const headers = new Headers(response.headers);
        headers.delete('content-length');
        return new Response(JSON.stringify(sanitize(data)), {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      }
    } catch (error) {
      console.warn('No se pudo sanear la respuesta de usuarios.', error);
    }

    return response;
  };
})();
