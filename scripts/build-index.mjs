import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'app.html');
const indexPath = path.join(root, 'index.html');

const mainMarker = '<script>\nconst LOGOS';
const preTag = '<script src="security-pre.js?v=20260820"></script>\n';
const runtimeTags = [
  '<script defer src="security-runtime.js?v=final-20260824-1"></script>',
  '<script defer src="security-post.js?v=rubro-align-20260830-2"></script>',
  '<script defer src="card-bank-alignment.js?v=20261005-bank-align-3"></script>',
  '<script defer src="mail-provider.js?v=20261005-performance-1"></script>',
  '<script defer src="expediente-loader.js?v=20260902-1"></script>',
  '<script defer src="divisas-hx-pro.js?v=20260822-all-users-1"></script>',
  '<script defer src="divisas-hx-pro-fix.js?v=20260822-navigation-1"></script>',
  '<script defer src="divisas-refresh-fix.js?v=final-20260824-1"></script>',
  '<script defer src="divisas-document-actions.js?v=final-20260824-1"></script>',
  '<script defer src="laboral-hx.js?v=final-20260824-1"></script>',
  '<script defer src="laboral-access.js?v=final-20260824-1"></script>',
  '<script defer src="laboral-despido.js?v=final-20260824-1"></script>',
  '<script defer src="laboral-imss.js?v=final-20260824-1"></script>',
  '<script defer src="laboral-navigation-fix.js?v=20260822-all-users-1"></script>',
  '<script defer src="performance-runtime.js?v=20261005-2"></script>'
].join('\n') + '\n';

let html = fs.readFileSync(appPath, 'utf8');

if (!html.includes(mainMarker)) {
  throw new Error('No se encontro el punto de insercion de seguridad.');
}
if (!html.includes('</body>')) {
  throw new Error('app.html no contiene cierre de body.');
}

html = html.replace(mainMarker, preTag + mainMarker);
html = html.replace('</body>', runtimeTags + '</body>');
html = html.replace(/[ \t]+$/gm, '');

fs.writeFileSync(indexPath, html);
console.log(`index.html generado directamente desde app.html (${Buffer.byteLength(html)} bytes)`);
