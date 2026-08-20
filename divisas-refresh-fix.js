(() => {
  'use strict';

  function snapshot() {
    return {
      average: document.getElementById('hxfxAverage')?.textContent || '',
      buy: document.getElementById('hxfxBuy')?.textContent || '',
      sell: document.getElementById('hxfxSell')?.textContent || '',
      updated: document.getElementById('hxfxUpdated')?.textContent || ''
    };
  }

  function sameRates(a, b) {
    return a.average === b.average && a.buy === b.buy && a.sell === b.sell;
  }

  function ensureStatus(btn) {
    let status = document.getElementById('hxfxManualRefreshStatus');
    if (status) return status;
    status = document.createElement('span');
    status.id = 'hxfxManualRefreshStatus';
    status.style.cssText = 'font-size:11px;color:var(--ink3);align-self:center;white-space:nowrap;';
    btn.insertAdjacentElement('afterend', status);
    return status;
  }

  function enhanceRefreshButton() {
    const btn = document.getElementById('hxfxRefresh');
    if (!btn || btn.dataset.hxRefreshEnhanced === '1' || typeof btn.onclick !== 'function') return;

    btn.dataset.hxRefreshEnhanced = '1';
    const original = btn.onclick;
    const status = ensureStatus(btn);

    btn.onclick = async (event) => {
      if (btn.disabled) return;
      const before = snapshot();
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '↻ Actualizando…';
      status.textContent = 'Consultando eldolar.info…';

      try {
        await Promise.resolve(original.call(btn, event));

        // También refresca la gráfica del rango que esté visible.
        const activeRange = document.querySelector('.hxfx-range button.active');
        if (activeRange) activeRange.click();

        const after = snapshot();
        const now = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        status.textContent = sameRates(before, after)
          ? `Fuente consultada ${now} · sin cambio de precio`
          : `Datos actualizados ${now}`;
        btn.textContent = '✓ Actualizado';
      } catch (error) {
        console.error('HX refresh:', error);
        status.textContent = 'No se pudo completar la actualización';
        btn.textContent = '⚠ Reintentar';
      } finally {
        window.setTimeout(() => {
          btn.disabled = false;
          if (btn.textContent === '✓ Actualizado' || btn.textContent === '⚠ Reintentar') {
            btn.textContent = originalText || '↻ Actualizar';
          }
        }, 1800);
      }
    };
  }

  function init() {
    enhanceRefreshButton();
    const observer = new MutationObserver(enhanceRefreshButton);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
