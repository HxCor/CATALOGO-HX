(() => {
  'use strict';

  const API = 'https://catalogo-hx-backend.armando-avila.workers.dev';
  const LFT_URL = 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf';
  const money = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(Number(n || 0));
  const num = (n, d = 2) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: d }).format(Number(n || 0));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const token = () => sessionStorage.getItem('hxSessionToken') || '';

  function isAdmin() {
    try { return typeof currentUser !== 'undefined' && currentUser && String(currentUser.rol || '').toLowerCase() === 'admin'; }
    catch { return false; }
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${token()}` };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    try {
      const response = await fetch(`${API}${path}`, { ...options, headers, signal: controller.signal, cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('El servidor tardó demasiado en responder. Intenta nuevamente.');
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function addStyles() {
    if (document.getElementById('hxLaboralDismissalStyles')) return;
    const style = document.createElement('style');
    style.id = 'hxLaboralDismissalStyles';
    style.textContent = `
      #hxlabDismissalPanel{margin-bottom:14px}
      .hxlab-dismiss-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:14px}
      .hxlab-dismiss-note{font-size:10px;line-height:1.55;color:var(--ink3);margin-top:8px}
      .hxlab-dismiss-result{min-height:260px}
      .hxlab-dismiss-warn{margin-top:10px;padding:10px 11px;border-radius:9px;background:#fffaf0;border:1px solid #ead9a5;font-size:9px;line-height:1.5;color:#665b3d}
      .hxlab-dismiss-contingent{margin-top:10px;padding:10px 11px;border-radius:9px;background:#f6f7fa;border:1px solid var(--border);font-size:10px;color:var(--ink2)}
      .hxlab-status.hxlab-dismiss-card{cursor:pointer;transition:transform .16s ease,border-color .16s ease}
      .hxlab-status.hxlab-dismiss-card:hover{transform:translateY(-1px);border-color:var(--accent-md)}
      .hxlab-mini-legal{margin-top:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .hxlab-mini-legal>div{border:1px solid var(--border);border-radius:9px;padding:9px;background:#fff;font-size:9px;line-height:1.45;color:var(--ink3)}
      .hxlab-mini-legal b{display:block;color:var(--ink2);font-size:10px;margin-bottom:2px}
      @media(max-width:900px){.hxlab-dismiss-grid{grid-template-columns:1fr}}
      @media(max-width:600px){.hxlab-mini-legal{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function payload() {
    return {
      scenario: document.getElementById('hxldScenario').value,
      relationType: 'indeterminado',
      employeeName: document.getElementById('hxldEmployee').value.trim(),
      startDate: document.getElementById('hxldStart').value,
      endDate: document.getElementById('hxldEnd').value,
      monthlySalary: Number(document.getElementById('hxldMonthly').value || 0),
      integratedDailySalary: Number(document.getElementById('hxldIntegrated').value || 0),
      region: document.getElementById('hxldRegion').value,
      unpaidSalaryDays: Number(document.getElementById('hxldUnpaid').value || 0),
      pendingVacationDays: Number(document.getElementById('hxldPendingVacation').value || 0),
      aguinaldoDays: Number(document.getElementById('hxldAguinaldo').value || 15),
      vacationPremiumPct: Number(document.getElementById('hxldVacPremium').value || 25),
      contractualVacationDays: Number(document.getElementById('hxldContractVacation').value || 0),
      plantWorker: document.getElementById('hxldPlant').checked,
      art49Confirmed: document.getElementById('hxldArt49').checked,
      backPayMonths: Number(document.getElementById('hxldBackPay').value || 0),
    };
  }

  function renderResult(result) {
    const root = document.getElementById('hxldResult');
    if (!root) return;
    const c = result.calculations || {};
    const s = result.salary || {};
    const unjustified = result.scenario === 'despido_injustificado';
    root.innerHTML = `
      <div class="hxlab-result-tag">RESULTADO ESTIMADO · NO ES DETERMINACIÓN OFICIAL</div>
      <div class="hxlab-total">${money(c.totalBaseEstimado)}</div>
      <div class="hxlab-result-sub">${esc(result.employeeName || 'Trabajador')} · ${esc(result.startDate)} → ${esc(result.endDate)} · ${num(result.service?.exactYears, 2)} años</div>
      <div class="hxlab-breakdown">
        <div class="hxlab-row"><span>Finiquito / prestaciones devengadas</span><strong>${money(c.finiquito)}</strong></div>
        <div class="hxlab-row"><span>Prima de antigüedad</span><strong>${money(c.primaAntiguedad)}</strong></div>
        <div class="hxlab-row"><span>Indemnización constitucional 3 meses</span><strong>${unjustified ? money(c.indemnizacionConstitucional) : 'No aplica'}</strong></div>
        <div class="hxlab-row"><span>Componente Art. 49/50 · 20 días/año</span><strong>${c.art49Confirmed ? money(c.indemnizacionArt50) : 'No incluido'}</strong></div>
        <div class="hxlab-row total"><span>Total base estimado</span><strong>${money(c.totalBaseEstimado)}</strong></div>
      </div>
      <div class="hxlab-dismiss-contingent"><b>Base diaria para indemnización:</b> ${money(s.indemnityDailySalary)} · ${esc(s.integratedSalarySource || '')}.<br><b>Salarios vencidos simulados:</b> ${money(c.salariosVencidosSimulados)}${c.backPayMonthsRequested ? ` (${num(c.backPayMonthsRequested)} mes(es))` : ''}. Este concepto se muestra separado y no está incluido en el total base.</div>
      <div class="hxlab-dismiss-warn">${(result.warnings || []).map(w => `• ${esc(w)}`).join('<br>')}</div>
      <div class="hxlab-mini-legal">${(result.legalBasis || []).map(x => `<div><b>${esc(x.concept)}</b>${esc(x.law)} · Arts. ${esc(x.articles)}<br>${esc(x.note)}</div>`).join('')}</div>
    `;
  }

  async function calculate() {
    const btn = document.getElementById('hxldCalculate');
    const root = document.getElementById('hxldResult');
    if (!btn || !root) return;
    btn.disabled = true;
    btn.textContent = 'Calculando…';
    try {
      const data = await api('/laboral/dismissal', { method: 'POST', body: JSON.stringify(payload()) });
      renderResult(data.result);
    } catch (error) {
      root.innerHTML = `<div class="hxlab-result-empty"><div><b>No fue posible calcular.</b><br>${esc(error.message)}</div></div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Calcular escenario';
    }
  }

  function syncScenario() {
    const unjustified = document.getElementById('hxldScenario')?.value === 'despido_injustificado';
    const art = document.getElementById('hxldArt49');
    const back = document.getElementById('hxldBackPay');
    if (art) { art.disabled = !unjustified; if (!unjustified) art.checked = false; }
    if (back) { back.disabled = !unjustified; if (!unjustified) back.value = '0'; }
  }

  function injectPanel(view) {
    if (!isAdmin() || document.getElementById('hxlabDismissalPanel')) return;
    addStyles();

    const cards = [...view.querySelectorAll('.hxlab-status')];
    const dismissalCard = cards.find(card => /Despido/i.test(card.querySelector('.hxlab-status-title')?.textContent || ''));
    if (dismissalCard) {
      dismissalCard.classList.add('hxlab-dismiss-card');
      const pill = dismissalCard.querySelector('.hxlab-pill');
      if (pill) { pill.textContent = 'BETA ACTIVO'; pill.classList.remove('pending'); }
    }

    const panel = document.createElement('div');
    panel.id = 'hxlabDismissalPanel';
    panel.className = 'hxlab-panel';
    panel.innerHTML = `
      <div class="hxlab-panel-title">📋 Despido / rescisión · motor por supuesto jurídico</div>
      <div class="hxlab-notice" style="margin-bottom:12px">
        <div class="hxlab-notice-title">⚠️ INFORMACIÓN ESTIMATIVA · NO ES DOCUMENTO PARA EXIGIR UN PAGO</div>
        <p>El sistema distingue despido injustificado y rescisión justificada. Los 20 días por año del artículo 50 no se agregan automáticamente: solo se incluyen cuando el usuario confirma que se actualiza el supuesto jurídico de los artículos 49 y 50. Salarios vencidos se presentan como simulación separada.</p>
      </div>
      <div class="hxlab-dismiss-grid">
        <div>
          <div class="hxlab-form">
            <div class="hxlab-field"><label>Supuesto</label><select class="hxlab-select" id="hxldScenario"><option value="despido_injustificado">Despido injustificado</option><option value="despido_justificado">Rescisión justificada · Art. 47</option></select></div>
            <div class="hxlab-field"><label>Trabajador</label><input class="hxlab-input" id="hxldEmployee" placeholder="Nombre"></div>
            <div class="hxlab-field"><label>Región</label><select class="hxlab-select" id="hxldRegion"><option value="general">Zona general</option><option value="frontera">ZLFN</option></select></div>
            <div class="hxlab-field"><label>Fecha ingreso</label><input class="hxlab-input" id="hxldStart" type="date"></div>
            <div class="hxlab-field"><label>Fecha baja</label><input class="hxlab-input" id="hxldEnd" type="date" value="${todayIso()}"></div>
            <div class="hxlab-field"><label>Sueldo mensual</label><input class="hxlab-input" id="hxldMonthly" type="number" min="0" step="0.01" placeholder="30000"></div>
            <div class="hxlab-field"><label>Salario diario integrado (opcional)</label><input class="hxlab-input" id="hxldIntegrated" type="number" min="0" step="0.01" placeholder="Si se conoce"></div>
            <div class="hxlab-field"><label>Días sueldo pendientes</label><input class="hxlab-input" id="hxldUnpaid" type="number" min="0" step="0.01" value="0"></div>
            <div class="hxlab-field"><label>Vacaciones pendientes adicionales</label><input class="hxlab-input" id="hxldPendingVacation" type="number" min="0" step="0.01" value="0"></div>
            <div class="hxlab-field"><label>Aguinaldo contractual</label><input class="hxlab-input" id="hxldAguinaldo" type="number" min="15" step="1" value="15"></div>
            <div class="hxlab-field"><label>Prima vacacional %</label><input class="hxlab-input" id="hxldVacPremium" type="number" min="25" step="0.01" value="25"></div>
            <div class="hxlab-field"><label>Vacaciones contractuales / año</label><input class="hxlab-input" id="hxldContractVacation" type="number" min="0" step="1" value="0"></div>
            <label class="hxlab-check"><input id="hxldPlant" type="checkbox" checked> Trabajador de planta</label>
            <label class="hxlab-check"><input id="hxldArt49" type="checkbox"> Confirmo supuesto Arts. 49/50</label>
            <div class="hxlab-field"><label>Simular salarios vencidos (0–12 meses)</label><input class="hxlab-input" id="hxldBackPay" type="number" min="0" max="12" step="1" value="0"></div>
            <div class="hxlab-calc-actions"><button class="hxlab-btn primary" id="hxldCalculate">Calcular escenario</button><span class="hxlab-calc-note">Relación por tiempo indeterminado · versión beta controlada</span></div>
          </div>
          <div class="hxlab-dismiss-note">La base de indemnización se estima conforme a los Arts. 84 y 89 con las prestaciones capturadas. Si conoces el salario diario integrado aplicable, captúralo para una estimación más precisa.</div>
        </div>
        <div class="hxlab-dismiss-result" id="hxldResult"><div class="hxlab-result-empty"><div>Captura los datos y selecciona el supuesto.<br><br><b>Fuentes:</b> LFT Arts. 46, 47, 48, 49, 50, 84, 89 y 162.</div></div></div>
      </div>
      <div style="margin-top:12px;font-size:9px;color:var(--ink3)">Fuente jurídica: <a href="${LFT_URL}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:700">Ley Federal del Trabajo · Cámara de Diputados · última reforma DOF 14-05-2026</a></div>
    `;

    const sourcebar = view.querySelector('.hxlab-sourcebar');
    if (sourcebar) sourcebar.insertAdjacentElement('beforebegin', panel);
    else view.appendChild(panel);

    document.getElementById('hxldScenario')?.addEventListener('change', syncScenario);
    document.getElementById('hxldCalculate')?.addEventListener('click', calculate);
    dismissalCard?.addEventListener('click', () => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    syncScenario();
  }

  function scan() {
    if (!isAdmin()) return false;
    const view = document.getElementById('hxLaboralView');
    if (!view) return false;
    injectPanel(view);
    return Boolean(document.getElementById('hxlabDismissalPanel'));
  }

  function init() {
    let observer;
    const run = () => {
      if (!scan()) return;
      observer?.disconnect();
    };
    run();
    observer = new MutationObserver(run);
    if (document.getElementById('hxlabDismissalPanel')) return;
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
