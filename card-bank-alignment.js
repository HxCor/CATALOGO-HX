/* CATALOGO-HX · alineación dinámica de franjas bancarias */
(function () {
  'use strict';

  const GRID_ID = 'cardsGrid';
  const CARD_SELECTOR = '.pcard';
  const FOOTER_SELECTOR = '.pcard-footer';
  const SPACER_CLASS = 'hx-bank-align-spacer';
  const ROW_TOLERANCE_PX = 4;

  let scheduled = false;
  let gridObserver = null;
  let resizeObserver = null;

  function ensureStyles() {
    if (document.getElementById('hx-bank-alignment-style')) return;
    const style = document.createElement('style');
    style.id = 'hx-bank-alignment-style';
    style.textContent = `
      #cardsGrid > .${CARD_SELECTOR} {
        display: flex !important;
        flex-direction: column !important;
      }
      #cardsGrid > .${CARD_SELECTOR} > .pcard-mid {
        flex: 1 1 auto !important;
      }
      #cardsGrid > .${CARD_SELECTOR} > .pcard-footer,
      #cardsGrid > .${CARD_SELECTOR} > .pcard-actions {
        flex: 0 0 auto !important;
      }
      .${SPACER_CLASS} {
        display: block;
        width: 100%;
        height: 0;
        flex: 0 0 auto;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureSpacer(card, footer) {
    let spacer = footer.previousElementSibling;
    if (!spacer || !spacer.classList.contains(SPACER_CLASS)) {
      spacer = document.createElement('div');
      spacer.className = SPACER_CLASS;
      spacer.setAttribute('aria-hidden', 'true');
      card.insertBefore(spacer, footer);
    }
    return spacer;
  }

  function alignBankStrips() {
    const grid = document.getElementById(GRID_ID);
    if (!grid) return;

    // El observador se pausa mientras se insertan/ajustan espaciadores para
    // que nuestras propias escrituras no provoquen otra ronda innecesaria.
    gridObserver?.disconnect();

    const gridRect = grid.getBoundingClientRect();
    const entries = [...grid.querySelectorAll(CARD_SELECTOR)]
      .map(card => {
        const footer = card.querySelector(FOOTER_SELECTOR);
        if (!footer) return null;
        const spacer = ensureSpacer(card, footer);
        return { card, footer, spacer };
      })
      .filter(Boolean);

    const rows = new Map();
    entries.forEach(entry => {
      const cardRect = entry.card.getBoundingClientRect();
      const rowKey = Math.round((cardRect.top - gridRect.top) / ROW_TOLERANCE_PX) * ROW_TOLERANCE_PX;
      const row = rows.get(rowKey) || [];
      const spacerHeight = Number.parseFloat(entry.spacer.style.height) || 0;
      row.push({
        ...entry,
        naturalFooterTop: entry.footer.getBoundingClientRect().top - cardRect.top - spacerHeight
      });
      rows.set(rowKey, row);
    });

    rows.forEach(row => {
      const targetTop = Math.max(...row.map(item => item.naturalFooterTop));
      row.forEach(item => {
        const extra = Math.max(0, Math.round((targetTop - item.naturalFooterTop) * 100) / 100);
        item.spacer.style.height = `${extra}px`;
      });
    });

    grid.dataset.hxBankAlignment = 'ready';

    gridObserver?.observe(grid, { childList: true, subtree: true });
  }

  function scheduleAlignment() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      alignBankStrips();
    });
  }

  function connect() {
    const grid = document.getElementById(GRID_ID);
    if (!grid) return false;

    ensureStyles();
    gridObserver?.disconnect();
    resizeObserver?.disconnect();

    gridObserver = new MutationObserver(scheduleAlignment);
    gridObserver.observe(grid, { childList: true, subtree: true });

    // Detecta cambios de altura del grid (imágenes, fuentes o nuevas filas)
    // sin observar cada nodo interno ni bloquear los clics.
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(scheduleAlignment);
      resizeObserver.observe(grid);
    }

    window.addEventListener('resize', scheduleAlignment, { passive: true });
    document.fonts?.ready?.then(scheduleAlignment).catch(() => {});
    scheduleAlignment();
    return true;
  }

  function init() {
    if (connect()) return;
    const bootstrapObserver = new MutationObserver(() => {
      if (connect()) bootstrapObserver.disconnect();
    });
    bootstrapObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.hxAlignBankStrips = scheduleAlignment;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
