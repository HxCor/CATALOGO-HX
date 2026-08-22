(() => {
  'use strict';

  const STYLE_ID = 'hxDivisasOnlyFixStyles';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
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
      if (btn?.classList.contains('active') && view) {
        setMode(true);
        return;
      }
      if (tries < 12) setTimeout(run, 80);
    };
    setTimeout(run, 0);
  }

  function init() {
    ensureStyles();
    document.addEventListener('click', event => {
      const divisas = event.target.closest?.('#hxDivisasBtn');
      if (divisas) {
        syncAfterOpen();
        return;
      }
      const side = event.target.closest?.('.side-btn');
      if (side && side.id !== 'hxDivisasBtn') setMode(false);
    }, true);

    // Lightweight startup sync only; no global MutationObserver.
    let startup = 0;
    const timer = setInterval(() => {
      startup += 1;
      const btn = document.getElementById('hxDivisasBtn');
      const view = document.getElementById('hxDivisasView');
      if (btn?.classList.contains('active') && view) setMode(true);
      if (startup >= 12) clearInterval(timer);
    }, 150);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
