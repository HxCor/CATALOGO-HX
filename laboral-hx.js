(() => {
  'use strict';

  const API = 'https://catalogo-hx-backend.armando-avila.workers.dev';
  const LFT_URL = 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf';
  const UMA_URL = 'https://sc.inegi.org.mx/repositorioNormateca/UMA.pdf';
  const SMG_URL = 'https://www.gob.mx/conasami/articulos/incremento-a-los-salarios-minimos-para-2026';
  const FALLBACK = {
    UMA_DIARIA_2026: 117.31,
    UMA_MENSUAL_2026: 3566.22,
    UMA_ANUAL_2026: 42794.64,
    SMG_GENERAL_2026: 315.04,
    SMG_FRONTERA_2026: 440.87,
    AGUINALDO_MIN_DIAS: 15,
    PRIMA_VACACIONAL_MIN_PCT: 25,
    PRIMA_ANTIGUEDAD_DIAS_ANIO: 12,
  };

  let active = false;
  let parameters = { ...FALLBACK };
  let lastResult = null;

  const money = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(Number(n || 0));
  const number = (n, digits = 2) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(Number(n || 0));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const token = () => sessionStorage.getItem('hxSessionToken') || '';

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${token()}` };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function addStyles() {
    if (document.getElementById('hxLaboralStyles')) return;
    const style = document.createElement('style');
    style.id = 'hxLaboralStyles';
    style.textContent = `
      #hxLaboralView{display:block;animation:hxLabIn .2s ease}
      @keyframes hxLabIn{from{opacity:.2;transform:translateY(5px)}to{opacity:1;transform:none}}
      .hxlab-head{display:flex;gap:16px;align-items:flex-start;margin-bottom:18px}.hxlab-head h1{font-size:24px;line-height:1.15;margin:0}.hxlab-head p{color:var(--ink3);margin:4px 0 0}.hxlab-head-actions{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
      .hxlab-btn{border:1px solid var(--border);background:#fff;color:var(--ink2);padding:9px 13px;border-radius:9px;font-weight:650;font-size:12px}.hxlab-btn:hover{border-color:var(--accent-md);color:var(--accent)}.hxlab-btn.primary{background:var(--accent);color:#fff;border-color:var(--accent)}.hxlab-btn:disabled{opacity:.5;cursor:not-allowed}
      .hxlab-status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}.hxlab-status{background:#fff;border:1px solid var(--border);border-radius:12px;padding:15px;box-shadow:var(--shadow-sm)}.hxlab-status-top{display:flex;align-items:center;gap:10px}.hxlab-status-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--accent-lt);font-size:18px}.hxlab-status-title{font-weight:800;font-size:13px}.hxlab-status-sub{font-size:10px;color:var(--ink3);margin-top:3px}.hxlab-pill{display:inline-flex;margin-top:10px;border-radius:999px;padding:3px 8px;font-size:9px;font-weight:800;background:var(--accent-lt);color:var(--accent)}.hxlab-pill.pending{background:#f5f2e9;color:#8a6b15}
      .hxlab-params{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.hxlab-param{background:#fff;border:1px solid var(--border);border-radius:10px;padding:12px}.hxlab-param span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--ink3);font-weight:700}.hxlab-param b{display:block;margin-top:4px;font-size:17px}.hxlab-param small{font-size:9px;color:var(--ink3)}
      .hxlab-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:14px;margin-bottom:14px}.hxlab-panel{background:#fff;border:1px solid var(--border);border-radius:12px;padding:16px;box-shadow:var(--shadow-sm)}.hxlab-panel-title{font-size:14px;font-weight:800;margin-bottom:12px}.hxlab-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.hxlab-field label{display:block;font-size:9px;color:var(--ink3);font-weight:750;margin-bottom:5px;text-transform:uppercase;letter-spacing:.45px}.hxlab-input,.hxlab-select{width:100%;border:1px solid var(--border);background:#fff;border-radius:8px;padding:9px 10px;font:inherit;color:var(--ink);outline:none}.hxlab-input:focus,.hxlab-select:focus{border-color:var(--accent-md);box-shadow:0 0 0 3px rgba(45,138,90,.08)}.hxlab-check{display:flex;align-items:center;gap:8px;min-height:38px;border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:11px;color:var(--ink2)}
      .hxlab-calc-actions{grid-column:1/-1;display:flex;gap:8px;align-items:center;margin-top:4px}.hxlab-calc-note{font-size:10px;color:var(--ink3);margin-left:auto}.hxlab-error{display:none;background:var(--red-lt);color:var(--red);border:1px solid #f0c4bd;border-radius:9px;padding:10px 12px;margin-bottom:12px;font-size:11px}
      .hxlab-result-empty{min-height:230px;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--ink3);font-size:12px;padding:20px}.hxlab-result-tag{font-size:9px;font-weight:850;letter-spacing:.6px;color:#8a6610;text-transform:uppercase}.hxlab-total{font-size:32px;font-weight:850;color:var(--accent);line-height:1.1;margin:6px 0 4px}.hxlab-result-sub{font-size:10px;color:var(--ink3);margin-bottom:12px}.hxlab-breakdown{border-top:1px solid var(--border)}.hxlab-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #efede8;font-size:11px}.hxlab-row strong{font-weight:750}.hxlab-row.total{font-size:13px;border-bottom:0;padding-top:11px}.hxlab-row.total strong{color:var(--accent);font-size:15px}
      .hxlab-notice{border:1px solid #ead9a5;background:#fffaf0;border-radius:11px;padding:13px 14px;margin-bottom:14px}.hxlab-notice-title{font-size:11px;font-weight:850;color:#7a5c08;margin-bottom:4px}.hxlab-notice p{font-size:10px;line-height:1.55;color:#665b3d;margin:0}.hxlab-legal{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.hxlab-legal-card{border:1px solid var(--border);border-radius:10px;padding:12px;background:#fff}.hxlab-legal-card b{font-size:11px}.hxlab-legal-card div{font-size:10px;color:var(--ink3);margin-top:3px}.hxlab-legal-card small{display:block;margin-top:5px;color:var(--ink2);font-size:9px;line-height:1.45}.hxlab-sourcebar{display:flex;gap:10px;justify-content:space-between;align-items:center;background:#eff8f2;border:1px solid #cfe7d7;border-radius:11px;padding:11px 13px;font-size:10px;color:var(--ink2)}.hxlab-sourcebar-links{display:flex;gap:8px;flex-wrap:wrap}.hxlab-sourcebar a{color:var(--accent);font-weight:750;text-decoration:none}
      @media(max-width:1100px){.hxlab-status-grid,.hxlab-params{grid-template-columns:repeat(2,1fr)}.hxlab-grid{grid-template-columns:1fr}.hxlab-form{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:600px){.hxlab-head{flex-direction:column}.hxlab-head-actions{margin-left:0;width:100%}.hxlab-head-actions .hxlab-btn{flex:1}.hxlab-status-grid,.hxlab-params{grid-template-columns:1fr 1fr}.hxlab-form{grid-template-columns:1fr}.hxlab-calc-actions{align-items:stretch;flex-direction:column}.hxlab-calc-note{margin-left:0}.hxlab-legal{grid-template-columns:1fr}.hxlab-sourcebar{align-items:flex-start;flex-direction:column}.hxlab-total{font-size:28px}}
    `;
    document.head.appendChild(style);
  }

  function addMenuButton() {
    const admin = document.getElementById('adminSideSection');
    if (!admin || document.getElementById('hxLaboralBtn')) return false;
    const btn = document.createElement('button');
    btn.className = 'side-btn';
    btn.id = 'hxLaboralBtn';
    btn.type = 'button';
    btn.innerHTML = '<span class="side-icon">⚖️</span> Laboral HX';
    btn.addEventListener('click', openView);
    admin.appendChild(btn);

    document.querySelector('.sidebar')?.addEventListener('click', event => {
      const other = event.target.closest('.side-btn');
      if (active && other && other.id !== 'hxLaboralBtn') closeView();
    }, true);
    return true;
  }

  function hideOriginal() {
    const main = document.getElementById('mainContent');
    if (!main) return;
    [...main.children].forEach(el => {
      if (el.id === 'hxLaboralView') return;
      if (!el.hasAttribute('data-hxlab-old-display')) el.setAttribute('data-hxlab-old-display', el.style.display || '');
      el.style.display = 'none';
    });
  }

  function restoreOriginal() {
    const main = document.getElementById('mainContent');
    if (!main) return;
    [...main.children].forEach(el => {
      if (el.id === 'hxLaboralView') { el.style.display = 'none'; return; }
      if (el.hasAttribute('data-hxlab-old-display')) {
        el.style.display = el.getAttribute('data-hxlab-old-display');
        el.removeAttribute('data-hxlab-old-display');
      }
    });
  }

  function closeView() {
    active = false;
    document.getElementById('hxLaboralBtn')?.classList.remove('active');
    restoreOriginal();
  }

  async function openView() {
    active = true;
    document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('hxLaboralBtn')?.classList.add('active');
    hideOriginal();
    let view = document.getElementById('hxLaboralView');
    if (!view) {
      view = document.createElement('section');
      view.id = 'hxLaboralView';
      document.getElementById('mainContent')?.appendChild(view);
      renderShell(view);
      bindEvents();
    }
    view.style.display = 'block';
    await loadParameters();
  }

  function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function renderShell(root) {
    root.innerHTML = `
      <div class="hxlab-error" id="hxlabError"></div>
      <div class="hxlab-head">
        <div><h1>⚖️ Laboral HX</h1><p>Cálculos laborales informativos con fundamento legal mexicano y parámetros versionados.</p></div>
        <div class="hxlab-head-actions"><button class="hxlab-btn" id="hxlabReload">↻ Actualizar parámetros</button><button class="hxlab-btn" id="hxlabLft">↗ Ley Federal del Trabajo</button></div>
      </div>

      <div class="hxlab-status-grid">
        <div class="hxlab-status"><div class="hxlab-status-top"><div class="hxlab-status-icon">👤</div><div><div class="hxlab-status-title">Renuncia voluntaria</div><div class="hxlab-status-sub">Finiquito estimado y desglose</div></div></div><span class="hxlab-pill">ACTIVO</span></div>
        <div class="hxlab-status"><div class="hxlab-status-top"><div class="hxlab-status-icon">🎁</div><div><div class="hxlab-status-title">Prestaciones</div><div class="hxlab-status-sub">Aguinaldo, vacaciones y prima</div></div></div><span class="hxlab-pill">ACTIVO</span></div>
        <div class="hxlab-status"><div class="hxlab-status-top"><div class="hxlab-status-icon">📋</div><div><div class="hxlab-status-title">Despido</div><div class="hxlab-status-sub">Motor por supuesto jurídico</div></div></div><span class="hxlab-pill pending">EN VALIDACIÓN</span></div>
        <div class="hxlab-status"><div class="hxlab-status-top"><div class="hxlab-status-icon">🏥</div><div><div class="hxlab-status-title">IMSS / costo patronal</div><div class="hxlab-status-sub">SBC, cuotas y costo integral</div></div></div><span class="hxlab-pill pending">SIGUIENTE ETAPA</span></div>
      </div>

      <div class="hxlab-params">
        <div class="hxlab-param"><span>UMA diaria 2026</span><b id="hxlabUma">$117.31</b><small>INEGI · vigente desde 01/02/2026</small></div>
        <div class="hxlab-param"><span>Salario mínimo general</span><b id="hxlabSmg">$315.04</b><small>CONASAMI · 2026</small></div>
        <div class="hxlab-param"><span>ZLFN</span><b id="hxlabSmgF">$440.87</b><small>CONASAMI · 2026</small></div>
        <div class="hxlab-param"><span>Versión legal</span><b style="font-size:13px" id="hxlabVersion">LFT 14-05-2026</b><small id="hxlabParamSource">Parámetros locales seguros</small></div>
      </div>

      <div class="hxlab-notice">
        <div class="hxlab-notice-title">⚠️ RESULTADO ESTIMADO · NO ES DETERMINACIÓN OFICIAL</div>
        <p>Los cálculos de Laboral HX tienen fines exclusivamente informativos y estimativos. No constituyen asesoría jurídica, laboral, fiscal o contable, ni una determinación oficial de autoridad; tampoco deben utilizarse por sí solos para exigir, reclamar o acreditar el pago de una cantidad. El resultado depende de los datos capturados y de las circunstancias particulares de la relación laboral.</p>
      </div>

      <div class="hxlab-grid">
        <div class="hxlab-panel">
          <div class="hxlab-panel-title">🧮 Calculadora laboral</div>
          <div class="hxlab-form">
            <div class="hxlab-field"><label>Tipo de cálculo</label><select class="hxlab-select" id="hxlabScenario"><option value="renuncia">Renuncia voluntaria</option><option value="prestaciones">Prestaciones proporcionales</option></select></div>
            <div class="hxlab-field"><label>Empleado</label><input class="hxlab-input" id="hxlabEmployee" placeholder="Nombre opcional"></div>
            <div class="hxlab-field"><label>Zona salarial</label><select class="hxlab-select" id="hxlabRegion"><option value="general">Zona general</option><option value="frontera">Zona Libre Frontera Norte</option></select></div>
            <div class="hxlab-field"><label>Fecha de ingreso</label><input class="hxlab-input" id="hxlabStart" type="date"></div>
            <div class="hxlab-field"><label>Fecha de baja / corte</label><input class="hxlab-input" id="hxlabEnd" type="date" value="${todayIso()}"></div>
            <div class="hxlab-field"><label>Sueldo mensual bruto</label><input class="hxlab-input" id="hxlabMonthly" type="number" min="0" step="0.01" placeholder="Ej. 25000"></div>
            <div class="hxlab-field"><label>Días sueldo pendientes</label><input class="hxlab-input" id="hxlabUnpaidDays" type="number" min="0" step="0.01" value="0"></div>
            <div class="hxlab-field"><label>Vacaciones pendientes devengadas</label><input class="hxlab-input" id="hxlabPendingVacation" type="number" min="0" step="0.01" value="0"></div>
            <div class="hxlab-field"><label>Días aguinaldo contractual</label><input class="hxlab-input" id="hxlabAguinaldo" type="number" min="15" step="0.01" value="15"></div>
            <div class="hxlab-field"><label>Prima vacacional %</label><input class="hxlab-input" id="hxlabVacationPremium" type="number" min="25" step="0.01" value="25"></div>
            <div class="hxlab-field"><label>Vacaciones contractuales / año</label><input class="hxlab-input" id="hxlabContractVacation" type="number" min="0" step="0.01" placeholder="Vacío = mínimo legal"></div>
            <div class="hxlab-field"><label>Prima de antigüedad</label><label class="hxlab-check"><input id="hxlabPlant" type="checkbox" checked> Trabajador de planta</label></div>
            <div class="hxlab-calc-actions"><button class="hxlab-btn primary" id="hxlabCalculate">Calcular</button><div class="hxlab-calc-note">El motor aplica mínimos legales cuando capturas una prestación inferior.</div></div>
          </div>
        </div>

        <div class="hxlab-panel">
          <div class="hxlab-panel-title">📄 Resultado</div>
          <div id="hxlabResult"><div class="hxlab-result-empty">Captura los datos del trabajador y selecciona <b style="margin-left:4px">Calcular</b>.</div></div>
        </div>
      </div>

      <div class="hxlab-panel" style="margin-bottom:14px">
        <div class="hxlab-panel-title">⚖ Fundamentos del cálculo</div>
        <div class="hxlab-legal" id="hxlabLegal">
          <div class="hxlab-legal-card"><b>Vacaciones</b><div>LFT · Arts. 76 y 79</div><small>Periodo mínimo según antigüedad y remuneración proporcional cuando termina la relación laboral.</small></div>
          <div class="hxlab-legal-card"><b>Prima vacacional</b><div>LFT · Art. 80</div><small>Prima no menor al 25% sobre los salarios correspondientes al periodo de vacaciones.</small></div>
          <div class="hxlab-legal-card"><b>Aguinaldo</b><div>LFT · Art. 87</div><small>Mínimo 15 días de salario y parte proporcional cuando no se labora el año completo.</small></div>
          <div class="hxlab-legal-card"><b>Prima de antigüedad</b><div>LFT · Arts. 162, 485 y 486</div><small>12 días por año; en retiro voluntario exige al menos 15 años de servicio y utiliza el tope salarial previsto en la Ley.</small></div>
        </div>
      </div>

      <div class="hxlab-sourcebar">
        <div><b>Fuentes oficiales:</b> Cámara de Diputados · INEGI · CONASAMI. Parámetros 2026 versionados.</div>
        <div class="hxlab-sourcebar-links"><a href="${LFT_URL}" target="_blank" rel="noopener">LFT</a><a href="${UMA_URL}" target="_blank" rel="noopener">UMA 2026</a><a href="${SMG_URL}" target="_blank" rel="noopener">Salarios mínimos 2026</a></div>
      </div>
    `;
  }

  function bindEvents() {
    document.getElementById('hxlabReload')?.addEventListener('click', loadParameters);
    document.getElementById('hxlabLft')?.addEventListener('click', () => window.open(LFT_URL, '_blank', 'noopener'));
    document.getElementById('hxlabCalculate')?.addEventListener('click', calculate);
  }

  function showError(message) {
    const box = document.getElementById('hxlabError');
    if (!box) return;
    box.textContent = message;
    box.style.display = 'block';
    setTimeout(() => { if (box.textContent === message) box.style.display = 'none'; }, 7000);
  }

  async function loadParameters() {
    const source = document.getElementById('hxlabParamSource');
    try {
      if (source) source.textContent = 'Actualizando…';
      const data = await api('/laboral/parameters');
      parameters = { ...FALLBACK, ...(data.values || {}) };
      document.getElementById('hxlabUma').textContent = money(parameters.UMA_DIARIA_2026);
      document.getElementById('hxlabSmg').textContent = money(parameters.SMG_GENERAL_2026);
      document.getElementById('hxlabSmgF').textContent = money(parameters.SMG_FRONTERA_2026);
      document.getElementById('hxlabVersion').textContent = 'LFT 14-05-2026';
      if (source) source.textContent = data.source || 'LABORAL_PARAMETROS';
    } catch (error) {
      if (source) source.textContent = 'Fallback seguro · 2026';
      showError(`No se pudieron actualizar los parámetros: ${error.message}`);
    }
  }

  function formPayload() {
    return {
      scenario: document.getElementById('hxlabScenario').value,
      employeeName: document.getElementById('hxlabEmployee').value.trim(),
      region: document.getElementById('hxlabRegion').value,
      startDate: document.getElementById('hxlabStart').value,
      endDate: document.getElementById('hxlabEnd').value,
      monthlySalary: Number(document.getElementById('hxlabMonthly').value || 0),
      unpaidSalaryDays: Number(document.getElementById('hxlabUnpaidDays').value || 0),
      pendingVacationDays: Number(document.getElementById('hxlabPendingVacation').value || 0),
      aguinaldoDays: Number(document.getElementById('hxlabAguinaldo').value || 15),
      vacationPremiumPct: Number(document.getElementById('hxlabVacationPremium').value || 25),
      contractualVacationDays: Number(document.getElementById('hxlabContractVacation').value || 0),
      plantWorker: document.getElementById('hxlabPlant').checked,
    };
  }

  async function calculate() {
    const button = document.getElementById('hxlabCalculate');
    const root = document.getElementById('hxlabResult');
    if (!button || !root) return;
    button.disabled = true;
    button.textContent = 'Calculando…';
    try {
      const data = await api('/laboral/calculate', { method: 'POST', body: JSON.stringify(formPayload()) });
      lastResult = data.result;
      renderResult(lastResult, data.parametersSource);
    } catch (error) {
      showError(error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Calcular';
    }
  }

  function renderResult(result, source) {
    const root = document.getElementById('hxlabResult');
    if (!root) return;
    const c = result.calculations || {};
    const i = result.inputsApplied || {};
    const service = result.service || {};
    const seniorityText = c.seniorityEligible ? money(c.primaAntiguedad) : 'No aplica';
    root.innerHTML = `
      <div class="hxlab-result-tag">Resultado estimado · no es determinación oficial</div>
      <div class="hxlab-total">${money(c.total)}</div>
      <div class="hxlab-result-sub">${esc(result.employeeName || 'Trabajador')} · ${esc(result.startDate)} → ${esc(result.endDate)} · ${number(service.exactYears, 2)} años de servicio</div>
      <div class="hxlab-breakdown">
        <div class="hxlab-row"><span>Sueldo pendiente (${number(i.unpaidSalaryDays)} días)</span><strong>${money(c.salaryPending)}</strong></div>
        <div class="hxlab-row"><span>Aguinaldo proporcional (${number(i.aguinaldoDays)} días/año)</span><strong>${money(c.aguinaldo)}</strong></div>
        <div class="hxlab-row"><span>Vacaciones (${number(c.vacationTotalDays, 3)} días calculados)</span><strong>${money(c.vacaciones)}</strong></div>
        <div class="hxlab-row"><span>Prima vacacional (${number(i.vacationPremiumPct)}%)</span><strong>${money(c.primaVacacional)}</strong></div>
        <div class="hxlab-row"><span>Prima de antigüedad</span><strong>${seniorityText}</strong></div>
        <div class="hxlab-row total"><span>Total bruto estimado</span><strong>${money(c.total)}</strong></div>
      </div>
      <div style="margin-top:11px;padding:10px;border-radius:9px;background:var(--surface2);font-size:9px;color:var(--ink3);line-height:1.5">
        Vacaciones mínimas aplicables al año de servicio actual: <b>${number(i.legalVacationDays)} días</b>. Fuente de parámetros: <b>${esc(source || '2026')}</b>. No incluye ISR, retenciones, adeudos particulares, comisiones/bonos no capturados ni indemnizaciones por despido.
      </div>
    `;

    const legal = document.getElementById('hxlabLegal');
    if (legal && Array.isArray(result.legalBasis)) {
      legal.innerHTML = result.legalBasis.map(item => `
        <div class="hxlab-legal-card"><b>${esc(item.concept)}</b><div>${esc(item.law)} · Art. ${esc(item.articles)}</div><small>${esc(item.note)}</small></div>
      `).join('');
    }
  }

  function init() {
    addStyles();
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (addMenuButton() || attempts > 30) clearInterval(timer);
    }, 200);
    addMenuButton();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();