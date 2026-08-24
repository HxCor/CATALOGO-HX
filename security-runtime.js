(() => {
  'use strict';

  const API = 'https://catalogo-hx-backend.armando-avila.workers.dev';
  const REFRESH_EVERY_MS = 30 * 60 * 1000;
  let refreshTimer = null;

  window.hxEscapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  window.hxSafeHttpUrl = value => {
    try {
      const url = new URL(String(value || ''), window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  };

  window.hxSafeImageSrc = value => {
    const raw = String(value || '').trim();
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(raw)) return raw;
    return window.hxSafeHttpUrl(raw);
  };

  const originalHxFetch = window.hxFetch;
  if (typeof originalHxFetch === 'function') {
    window.hxFetch = async function hxFetchWithTimeout(url, options = {}, timeoutMs = 15000) {
      if (options.signal) return originalHxFetch(url, options);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await originalHxFetch(url, { ...options, signal: controller.signal });
      } finally {
        window.clearTimeout(timeout);
      }
    };
  }

  async function refreshHxSession() {
    const token = sessionStorage.getItem('hxSessionToken') || '';
    if (!token) return false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${API}/session/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) return false;
      sessionStorage.setItem('hxSessionToken', data.token);
      try { HX_SESSION_TOKEN = data.token; } catch {}
      return true;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function startHxSessionRefresh() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    if (!sessionStorage.getItem('hxSessionToken')) return;
    refreshTimer = window.setInterval(refreshHxSession, REFRESH_EVERY_MS);
  }

  function stopHxSessionRefresh() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = null;
  }

  window.refreshHxSession = refreshHxSession;
  window.startHxSessionRefresh = startHxSessionRefresh;
  window.stopHxSessionRefresh = stopHxSessionRefresh;

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && sessionStorage.getItem('hxSessionToken')) refreshHxSession();
  });
  startHxSessionRefresh();
})();
