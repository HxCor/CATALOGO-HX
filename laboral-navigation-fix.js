(() => {
  'use strict';

  const STYLE_ID = 'hxLaboralNavigationFixStyles';

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .sidebar{position:relative!important;z-index:40!important;isolation:isolate}
      #adminSideSection{position:relative!important;z-index:50!important;pointer-events:auto!important}
      #hxLaboralBtn,#hxDivisasBtn{position:relative!important;z-index:60!important;pointer-events:auto!important}
      #mainContent.hxlab-force > :not(#hxLaboralView){display:none!important}
      #mainContent.hxlab-force #hxLaboralView{display:block!important;visibility:visible!important;opacity:1!important}
      #mainContent.hxlab-force #cardsGrid,
      #mainContent.hxlab-force .cards-grid,
      #mainContent.hxlab-force .stats-row,
      #mainContent.hxlab-force .page-header{display:none!important}
      #mainContent.hxlab-imss-only > :not(#hxLaboralView){display:none!important}
      #mainContent.hxlab-imss-only #hxLaboralView{display:block!important;visibility:visible!important;opacity:1!important}
      #mainContent.hxlab-imss-only #hxLaboralView > :not(#hxlabImssPanel){display:none!important}
      #mainContent.hxlab-imss-only #hxlabImssPanel{display:block!important;margin-top:0!important;contain:layout style paint}
      .hxli-card-click{cursor:pointer;position:relative;z-index:2;pointer-events:auto!important}
      .hxli-card-click:focus{outline:2px solid var(--accent-md);outline-offset:2px}
      #hxliBackLaboral{margin-bottom:12px}
      #hxLaboralView{contain:layout style}
      #hxliResult .hxli-summary{display:grid!important;visibility:visible!important;opacity:1!important}
      #hxliResult .hxli-summary-card,
      #hxliResult .hxli-summary-card span,
      #hxliResult .hxli-summary-card b{visibility:visible!important;opacity:1!important}
    `;
    document.head.appendChild(style);
  }

  function isAuthenticated() {
    try {
      return typeof currentUser !== 'undefined' && Boolean(currentUser);
    } catch {
      return false;
    }
  }

  function clearModes() {
    const main = document.getElementById('mainContent');
    if (!main) return;
    main.classList.remove('hxlab-force', 'hxlab-imss-only');
  }

  function forceLaboralVisible() {
    if (!isAuthenticated()) return false;
    const main = document.getElementById('mainContent');
    const laboralBtn = document.getElementById('hxLaboralBtn');
    const laboralView = document.getElementById('hxLaboralView');
    if (!main || !laboralBtn || !laboralView) return false;

    document.getElementById('hxDivisasBtn')?.classList.remove('active');
    main.classList.remove('hxfx-only', 'hxlab-imss-only');
    main.classList.add('hxlab-force');
    laboralBtn.classList.add('active');
    laboralView.style.setProperty('display', 'block', 'important');
    laboralView.style.setProperty('visibility', 'visible', 'important');
    laboralView.removeAttribute('aria-hidden');
    return true;
  }

  function ensureBackButton(panel) {
    if (!panel || document.getElementById('hxliBackLaboral')) return;
    const back = document.createElement('button');
    back.id = 'hxliBackLaboral';
    back.type = 'button';
    back.className = 'hxlab-btn';
    back.textContent = '← Volver a Laboral HX';
    back.addEventListener('click', () => {
      const main = document.getElementById('mainContent');
      main?.classList.remove('hxlab-imss-only');
      main?.classList.add('hxlab-force');
      document.getElementById('hxLaboralView')?.scrollIntoView({ block: 'start' });
    });
    panel.prepend(back);
  }

  function openImssOnly() {
    if (!isAuthenticated()) return false;
    const main = document.getElementById('mainContent');
    const view = document.getElementById('hxLaboralView');
    const panel = document.getElementById('hxlabImssPanel');
    if (!main || !view || !panel) return false;

    main.classList.remove('hxfx-only', 'hxlab-force');
    main.classList.add('hxlab-imss-only');
    view.style.setProperty('display', 'block', 'important');
    panel.style.setProperty('display', 'block', 'important');
    ensureBackButton(panel);
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => panel.querySelector('input,select,button')?.focus?.({ preventScroll: true }), 250);
    return true;
  }

  function retryOpen(mode) {
    let attempts = 0;
    const run = () => {
      attempts += 1;
      const ok = mode === 'imss' ? openImssOnly() : forceLaboralVisible();
      if (ok || attempts >= 18) return;
      setTimeout(run, 90);
    };
    setTimeout(run, 0);
  }

  function isImssCard(target) {
    const card = target?.closest?.('.hxlab-status');
    if (!card) return null;
    const title = card.querySelector('.hxlab-status-title')?.textContent || '';
    return /IMSS/i.test(title) ? card : null;
  }

  function prepareImssCard() {
    const view = document.getElementById('hxLaboralView');
    if (!view) return false;
    const card = [...view.querySelectorAll('.hxlab-status')].find(c => /IMSS/i.test(c.querySelector('.hxlab-status-title')?.textContent || ''));
    if (!card) return false;
    card.classList.add('hxli-card-click');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'Abrir IMSS y costo patronal');
    return true;
  }

  function prepareAfterLaboralOpen() {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (prepareImssCard() || attempts >= 16) clearInterval(timer);
    }, 100);
  }

  function init() {
    addStyles();

    document.addEventListener('click', event => {
      if (event.target.closest?.('#hxLaboralBtn')) {
        clearModes();
        retryOpen('laboral');
        prepareAfterLaboralOpen();
        return;
      }

      const imssCard = isImssCard(event.target);
      if (imssCard) {
        retryOpen('imss');
        return;
      }

      if (event.target.closest?.('#hxDivisasBtn')) {
        clearModes();
        return;
      }

      const side = event.target.closest?.('.side-btn');
      if (side && side.id !== 'hxLaboralBtn') clearModes();
    }, true);

    document.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      const card = isImssCard(event.target);
      if (!card) return;
      event.preventDefault();
      retryOpen('imss');
    });

    let startup = 0;
    const timer = setInterval(() => {
      startup += 1;
      prepareImssCard();
      if (startup >= 16) clearInterval(timer);
    }, 150);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
