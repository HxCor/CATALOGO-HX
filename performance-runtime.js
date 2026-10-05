/* CATALOGO-HX · rendimiento compartido para todos los roles */
(() => {
  'use strict';

  const STORAGE_KEYS = Object.freeze({
    cats: 'hx_categorias',
    providers: 'hx_proveedores',
    users: 'hx_users',
    logos: 'hx_logos'
  });

  const cache = {
    cats: undefined,
    providers: undefined,
    users: undefined,
    logos: undefined
  };

  function installCachedAccessor(slot, getterName, saverName, options = {}) {
    const originalGetter = window[getterName];
    const originalSaver = window[saverName];
    if (typeof originalGetter !== 'function' || typeof originalSaver !== 'function') return;

    window[getterName] = function() {
      if (cache[slot] === undefined) cache[slot] = originalGetter();
      return cache[slot];
    };

    window[saverName] = function(value) {
      const result = originalSaver(value);
      // Usuarios se vuelven a leer para conservar la sanitización aplicada por
      // security-post.js. Los demás datos pueden reutilizar el arreglo actual.
      cache[slot] = options.readAfterSave ? originalGetter() : value;
      return result;
    };
  }

  installCachedAccessor('cats', 'getCats', 'saveCats', { readAfterSave: true });
  installCachedAccessor('providers', 'getProveedores', 'saveProveedores');
  installCachedAccessor('users', 'getUsers', 'saveUsers', { readAfterSave: true });
  installCachedAccessor('logos', 'getLogosExtra', 'saveLogosExtra');

  window.addEventListener('storage', event => {
    const slot = Object.keys(STORAGE_KEYS).find(name => STORAGE_KEYS[name] === event.key);
    if (slot) cache[slot] = undefined;
  }, { passive: true });

  // Agrupa búsquedas rápidas: escribir varias letras ya no redibuja todo el
  // catálogo una vez por tecla. El último valor siempre se procesa.
  const originalInitApp = window.initApp;
  if (typeof originalInitApp === 'function') {
    window.initApp = function(...args) {
      const result = originalInitApp(...args);
      const input = document.getElementById('searchInput');
      const immediateHandler = input?.oninput;
      if (input && typeof immediateHandler === 'function' && !input.dataset.hxFastSearch) {
        let timer = 0;
        input.dataset.hxFastSearch = '1';
        input.oninput = event => {
          window.clearTimeout(timer);
          timer = window.setTimeout(() => immediateHandler(event), 90);
        };
      }
      return result;
    };
  }

  // Da respuesta visual inmediata al filtro y deja el trabajo pesado para el
  // siguiente frame. Esto evita que el clic parezca trabado.
  const originalFilterCat = window.filterCat;
  if (typeof originalFilterCat === 'function') {
    let filterFrame = 0;
    let pendingFilter = null;
    window.filterCat = function(cat, button) {
      document.querySelectorAll('.side-btn').forEach(item => item.classList.remove('active'));
      button?.classList.add('active');
      pendingFilter = [cat, button];
      if (filterFrame) return;
      filterFrame = requestAnimationFrame(() => {
        filterFrame = 0;
        const args = pendingFilter;
        pendingFilter = null;
        if (args) originalFilterCat(...args);
      });
    };
  }

  // Evita solicitudes dobles si el usuario pulsa varias veces mientras el
  // servidor valida la sesión. No cambia credenciales ni autorización.
  const originalDoLogin = window.doLogin;
  if (typeof originalDoLogin === 'function') {
    let loggingIn = false;
    window.doLogin = async function(...args) {
      if (loggingIn) return;
      const button = document.getElementById('btnLogin');
      const previousText = button?.textContent || '';
      loggingIn = true;
      if (button) {
        button.disabled = true;
        button.textContent = 'Ingresando…';
        button.setAttribute('aria-busy', 'true');
      }
      try {
        return await originalDoLogin(...args);
      } finally {
        loggingIn = false;
        if (button) {
          button.disabled = false;
          button.textContent = previousText;
          button.removeAttribute('aria-busy');
        }
      }
    };
  }

  document.documentElement.dataset.hxPerformanceRuntime = 'active';
})();
