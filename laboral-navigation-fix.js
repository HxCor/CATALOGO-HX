(() => {
  'use strict';

  const STYLE_ID = 'hxLaboralNavigationFixStyles';

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #hxLaboralBtn,#hxDivisasBtn{position:relative;pointer-events:auto!important}
      #mainContent.hxlab-force > :not(#hxLaboralView){display:none!important}
      #mainContent.hxlab-force #hxLaboralView{display:block!important;visibility:visible!important;opacity:1!important}
      .hxli-card-click{cursor:pointer}
      .hxli-card-click:focus{outline:2px solid var(--accent-md);outline-offset:2px}
    `;
    document.head.appendChild(style);
  }

  function isAdmin() {
    try {
      return typeof currentUser !== 'undefined' && currentUser && String(currentUser.rol || '').toLowerCase() === 'admin';
    } catch {
      return false;
    }
  }

  function forceLaboralVisible() {
    if (!isAdmin()) return false;
    const main = document.getElementById('mainContent');
    const laboralBtn = document.getElementById('hxLaboralBtn');
    const divisasBtn = document.getElementById('hxDivisasBtn');
    const laboralView = document.getElementById('hxLaboralView');
    const divisasView = document.getElementById('hxDivisasView');
    if (!main || !laboralBtn || !laboralView) return false;

    divisasBtn?.classList.remove('active');
    if (divisasView) divisasView.style.setProperty('display', 'none', 'important');
    main.classList.remove('hxfx-only');
    main.classList.add('hxlab-force');
    laboralBtn.classList.add('active');
    laboralView.style.setProperty('display', 'block', 'important');
    laboralView.style.setProperty('visibility', 'visible', 'important');
    laboralView.removeAttribute('aria-hidden');
    return true;
  }

  function releaseLaboralForce() {
    document.getElementById('mainContent')?.classList.remove('hxlab-force');
  }

  function retryForceLaboral(scrollToImss = false) {
    let attempts = 0;
    const run = () => {
      attempts += 1;
      const ready = forceLaboralVisible();
      const panel = document.getElementById('hxlabImssPanel');
      if (ready && (!scrollToImss || panel)) {
        if (scrollToImss && panel) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
          const first = panel.querySelector('input,select,button');
          if (first instanceof HTMLElement) setTimeout(() => first.focus({ preventScroll: true }), 350);
        }
        return;
      }
      if (attempts < 40) setTimeout(run, 100);
    };
    setTimeout(run, 0);
  }

  function enhanceImssCard() {
    const view = document.getElementById('hxLaboralView');
    if (!view) return;
    const cards = [...view.querySelectorAll('.hxlab-status')];
    const card = cards.find(c => /IMSS/i.test(c.querySelector('.hxlab-status-title')?.textContent || ''));
    if (!card || card.dataset.hxNavFixed === '1') return;
    card.dataset.hxNavFixed = '1';
    card.classList.add('hxli-card-click');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'Abrir IMSS y costo patronal');
    const open = event => {
      if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
      if (event.type === 'keydown') event.preventDefault();
      retryForceLaboral(true);
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', open);
  }

  function init() {
    addStyles();

    document.addEventListener('click', event => {
      const laboral = event.target.closest?.('#hxLaboralBtn');
      if (laboral) {
        releaseLaboralForce();
        retryForceLaboral(false);
        return;
      }

      const divisas = event.target.closest?.('#hxDivisasBtn');
      if (divisas) {
        releaseLaboralForce();
        return;
      }

      const side = event.target.closest?.('.side-btn');
      if (side && side.id !== 'hxLaboralBtn') releaseLaboralForce();
    }, true);

    const observer = new MutationObserver(() => {
      enhanceImssCard();
      const btn = document.getElementById('hxLaboralBtn');
      const view = document.getElementById('hxLaboralView');
      if (btn?.classList.contains('active') && view && isAdmin()) forceLaboralVisible();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    enhanceImssCard();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
