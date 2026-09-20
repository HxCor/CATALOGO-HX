import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let textWrites = 0;
let titleWrites = 0;
let observerCallback;
const frames = [];

const button = {
  _text: '✉️ Preparar correo',
  _title: '',
  get textContent() { return this._text; },
  set textContent(value) { textWrites += 1; this._text = value; },
  get title() { return this._title; },
  set title(value) { titleWrites += 1; this._title = value; }
};

const grid = {
  querySelectorAll(selector) { return selector === '.hx-email-btn' ? [button] : []; }
};

const context = {
  console,
  URLSearchParams,
  document: {
    querySelectorAll(selector) { return grid.querySelectorAll(selector); },
    getElementById(id) { return id === 'cardsGrid' ? grid : null; }
  },
  requestAnimationFrame(callback) { frames.push(callback); },
  MutationObserver: class {
    constructor(callback) { observerCallback = callback; }
    observe() {}
  },
  location: { href: '' },
  open() { return {}; }
};
context.window = context;

vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../mail-provider.js', import.meta.url), 'utf8'), context);

assert.equal(textWrites, 1, 'la etiqueta inicial se cambia una vez');
assert.equal(titleWrites, 1, 'el título inicial se cambia una vez');

observerCallback();
observerCallback();
assert.equal(frames.length, 1, 'varias mutaciones se agrupan en un solo frame');
frames.shift()();

assert.equal(textWrites, 1, 'no debe reescribir texto idéntico ni crear otro ciclo');
assert.equal(titleWrites, 1, 'no debe reescribir el título idéntico');

console.log('mail-provider-performance: PASS');
