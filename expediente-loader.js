(() => {
  'use strict';

  let modulePromise = null;

  function loadModule() {
    if (window.hxOpenExpediente) return Promise.resolve();
    if (modulePromise) return modulePromise;
    modulePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'expediente-digital.js?v=20260902-2';
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('No se pudo cargar el expediente digital'));
      document.head.appendChild(script);
    });
    return modulePromise;
  }

  function install() {
    const originalOpenDetail = window.openDetail;
    if (typeof originalOpenDetail !== 'function' || originalOpenDetail.__hxExpedienteLoader) return;
    const wrapped = function(index) {
      const result = originalOpenDetail.apply(this, arguments);
      const providers = typeof getProveedores === 'function' ? getProveedores() : [];
      const provider = providers[index];
      loadModule()
        .then(() => window.hxOpenExpediente?.(provider))
        .catch(error => {
          console.error('Expediente digital:', error);
          if (typeof showToast === 'function') showToast('No se pudo abrir el expediente digital.', 'error');
        });
      return result;
    };
    wrapped.__hxExpedienteLoader = true;
    window.openDetail = wrapped;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
