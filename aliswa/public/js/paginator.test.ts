// Register happy-dom BEFORE importing bun:test so document.createElement works
// in the splitListByCount tests. Scoped to this file so storage / drust tests
// (which need Bun's native fetch for live HTTP) aren't affected.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

import { test, expect } from 'bun:test';
import { findMaxFitting, splitListByCount } from './paginator';

test('findMaxFitting returns N when every n in [1..N] fits', () => {
  // measure: each n is "cost n" units, max allowed 10 → all 1..10 fit
  const best = findMaxFitting(10, (n: number) => n, 10);
  expect(best).toBe(10);
});

test('findMaxFitting returns 0 when even n=1 overflows', () => {
  const best = findMaxFitting(10, (n: number) => 999 * n, 50);
  expect(best).toBe(0);
});

test('findMaxFitting finds the largest n whose measure stays under the budget', () => {
  // Linear cost; budget 35, each unit costs 4 → 35 / 4 = 8.75, so best = 8
  const best = findMaxFitting(20, (n: number) => n * 4, 35);
  expect(best).toBe(8);
});

test('findMaxFitting handles upperBound = 1', () => {
  expect(findMaxFitting(1, () => 5, 10)).toBe(1);
  expect(findMaxFitting(1, () => 15, 10)).toBe(0);
});

test('findMaxFitting handles upperBound = 0', () => {
  expect(findMaxFitting(0, () => 0, 10)).toBe(0);
});

test('splitListByCount puts first N items in first list, rest in second', () => {
  const ul = document.createElement('ul');
  const items = ['a', 'b', 'c', 'd'].map(t => {
    const li = document.createElement('li');
    li.textContent = t;
    return li;
  });
  const [first, second] = splitListByCount(ul, items, 2);
  expect(Array.from(first.children).map((c: Element) => c.textContent)).toEqual(['a', 'b']);
  expect(Array.from(second.children).map((c: Element) => c.textContent)).toEqual(['c', 'd']);
  expect(first.tagName).toBe('UL');
  expect(second.tagName).toBe('UL');
});

test('splitListByCount clones list element type (OL stays OL)', () => {
  const ol = document.createElement('ol');
  const items = [document.createElement('li')];
  const [first] = splitListByCount(ol, items, 1);
  expect(first.tagName).toBe('OL');
});
