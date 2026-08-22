(() => {
  'use strict';

  const STYLE_ID = 'hxDivisasOnlyFixStyles';

  function isAuthenticated() {
    try {
      return typeof currentUser !== 'undefined' && Boolean(currentUser);
    } catch {
      return false;
    }
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .sidebar{position:relative!important;z-index:40!important;isolation:isolate}
      #adminSideSection{position:relative!important;z-index:50!important;pointer-events:auto!important}
      #hxToolsSideSection{visibility:visible!important}
      #hxDivisasBtn,#hxLaboralBtn{position:relative!important;z-index:60!important;pointer-events:auto!important}
      #mainContent.hxfx-only > :not(#hxDivisasView){display:none!important}
      #mainContent.hxfx-only #hxDivisasView{display:block!important;visibility:visible!important;opacity:1!important;margin-top:0!important}
      #mainContent.hxfx-only #cardsGrid,
      #mainContent.hxfx-only .cards-grid,
      #mainContent.hxfx-only .stats-row,
      #mainContent.hxfx-only .page-header{display:none!important}
      #hxDivisasView{contain:layout style paint}
    `;
    document.head.appendChild(style);
  }

  function syncAccess() {
    const allowed = isAuthenticated();
    const button = document.getElementById('hxDivisasBtn');
    const tools = document.getElementById('hxToolsSideSection');
    const view = document.getElementById('hxDivisasView');

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
      setMode(false);
      view.style.setProperty('display', 'none', 'important');
      view.setAttribute('aria-hidden', 'true');
      button?.classList.remove('active');
    } else if (allowed && view) {
      view.removeAttribute('aria-hidden');
    }
  }

  function setMode(enabled) {
    const main = document.getElementById('mainContent');
    if (!main) return;
    main.classList.toggle('hxfx-only', Boolean(enabled));
    if (enabled) {
      main.classList.remove('hxlab-force', 'hxlab-imss-only');
      const view = document.getElementById('hxDivisasView');
      if (view) view.style.setProperty('display', 'block', 'important');
    }
  }

  function syncAfterOpen() {
    let tries = 0;
    const run = () => {
      tries += 1;
      const btn = document.getElementById('hxDivisasBtn');
      const view = document.getElementById('hxDivisasView');
      if (isAuthenticated() && btn?.classList.contains('active') && view) {
        setMode(true);
        return;
      }
      if (tries < 12) setTimeout(run, 80);
    };
    setTimeout(run, 0);
  }

  function init() {
    ensureStyles();
    syncAccess();

    document.addEventListener('click', event => {
      const divisas = event.target.closest?.('#hxDivisasBtn');
      if (divisas) {
        if (!isAuthenticated()) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        syncAfterOpen();
        return;
      }
      const side = event.target.closest?.('.side-btn');
      if (side && side.id !== 'hxDivisasBtn') setMode(false);
    }, true);

    const observer = new MutationObserver(syncAccess);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });

    let startup = 0;
    const timer = setInterval(() => {
      startup += 1;
      syncAccess();
      const btn = document.getElementById('hxDivisasBtn');
      const view = document.getElementById('hxDivisasView');
      if (isAuthenticated() && btn?.classList.contains('active') && view) setMode(true);
      if (startup >= 20) clearInterval(timer);
    }, 150);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
