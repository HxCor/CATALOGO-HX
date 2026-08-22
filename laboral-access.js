(() => {
  'use strict';

  function isAuthenticated() {
    try {
      return typeof currentUser !== 'undefined' && Boolean(currentUser);
    } catch {
      return false;
    }
  }

  function syncLaboralAccess() {
    const allowed = isAuthenticated();
    const button = document.getElementById('hxLaboralBtn');
    if (button) {
      button.style.setProperty('display', allowed ? '' : 'none', 'important');
      button.setAttribute('aria-hidden', allowed ? 'false' : 'true');
      button.tabIndex = allowed ? 0 : -1;
    }

    const view = document.getElementById('hxLaboralView');
    if (view && !allowed) {
      view.style.setProperty('display', 'none', 'important');
      view.setAttribute('aria-hidden', 'true');
      document.getElementById('hxLaboralBtn')?.classList.remove('active');
    }
  }

  const observer = new MutationObserver(syncLaboralAccess);

  function init() {
    syncLaboralAccess();
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    let attempts = 0;
    const timer = setInterval(() => {
      syncLaboralAccess();
      attempts += 1;
      if (attempts >= 80) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
