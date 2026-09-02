(() => {
  'use strict';

  const API = 'https://catalogo-hx-backend.armando-avila.workers.dev';
  const MAX_BYTES = 8 * 1024 * 1024;
  const DEFINITIONS = [
    { key: 'ACTA_CONSTITUTIVA', label: 'Acta constitutiva', icon: '📘', sensitive: false },
    { key: 'INE_REPRESENTANTE', label: 'INE del representante legal', icon: '🪪', sensitive: true },
    { key: 'COMPROBANTE_DOMICILIO', label: 'Comprobante de domicilio', icon: '🏠', sensitive: false },
    { key: 'OPINION_CUMPLIMIENTO', label: 'Opinión de cumplimiento', icon: '✅', sensitive: false },
    { key: 'CARATULA_BANCARIA', label: 'Carátula bancaria', icon: '🏦', sensitive: true, bank: true },
  ];
  let selectedProvider = null;
  let selectedDefinition = null;
  let selectedBankId = '';
  let previewUrl = '';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  function currentRole() {
    try { return typeof currentUser !== 'undefined' ? String(currentUser?.rol || '') : ''; } catch { return ''; }
  }

  function sessionFetch(path, options = {}) {
    const token = sessionStorage.getItem('hxSessionToken') || '';
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API}${path}`, { ...options, headers });
  }

  function notify(message, type = 'success') {
    if (typeof showToast === 'function') showToast(message, type);
  }

  function ensureStyles() {
    if (document.getElementById('hx-expediente-styles')) return;
    const style = document.createElement('style');
    style.id = 'hx-expediente-styles';
    style.textContent = `
      .hx-expediente-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}
      .hx-expediente-sub{font-size:12px;color:var(--ink3);line-height:1.45;margin-top:4px}
      .hx-expediente-progress{flex:0 0 auto;padding:6px 10px;border:1px solid var(--border);border-radius:999px;background:var(--surface2);font-size:11px;font-weight:800;color:var(--ink2);font-variant-numeric:tabular-nums}
      .hx-doc-list{display:grid;gap:10px}
      .hx-doc-card{border:1px solid var(--border);border-radius:16px;background:#fff;padding:13px;box-shadow:0 4px 14px rgba(20,18,14,.04)}
      .hx-doc-main{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:10px}
      .hx-doc-icon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--surface2);font-size:18px}
      .hx-doc-title{font-size:13px;font-weight:800;color:var(--ink);line-height:1.25}
      .hx-doc-meta{font-size:11px;color:var(--ink3);margin-top:4px;line-height:1.4}
      .hx-doc-status{display:inline-flex;align-items:center;min-height:24px;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:900;white-space:nowrap;border:1px solid transparent}
      .hx-status-faltante{color:#991b1b;background:#fef2f2;border-color:#fecaca}
      .hx-status-cargado{color:#166534;background:#f0fdf4;border-color:#bbf7d0}
      .hx-status-por_vencer{color:#92400e;background:#fffbeb;border-color:#fde68a}
      .hx-status-vencido{color:#991b1b;background:#fff1f2;border-color:#fda4af}
      .hx-doc-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:11px;padding-top:11px;border-top:1px solid var(--border)}
      .hx-ios-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:34px;padding:7px 12px;border-radius:11px;border:1px solid rgba(18,107,59,.20);background:linear-gradient(180deg,#fff 0%,#f5f6f4 100%);color:var(--accent);font:800 11px -apple-system,BlinkMacSystemFont,'SF Pro Text',Arial,sans-serif;box-shadow:0 3px 8px rgba(20,18,14,.06),inset 0 1px 0 rgba(255,255,255,.9);cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}
      .hx-ios-btn:hover{transform:translateY(-1px);box-shadow:0 6px 14px rgba(20,18,14,.10)}
      .hx-ios-btn:active{transform:scale(.97)}
      .hx-ios-btn-primary{color:#fff;background:linear-gradient(180deg,#17824e 0%,#126b3b 100%);border-color:#126b3b}
      .hx-ios-btn:disabled{opacity:.55;cursor:wait;transform:none}
      .hx-history{display:none;margin-top:10px;padding:10px;border-radius:12px;background:var(--surface2)}
      .hx-history.open{display:block}
      .hx-history-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);font-size:11px;color:var(--ink2)}
      .hx-history-row:last-child{border-bottom:0}
      .hx-expediente-loading{padding:18px;border-radius:14px;background:var(--surface2);color:var(--ink3);font-size:12px;text-align:center}
      .hx-expediente-error{padding:14px;border:1px solid #fecaca;border-radius:14px;background:#fef2f2;color:#991b1b;font-size:12px}
      .hx-upload-overlay,.hx-preview-overlay{position:fixed;inset:0;z-index:1100;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(20,18,14,.58);backdrop-filter:blur(9px)}
      .hx-upload-overlay.open,.hx-preview-overlay.open{display:flex}
      .hx-upload-card{width:min(520px,100%);border-radius:22px;background:#fff;box-shadow:0 28px 80px rgba(0,0,0,.24);overflow:hidden}
      .hx-upload-header{display:flex;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid var(--border)}
      .hx-upload-title{font-size:17px;font-weight:900;color:var(--ink);flex:1}
      .hx-upload-body{display:grid;gap:14px;padding:20px}
      .hx-upload-label{display:grid;gap:6px;font-size:11px;font-weight:800;color:var(--ink2)}
      .hx-upload-input{width:100%;box-sizing:border-box;border:1px solid var(--border2);border-radius:12px;background:#fff;padding:11px 12px;font:500 13px -apple-system,BlinkMacSystemFont,'SF Pro Text',Arial,sans-serif;color:var(--ink)}
      .hx-upload-help{font-size:11px;color:var(--ink3);line-height:1.45}
      .hx-upload-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:0 20px 20px}
      .hx-preview-card{width:min(980px,100%);height:min(86vh,760px);border-radius:22px;background:#fff;box-shadow:0 28px 80px rgba(0,0,0,.28);overflow:hidden;display:grid;grid-template-rows:auto 1fr}
      .hx-preview-head{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border)}
      .hx-preview-title{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:800}
      .hx-preview-frame{width:100%;height:100%;border:0;background:#f3f4f6}
      @media(max-width:700px){.hx-doc-main{grid-template-columns:36px minmax(0,1fr)}.hx-doc-status{grid-column:2;justify-self:start}.hx-ios-btn{flex:1}.hx-upload-overlay,.hx-preview-overlay{padding:0}.hx-upload-card,.hx-preview-card{width:100vw;height:100vh;max-height:none;border-radius:0}.hx-preview-card{height:100vh}}
    `;
    document.head.appendChild(style);
  }

  function ensureContainers() {
    ensureStyles();
    const banks = document.getElementById('dBanks');
    const bankSection = banks?.closest('.modal-sec');
    if (bankSection && !document.getElementById('hxExpedienteSection')) {
      const section = document.createElement('div');
      section.className = 'modal-sec';
      section.id = 'hxExpedienteSection';
      section.innerHTML = `
        <div class="hx-expediente-head">
          <div><div class="modal-sec-title">Expediente digital</div><div class="hx-expediente-sub">Los archivos se cargan únicamente al abrirlos.</div></div>
          <div class="hx-expediente-progress" id="hxExpedienteProgress">—</div>
        </div>
        <div id="hxExpedienteBody" class="hx-expediente-loading">Selecciona una empresa.</div>`;
      bankSection.insertAdjacentElement('afterend', section);
    }
    if (!document.getElementById('hxUploadOverlay')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="hx-upload-overlay" id="hxUploadOverlay" role="dialog" aria-modal="true" aria-labelledby="hxUploadTitle">
          <form class="hx-upload-card" id="hxUploadForm">
            <div class="hx-upload-header"><div class="hx-upload-title" id="hxUploadTitle">Cargar documento</div><button type="button" class="modal-close" data-hx-close-upload>✕</button></div>
            <div class="hx-upload-body">
              <label class="hx-upload-label">Archivo
                <input class="hx-upload-input" id="hxUploadFile" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" required>
              </label>
              <label class="hx-upload-label">Fecha de vencimiento
                <input class="hx-upload-input" id="hxUploadExpiry" type="date">
              </label>
              <div class="hx-upload-help" id="hxUploadHelp">PDF, JPG o PNG · máximo 8 MB. Las imágenes grandes se optimizan antes de subir.</div>
            </div>
            <div class="hx-upload-actions"><button type="button" class="hx-ios-btn" data-hx-close-upload>Cancelar</button><button type="submit" class="hx-ios-btn hx-ios-btn-primary" id="hxUploadSubmit">Guardar documento</button></div>
          </form>
        </div>
        <div class="hx-preview-overlay" id="hxPreviewOverlay" role="dialog" aria-modal="true" aria-labelledby="hxPreviewTitle">
          <div class="hx-preview-card">
            <div class="hx-preview-head"><div class="hx-preview-title" id="hxPreviewTitle">Vista previa</div><button type="button" class="hx-ios-btn" id="hxPreviewDownload">Descargar</button><button type="button" class="modal-close" data-hx-close-preview>✕</button></div>
            <iframe class="hx-preview-frame" id="hxPreviewFrame" title="Vista previa del documento"></iframe>
          </div>
        </div>`);
      document.querySelectorAll('[data-hx-close-upload]').forEach(button => button.addEventListener('click', closeUpload));
      document.querySelectorAll('[data-hx-close-preview]').forEach(button => button.addEventListener('click', closePreview));
      document.getElementById('hxUploadForm').addEventListener('submit', submitUpload);
    }
  }

  function labelStatus(status) {
    return ({ faltante: 'Faltante', cargado: 'Cargado', por_vencer: 'Por vencer', vencido: 'Vencido' })[status] || 'Faltante';
  }

  function niceDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date);
  }

  function niceSize(bytes) {
    const size = Number(bytes || 0);
    if (!size) return '';
    return size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`;
  }

  function slotsForProvider(provider) {
    const admin = currentRole() === 'admin';
    return DEFINITIONS.flatMap(definition => {
      if (definition.sensitive && !admin) return [];
      if (!definition.bank) return [{ definition, bankId: '', bankLabel: '' }];
      const banks = Array.isArray(provider?.bancos) ? provider.bancos : [];
      if (!banks.length) return [{ definition, bankId: '', bankLabel: 'Sin cuenta bancaria vinculada', disabled: true }];
      return banks.map((bank, index) => ({
        definition,
        bankId: String(bank._airtableId || ''),
        bankLabel: `${bank.nombre || 'Banco'}${bank.cuenta && bank.cuenta !== 'CTA' ? ` · •${String(bank.cuenta).slice(-4)}` : ''}`,
        disabled: !bank._airtableId,
        index,
      }));
    });
  }

  function recordsForSlot(records, slot) {
    return records.filter(record => {
      if (record.tipo !== slot.definition.key) return false;
      if (!slot.definition.bank) return true;
      return Array.isArray(record.bancoIds) && record.bancoIds.includes(slot.bankId);
    });
  }

  function activeForSlot(records, slot) {
    return recordsForSlot(records, slot).find(record => record.estadoVersion === 'Activo') || null;
  }

  function renderDocuments(records = []) {
    const body = document.getElementById('hxExpedienteBody');
    const progress = document.getElementById('hxExpedienteProgress');
    if (!body || !selectedProvider) return;
    const admin = currentRole() === 'admin';
    const slots = slotsForProvider(selectedProvider);
    const complete = slots.filter(slot => activeForSlot(records, slot)).length;
    progress.textContent = `${complete}/${slots.length}`;
    body.className = 'hx-doc-list';
    body.innerHTML = slots.map((slot, index) => {
      const versions = recordsForSlot(records, slot);
      const active = activeForSlot(records, slot);
      const status = active?.estado || 'faltante';
      const meta = active
        ? `${esc(active.nombreArchivo)}${active.fechaCarga ? ` · ${esc(niceDate(active.fechaCarga))}` : ''}${active.fechaVencimiento ? ` · vence ${esc(niceDate(active.fechaVencimiento))}` : ''}${niceSize(active.tamanoBytes) ? ` · ${esc(niceSize(active.tamanoBytes))}` : ''}`
        : slot.disabled ? esc(slot.bankLabel) : 'Documento pendiente de carga';
      const slotKey = `${slot.definition.key}-${slot.bankId || 'general'}-${index}`;
      return `
        <article class="hx-doc-card">
          <div class="hx-doc-main">
            <div class="hx-doc-icon">${slot.definition.icon}</div>
            <div><div class="hx-doc-title">${esc(slot.definition.label)}${slot.bankLabel ? ` · ${esc(slot.bankLabel)}` : ''}</div><div class="hx-doc-meta">${meta}</div></div>
            <span class="hx-doc-status hx-status-${esc(status)}">${esc(labelStatus(status))}</span>
          </div>
          <div class="hx-doc-actions">
            ${active?.puedeVer ? `<button class="hx-ios-btn" data-hx-view="${esc(active.id)}">Ver</button><button class="hx-ios-btn" data-hx-download="${esc(active.id)}">Descargar</button>` : ''}
            ${admin && !slot.disabled ? `<button class="hx-ios-btn hx-ios-btn-primary" data-hx-upload="${esc(slot.definition.key)}" data-hx-bank="${esc(slot.bankId)}">${active ? 'Reemplazar' : 'Cargar'}</button>` : ''}
            ${versions.length ? `<button class="hx-ios-btn" data-hx-history-toggle="${esc(slotKey)}">Historial (${versions.length})</button>` : ''}
          </div>
          ${versions.length ? `<div class="hx-history" id="hx-history-${esc(slotKey)}">${versions.map(version => `<div class="hx-history-row"><span>v${version.version} · ${esc(version.usuario || 'Usuario')} · ${esc(niceDate(version.fechaCarga))}</span><span>${version.estadoVersion === 'Activo' ? 'Actual' : 'Reemplazado'}</span></div>`).join('')}</div>` : ''}
        </article>`;
    }).join('');

    body.querySelectorAll('[data-hx-upload]').forEach(button => button.addEventListener('click', () => openUpload(button.dataset.hxUpload, button.dataset.hxBank || '')));
    body.querySelectorAll('[data-hx-view]').forEach(button => button.addEventListener('click', () => previewDocument(button.dataset.hxView)));
    body.querySelectorAll('[data-hx-download]').forEach(button => button.addEventListener('click', () => downloadDocument(button.dataset.hxDownload)));
    body.querySelectorAll('[data-hx-history-toggle]').forEach(button => button.addEventListener('click', () => document.getElementById(`hx-history-${button.dataset.hxHistoryToggle}`)?.classList.toggle('open')));
  }

  async function hydrateProvider(provider) {
    const banks = Array.isArray(provider?.bancos) ? provider.bancos : [];
    if (provider?._airtableId && banks.every(bank => bank._airtableId)) return provider;
    const [providersResponse, banksResponse] = await Promise.all([
      sessionFetch('/proveedores'),
      sessionFetch('/bancos'),
    ]);
    const [providersData, banksData] = await Promise.all([providersResponse.json(), banksResponse.json()]);
    if (!providersResponse.ok || !providersData.ok) throw new Error('No se pudo vincular la empresa con Airtable.');
    const providerRecords = Array.isArray(providersData.records) ? providersData.records : [];
    const match = providerRecords.find(record => String(record.fields?.RFC || '').trim().toUpperCase() === String(provider?.rfc || '').trim().toUpperCase());
    if (!match) throw new Error('Esta empresa todavía no está vinculada con su registro de Airtable.');
    const bankRecords = banksResponse.ok && banksData.ok && Array.isArray(banksData.records) ? banksData.records : [];
    const linkedBanks = bankRecords.filter(record => Array.isArray(record.fields?.Proveedor) && record.fields.Proveedor.includes(match.id)).map(record => ({
      _airtableId: record.id,
      nombre: record.fields?.['Nombre de Banco'] || record.fields?.Empresa || '',
      cuenta: record.fields?.Cuenta || '',
      clabe: record.fields?.CLABE || '',
      titular: record.fields?.['Titular de la cuenta'] || '',
    }));
    provider._airtableId = match.id;
    provider.bancos = linkedBanks;
    return provider;
  }

  async function loadDocuments(provider) {
    ensureContainers();
    selectedProvider = provider;
    const body = document.getElementById('hxExpedienteBody');
    const progress = document.getElementById('hxExpedienteProgress');
    body.className = 'hx-expediente-loading';
    body.textContent = 'Cargando expediente…';
    progress.textContent = '—';
    try {
      selectedProvider = await hydrateProvider(provider);
      const response = await sessionFetch(`/expedientes?proveedorId=${encodeURIComponent(selectedProvider._airtableId)}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'No se pudo cargar el expediente');
      renderDocuments(Array.isArray(data.records) ? data.records : []);
    } catch (error) {
      body.className = 'hx-expediente-error';
      body.textContent = error.message || 'No se pudo cargar el expediente.';
    }
  }

  function openUpload(type, bankId) {
    selectedDefinition = DEFINITIONS.find(item => item.key === type) || null;
    selectedBankId = bankId || '';
    if (!selectedDefinition || !selectedProvider) return;
    document.getElementById('hxUploadTitle').textContent = `Cargar ${selectedDefinition.label}`;
    document.getElementById('hxUploadForm').reset();
    document.getElementById('hxUploadOverlay').classList.add('open');
    setTimeout(() => document.getElementById('hxUploadFile')?.focus(), 30);
  }

  function closeUpload() {
    document.getElementById('hxUploadOverlay')?.classList.remove('open');
  }

  async function compressImage(file) {
    if (!file.type.startsWith('image/') || file.size <= 1.5 * 1024 * 1024) return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  }

  async function submitUpload(event) {
    event.preventDefault();
    const submit = document.getElementById('hxUploadSubmit');
    const input = document.getElementById('hxUploadFile');
    const source = input.files?.[0];
    if (!source || !selectedDefinition || !selectedProvider?._airtableId) return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(source.type)) return notify('Solo se permiten PDF, JPG y PNG.', 'error');
    if (source.size > MAX_BYTES) return notify('El archivo supera el máximo de 8 MB.', 'error');
    submit.disabled = true;
    submit.textContent = 'Guardando…';
    try {
      const file = await compressImage(source);
      const form = new FormData();
      form.append('proveedorId', selectedProvider._airtableId);
      form.append('tipo', selectedDefinition.key);
      if (selectedBankId) form.append('bancoId', selectedBankId);
      const expiry = document.getElementById('hxUploadExpiry').value;
      if (expiry) form.append('fechaVencimiento', expiry);
      form.append('file', file, file.name);
      const response = await sessionFetch('/expedientes/upload', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'No se pudo guardar el documento');
      closeUpload();
      notify('Documento guardado en el expediente.');
      await loadDocuments(selectedProvider);
    } catch (error) {
      notify(error.message || 'No se pudo guardar el documento.', 'error');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Guardar documento';
    }
  }

  async function fetchDocumentBlob(recordId, download = false) {
    const response = await sessionFetch(`/expedientes/${encodeURIComponent(recordId)}/file${download ? '?download=1' : ''}`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'No se pudo abrir el documento');
    }
    return response.blob();
  }

  async function previewDocument(recordId) {
    const overlay = document.getElementById('hxPreviewOverlay');
    const frame = document.getElementById('hxPreviewFrame');
    const title = document.getElementById('hxPreviewTitle');
    overlay.classList.add('open');
    title.textContent = 'Cargando vista previa…';
    frame.removeAttribute('src');
    try {
      const blob = await fetchDocumentBlob(recordId, false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
      frame.src = previewUrl;
      title.textContent = 'Vista previa del documento';
      const downloadButton = document.getElementById('hxPreviewDownload');
      downloadButton.onclick = () => downloadDocument(recordId);
    } catch (error) {
      closePreview();
      notify(error.message, 'error');
    }
  }

  function closePreview() {
    document.getElementById('hxPreviewOverlay')?.classList.remove('open');
    document.getElementById('hxPreviewFrame')?.removeAttribute('src');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }

  async function downloadDocument(recordId) {
    try {
      const blob = await fetchDocumentBlob(recordId, true);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'documento';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  function install() {
    ensureContainers();
    const originalOpenDetail = window.openDetail;
    if (typeof originalOpenDetail === 'function' && !originalOpenDetail.__hxExpedienteWrapped) {
      const wrapped = function(index) {
        const result = originalOpenDetail.apply(this, arguments);
        const providers = typeof getProveedores === 'function' ? getProveedores() : [];
        const provider = providers[index];
        queueMicrotask(() => loadDocuments(provider));
        return result;
      };
      wrapped.__hxExpedienteWrapped = true;
      window.openDetail = wrapped;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
