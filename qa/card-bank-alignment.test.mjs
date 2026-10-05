import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let mutationCallback;

function makeClassList(names = []) {
  const values = new Set(names);
  return {
    contains(name) { return values.has(name); },
    add(name) { values.add(name); }
  };
}

function makeCard(top, naturalFooterTop) {
  const spacerHolder = { current: null };
  const footer = {
    previousElementSibling: null,
    getBoundingClientRect() {
      const extra = Number.parseFloat(spacerHolder.current?.style.height) || 0;
      return { top: top + naturalFooterTop + extra };
    }
  };
  const card = {
    classList: makeClassList(['pcard']),
    querySelector(selector) { return selector === '.pcard-footer' ? footer : null; },
    getBoundingClientRect() { return { top }; },
    insertBefore(spacer) {
      spacerHolder.current = spacer;
      footer.previousElementSibling = spacer;
    }
  };
  return { card, footer, spacerHolder };
}

const first = makeCard(20, 120);
const second = makeCard(20, 210);
const cards = [first.card, second.card];
const grid = {
  dataset: {},
  querySelectorAll(selector) { return selector === '.pcard' ? cards : []; },
  getBoundingClientRect() { return { top: 0 }; }
};
const head = { appendChild() {} };

const context = {
  console,
  document: {
    readyState: 'complete',
    head,
    fonts: { ready: Promise.resolve() },
    getElementById(id) {
      if (id === 'cardsGrid') return grid;
      return null;
    },
    createElement(type) {
      if (type === 'style') return { id: '', textContent: '' };
      return {
        className: '',
        classList: makeClassList(['hx-bank-align-spacer']),
        style: { height: '0px' },
        setAttribute() {}
      };
    },
    documentElement: {}
  },
  MutationObserver: class {
    constructor(callback) { mutationCallback = callback; }
    observe() {}
    disconnect() {}
  },
  ResizeObserver: class {
    constructor() {}
    observe() {}
    disconnect() {}
  },
  requestAnimationFrame(callback) { callback(); },
  addEventListener() {}
};
context.window = context;

vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../card-bank-alignment.js', import.meta.url), 'utf8'), context);

const firstHeight = Number.parseFloat(first.spacerHolder.current.style.height);
const secondHeight = Number.parseFloat(second.spacerHolder.current.style.height);
assert.equal(firstHeight, 90);
assert.equal(secondHeight, 0);
assert.equal(120 + firstHeight, 210 + secondHeight, 'las franjas existentes deben quedar parejas');

const added = makeCard(20, 80);
cards.push(added.card);
mutationCallback();
const addedHeight = Number.parseFloat(added.spacerHolder.current.style.height);
assert.equal(80 + addedHeight, 210, 'una empresa nueva debe heredar la misma alineación');
assert.equal(grid.dataset.hxBankAlignment, 'ready');

console.log('card-bank-alignment: PASS');
