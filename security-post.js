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
