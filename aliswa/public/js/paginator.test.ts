import { test, expect } from 'bun:test';
import { findMaxFitting } from './paginator';

test('findMaxFitting returns N when every n in [1..N] fits', () => {
  // measure: each n is "cost n" units, max allowed 10 → all 1..10 fit
  const best = findMaxFitting(10, n => n, 10);
  expect(best).toBe(10);
});

test('findMaxFitting returns 0 when even n=1 overflows', () => {
  const best = findMaxFitting(10, n => 999 * n, 50);
  expect(best).toBe(0);
});

test('findMaxFitting finds the largest n whose measure stays under the budget', () => {
  // Linear cost; budget 35, each unit costs 4 → 35 / 4 = 8.75, so best = 8
  const best = findMaxFitting(20, n => n * 4, 35);
  expect(best).toBe(8);
});

test('findMaxFitting handles upperBound = 1', () => {
  expect(findMaxFitting(1, () => 5, 10)).toBe(1);
  expect(findMaxFitting(1, () => 15, 10)).toBe(0);
});

test('findMaxFitting handles upperBound = 0', () => {
  expect(findMaxFitting(0, () => 0, 10)).toBe(0);
});
