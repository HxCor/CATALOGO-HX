(() => {
  'use strict';

  const API = 'https://catalogo-hx-backend.armando-avila.workers.dev';
  const LAST_KEY = 'hxDivisasLastQuoteV2';
  const nativeFetch = window.fetch.bind(window);

  function token() { return sessionStorage.getItem('hxSessionToken') || ''; }
  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); }
  function ascii(v) { return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, ' '); }
  function num(v, d = 2) { return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function pdfEsc(v) { return ascii(v).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }

  function saveLast(record) {
    if (!record?.id || !record?.fields) return;
    try { sessionStorage.setItem(LAST_KEY, JSON.stringify(record)); } catch {}
    setTimeout(decorate, 0);
  }

  function getLast() {
    try { return JSON.parse(sessionStorage.getItem(LAST_KEY) || 'null'); } catch { return null; }
  }

  window.fetch = async function(input, init) {
    const response = await nativeFetch(input, init);
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = String(init?.method || input?.method || 'GET').toUpperCase();
      if (method === 'POST' && /\/divisas\/quotes(?:\?|$)/.test(url) && !/\/status(?:\?|$)/.test(url) && response.ok) {
        const data = await response.clone().json();
        if (data?.record) saveLast(data.record);
      }
    } catch {}
    return response;
  };

  function notify(message, error = false) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, error ? 'error' : 'success');
      return;
    }
    const box = document.getElementById('hxfxError');
    if (!box) return;
    box.textContent = message;
    box.style.display = 'block';
    box.style.background = error ? '' : '#eff8f2';
    box.style.color = error ? '' : '#1a5c3a';
    box.style.borderColor = error ? '' : '#cfe7d7';
    setTimeout(() => { box.style.display = 'none'; }, 5000);
  }

  function addRecipientField() {
    if (document.getElementById('hxfxRecipientEmail')) return;
    const client = document.getElementById('hxfxClient');
    const parent = client?.closest('.hxfx-field');
    if (!parent) return;
    const field = document.createElement('div');
    field.className = 'hxfx-field';
    field.innerHTML = '<label>Correo destinatario</label><input class="hxfx-input" id="hxfxRecipientEmail" type="email" placeholder="cliente@empresa.com" autocomplete="email">';
    parent.insertAdjacentElement('afterend', field);
  }

  function decorate() {
    addRecipientField();
    const pdf = document.getElementById('hxfxPdf');
    const mail = document.getElementById('hxfxEmail');
    // MutationObserver calls decorate() after every DOM change. Rewriting
    // textContent on every call creates another mutation and can lock the UI
    // in an infinite callback loop as soon as Divisas is opened.
    if (pdf && pdf.dataset.hxDocumentDecorated !== '1') {
      pdf.dataset.hxDocumentDecorated = '1';
      pdf.textContent = 'Descargar PDF';
      pdf.title = 'Descargar cotización profesional en PDF';
    }
    if (mail && mail.dataset.hxDocumentDecorated !== '1') {
      mail.dataset.hxDocumentDecorated = '1';
      mail.textContent = 'Enviar por Gmail';
      mail.title = 'Descarga el PDF y abre Gmail con el correo prellenado';
    }
    return Boolean(pdf && mail);
  }

  function pdfText(cmd, x, y, size, text, bold = false, color = '0.10 0.09 0.08') {
    cmd.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color} rg ${x} ${y} Td (${pdfEsc(text)}) Tj ET`);
  }

  function pdfRect(cmd, x, y, w, h, fill, stroke = null, radius = 0) {
    void radius;
    if (fill) cmd.push(`${fill} rg ${x} ${y} ${w} ${h} re f`);
    if (stroke) cmd.push(`${stroke} RG ${x} ${y} ${w} ${h} re S`);
  }

  function createPdf(record) {
    const f = record?.fields || {};
    const origin = f.MonedaOrigen || 'USD';
    const dest = f.MonedaDestino || 'MXN';
    const cmd = [];

    pdfRect(cmd, 0, 754, 595, 88, '0.10 0.36 0.23');
    pdfRect(cmd, 35, 779, 42, 42, '0.15 0.52 0.34');
    pdfText(cmd, 47, 793, 18, 'HX', true, '1 1 1');
    pdfText(cmd, 95, 800, 22, 'COTIZACION DIVISAS HX PRO', true, '1 1 1');
    pdfText(cmd, 96, 781, 9, 'CATALOGO-HX | Tipo de cambio congelado', false, '0.88 0.94 0.90');
    pdfText(cmd, 463, 807, 8, 'FOLIO', true, '0.88 0.94 0.90');
    pdfText(cmd, 463, 790, 11, f.Folio || 'HX-', true, '1 1 1');
    pdfText(cmd, 463, 771, 8, f.Estado?.name || f.Estado || 'Borrador', true, '1 1 1');

    const cards = [
      ['PROVEEDOR', f.Proveedor || 'HX'],
      ['TIPO APLICADO', f.TipoAplicado || 'Venta'],
      ['TIPO DE CAMBIO', Number(f.TipoCambioUsado || 0).toFixed(4)],
      ['FUENTE', 'eldolar.info'],
    ];
    cards.forEach((c, i) => {
      const x = 35 + i * 132;
      pdfRect(cmd, x, 688, 121, 52, '1 1 1', '0.88 0.87 0.84');
      pdfText(cmd, x + 10, 722, 7, c[0], true, '0.53 0.51 0.49');
      pdfText(cmd, x + 10, 701, i === 2 ? 16 : 12, c[1], true, i === 2 ? '0.10 0.36 0.23' : '0.10 0.09 0.08');
    });

    pdfText(cmd, 35, 652, 14, 'Resumen de cotizacion', true);
    pdfRect(cmd, 35, 500, 525, 132, '1 1 1', '0.88 0.87 0.84');
    const rows = [
      ['Cliente / Proyecto', f.ClienteProyecto || '-'],
      ['RFC proveedor', f.RFC || '-'],
      ['Importe original', `${origin} $${num(f.ImporteOriginal, 2)}`],
      ['Moneda destino', dest],
      ['Ajuste', `${num(f.ComisionAjuste || 0, 2)}%`],
      ['Fecha / hora', f.FechaHora ? new Date(f.FechaHora).toLocaleString('es-MX') : '-'],
    ];
    rows.forEach((r, i) => {
      const col = i < 3 ? 0 : 1;
      const row = i % 3;
      const x = col ? 310 : 50;
      const y = 600 - row * 34;
      pdfText(cmd, x, y, 8, r[0].toUpperCase(), true, '0.53 0.51 0.49');
      pdfText(cmd, x, y - 15, 10, r[1], true);
    });

    pdfRect(cmd, 35, 411, 525, 66, '0.91 0.96 0.93', '0.79 0.89 0.83');
    pdfText(cmd, 50, 454, 8, 'RESULTADO CONVERTIDO', true, '0.25 0.39 0.31');
    pdfText(cmd, 50, 428, 24, `${dest} $${num(f.ResultadoConvertido, 2)}`, true, '0.10 0.36 0.23');

    pdfText(cmd, 35, 371, 13, 'Referencia y trazabilidad', true);
    pdfRect(cmd, 35, 278, 525, 72, '0.97 0.97 0.96', '0.88 0.87 0.84');
    pdfText(cmd, 50, 328, 9, 'Fuente de referencia', true, '0.53 0.51 0.49');
    pdfText(cmd, 200, 328, 10, 'eldolar.info', true);
    pdfText(cmd, 50, 306, 9, 'TC congelado', true, '0.53 0.51 0.49');
    pdfText(cmd, 200, 306, 10, Number(f.TipoCambioUsado || 0).toFixed(4), true);
    pdfText(cmd, 330, 328, 9, 'Usuario', true, '0.53 0.51 0.49');
    pdfText(cmd, 420, 328, 10, f.Usuario || '-', true);
    pdfText(cmd, 330, 306, 9, 'Estado', true, '0.53 0.51 0.49');
    pdfText(cmd, 420, 306, 10, f.Estado?.name || f.Estado || 'Borrador', true);

    pdfText(cmd, 35, 226, 8, 'Este documento es una cotizacion de referencia y no constituye comprobante bancario ni fiscal.', false, '0.45 0.44 0.42');
    pdfText(cmd, 35, 211, 8, 'El tipo de cambio queda conservado en CATALOGO-HX para trazabilidad de la operacion.', false, '0.45 0.44 0.42');
    cmd.push('0.88 0.87 0.84 RG 35 52 m 560 52 l S');
    pdfText(cmd, 35, 35, 7, 'CATALOGO-HX | Divisas HX Pro', false, '0.53 0.51 0.49');
    pdfText(cmd, 445, 35, 7, `Folio ${f.Folio || '-'}`, false, '0.53 0.51 0.49');

    const stream = cmd.join('\n');
    const enc = new TextEncoder();
    const len = s => enc.encode(s).length;
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      `<< /Length ${len(stream)} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = '%PDF-1.4\n%CATALOGOHX\n';
    const offsets = [0];
    objects.forEach((obj, i) => {
      offsets.push(len(pdf));
      pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xref = len(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach(o => { pdf += `${String(o).padStart(10, '0')} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([enc.encode(pdf)], { type: 'application/pdf' });
  }

  function downloadPdf(record, quiet = false) {
    if (!record?.fields) { notify('Genera primero una cotización.', true); return null; }
    const blob = createPdf(record);
    const name = `Cotizacion_${ascii(record.fields.Folio || 'HX')}_HX.pdf`.replace(/\s+/g, '_');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    if (!quiet) notify(`PDF generado: ${name}`);
    return { blob, name };
  }

  async function persistRecipient(recordId, email) {
    try {
      const response = await nativeFetch(`${API}/divisas/quotes/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recordId, email }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (e) {
      console.warn('No se pudo guardar el destinatario:', e);
    }
  }

  function gmailUrl(email, record) {
    const f = record.fields || {};
    const body = [
      `Hola,`,
      '',
      `Te comparto la cotización ${f.Folio || ''} de HX.`,
      '',
      `Cliente / Proyecto: ${f.ClienteProyecto || '-'}`,
      `Importe original: ${f.MonedaOrigen || 'USD'} $${num(f.ImporteOriginal, 2)}`,
      `Tipo de cambio: ${Number(f.TipoCambioUsado || 0).toFixed(4)} (${f.TipoAplicado || 'Venta'})`,
      `Resultado: ${f.MonedaDestino || 'MXN'} $${num(f.ResultadoConvertido, 2)}`,
      `Fuente: eldolar.info`,
      '',
      `El PDF de la cotización se descargó automáticamente para adjuntarlo a este correo.`,
      '',
      `Saludos.`,
      `HX`,
    ].join('\n');
    const p = new URLSearchParams({
      view: 'cm', fs: '1', to: email,
      su: `Cotización ${f.Folio || ''} · HX`,
      body,
    });
    return `https://mail.google.com/mail/?${p.toString()}`;
  }

  async function sendQuote() {
    const record = getLast();
    if (!record?.fields) return notify('Genera primero una cotización.', true);
    const input = document.getElementById('hxfxRecipientEmail');
    const email = String(input?.value || '').trim();
    if (!emailOk(email)) {
      input?.focus();
      return notify('Escribe un correo destinatario válido.', true);
    }

    const popup = window.open('about:blank', '_blank');
    const pdf = downloadPdf(record, true);
    persistRecipient(record.id, email);
    const url = gmailUrl(email, record);
    if (popup) popup.location.href = url;
    else window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Cotización ${record.fields.Folio || ''} · HX`)}&body=${encodeURIComponent('Adjunto cotización HX. El PDF fue descargado desde CATALOGO-HX.')}`;
    notify(`Gmail preparado. Adjunta ${pdf?.name || 'el PDF descargado'}.`);
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('#hxfxPdf, #hxfxEmail');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (button.id === 'hxfxPdf') downloadPdf(getLast());
    else sendQuote();
  }, true);

  const observer = new MutationObserver(() => {
    if (decorate()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (decorate()) observer.disconnect();
})();
