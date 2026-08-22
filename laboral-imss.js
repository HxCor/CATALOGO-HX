(() => {
  'use strict';

  const API = 'https://catalogo-hx-backend.armando-avila.workers.dev';
  const LSS_URL = 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LSS.pdf';
  const INFONAVIT_URL = 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LIFNVT.pdf';
  const SUA_URL = 'https://www.imss.gob.mx/patrones/sua';
  const money = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(Number(n || 0));
  const num = (n, d = 2) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: d }).format(Number(n || 0));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const token = () => sessionStorage.getItem('hxSessionToken') || '';

  function isAuthenticated() {
    try { return typeof currentUser !== 'undefined' && Boolean(currentUser); }
    catch { return false; }
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${token()}` };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function addStyles() {
    if (document.getElementById('hxLaboralImssStyles')) return;
    const style = document.createElement('style');
    style.id = 'hxLaboralImssStyles';
    style.textContent = `
      #hxlabImssPanel{margin-bottom:14px}.hxli-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:14px}.hxli-card-click{cursor:pointer;transition:transform .16s ease,border-color .16s ease}.hxli-card-click:hover{transform:translateY(-1px);border-color:var(--accent-md)}
      .hxli-result{min-height:340px}.hxli-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:10px 0}.hxli-summary-card{border:1px solid var(--border);border-radius:9px;padding:10px;background:#fafbf9}.hxli-summary-card span{display:block;font-size:8px;letter-spacing:.45px;text-transform:uppercase;color:var(--ink3);font-weight:800}.hxli-summary-card b{display:block;font-size:16px;margin-top:3px;color:var(--ink)}.hxli-summary-card.primary b{color:var(--accent)}
      .hxli-section-title{font-size:10px;font-weight:850;margin:13px 0 5px;color:var(--ink2);text-transform:uppercase;letter-spacing:.4px}.hxli-breakdown{border:1px solid var(--border);border-radius:9px;overflow:hidden}.hxli-brow{display:grid;grid-template-columns:1fr 105px 105px;gap:8px;padding:7px 9px;border-bottom:1px solid #efede8;font-size:9px;align-items:center}.hxli-brow:last-child{border-bottom:0}.hxli-brow strong{text-align:right;font-size:10px}.hxli-brow.head{background:#f7f6f2;font-weight:800;color:var(--ink3)}
      .hxli-chart{display:grid;gap:8px;margin-top:10px}.hxli-chart-row{display:grid;grid-template-columns:100px 1fr 95px;gap:8px;align-items:center;font-size:9px}.hxli-chart-track{height:8px;border-radius:999px;background:#eceae4;overflow:hidden}.hxli-chart-fill{height:100%;border-radius:999px;background:var(--accent)}.hxli-chart-row:nth-child(2) .hxli-chart-fill{background:#b89a50}.hxli-chart-row:nth-child(3) .hxli-chart-fill{background:#1d5d3e}
      .hxli-legal{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.hxli-legal>div{border:1px solid var(--border);border-radius:9px;padding:9px;background:#fff;font-size:9px;line-height:1.45;color:var(--ink3)}.hxli-legal b{display:block;color:var(--ink2);font-size:10px;margin-bottom:2px}.hxli-warn{padding:10px 11px;border-radius:9px;background:#fffaf0;border:1px solid #ead9a5;font-size:9px;line-height:1.5;color:#665b3d;margin-top:10px}.hxli-source{font-size:9px;color:var(--ink3);margin-top:10px;line-height:1.6}.hxli-source a{color:var(--accent);font-weight:750;text-decoration:none}.hxli-risk-note{font-size:9px;color:var(--ink3);line-height:1.4;margin-top:5px}
      @media(max-width:950px){.hxli-grid{grid-template-columns:1fr}}@media(max-width:600px){.hxli-summary,.hxli-legal{grid-template-columns:1fr}.hxli-brow{grid-template-columns:1fr 84px 84px}.hxli-chart-row{grid-template-columns:82px 1fr 82px}}
    `;
    document.head.appendChild(style);
  }

  function payload() {
    return {
      employeeName: document.getElementById('hxliEmployee')?.value.trim() || '',
      monthlySalary: Number(document.getElementById('hxliMonthly')?.value || 0),
      knownSbcDaily: Number(document.getElementById('hxliKnownSbc')?.value || 0),
      region: document.getElementById('hxliRegion')?.value || 'general',
      serviceYear: Number(document.getElementById('hxliServiceYear')?.value || 1),
      aguinaldoDays: Number(document.getElementById('hxliAguinaldo')?.value || 15),
      vacationDays: Number(document.getElementById('hxliVacationDays')?.value || 0),
      vacationPremiumPct: Number(document.getElementById('hxliVacPremium')?.value || 25),
      otherIntegrableDaily: Number(document.getElementById('hxliOtherDaily')?.value || 0),
      daysCotized: Number(document.getElementById('hxliDays')?.value || 30.4),
      riskClass: document.getElementById('hxliRiskClass')?.value || 'I',
      riskPremiumPct: Number(document.getElementById('hxliRiskCustom')?.value || 0),
    };
  }

  function bar(label, value, max) {
    const pct = max > 0 ? Math.max(1, Math.min(100, (value / max) * 100)) : 0;
    return `<div class="hxli-chart-row"><span>${esc(label)}</span><div class="hxli-chart-track"><div class="hxli-chart-fill" style="width:${pct.toFixed(2)}%"></div></div><strong>${money(value)}</strong></div>`;
  }

  function renderResult(result) {
    const root = document.getElementById('hxliResult');
    if (!root) return;
    const s = result.salary || {}, c = result.calculations || {}, a = result.assumptions || {};
    const maxChart = Math.max(c.employerCostMonthly || 0, s.monthly || 0, c.employerSocialBurdenMonthly || 0);
    root.innerHTML = `
      <div class="hxlab-result-tag">RESULTADO ESTIMADO · NO ES DETERMINACIÓN OFICIAL</div>
      <div class="hxlab-total">${money(c.employerCostMonthly)}</div>
      <div class="hxlab-result-sub">Costo patronal mensual estimado · ${esc(result.employeeName || 'Trabajador')} · ${num(a.daysCotized,1)} días de cotización</div>
      <div class="hxli-summary">
        <div class="hxli-summary-card primary"><span>SBC diario</span><b>${money(s.sbcDaily)}</b></div>
        <div class="hxli-summary-card"><span>Factor integración</span><b>${num(s.integrationFactor,6)}</b></div>
        <div class="hxli-summary-card"><span>IMSS patronal mensual</span><b>${money(c.employerImssMonthly)}</b></div>
        <div class="hxli-summary-card"><span>Cuota obrera a retener</span><b>${money(c.workerQuotaWithheldMonthly)}</b></div>
        <div class="hxli-summary-card"><span>INFONAVIT mensual estimado</span><b>${money(c.infonavitMonthly)}</b></div>
        <div class="hxli-summary-card primary"><span>Costo anual estimado</span><b>${money(c.employerCostAnnual)}</b></div>
      </div>
      <div style="font-size:9px;color:var(--ink3);line-height:1.5"><b>Base:</b> ${esc(s.sbcSource)} · Aguinaldo ${num(a.aguinaldoDays)} días · Vacaciones ${num(a.vacationDays)} días · Prima ${num(a.vacationPremiumPct)}% · Riesgo ${esc(a.riskSource)} (${num(a.riskPremiumPct,5)}%) · CEAV ${num(a.ceavEmployerPct,3)}%.</div>
      <div class="hxli-section-title">Comparativo mensual</div>
      <div class="hxli-chart">${bar('Sueldo', s.monthly, maxChart)}${bar('Carga social', c.employerSocialBurdenMonthly, maxChart)}${bar('Costo total', c.employerCostMonthly, maxChart)}</div>
      <div class="hxli-section-title">Cuotas patronales IMSS</div>
      <div class="hxli-breakdown"><div class="hxli-brow head"><span>Concepto</span><strong>Mensual</strong><strong>Anual</strong></div>${(result.employerBreakdown || []).map(x => `<div class="hxli-brow"><span>${esc(x.label)}</span><strong>${money(x.monthly)}</strong><strong>${money(x.annual)}</strong></div>`).join('')}</div>
      <div class="hxli-section-title">Cuotas de la persona trabajadora</div>
      <div class="hxli-breakdown"><div class="hxli-brow head"><span>Concepto</span><strong>Mensual</strong><strong>Anual</strong></div>${(result.workerBreakdown || []).map(x => `<div class="hxli-brow"><span>${esc(x.label)}</span><strong>${money(x.monthly)}</strong><strong>${money(x.annual)}</strong></div>`).join('')}</div>
      ${a.minimumWageWorker ? `<div class="hxli-warn"><b>Art. 36 LSS:</b> el salario diario coincide con el salario mínimo seleccionado. La cuota obrera calculada (${money(c.workerQuotaCalculatedMonthly)}) fue incorporada al costo del patrón y la retención obrera quedó en ${money(c.workerQuotaWithheldMonthly)}.</div>` : ''}
      <div class="hxli-warn">${(result.warnings || []).map(w => `• ${esc(w)}`).join('<br>')}</div>
      <div class="hxli-section-title">Fundamento del cálculo</div>
      <div class="hxli-legal">${(result.legalBasis || []).map(x => `<div><b>${esc(x.concept)}</b>${esc(x.law)} · Arts. ${esc(x.articles)}<br>${esc(x.note)}</div>`).join('')}</div>
      <div class="hxli-source"><b>Versión:</b> ${esc(result.legalVersion || '')}<br><b>Parámetros:</b> ${esc(result.parameterSource || '')}<br><a href="${LSS_URL}" target="_blank" rel="noopener">Ley del Seguro Social</a> · <a href="${INFONAVIT_URL}" target="_blank" rel="noopener">Ley del INFONAVIT</a> · <a href="${SUA_URL}" target="_blank" rel="noopener">SUA · IMSS</a></div>
    `;
  }

  async function calculate() {
    const btn = document.getElementById('hxliCalculate');
    const root = document.getElementById('hxliResult');
    if (!btn || !root) return;
    btn.disabled = true; btn.textContent = 'Calculando…';
    try {
      const data = await api('/laboral/imss-cost', { method: 'POST', body: JSON.stringify(payload()) });
      renderResult(data.result);
    } catch (error) {
      root.innerHTML = `<div class="hxlab-result-empty"><div><b>No fue posible calcular.</b><br>${esc(error.message)}</div></div>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Calcular IMSS / costo';
    }
  }

  function syncRisk() {
    const custom = document.getElementById('hxliRiskCustom');
    const cls = document.getElementById('hxliRiskClass');
    if (!custom || !cls) return;
    cls.disabled = Number(custom.value || 0) > 0;
  }

  function injectPanel(view) {
    if (!isAuthenticated() || document.getElementById('hxlabImssPanel')) return;
    addStyles();
    const cards = [...view.querySelectorAll('.hxlab-status')];
    const imssCard = cards.find(card => /IMSS/i.test(card.querySelector('.hxlab-status-title')?.textContent || ''));
    if (imssCard) {
      imssCard.classList.add('hxli-card-click');
      const pill = imssCard.querySelector('.hxlab-pill');
      if (pill) { pill.textContent = 'BETA ACTIVO'; pill.classList.remove('pending'); }
      const sub = imssCard.querySelector('.hxlab-status-sub');
      if (sub) sub.textContent = 'SBC, cuotas IMSS, INFONAVIT y costo integral';
    }

    const panel = document.createElement('div');
    panel.id = 'hxlabImssPanel'; panel.className = 'hxlab-panel';
    panel.innerHTML = `
      <div class="hxlab-panel-title">🏥 IMSS / Costo Patronal · SBC + cuotas + INFONAVIT</div>
      <div class="hxlab-notice" style="margin-bottom:12px"><div class="hxlab-notice-title">⚠️ RESULTADO ESTIMADO · NO ES DETERMINACIÓN OFICIAL</div><p>Esta herramienta sirve para estimación y planeación. No sustituye SUA, SIPARE, la cédula IMSS, la prima de riesgo vigente del registro patronal ni la determinación oficial de INFONAVIT. Captura el SBC conocido o la prima de riesgo vigente cuando dispongas de ellos.</p></div>
      <div class="hxli-grid">
        <div>
          <div class="hxlab-form">
            <div class="hxlab-field"><label>Trabajador</label><input class="hxlab-input" id="hxliEmployee" placeholder="Nombre"></div>
            <div class="hxlab-field"><label>Sueldo mensual</label><input class="hxlab-input" id="hxliMonthly" type="number" min="0" step="0.01" placeholder="30000"></div>
            <div class="hxlab-field"><label>SBC diario conocido (opcional)</label><input class="hxlab-input" id="hxliKnownSbc" type="number" min="0" step="0.01" placeholder="Si ya lo tienes"></div>
            <div class="hxlab-field"><label>Región salario mínimo</label><select class="hxlab-select" id="hxliRegion"><option value="general">Zona general</option><option value="frontera">ZLFN</option></select></div>
            <div class="hxlab-field"><label>Año de servicio actual</label><input class="hxlab-input" id="hxliServiceYear" type="number" min="1" max="60" step="1" value="1"></div>
            <div class="hxlab-field"><label>Días cotizados del mes</label><input class="hxlab-input" id="hxliDays" type="number" min="1" max="31" step="0.1" value="30.4"></div>
            <div class="hxlab-field"><label>Aguinaldo anual · días</label><input class="hxlab-input" id="hxliAguinaldo" type="number" min="15" step="1" value="15"></div>
            <div class="hxlab-field"><label>Vacaciones anuales · días</label><input class="hxlab-input" id="hxliVacationDays" type="number" min="0" step="1" value="0" placeholder="0 = mínimo legal por antigüedad"></div>
            <div class="hxlab-field"><label>Prima vacacional %</label><input class="hxlab-input" id="hxliVacPremium" type="number" min="25" step="0.01" value="25"></div>
            <div class="hxlab-field"><label>Otros integrables diarios</label><input class="hxlab-input" id="hxliOtherDaily" type="number" min="0" step="0.01" value="0"></div>
            <div class="hxlab-field"><label>Clase de riesgo inicial</label><select class="hxlab-select" id="hxliRiskClass"><option value="I">Clase I · 0.54355%</option><option value="II">Clase II · 1.13065%</option><option value="III">Clase III · 2.59840%</option><option value="IV">Clase IV · 4.65325%</option><option value="V">Clase V · 7.58875%</option></select></div>
            <div class="hxlab-field"><label>Prima de riesgo vigente % (opcional)</label><input class="hxlab-input" id="hxliRiskCustom" type="number" min="0" max="15" step="0.00001" value="0"><div class="hxli-risk-note">Si capturas una prima, sustituye la clase inicial. Rango general Art. 74: 0.5%–15%.</div></div>
            <div class="hxlab-calc-actions"><button class="hxlab-btn primary" id="hxliCalculate">Calcular IMSS / costo</button><span class="hxlab-calc-note">2026 · parámetros versionados</span></div>
          </div>
        </div>
        <div class="hxli-result" id="hxliResult"><div class="hxlab-result-empty"><div>Captura sueldo y condiciones para estimar el SBC y la carga social.<br><br><b>Incluye:</b> IMSS patrón/trabajador, Riesgos de Trabajo, Retiro, CEAV 2026, Guarderías e INFONAVIT 5%.</div></div></div>
      </div>
      <div class="hxli-source"><b>Fuentes primarias:</b> LSS vigente · Cámara de Diputados; régimen gradual CEAV de la reforma pensionaria; Ley del INFONAVIT. Para determinación/pago usa sistemas oficiales del IMSS e INFONAVIT.</div>
    `;

    const sourcebar = view.querySelector('.hxlab-sourcebar');
    if (sourcebar) sourcebar.insertAdjacentElement('beforebegin', panel); else view.appendChild(panel);
    document.getElementById('hxliCalculate')?.addEventListener('click', calculate);
    document.getElementById('hxliRiskCustom')?.addEventListener('input', syncRisk);
    imssCard?.addEventListener('click', () => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    syncRisk();
  }

  function scan() {
    if (!isAuthenticated()) return;
    const view = document.getElementById('hxLaboralView');
    if (view) injectPanel(view);
  }

  function init() {
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
