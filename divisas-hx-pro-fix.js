(() => {
  'use strict';

  const STYLE_ID = 'hxDivisasOnlyFixStyles';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #mainContent.hxfx-only > :not(#hxDivisasView) {
        display: none !important;
      }
      #mainContent.hxfx-only #hxDivisasView {
        display: block !important;
        margin-top: 0 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function syncDivisasView() {
    const main = document.getElementById('mainContent');
    const btn = document.getElementById('hxDivisasBtn');
    const view = document.getElementById('hxDivisasView');
    if (!main) return;

    const isActive = Boolean(
      btn && btn.classList.contains('active') &&
      view && getComputedStyle(view).display !== 'none'
    );

    main.classList.toggle('hxfx-only', isActive);
  }

  function init() {
    ensureStyles();

    document.addEventListener('click', () => {
      requestAnimationFrame(() => requestAnimationFrame(syncDivisasView));
    }, true);

    const observer = new MutationObserver(() => syncDivisasView());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    syncDivisasView();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
