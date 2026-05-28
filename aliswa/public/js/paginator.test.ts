// Register happy-dom BEFORE bun:test so the helpers can operate on real DOM
// elements in the unit tests. Scoped to this file so storage/drust tests still
// see Bun's native fetch.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

import { test, expect } from 'bun:test';
import { overflows, splitTextInPlace } from './paginator';

function fakePage(scrollW: number, clientW: number, scrollH: number, clientH: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollWidth',  { value: scrollW,  configurable: true });
  Object.defineProperty(el, 'clientWidth',  { value: clientW,  configurable: true });
  Object.defineProperty(el, 'scrollHeight', { value: scrollH,  configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientH,  configurable: true });
  return el;
}

test('overflows returns false when content fits exactly', () => {
  expect(overflows(fakePage(100, 100, 200, 200))).toBe(false);
});

test('overflows returns false within 1px tolerance', () => {
  expect(overflows(fakePage(101, 100, 201, 200))).toBe(false);
});

test('overflows returns true when block axis exceeds client by 2px', () => {
  expect(overflows(fakePage(102, 100, 200, 200))).toBe(true);
});

test('overflows returns true when inline axis exceeds client by 2px', () => {
  expect(overflows(fakePage(100, 100, 202, 200))).toBe(true);
});

// Build a fake page+element pair whose `overflows` flips based on a budget over
// character count. We monkey-patch `page.scrollWidth` to reflect the cloned
// element's current text length. Equivalent to "1 char = 1 unit, budget = N".
function makeFakePageAndEl(maxChars: number): { page: HTMLElement; el: HTMLElement } {
  const page = document.createElement('div');
  Object.defineProperty(page, 'clientWidth',  { value: maxChars, configurable: true });
  Object.defineProperty(page, 'clientHeight', { value: 1000,     configurable: true });
  Object.defineProperty(page, 'scrollHeight', { value: 0,        configurable: true });
  const el = document.createElement('p');
  page.appendChild(el);
  Object.defineProperty(page, 'scrollWidth', {
    configurable: true,
    get() { return (el.textContent ?? '').length; },
  });
  return { page, el };
}

test('splitTextInPlace returns null for empty text', () => {
  const { page, el } = makeFakePageAndEl(5);
  el.textContent = '';
  expect(splitTextInPlace(el, page)).toBeNull();
});

test('splitTextInPlace returns null when whole text already fits', () => {
  const { page, el } = makeFakePageAndEl(50);
  el.textContent = 'short text';     // 10 chars, fits in 50
  expect(splitTextInPlace(el, page)).toBeNull();
  expect(el.textContent).toBe('short text');
});

test('splitTextInPlace splits at the max fitting boundary', () => {
  const { page, el } = makeFakePageAndEl(4);
  el.textContent = 'abcdefghij';     // 10 chars, budget 4 (+1 tolerance) → first 5 fit
  const leftover = splitTextInPlace(el, page);
  expect(el.textContent).toBe('abcde');
  expect(leftover).not.toBeNull();
  expect(leftover!.textContent).toBe('fghij');
  expect(leftover!.tagName).toBe('P');
});

test('splitTextInPlace returns null when even 1 char overflows (restores original)', () => {
  const { page, el } = makeFakePageAndEl(-2);  // budget -2 (+1 tolerance) → even 1 char overflows
  el.textContent = 'abc';
  expect(splitTextInPlace(el, page)).toBeNull();
  expect(el.textContent).toBe('abc'); // restored
});
