// Register happy-dom for DOM helpers (document.createElement etc.) used by
// paginator tests. happy-dom's `register()` also replaces `globalThis.fetch`
// with a Same-Origin-Policy-enforcing version — that breaks the live-Drust
// tests in server/ when `bun test` runs the whole suite (they share a single
// JS context). Capture Bun's native fetch first, then restore it immediately
// after registering — happy-dom's DOM stays in place, only its CORS-enforcing
// fetch is rolled back.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
const nativeFetch = globalThis.fetch;
GlobalRegistrator.register();
globalThis.fetch = nativeFetch;

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

// Direct test of splitListInPlace using a fake `overflows` derived from
// children count. We don't import it (it's not exported) — verify it through
// `paginate` once the main loop is in place (Task 5).
test('paginator.ts exports the public surface', async () => {
  const mod = await import('./paginator');
  expect(typeof mod.overflows).toBe('function');
  expect(typeof mod.splitTextInPlace).toBe('function');
});

test('paginate is exported', async () => {
  const mod = await import('./paginator');
  expect(typeof mod.paginate).toBe('function');
  expect(typeof mod.showPage).toBe('function');
});

// ── Video embed page-claim ───────────────────────────────────────
// `overflows()` reads scrollWidth/scrollHeight which happy-dom leaves at 0
// — so without measurement stubs, no text overflow ever triggers. That's
// fine here: the video-embed branch creates pages by class detection, not
// by measurement, so we can verify it deterministically.

test('paginate gives .video-embed its own page (break before + after)', async () => {
  const { paginate } = await import('./paginator');
  const article = document.createElement('article');
  article.innerHTML =
    '<p>before</p>' +
    '<div class="video-embed" data-provider="youtube"><iframe src="x"></iframe></div>' +
    '<p>after</p>';
  const manuscript = document.createElement('div');
  const pages = paginate(article, manuscript, 'horizontal-tb');

  expect(pages.length).toBe(3);
  expect(pages[0].textContent).toContain('before');
  expect(pages[1].classList.contains('video-page')).toBe(true);
  expect(pages[1].querySelector('.video-embed')).not.toBeNull();
  expect(pages[2].textContent).toContain('after');
});

test('paginate handles trailing video (no empty dangling page)', async () => {
  const { paginate } = await import('./paginator');
  const article = document.createElement('article');
  article.innerHTML =
    '<p>before</p>' +
    '<div class="video-embed" data-provider="youtube"><iframe src="x"></iframe></div>';
  const manuscript = document.createElement('div');
  const pages = paginate(article, manuscript, 'horizontal-tb');

  expect(pages.length).toBe(2);
  expect(pages[0].textContent).toContain('before');
  expect(pages[1].classList.contains('video-page')).toBe(true);
});

test('paginate forces horizontal writing-mode on video page even in 直書', async () => {
  const { paginate } = await import('./paginator');
  const article = document.createElement('article');
  article.innerHTML =
    '<div class="video-embed" data-provider="youtube"><iframe src="x"></iframe></div>';
  const manuscript = document.createElement('div');
  const pages = paginate(article, manuscript, 'vertical-rl');

  expect(pages.length).toBe(1);
  expect(pages[0].style.writingMode).toBe('horizontal-tb');
  expect(pages[0].classList.contains('video-page')).toBe(true);
});
