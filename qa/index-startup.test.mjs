import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(index, /id="screenLogin"/, 'el login debe venir en la respuesta inicial');
assert.match(index, /id="btnLogin"/, 'el boton de acceso debe venir en la respuesta inicial');
assert.match(index, /security-pre\.js/, 'debe conservar el endurecimiento previo');
assert.match(index, /performance-runtime\.js/, 'debe cargar el optimizador compartido');
assert.doesNotMatch(index, /fetch\(['"]app\.html/, 'el inicio no debe descargar y reescribir la aplicacion');
assert.doesNotMatch(index, /document\.write\(/, 'el inicio no debe reemplazar el documento');

const preIndex = index.indexOf('security-pre.js');
const dataIndex = index.indexOf('const LOGOS');
assert.ok(preIndex >= 0 && preIndex < dataIndex, 'security-pre debe ejecutarse antes de los datos base');

for (const asset of [
  'security-runtime.js',
  'security-post.js',
  'card-bank-alignment.js',
  'mail-provider.js',
  'expediente-loader.js',
  'divisas-hx-pro.js',
  'laboral-hx.js',
  'laboral-imss.js'
]) {
  assert.match(index, new RegExp(asset.replace('.', '\\.')));
}

console.log('index-startup: PASS');
