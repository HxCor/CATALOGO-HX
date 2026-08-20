(() => {
  'use strict';

  // Integración de correo sin secretos en el navegador.
  // Usa la sesión de Gmail que ya tenga abierta el usuario en su navegador.
  // La futura integración Gmail API podrá reemplazar este transporte sin cambiar las tarjetas.
  window.HX_MAIL_CONFIG = Object.freeze({
    provider: 'gmail',
    mode: 'gmail-web-compose',
    directApiReady: false,
    futureApiEndpoint: '/mail/send'
  });

  function normalizeEmail(value) {
    const email = String(value || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  }

  function composeParts(provider) {
    const email = normalizeEmail(provider?.email);
    if (!email) return null;

    const empresa = String(provider?.nombre || 'Proveedor').trim();
    const rfc = String(provider?.rfc || '').trim().toUpperCase();
    const contacto = String(provider?.contacto || '').trim();
    const saludo = contacto ? `Hola ${contacto},` : 'Hola,';
    const subject = `Catálogo HX · ${empresa}${rfc ? ` · ${rfc}` : ''}`;
    const body = [
      saludo,
      '',
      `Nos ponemos en contacto con ${empresa} desde el Catálogo HX de proveedores.`,
      rfc ? `RFC: ${rfc}` : '',
      '',
      'Quedamos atentos a sus comentarios.',
      '',
      'Saludos.'
    ].filter((line, index, arr) => line !== '' || arr[index - 1] !== '').join('\n');

    return { email, subject, body };
  }

  function gmailComposeUrl(parts) {
    const p = new URLSearchParams({
      view: 'cm',
      fs: '1',
      to: parts.email,
      su: parts.subject,
      body: parts.body
    });
    return `https://mail.google.com/mail/?${p.toString()}`;
  }

  function mailtoUrl(parts) {
    return `mailto:${parts.email}?subject=${encodeURIComponent(parts.subject)}&body=${encodeURIComponent(parts.body)}`;
  }

  window.hxComposeProviderEmail = function(provider) {
    const parts = composeParts(provider);
    if (!parts) {
      if (typeof showToast === 'function') showToast('Esta empresa todavía no tiene correo registrado.', 'error');
      return false;
    }

    const url = gmailComposeUrl(parts);
    const popup = window.open(url, '_blank', 'noopener,noreferrer');

    // Safari/iOS puede bloquear popups; usa el cliente de correo del dispositivo como respaldo.
    if (!popup) window.location.href = mailtoUrl(parts);
    return true;
  };

  function relabelMailButtons(root = document) {
    root.querySelectorAll?.('.hx-email-btn').forEach(button => {
      button.textContent = '✉️ Abrir en Gmail';
      button.title = 'Abrir un correo prellenado en Gmail';
    });
  }

  relabelMailButtons();

  const grid = document.getElementById('cardsGrid');
  if (grid && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => relabelMailButtons(grid)).observe(grid, { childList: true, subtree: true });
  }
})();
