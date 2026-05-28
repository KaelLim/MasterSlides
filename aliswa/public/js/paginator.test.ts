// Register happy-dom BEFORE bun:test so the helpers can operate on real DOM
// elements in the unit tests. Scoped to this file so storage/drust tests still
// see Bun's native fetch.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

import { test, expect } from 'bun:test';
import { overflows } from './paginator';

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
