(() => {
  'use strict';

  const STYLE_ID = 'hxLaboralPermissionStyles';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '#hxToolsSideSection{visibility:visible!important}';
    document.head.appendChild(style);
  }

  function isAuthenticated() {
    return Boolean(
      typeof currentUser !== 'undefined' &&
      currentUser
    );
  }

  function sync() {
    ensureStyles();
    const button = document.getElementById('hxLaboralBtn');
    const tools = document.getElementById('hxToolsSideSection');
    const view = document.getElementById('hxLaboralView');
    const allowed = isAuthenticated();

    if (tools && allowed) {
      tools.style.setProperty('display', 'block', 'important');
      tools.style.setProperty('visibility', 'visible', 'important');
    }

    if (button) {
      button.style.setProperty('display', allowed ? '' : 'none', 'important');
      button.style.setProperty('visibility', allowed ? 'visible' : 'hidden', 'important');
      button.setAttribute('aria-hidden', allowed ? 'false' : 'true');
      button.tabIndex = allowed ? 0 : -1;
    }

    if (!allowed && view) {
      view.style.setProperty('display', 'none', 'important');
      view.setAttribute('hidden', 'hidden');
      button?.classList.remove('active');
    } else if (allowed && view) {
      view.removeAttribute('hidden');
      view.removeAttribute('aria-hidden');
      view.style.removeProperty('visibility');
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('#hxLaboralBtn');
    if (!button || isAuthenticated()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  const observer = new MutationObserver(sync);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync, { once: true });
  else sync();
})();
