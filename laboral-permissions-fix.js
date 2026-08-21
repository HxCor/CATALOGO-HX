(() => {
  'use strict';

  const STYLE_ID = 'hxLaboralPermissionStyles';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      body.is-viewer #hxLaboralBtn,
      body:not(.is-admin) #hxLaboralBtn {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      body.is-viewer #hxLaboralView,
      body:not(.is-admin) #hxLaboralView {
        display: none !important;
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  function isAdmin() {
    return Boolean(
      document.body.classList.contains('is-admin') &&
      typeof currentUser !== 'undefined' &&
      currentUser &&
      String(currentUser.rol || '').toLowerCase() === 'admin'
    );
  }

  function sync() {
    ensureStyles();
    const button = document.getElementById('hxLaboralBtn');
    const view = document.getElementById('hxLaboralView');
    const allowed = isAdmin();

    if (button) {
      button.setAttribute('aria-hidden', allowed ? 'false' : 'true');
      button.tabIndex = allowed ? 0 : -1;
    }

    if (!allowed && view) {
      view.style.setProperty('display', 'none', 'important');
      view.setAttribute('hidden', 'hidden');
    } else if (allowed && view) {
      view.removeAttribute('hidden');
      view.style.removeProperty('visibility');
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('#hxLaboralBtn');
    if (!button || isAdmin()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  const observer = new MutationObserver(sync);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync, { once: true });
  else sync();
})();