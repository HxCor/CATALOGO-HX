(() => {
  'use strict';

  const USERS_KEY = 'hx_users';

  function cleanUserForStorage(user) {
    if (!user || typeof user !== 'object') return user;
    const copy = { ...user };
    delete copy.pass;
    delete copy.password;
    delete copy['Contraseña'];
    delete copy['contraseña'];
    delete copy['Password Hash'];
    return copy;
  }

  function isProtectedAdmin(user) {
    return String(user?.user || '').trim().toLowerCase() === 'admin';
  }

  // Refuerzo de persistencia: nunca guardar passwords en localStorage.
  window.saveUsers = function(arr) {
    const clean = Array.isArray(arr) ? arr.map(cleanUserForStorage) : [];
    localStorage.setItem(USERS_KEY, JSON.stringify(clean));
  };

  // Después de un login admin válido, cargar la lista de usuarios ya autorizada.
  // El backend endurecido nunca devuelve Contraseña ni Password Hash.
  const originalDoLogin = window.doLogin;
  window.doLogin = async function(...args) {
    await originalDoLogin(...args);
    if (HX_SESSION_TOKEN && currentUser?.rol === 'admin') {
      try {
        await loadUsersFromAirtable();
      } catch (error) {
        console.warn('No se pudo actualizar la lista de usuarios después del login.', error);
      }
    }
  };

  // Logout completo: elimina también el token de sesión.
  window.doLogout = function() {
    currentUser = null;
    HX_SESSION_TOKEN = null;
    sessionStorage.removeItem('hxSessionToken');
    document.body.classList.remove('logged-in');

    const app = document.getElementById('screenApp');
    const login = document.getElementById('screenLogin');

    if (app) {
      app.classList.remove('active');
      app.style.setProperty('display', 'none', 'important');
      app.setAttribute('hidden', 'hidden');
    }

    if (login) {
      login.classList.add('active');
      login.style.setProperty('display', 'flex', 'important');
    }

    const loginUser = document.getElementById('loginUser');
    const loginPass = document.getElementById('loginPass');
    if (loginUser) loginUser.value = '';
    if (loginPass) loginPass.value = '';

    window.scrollTo(0, 0);
  };

  // El administrador protegido se identifica por username, no por posición en la lista.
  window.renderUsersList = function() {
    const users = getUsers();
    const container = document.getElementById('usersList');
    if (!container) return;

    container.innerHTML = users.map((u, i) => {
      const initials = String(u.nombre || u.user || 'U')
        .split(/\s+/)
        .filter(Boolean)
        .map(w => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      const protectedAdmin = isProtectedAdmin(u);

      return `
        <div class="user-row">
          <div class="user-row-avatar ${u.rol === 'admin' ? 'avatar-admin' : 'avatar-viewer'}">${initials}</div>
          <div>
            <div class="user-row-name">${u.nombre || ''}</div>
            <div class="user-row-user">@${u.user || ''} · ${u.rol === 'admin' ? 'Administrador' : 'Consultor'}</div>
          </div>
          <div style="margin-left:auto;display:flex;gap:6px">
            <span class="badge-role ${u.rol === 'admin' ? 'badge-admin' : 'badge-viewer'}">${u.rol === 'admin' ? 'Admin' : 'Viewer'}</span>
            ${protectedAdmin
              ? '<span style="font-size:13px;color:#888">Protegido</span>'
              : `<button class="btn btn-secondary btn-sm" onclick="editUser(${i})">✏️</button>
                 <button class="btn btn-danger btn-sm" onclick="deleteUser(${i})">🗑️</button>`}
          </div>
        </div>`;
    }).join('');
  };

  const originalDeleteUser = window.deleteUser;
  window.deleteUser = async function(idx) {
    const users = getUsers();
    const user = users[idx];
    if (isProtectedAdmin(user)) {
      showToast('El administrador principal no se puede eliminar.', 'error');
      return;
    }
    return originalDeleteUser(idx);
  };

  // Evita revelar conteos de proveedores fuera del alcance de un usuario viewer.
  window.renderSidebar = function() {
    const cats = getCats();
    const provs = aplicarPermisosUsuario(getProveedores());
    const q = searchTerm.toLowerCase();
    const container = document.getElementById('sidebarCats');
    if (!container) return;

    container.innerHTML = cats.map(c => {
      const count = provs.filter(p => {
        const cm = p.categoria === c.nombre;
        const sm = !q ||
          String(p.nombre || '').toLowerCase().includes(q) ||
          String(p.rfc || '').toLowerCase().includes(q) ||
          (p.servicios || []).some(s => String(s || '').toLowerCase().includes(q));
        return cm && sm;
      }).length;
      const active = currentCat === c.nombre ? 'active' : '';
      const safeid = encodeURIComponent(c.nombre);
      return `<button class="side-btn ${active}" data-cat="${c.nombre}" onclick="filterCat('${c.nombre}',this)">
        <span class="side-icon">${c.icono}</span> ${c.nombre}
        <span class="side-count" id="sc-${safeid}">${count}</span>
      </button>`;
    }).join('');
  };

  // Capa de correo desacoplada del proveedor de email.
  // Hoy usa mailto: sin exponer secretos en el navegador; mañana puede apuntar a una API autenticada.
  window.HX_MAIL_CONFIG = Object.freeze({
    mode: 'mailto',
    futureApiEndpoint: '/mail/send'
  });

  function normalizeProviderEmail(value) {
    const email = String(value || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  }

  function currentProviderEmailInputValue() {
    return String(document.getElementById('fHxEmail')?.value || '').trim();
  }

  function ensureProviderEmailField() {
    if (document.getElementById('fHxEmail')) return document.getElementById('fHxEmail');
    const anchor = document.getElementById('fOpinionCumplimientoUrl')?.closest('.form-row');
    if (!anchor) return null;

    const row = document.createElement('div');
    row.className = 'form-row hx-provider-email-row';
    row.innerHTML = `
      <div class="form-group full">
        <label class="form-label">Correo de contacto / corporativo</label>
        <input class="form-input" id="fHxEmail" type="email" autocomplete="email" placeholder="contacto@empresa.com">
        <div style="font-size:11px;color:var(--ink3);margin-top:5px">Se usa para preparar correos desde la ficha de la empresa.</div>
      </div>`;
    anchor.insertAdjacentElement('afterend', row);
    return row.querySelector('#fHxEmail');
  }

  const originalOpenAddForm = window.openAddForm;
  if (typeof originalOpenAddForm === 'function') {
    window.openAddForm = function(...args) {
      const result = originalOpenAddForm(...args);
      const input = ensureProviderEmailField();
      if (input) input.value = '';
      return result;
    };
  }

  const originalOpenEditForm = window.openEditForm;
  if (typeof originalOpenEditForm === 'function') {
    window.openEditForm = function(idx, ...args) {
      const result = originalOpenEditForm(idx, ...args);
      const input = ensureProviderEmailField();
      const provider = typeof getProveedores === 'function' ? getProveedores()[idx] : null;
      if (input) input.value = String(provider?.email || '');
      return result;
    };
  }

  let mailFormWriteActive = false;

  const originalCreateProveedorAirtable = window.createProveedorAirtable;
  if (typeof originalCreateProveedorAirtable === 'function') {
    window.createProveedorAirtable = function(entry, ...args) {
      const email = mailFormWriteActive ? currentProviderEmailInputValue() : String(entry?.email || '');
      return originalCreateProveedorAirtable({ ...(entry || {}), email }, ...args);
    };
  }

  const originalUpdateProveedorAirtable = window.updateProveedorAirtable;
  if (typeof originalUpdateProveedorAirtable === 'function') {
    window.updateProveedorAirtable = function(entry, ...args) {
      const email = mailFormWriteActive ? currentProviderEmailInputValue() : String(entry?.email || '');
      return originalUpdateProveedorAirtable({ ...(entry || {}), email }, ...args);
    };
  }

  const originalSaveProveedores = window.saveProveedores;
  if (typeof originalSaveProveedores === 'function') {
    window.saveProveedores = function(arr) {
      if (mailFormWriteActive && Array.isArray(arr)) {
        const email = currentProviderEmailInputValue();
        const editIdx = Number.parseInt(document.getElementById('fEditIdx')?.value || '-1', 10);
        const rfc = String(document.getElementById('fRfc')?.value || '').trim().toUpperCase();
        let target = Number.isInteger(editIdx) && editIdx >= 0 ? arr[editIdx] : null;
        if (!target && rfc) target = arr.find(p => String(p?.rfc || '').trim().toUpperCase() === rfc);
        if (target) target.email = email;
      }
      return originalSaveProveedores(arr);
    };
  }

  const originalSaveForm = window.saveForm;
  if (typeof originalSaveForm === 'function') {
    window.saveForm = async function(...args) {
      ensureProviderEmailField();
      const rawEmail = currentProviderEmailInputValue();
      if (rawEmail && !normalizeProviderEmail(rawEmail)) {
        if (typeof showToast === 'function') showToast('El correo de la empresa no tiene un formato válido.', 'error');
        return;
      }
      mailFormWriteActive = true;
      try {
        return await originalSaveForm(...args);
      } finally {
        mailFormWriteActive = false;
      }
    };
  }

  window.hxComposeProviderEmail = function(provider) {
    const email = normalizeProviderEmail(provider?.email);
    if (!email) {
      if (typeof showToast === 'function') showToast('Esta empresa todavía no tiene correo registrado.', 'error');
      return false;
    }

    const empresa = String(provider?.nombre || 'Proveedor').trim();
    const rfc = String(provider?.rfc || '').trim().toUpperCase();
    const contacto = String(provider?.contacto || '').trim();
    const saludo = contacto ? `Hola ${contacto},` : 'Hola,';
    const subject = `Catálogo HX · ${empresa}${rfc ? ` · ${rfc}` : ''}`;
    const body = [
      saludo,
      '',
      `Nos ponemos en contacto con ${empresa} desde el Catálogo HX de proveedores.`,
      rfc ? `RFC: ${rfc}` : '',
      '',
      'Quedamos atentos a sus comentarios.',
      '',
      'Saludos.'
    ].filter((line, index, arr) => line !== '' || arr[index - 1] !== '').join('\n');

    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return true;
  };

  function ensureMailStyles() {
    if (document.getElementById('hx-mail-tools-style')) return;
    const style = document.createElement('style');
    style.id = 'hx-mail-tools-style';
    style.textContent = `
      .hx-email-actions{padding:10px 18px;border-top:1px solid var(--border);display:flex;gap:8px;background:rgba(26,92,58,.025)}
      .hx-email-btn{width:100%;min-height:36px;border:1px solid rgba(26,92,58,.22);border-radius:8px;background:var(--accent-lt);color:var(--accent);font:600 12px 'Sora',sans-serif;cursor:pointer;transition:all .18s ease}
      .hx-email-btn:hover{background:var(--accent);color:#fff;transform:translateY(-1px)}
      @media(max-width:600px){.hx-email-actions{padding:12px 18px}.hx-email-btn{min-height:42px;border-radius:12px}}
    `;
    document.head.appendChild(style);
  }

  function injectProviderEmailButtons() {
    const grid = document.getElementById('cardsGrid');
    if (!grid || typeof getFiltered !== 'function' || typeof aplicarPermisosUsuario !== 'function') return;

    ensureMailStyles();
    const visibleProviders = aplicarPermisosUsuario(getFiltered(currentCat, searchTerm));
    const cards = [...grid.querySelectorAll('.pcard')];

    cards.forEach((card, index) => {
      if (card.querySelector('.hx-email-actions')) return;
      const provider = visibleProviders[index];
      if (!provider || !normalizeProviderEmail(provider.email)) return;

      const actions = document.createElement('div');
      actions.className = 'hx-email-actions';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hx-email-btn';
      button.textContent = '✉️ Preparar correo';
      button.setAttribute('aria-label', `Preparar correo para ${provider.nombre || 'proveedor'}`);
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        window.hxComposeProviderEmail(provider);
      });
      actions.appendChild(button);

      const adminActions = card.querySelector('.pcard-actions');
      card.insertBefore(actions, adminActions || null);
    });
  }

  const originalRenderCards = window.renderCards;
  if (typeof originalRenderCards === 'function') {
    window.renderCards = function(...args) {
      const result = originalRenderCards(...args);
      queueMicrotask(injectProviderEmailButtons);
      return result;
    };
    queueMicrotask(injectProviderEmailButtons);
  }

  // Corrige una clase antigua escrita con guion Unicode.
  document.body.classList.remove('logged—in');

  // Limpieza final por si una versión anterior ya había persistido passwords.
  try {
    const users = getUsers();
    saveUsers(users);
  } catch (error) {
    console.warn('No se pudo completar la limpieza local de usuarios.', error);
  }
})();
