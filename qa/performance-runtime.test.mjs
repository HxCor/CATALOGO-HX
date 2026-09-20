import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let providerReads = 0;
let providerWrites = 0;
let filterCalls = 0;
let loginCalls = 0;
let resolveLogin;
const animationFrames = [];
const listeners = {};

const loginButton = {
  disabled: false,
  textContent: 'Ingresar al Catálogo →',
  attributes: new Map(),
  setAttribute(name, value) { this.attributes.set(name, value); },
  removeAttribute(name) { this.attributes.delete(name); }
};

const sideButtons = [
  { classList: { add() {}, remove() {} } },
  { classList: { add() {}, remove() {} } }
];

const context = {
  console,
  setTimeout,
  clearTimeout,
  requestAnimationFrame(callback) {
    animationFrames.push(callback);
    return animationFrames.length;
  },
  localStorage: {},
  document: {
    documentElement: { dataset: {} },
    getElementById(id) { return id === 'btnLogin' ? loginButton : null; },
    querySelectorAll(selector) { return selector === '.side-btn' ? sideButtons : []; }
  },
  addEventListener(name, callback) { listeners[name] = callback; },
  getCats() { return [{ nombre: 'Servicios' }]; },
  saveCats() {},
  getProveedores() {
    providerReads += 1;
    return [{ nombre: 'Empresa Uno', rfc: 'UNO010101AA1' }];
  },
  saveProveedores() { providerWrites += 1; },
  getUsers() { return []; },
  saveUsers() {},
  getLogosExtra() { return {}; },
  saveLogosExtra() {},
  initApp() {},
  filterCat() { filterCalls += 1; },
  doLogin() {
    loginCalls += 1;
    return new Promise(resolve => { resolveLogin = resolve; });
  }
};
context.window = context;

vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../performance-runtime.js', import.meta.url), 'utf8'), context);

assert.equal(context.document.documentElement.dataset.hxPerformanceRuntime, 'active');
assert.equal(context.getProveedores().length, 1);
assert.equal(context.getProveedores().length, 1);
assert.equal(providerReads, 1, 'proveedores debe leerse una sola vez desde storage');

const replacement = [{ nombre: 'Empresa Dos', rfc: 'DOS010101AA2' }];
context.saveProveedores(replacement);
assert.equal(providerWrites, 1);
assert.equal(context.getProveedores(), replacement, 'guardar debe refrescar el caché');

context.filterCat('Servicios', sideButtons[0]);
context.filterCat('Industrial', sideButtons[1]);
assert.equal(filterCalls, 0, 'el filtro pesado debe esperar al siguiente frame');
animationFrames.shift()();
assert.equal(filterCalls, 1, 'dos clics dentro del mismo frame deben agruparse');

const loginOne = context.doLogin();
const loginTwo = context.doLogin();
assert.equal(loginCalls, 1, 'doble clic no debe crear dos solicitudes de login');
assert.equal(loginButton.disabled, true);
resolveLogin();
await Promise.all([loginOne, loginTwo]);
assert.equal(loginButton.disabled, false);
assert.equal(loginButton.textContent, 'Ingresar al Catálogo →');

console.log('performance-runtime: PASS');
