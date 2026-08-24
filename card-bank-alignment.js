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

    const gridRect = grid.getBoundingClientRect();
    const entries = [...grid.querySelectorAll(CARD_SELECTOR)]
      .map(card => {
        const footer = card.querySelector(FOOTER_SELECTOR);
        if (!footer) return null;
        const spacer = ensureSpacer(card, footer);
        spacer.style.height = '0px';
        return { card, footer, spacer };
      })
      .filter(Boolean);

    const rows = new Map();
    entries.forEach(entry => {
      const cardRect = entry.card.getBoundingClientRect();
      const rowKey = Math.round((cardRect.top - gridRect.top) / ROW_TOLERANCE_PX) * ROW_TOLERANCE_PX;
      const row = rows.get(rowKey) || [];
      row.push(entry);
      rows.set(rowKey, row);
    });

    rows.forEach(row => {
      const measurements = row.map(entry => ({
        ...entry,
        footerTop: entry.footer.getBoundingClientRect().top - entry.card.getBoundingClientRect().top
      }));
      const targetTop = Math.max(...measurements.map(item => item.footerTop));
      measurements.forEach(item => {
        const extra = Math.max(0, Math.round((targetTop - item.footerTop) * 100) / 100);
        item.spacer.style.height = `${extra}px`;
      });
    });

    grid.dataset.hxBankAlignment = 'ready';
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
