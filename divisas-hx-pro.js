(() => {
  'use strict';

  const API = 'https://catalogo-hx-backend.armando-avila.workers.dev';
  const SOURCE = 'https://www.eldolar.info/es-MX/mexico/dia/hoy';
  let active = false;
  let refreshTimer = null;
  let opening = false;
  let currentRate = null;
  let hxProvider = { nombre: 'HX', rfc: '', email: '' };
  let lastQuote = null;

  const money = (n, currency = 'MXN') => new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(n || 0));
  const rate4 = n => Number(n || 0).toFixed(4);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token = () => sessionStorage.getItem('hxSessionToken') || '';

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${token()}` };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    try {
      const r = await fetch(`${API}${path}`, { ...options, headers, signal: controller.signal, cache: 'no-store' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.ok === false) throw new Error(data.error || `HTTP ${r.status}`);
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('El servidor tardó demasiado en responder. Intenta actualizar.');
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function addStyles() {
    if (document.getElementById('hxDivisasStyles')) return;
    const s = document.createElement('style');
    s.id = 'hxDivisasStyles';
    s.textContent = `
      #hxDivisasView{display:block;animation:hxFxIn .2s ease}
      @keyframes hxFxIn{from{opacity:.2;transform:translateY(5px)}to{opacity:1;transform:none}}
      .hxfx-head{display:flex;align-items:flex-start;gap:14px;margin-bottom:18px}.hxfx-head h1{font-size:24px;line-height:1.15;margin:0}.hxfx-head p{color:var(--ink3);margin-top:3px}.hxfx-head-actions{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
      .hxfx-btn{border:1px solid var(--border);background:#fff;color:var(--ink2);padding:9px 13px;border-radius:9px;font-weight:650;font-size:12px}.hxfx-btn:hover{border-color:var(--accent-md);color:var(--accent)}.hxfx-btn.primary{background:var(--accent);color:#fff;border-color:var(--accent)}.hxfx-btn.blue{background:#eef2fb;color:#1a3a6c;border-color:#cdd8ef}
      .hxfx-grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}.hxfx-card,.hxfx-panel{background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-sm)}.hxfx-card{padding:15px}.hxfx-card-label{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--ink3);font-weight:700}.hxfx-card-value{font-size:24px;font-weight:800;margin:5px 0 3px}.hxfx-mini{font-size:11px;color:var(--ink3)}.hxfx-live{display:inline-flex;gap:6px;align-items:center;color:var(--accent);font-weight:700}.hxfx-dot{width:7px;height:7px;border-radius:50%;background:#20a464;box-shadow:0 0 0 4px rgba(32,164,100,.1)}
      .hxfx-grid2{display:grid;grid-template-columns:1.05fr .95fr;gap:14px;margin-bottom:14px}.hxfx-panel{padding:16px}.hxfx-panel-title{font-size:14px;font-weight:800;margin-bottom:12px;display:flex;align-items:center;gap:8px}.hxfx-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.hxfx-field label{display:block;font-size:10px;color:var(--ink3);font-weight:700;margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px}.hxfx-input,.hxfx-select{width:100%;border:1px solid var(--border);background:#fff;border-radius:8px;padding:9px 10px;font:inherit;color:var(--ink);outline:none}.hxfx-input:focus,.hxfx-select:focus{border-color:var(--accent-md);box-shadow:0 0 0 3px rgba(45,138,90,.08)}.hxfx-result{grid-column:1/-1;background:var(--accent-lt);border:1px solid #c9e2d4;padding:12px;border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:12px}.hxfx-result strong{font-size:20px;color:var(--accent)}
      .hxfx-summary{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}.hxfx-summary-row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--border);padding:9px 0;font-size:12px}.hxfx-summary-row b{font-weight:750}.hxfx-summary-row .green{color:var(--accent)}.hxfx-actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
      .hxfx-chart{height:220px;border:1px solid var(--border);border-radius:10px;background:linear-gradient(#fff,#fbfcfb);padding:10px}.hxfx-chart svg{width:100%;height:100%;overflow:visible}.hxfx-chart-empty{height:100%;display:flex;align-items:center;justify-content:center;color:var(--ink3)}.hxfx-range{margin-left:auto;display:flex;gap:4px}.hxfx-range button{border:1px solid var(--border);background:#fff;border-radius:7px;padding:5px 9px;font-size:10px}.hxfx-range button.active{background:var(--accent);color:#fff;border-color:var(--accent)}
      .hxfx-table-wrap{overflow:auto}.hxfx-table{width:100%;border-collapse:collapse;font-size:11px}.hxfx-table th{text-align:left;color:var(--ink3);font-size:9px;text-transform:uppercase;letter-spacing:.5px;padding:8px;border-bottom:1px solid var(--border)}.hxfx-table td{padding:8px;border-bottom:1px solid #efede8;white-space:nowrap}.hxfx-table tr:last-child td{border-bottom:0}.hxfx-pill{display:inline-flex;border-radius:999px;padding:3px 7px;font-size:9px;font-weight:800;background:var(--accent-lt);color:var(--accent)}
      .hxfx-alert-form{display:grid;grid-template-columns:1.5fr 1fr 1fr auto;gap:8px;margin-bottom:10px}.hxfx-alert-row{display:grid;grid-template-columns:1.6fr .8fr .7fr auto;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid var(--border);font-size:11px}.hxfx-muted{color:var(--ink3)}.hxfx-error{background:var(--red-lt);color:var(--red);border:1px solid #f0c4bd;border-radius:9px;padding:10px 12px;margin-bottom:12px;display:none}.hxfx-source{display:flex;justify-content:space-between;gap:15px;align-items:center;background:#eff8f2;border:1px solid #cfe7d7;border-radius:11px;padding:12px 14px;font-size:11px;color:var(--ink2)}
      @media(max-width:1100px){.hxfx-grid4{grid-template-columns:repeat(2,1fr)}.hxfx-grid2{grid-template-columns:1fr}.hxfx-form{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:600px){.hxfx-grid4{grid-template-columns:1fr 1fr}.hxfx-form{grid-template-columns:1fr}.hxfx-head{flex-direction:column}.hxfx-head-actions{margin-left:0;width:100%}.hxfx-head-actions .hxfx-btn{flex:1}.hxfx-summary{grid-template-columns:1fr}.hxfx-alert-form,.hxfx-alert-row{grid-template-columns:1fr}.hxfx-result{align-items:flex-start;flex-direction:column}.hxfx-source{align-items:flex-start;flex-direction:column}.hxfx-card-value{font-size:20px}}
    `;
    document.head.appendChild(s);
  }

  function addMenuButton() {
    const sidebar = document.querySelector('.sidebar');
    const admin = document.getElementById('adminSideSection');
    if (!sidebar || document.getElementById('hxDivisasBtn')) return;
    let tools = document.getElementById('hxToolsSideSection');
    if (!tools) {
      tools = document.createElement('div');
      tools.className = 'side-section';
      tools.id = 'hxToolsSideSection';
      tools.innerHTML = '<div class="side-label">HERRAMIENTAS HX</div>';
      sidebar.insertBefore(tools, admin || null);
    }
    const btn = document.createElement('button');
    btn.className = 'side-btn';
    btn.id = 'hxDivisasBtn';
    btn.type = 'button';
    btn.innerHTML = '<span class="side-icon">💱</span> Divisas HX Pro';
    btn.addEventListener('click', openView);
    tools.appendChild(btn);

    document.querySelector('.sidebar')?.addEventListener('click', e => {
      const other = e.target.closest('.side-btn');
      if (active && other && other.id !== 'hxDivisasBtn') closeView();
    }, true);
  }

  function hideOriginal() {
    const main = document.getElementById('mainContent');
    if (!main) return;
    main.classList.remove('hxlab-force', 'hxlab-imss-only');
    main.classList.add('hxfx-only');
  }

  function restoreOriginal() {
    const main = document.getElementById('mainContent');
    if (!main) return;
    main.classList.remove('hxfx-only');
    const view = document.getElementById('hxDivisasView');
    if (view) view.style.display = 'none';
  }

  function closeView() {
    active = false;
    clearInterval(refreshTimer);
    refreshTimer = null;
    document.getElementById('hxDivisasBtn')?.classList.remove('active');
    restoreOriginal();
  }

  function openView() {
    if (opening) return;
    opening = true;
    active = true;
    document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('hxDivisasBtn')?.classList.add('active');
    hideOriginal();
    let view = document.getElementById('hxDivisasView');
    if (!view) {
      view = document.createElement('section');
      view.id = 'hxDivisasView';
      document.getElementById('mainContent')?.appendChild(view);
      renderShell(view);
      bindEvents();
    }
    view.style.display = 'block';
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => active && loadCurrent(false), 420000);

    // La vista queda pintada antes de consultar la red. Esto evita que un API
    // lento o varios MutationObserver bloqueen el clic de navegación.
    window.setTimeout(() => {
      opening = false;
      if (!active) return;
      Promise.allSettled([loadProvider(), loadCurrent(), loadQuotes(), loadAlerts(), loadHistory(7)]);
    }, 0);
  }

  function renderShell(root) {
    root.innerHTML = `
      <div class="hxfx-error" id="hxfxError"></div>
      <div class="hxfx-head">
        <div><h1>💱 Divisas HX Pro</h1><p>Herramienta avanzada de tipo de cambio y cotización</p></div>
        <div class="hxfx-head-actions"><button class="hxfx-btn" id="hxfxRefresh">↻ Actualizar</button><button class="hxfx-btn" id="hxfxSource">↗ eldolar.info</button></div>
      </div>
      <div class="hxfx-grid4">
        <div class="hxfx-card"><div class="hxfx-card-label">USD/MXN hoy</div><div class="hxfx-card-value" id="hxfxAverage">—</div><div class="hxfx-mini">Compra <b id="hxfxBuy">—</b> · Venta <b id="hxfxSell">—</b></div></div>
        <div class="hxfx-card"><div class="hxfx-card-label">Fuente oficial</div><div class="hxfx-card-value" style="font-size:20px">eldolar.info</div><div class="hxfx-mini"><span class="hxfx-live"><span class="hxfx-dot"></span> Actualización cada 7 min</span></div></div>
        <div class="hxfx-card"><div class="hxfx-card-label">Cotizaciones registradas</div><div class="hxfx-card-value" id="hxfxQuoteCount">0</div><div class="hxfx-mini">Con TC congelado</div></div>
        <div class="hxfx-card"><div class="hxfx-card-label">Último tipo usado</div><div class="hxfx-card-value" id="hxfxLastRate">—</div><div class="hxfx-mini" id="hxfxUpdated">Sin actualizar</div></div>
      </div>
      <div class="hxfx-grid2">
        <div class="hxfx-panel">
          <div class="hxfx-panel-title">🧮 Calculadora avanzada</div>
          <div class="hxfx-form">
            <div class="hxfx-field"><label>Proveedor</label><input class="hxfx-input" id="hxfxProvider" value="HX" readonly></div>
            <div class="hxfx-field"><label>Cliente / Proyecto</label><input class="hxfx-input" id="hxfxClient" placeholder="Cliente o proyecto"></div>
            <div class="hxfx-field"><label>Tipo aplicado</label><select class="hxfx-select" id="hxfxRateType"><option value="sell">Venta</option><option value="buy">Compra</option><option value="average">Promedio</option></select></div>
            <div class="hxfx-field"><label>Moneda origen</label><select class="hxfx-select" id="hxfxOrigin"><option>USD</option><option>MXN</option></select></div>
            <div class="hxfx-field"><label>Moneda destino</label><select class="hxfx-select" id="hxfxDestination"><option>MXN</option><option>USD</option></select></div>
            <div class="hxfx-field"><label>Monto</label><input class="hxfx-input" id="hxfxAmount" type="number" min="0" step="0.01" value="10000"></div>
            <div class="hxfx-field"><label>Tipo de cambio</label><input class="hxfx-input" id="hxfxRate" readonly></div>
            <div class="hxfx-field"><label>Ajuste % opcional</label><input class="hxfx-input" id="hxfxAdjustment" type="number" step="0.01" value="0"></div>
            <div class="hxfx-field"><label>RFC proveedor</label><input class="hxfx-input" id="hxfxRfc" readonly></div>
            <div class="hxfx-result"><div><div class="hxfx-mini">Resultado estimado</div><strong id="hxfxCalcResult">—</strong></div><button class="hxfx-btn primary" id="hxfxCreateQuote">Generar cotización con TC actual</button></div>
          </div>
        </div>
        <div class="hxfx-panel">
          <div class="hxfx-panel-title">📄 Resumen de cotización vinculada</div>
          <div id="hxfxSummary"><div class="hxfx-muted">Genera una cotización para congelar el tipo de cambio utilizado.</div></div>
          <div class="hxfx-actions"><button class="hxfx-btn primary" id="hxfxPdf" disabled>Imprimir / PDF</button><button class="hxfx-btn blue" id="hxfxEmail" disabled>Enviar</button></div>
        </div>
      </div>
      <div class="hxfx-grid2">
        <div class="hxfx-panel">
          <div class="hxfx-panel-title">📈 Histórico USD/MXN <div class="hxfx-range"><button class="active" data-days="7">7 días</button><button data-days="30">30 días</button><button data-days="90">90 días</button></div></div>
          <div class="hxfx-chart" id="hxfxChart"><div class="hxfx-chart-empty">Cargando histórico…</div></div>
        </div>
        <div class="hxfx-panel"><div class="hxfx-panel-title">🏦 Comparativo de entidades</div><div class="hxfx-table-wrap"><table class="hxfx-table"><thead><tr><th>Entidad</th><th>Compra</th><th>Venta</th><th>Referencia</th></tr></thead><tbody id="hxfxEntities"><tr><td colspan="4">Cargando…</td></tr></tbody></table></div></div>
      </div>
      <div class="hxfx-grid2">
        <div class="hxfx-panel">
          <div class="hxfx-panel-title">🔔 Alertas y reglas</div>
          <div class="hxfx-alert-form"><input class="hxfx-input" id="hxfxAlertRule" placeholder="Nombre de la alerta"><select class="hxfx-select" id="hxfxAlertCond"><option value="gt">Mayor que</option><option value="lt">Menor que</option><option value="pct">Variación %</option></select><input class="hxfx-input" id="hxfxAlertValue" type="number" step="0.01" placeholder="Valor"><button class="hxfx-btn primary" id="hxfxAddAlert">+ Alerta</button></div>
          <div id="hxfxAlerts"></div>
        </div>
        <div class="hxfx-panel"><div class="hxfx-panel-title">🕘 Historial de cotizaciones con TC</div><div class="hxfx-table-wrap"><table class="hxfx-table"><thead><tr><th>Folio</th><th>Moneda</th><th>Importe</th><th>TC</th><th>Resultado</th><th>Estado</th></tr></thead><tbody id="hxfxQuotes"><tr><td colspan="6">Sin registros</td></tr></tbody></table></div></div>
      </div>
      <div class="hxfx-source"><div><b>Fuente de referencia: eldolar.info</b><br>Datos de referencia; el sistema conserva el TC exacto usado en cada cotización.</div><button class="hxfx-btn" id="hxfxSourceBottom">Abrir eldolar.info ↗</button></div>
    `;
  }

  function bindEvents() {
    document.getElementById('hxfxRefresh').onclick = () => loadCurrent(true);
    document.getElementById('hxfxSource').onclick = document.getElementById('hxfxSourceBottom').onclick = () => window.open(SOURCE, '_blank', 'noopener,noreferrer');
    ['hxfxAmount','hxfxRateType','hxfxOrigin','hxfxDestination','hxfxAdjustment'].forEach(id => document.getElementById(id).addEventListener('input', recalc));
    document.getElementById('hxfxCreateQuote').onclick = createQuote;
    document.getElementById('hxfxPdf').onclick = printQuote;
    document.getElementById('hxfxEmail').onclick = emailQuote;
    document.querySelectorAll('.hxfx-range button').forEach(b => b.onclick = () => { document.querySelectorAll('.hxfx-range button').forEach(x => x.classList.remove('active')); b.classList.add('active'); loadHistory(Number(b.dataset.days)); });
    document.getElementById('hxfxAddAlert').onclick = addAlert;
    document.getElementById('hxfxOrigin').onchange = normalizeCurrencyPair;
    document.getElementById('hxfxDestination').onchange = normalizeCurrencyPair;
  }

  function showError(message) {
    const el = document.getElementById('hxfxError');
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(() => { if (el.textContent === message) el.style.display = 'none'; }, 7000);
  }

  async function loadProvider() {
    try {
      const data = await api('/proveedores');
      const rec = (data.records || []).find(r => {
        const f = r.fields || {};
        return String(f.Empresa || f.Nombre || '').trim().toUpperCase() === 'HX';
      });
      if (rec) hxProvider = { nombre: 'HX', rfc: rec.fields?.RFC || '', email: rec.fields?.Email || '' };
      const rfc = document.getElementById('hxfxRfc'); if (rfc) rfc.value = hxProvider.rfc || 'Sin RFC registrado';
    } catch {}
  }

  async function loadCurrent(force = false) {
    try {
      const data = await api(`/divisas/current${force ? '?refresh=1' : ''}`);
      currentRate = data.data;
      document.getElementById('hxfxAverage').textContent = rate4(currentRate.average);
      document.getElementById('hxfxBuy').textContent = rate4(currentRate.buy);
      document.getElementById('hxfxSell').textContent = rate4(currentRate.sell);
      document.getElementById('hxfxUpdated').textContent = `${currentRate.stale ? 'Último dato disponible' : 'Actualizado'} · ${new Date(currentRate.fetchedAt).toLocaleString('es-MX')}`;
      renderEntities(currentRate.entities || []);
      recalc();
    } catch (e) { showError(`Divisas: ${e.message}`); }
  }

  function selectedRate() {
    if (!currentRate) return 0;
    const t = document.getElementById('hxfxRateType').value;
    return t === 'buy' ? currentRate.buy : t === 'average' ? currentRate.average : currentRate.sell;
  }

  function normalizeCurrencyPair() {
    const a = document.getElementById('hxfxOrigin'), b = document.getElementById('hxfxDestination');
    if (a.value === b.value) b.value = a.value === 'USD' ? 'MXN' : 'USD';
    recalc();
  }

  function recalc() {
    const rate = selectedRate();
    const amount = Number(document.getElementById('hxfxAmount')?.value || 0);
    const origin = document.getElementById('hxfxOrigin')?.value || 'USD';
    const destination = document.getElementById('hxfxDestination')?.value || 'MXN';
    const adj = Number(document.getElementById('hxfxAdjustment')?.value || 0);
    const rateInput = document.getElementById('hxfxRate'); if (rateInput) rateInput.value = rate ? rate4(rate) : '';
    if (!rate || !amount) { document.getElementById('hxfxCalcResult').textContent = '—'; return; }
    let result = origin === 'USD' ? amount * rate : amount / rate;
    result *= 1 + (Number.isFinite(adj) ? adj : 0) / 100;
    document.getElementById('hxfxCalcResult').textContent = money(result, destination);
  }

  function renderEntities(rows) {
    const tbody = document.getElementById('hxfxEntities');
    if (!tbody) return;
    tbody.innerHTML = rows.length ? rows.map(r => `<tr><td>${esc(r.entidad)}</td><td>${r.compra == null ? '—' : rate4(r.compra)}</td><td>${r.venta == null ? '—' : rate4(r.venta)}</td><td>${r.referencia == null ? '—' : rate4(r.referencia)}</td></tr>`).join('') : '<tr><td colspan="4">Sin comparativo disponible en este momento.</td></tr>';
  }

  async function loadHistory(days) {
    const chart = document.getElementById('hxfxChart'); if (!chart) return;
    chart.innerHTML = '<div class="hxfx-chart-empty">Cargando histórico…</div>';
    try {
      const data = await api(`/divisas/history?days=${days}`);
      renderChart(data.points || []);
    } catch (e) { chart.innerHTML = `<div class="hxfx-chart-empty">${esc(e.message)}</div>`; }
  }

  function renderChart(points) {
    const box = document.getElementById('hxfxChart');
    if (!points.length) { box.innerHTML = '<div class="hxfx-chart-empty">Sin datos históricos disponibles.</div>'; return; }
    const values = points.map(p => Number(p.average));
    const min = Math.min(...values), max = Math.max(...values), span = Math.max(.01, max - min);
    const coords = values.map((v, i) => `${12 + (i / Math.max(1, values.length - 1)) * 576},${185 - ((v - min) / span) * 155}`);
    const labels = points.filter((_, i) => i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 4) === 0).map((p, i, arr) => {
      const idx = points.indexOf(p), x = 12 + (idx / Math.max(1, points.length - 1)) * 576;
      return `<text x="${x}" y="198" text-anchor="middle" font-size="9" fill="#8a8784">${p.date.slice(5)}</text>`;
    }).join('');
    box.innerHTML = `<svg viewBox="0 0 600 205" preserveAspectRatio="none"><defs><linearGradient id="hxfxFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d8a5a" stop-opacity=".24"/><stop offset="1" stop-color="#2d8a5a" stop-opacity="0"/></linearGradient></defs><line x1="12" y1="30" x2="588" y2="30" stroke="#ece9e3"/><line x1="12" y1="108" x2="588" y2="108" stroke="#ece9e3"/><line x1="12" y1="185" x2="588" y2="185" stroke="#ece9e3"/><polygon points="12,185 ${coords.join(' ')} 588,185" fill="url(#hxfxFill)"/><polyline points="${coords.join(' ')}" fill="none" stroke="#1a7a48" stroke-width="2.5" vector-effect="non-scaling-stroke"/>${labels}<text x="14" y="20" font-size="9" fill="#8a8784">Máx ${max.toFixed(4)}</text><text x="14" y="180" font-size="9" fill="#8a8784">Mín ${min.toFixed(4)}</text></svg>`;
  }

  async function createQuote() {
    if (!currentRate) return showError('Primero carga el tipo de cambio actual.');
    const btn = document.getElementById('hxfxCreateQuote');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const payload = {
        provider: 'HX', rfc: hxProvider.rfc || '',
        clientProject: document.getElementById('hxfxClient').value.trim(),
        origin: document.getElementById('hxfxOrigin').value,
        destination: document.getElementById('hxfxDestination').value,
        amount: Number(document.getElementById('hxfxAmount').value),
        rateType: document.getElementById('hxfxRateType').value,
        adjustmentPct: Number(document.getElementById('hxfxAdjustment').value || 0),
      };
      const data = await api('/divisas/quotes', { method: 'POST', body: JSON.stringify(payload) });
      lastQuote = data.record;
      renderSummary(lastQuote);
      document.getElementById('hxfxPdf').disabled = false;
      document.getElementById('hxfxEmail').disabled = false;
      await loadQuotes();
    } catch (e) { showError(`Cotización: ${e.message}`); }
    finally { btn.disabled = false; btn.textContent = 'Generar cotización con TC actual'; }
  }

  function renderSummary(record) {
    const f = record?.fields || {};
    document.getElementById('hxfxSummary').innerHTML = `<div class="hxfx-summary">
      <div><div class="hxfx-summary-row"><span>Proveedor</span><b>${esc(f.Proveedor || 'HX')}</b></div><div class="hxfx-summary-row"><span>RFC</span><b>${esc(f.RFC || '—')}</b></div><div class="hxfx-summary-row"><span>Importe original</span><b>${money(f.ImporteOriginal, f.MonedaOrigen || 'USD')}</b></div><div class="hxfx-summary-row"><span>TC usado</span><b class="green">${rate4(f.TipoCambioUsado)}</b></div></div>
      <div><div class="hxfx-summary-row"><span>Fuente</span><b>eldolar.info</b></div><div class="hxfx-summary-row"><span>Tipo</span><b>${esc(f.TipoAplicado || '')}</b></div><div class="hxfx-summary-row"><span>Resultado</span><b class="green">${money(f.ResultadoConvertido, f.MonedaDestino || 'MXN')}</b></div><div class="hxfx-summary-row"><span>Folio</span><b>${esc(f.Folio || '')}</b></div></div>
    </div>`;
  }

  async function loadQuotes() {
    try {
      const data = await api('/divisas/quotes');
      const rows = data.records || [];
      document.getElementById('hxfxQuoteCount').textContent = rows.length;
      if (rows[0]?.fields?.TipoCambioUsado) document.getElementById('hxfxLastRate').textContent = rate4(rows[0].fields.TipoCambioUsado);
      document.getElementById('hxfxQuotes').innerHTML = rows.length ? rows.slice(0, 12).map(r => { const f = r.fields || {}; return `<tr><td><b>${esc(f.Folio || '')}</b></td><td>${esc(f.MonedaOrigen || '')}→${esc(f.MonedaDestino || '')}</td><td>${money(f.ImporteOriginal, f.MonedaOrigen || 'USD')}</td><td>${rate4(f.TipoCambioUsado)}</td><td>${money(f.ResultadoConvertido, f.MonedaDestino || 'MXN')}</td><td><span class="hxfx-pill">${esc(f.Estado?.name || f.Estado || 'Borrador')}</span></td></tr>`; }).join('') : '<tr><td colspan="6">Sin cotizaciones registradas.</td></tr>';
    } catch (e) { showError(`Historial: ${e.message}`); }
  }

  async function addAlert() {
    const value = Number(document.getElementById('hxfxAlertValue').value);
    if (!Number.isFinite(value)) return showError('Escribe un valor válido para la alerta.');
    try {
      await api('/divisas/alerts', { method: 'POST', body: JSON.stringify({ rule: document.getElementById('hxfxAlertRule').value.trim() || 'Alerta USD/MXN', condition: document.getElementById('hxfxAlertCond').value, value, channel: 'Panel' }) });
      document.getElementById('hxfxAlertRule').value = ''; document.getElementById('hxfxAlertValue').value = '';
      await loadAlerts();
    } catch (e) { showError(`Alerta: ${e.message}`); }
  }

  async function loadAlerts() {
    try {
      const data = await api('/divisas/alerts');
      const rows = data.records || [];
      document.getElementById('hxfxAlerts').innerHTML = rows.length ? rows.map(r => { const f = r.fields || {}; const cond = f.Condicion === 'gt' ? 'Mayor a' : f.Condicion === 'lt' ? 'Menor a' : 'Variación %'; return `<div class="hxfx-alert-row"><div><b>${esc(f.Regla || '')}</b><div class="hxfx-muted">${cond} ${esc(f.Valor)}</div></div><div><span class="hxfx-pill">${esc(f.Estado?.name || f.Estado || 'Activa')}</span></div><div class="hxfx-muted">${esc(f.MedioNotificacion || 'Panel')}</div><button class="hxfx-btn" data-delete-alert="${r.id}">Eliminar</button></div>`; }).join('') : '<div class="hxfx-muted">No hay alertas configuradas.</div>';
      document.querySelectorAll('[data-delete-alert]').forEach(b => b.onclick = async () => { try { await api('/divisas/alerts', { method: 'DELETE', body: JSON.stringify({ recordId: b.dataset.deleteAlert }) }); await loadAlerts(); } catch (e) { showError(e.message); } });
    } catch (e) { showError(`Alertas: ${e.message}`); }
  }

  function printQuote() {
    const f = lastQuote?.fields; if (!f) return;
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${esc(f.Folio)}</title><style>body{font-family:Arial;padding:40px;color:#222}h1{color:#1a5c3a}table{width:100%;border-collapse:collapse}td{padding:10px;border-bottom:1px solid #ddd}.total{font-size:24px;color:#1a5c3a;font-weight:bold}</style></head><body><h1>Cotización ${esc(f.Folio)}</h1><p>Proveedor: <b>${esc(f.Proveedor || 'HX')}</b></p><table><tr><td>Importe original</td><td>${money(f.ImporteOriginal,f.MonedaOrigen)}</td></tr><tr><td>Tipo de cambio</td><td>${rate4(f.TipoCambioUsado)} (${esc(f.TipoAplicado)})</td></tr><tr><td>Fuente</td><td>eldolar.info</td></tr><tr><td>Fecha</td><td>${esc(f.FechaHora || '')}</td></tr><tr><td>Resultado</td><td class="total">${money(f.ResultadoConvertido,f.MonedaDestino)}</td></tr></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  function emailQuote() {
    const f = lastQuote?.fields; if (!f) return;
    const subject = `Cotización ${f.Folio} · HX`;
    const body = `Cotización ${f.Folio}\nProveedor: HX\nImporte: ${money(f.ImporteOriginal,f.MonedaOrigen)}\nTC usado: ${rate4(f.TipoCambioUsado)} (${f.TipoAplicado})\nResultado: ${money(f.ResultadoConvertido,f.MonedaDestino)}\nFuente: eldolar.info`;
    const to = hxProvider.email || '';
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function init() {
    addStyles();
    addMenuButton();
    if (!document.getElementById('hxDivisasBtn')) {
      const obs = new MutationObserver(() => {
        addMenuButton();
        if (document.getElementById('hxDivisasBtn')) obs.disconnect();
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  init();
})();
