import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (product, name, ok, detail = '') => checks.push({ product, name, ok: Boolean(ok), detail });

const index = read('index.html');
const app = read('app.html');
const worker = read('worker/index-fast.js');
const divisas = read('divisas-hx-pro.js');
const laboral = read('laboral-hx.js');
const imss = read('laboral-imss.js');
const wrangler = read('wrangler.toml');

check('Plataforma', 'JavaScript principal liviano', Buffer.byteLength(app) < 250_000, `${Buffer.byteLength(app)} bytes`);
check('Plataforma', 'Carga principal reutiliza caché', index.includes("cache: 'force-cache'"));
check('Plataforma', 'Assets con versión de auditoría', index.includes('20260822-audit-1'));
check('Seguridad', 'Escape HTML central', app.includes('function hxEscapeHtml'));
check('Seguridad', 'URLs externas validadas', app.includes('function hxSafeHttpUrl'));
check('Seguridad', 'Sesión con renovación', worker.includes('handleSessionRefresh') && app.includes('startHxSessionRefresh'));
check('Seguridad', 'Secretos obligatorios', worker.includes('Seguridad del backend no configurada'));
check('Cloudflare', 'Observabilidad activa', /\[observability\][\s\S]*enabled\s*=\s*true/.test(wrangler));
check('Cloudflare', 'Compatibilidad actual', wrangler.includes('compatibility_date = "2026-08-22"'));
check('Divisas / Cotizador', 'Vista aislada', divisas.includes("main.classList.add('hxfx-only')"));
check('Divisas / Cotizador', 'API con timeout', divisas.includes('AbortController'));
check('Laboral HX', 'Disponible para sesión válida', laboral.includes("tools.id = 'hxToolsSideSection'"));
check('Laboral HX', 'API con timeout', laboral.includes('AbortController'));
check('IMSS / Costo patronal', 'Disponible para sesión válida', imss.includes('isAuthenticated'));
check('IMSS / Costo patronal', 'Panel completo', imss.includes('SBC diario') && imss.includes('INFONAVIT'));

if (process.argv.includes('--live')) {
  const probe = async (product, name, url, expectedStatus, marker, options = {}) => {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000), cache: 'no-store' });
      const body = await response.text();
      check(product, name, response.status === expectedStatus && (!marker || body.includes(marker)), `HTTP ${response.status}`);
    } catch (error) {
      check(product, name, false, error?.message || String(error));
    }
  };
  const nonce = Date.now();
  await probe('Plataforma', 'GitHub Pages disponible', `https://hxcor.github.io/CATALOGO-HX/?audit=${nonce}`, 200, 'app.html?v=20260822-performance-security-1');
  await probe('Cloudflare', 'Backend disponible y aislado', 'https://catalogo-hx-backend.armando-avila.workers.dev/', 200, '"secretIsolation":"isolated"');
  await probe('Catálogo / Proveedores', 'Protección sin sesión', 'https://catalogo-hx-backend.armando-avila.workers.dev/proveedores', 401, 'No autorizado');
  await probe('Divisas / Cotizador', 'Protección sin sesión', 'https://catalogo-hx-backend.armando-avila.workers.dev/divisas/current', 401, 'No autorizado');
  await probe('Laboral HX', 'Protección sin sesión', 'https://catalogo-hx-backend.armando-avila.workers.dev/laboral/parameters', 401, 'No autorizado');
  await probe('IMSS / Costo patronal', 'Protección sin sesión', 'https://catalogo-hx-backend.armando-avila.workers.dev/laboral/imss-cost', 401, 'No autorizado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
}

const failed = checks.filter(item => !item.ok);
const report = {
  checkedAtUtc: new Date().toISOString(),
  overall: failed.length ? 'FAIL' : 'PASS',
  products: checks,
  totals: { checks: checks.length, passed: checks.length - failed.length, failed: failed.length },
};

console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;
