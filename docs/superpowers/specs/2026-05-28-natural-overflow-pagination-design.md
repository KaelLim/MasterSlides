# Pagination Rewrite v2 — Natural Overflow + scrollWidth Detection

**Date:** 2026-05-28
**Status:** Ready for review
**Scope:** Replace `aliswa/public/js/paginator.ts` with a new algorithm that builds pages directly inside the final slide-page container and detects overflow via `scrollWidth`/`scrollHeight`. Drop the hidden-wrapper measurement context. Eliminate the wrapper-vs-render mismatch that produced visible cropping at narrow viewports and tablet-portrait layouts.

**Supersedes:** `2026-05-28-pagination-rewrite-design.md` (pure-DOM binary search in a hidden wrapper).

---

## Background

The previous rewrite removed `@chenglou/pretext` and replaced text/list splits with DOM binary search. Tests passed in isolation, but the user reported visible cropping at narrow viewports:

> 還是有問題，超出介面了！... 並非用數學計算？不能用自然排版？在 div 中超出，就下一個 div？

The user's diagnosis is correct. The current paginator measures inside a **hidden wrapper** with explicit pixel dimensions:

```javascript
// app.js#repaginate (current)
const wrapper = document.createElement('div');
wrapper.style.position = 'absolute';
wrapper.style.visibility = 'hidden';
wrapper.style.writingMode = currentWritingMode;
wrapper.style.width  = containerWidth  + 'px';
wrapper.style.height = containerHeight + 'px';
// → all children appended here, paginate measures here
```

The rendered pages, however, live inside `.slide-page` divs whose CSS is `width: 100%; height: 100%`. The two contexts produce slightly different line-break decisions because:

1. **Snapshot vs live container size.** `containerWidth` is read once at the start of `repaginate`. If the layout shifts between paginate and render (font load, scrollbar, tablet rotation, dev-tools opening, soft keyboard), `.slide-page` resizes but the precomputed pages stay sized to the snapshot.
2. **Pixel pegging vs percentage flow.** Browsers can resolve line breaks slightly differently between `width: 1660px` and `width: 100%`. At a budget of 1 char-width per column in `vertical-rl`, one pixel of drift puts the last column outside the visible area.
3. **CSS inheritance chain.** Hidden wrapper inherits manuscript styles; slide-page inherits manuscript styles AND has its own `class`-bound rules in `slides-aliswa.css`. Functionally similar, not byte-identical for the layout engine.

A handful of patches (DOM-verify, contain-fit, aspect-ratio cells) softened the symptoms but never eliminated the root cause: **measurement happens in a different DOM context than rendering.**

The user's proposed fix collapses the two contexts into one: build pages by progressively appending elements **directly into the final slide-page**, observe `scrollWidth`/`scrollHeight`, retract and start a new page when overflow is detected. The browser performs the actual layout; we just watch it.

## Goals

- **Zero context mismatch.** Every measurement happens in the slide-page that will be displayed. Whatever the browser decides during paginate is exactly what the user sees.
- **Natural pagination.** Lean on CSS flow and `overflow` detection instead of recomputing widths and line counts.
- **Same public API.** `paginate` / `renderPages` / `showPage` exports stay (signatures may change; callers in `app.js#repaginate` update once).
- **Smaller, simpler code.** Estimated ~120 lines, down from ~290 in the current paginator.

## Non-Goals

- Changing `slide-page` CSS, font scaling, or the `--font-scale` variable.
- Changing the resize-handler or repaginate triggers in `app.js`.
- Performance optimisation beyond what the algorithm naturally provides.
- Re-introducing pretext or any external typesetting lib.

## Algorithm

### Top-level loop

```
paginate(article, manuscript, writingMode):
  manuscript.innerHTML = ''            # clear out wrapper/old slide-pages
  current = createSlidePage(append into manuscript, writingMode)

  for el of article.children:
    HR                                 → current = createSlidePage(...); continue
    H1/H2 + current.has_content        → current = createSlidePage(...)
    IMG                                → scaleImageToFit(el, current.clientBlockSize)

    current.appendChild(el)            # try to place

    if not overflows(current, writingMode):
      continue                         # fits, move on

    # Overflowed. Retract.
    current.removeChild(el)

    if current.has_content:
      # current page has prior content — el goes onto a fresh page (carry orphan headings if they still fit)
      current = pushOntoFreshPage(el, current, writingMode, manuscript)
      if not overflows(current, writingMode):
        continue
      # el alone STILL overflows → falls through to split

    # el is alone on the page and overflows → must split
    leftover = splitInPlace(el, current, writingMode)
    if leftover is null:
      # split refused (unsplittable, e.g. lone IMG too big after scale) — accept overflow
      continue
    # Process leftover next: requeue it at the head of children
    children.unshift(leftover)

  return all .slide-page elements appended to manuscript
```

### `overflows(page, writingMode)`

```typescript
function overflows(page: HTMLElement, writingMode: WritingMode): boolean {
  const blockOverflow = writingMode === 'vertical-rl'
    ? page.scrollWidth  > page.clientWidth  + 1
    : page.scrollHeight > page.clientHeight + 1;
  const inlineOverflow = writingMode === 'vertical-rl'
    ? page.scrollHeight > page.clientHeight + 1
    : page.scrollWidth  > page.clientWidth  + 1;
  return blockOverflow || inlineOverflow;
}
```

Both axes are checked because, in practice, a single very-long-word LI can overflow inline (column doesn't break) while a too-wide image overflows block. The `+1` allows for sub-pixel rounding without misfiring.

### `createSlidePage(manuscript, writingMode)`

```typescript
function createSlidePage(manuscript: HTMLElement, writingMode: WritingMode): HTMLElement {
  const page = document.createElement('div');
  page.className = 'slide-page';
  page.dataset.page = String(manuscript.querySelectorAll('.slide-page').length);
  if (writingMode === 'vertical-rl') {
    page.style.writingMode = 'vertical-rl';
    page.style.textOrientation = 'mixed';
  } else {
    page.style.writingMode = 'horizontal-tb';
  }
  manuscript.appendChild(page);
  return page;
}
```

The slide-page is the *final* container — same class, same parent, same CSS inheritance as what the user sees. `display` stays at the CSS default (block); subsequent `showPage(i)` toggles `style.display` to switch between pages.

### `splitInPlace(el, page, writingMode)`

The element is already in `page` and overflows. Binary-search the largest prefix that doesn't overflow.

**Text element (P, H, LI, BLOCKQUOTE):** binary-search character index.

```typescript
function splitTextInPlace(el: HTMLElement, page: HTMLElement, wm: WritingMode): HTMLElement | null {
  const text = el.textContent ?? '';
  if (text.length < 2) return null;

  let lo = 1, hi = text.length, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    el.textContent = text.slice(0, mid);
    if (overflows(page, wm)) { hi = mid - 1; } else { best = mid; lo = mid + 1; }
  }

  if (best === 0) {
    el.textContent = text;          // restore (caller decides: skip or accept overflow)
    return null;
  }
  if (best >= text.length) {
    el.textContent = text;          // whole thing fits — caller shouldn't have asked
    return null;
  }

  el.textContent = text.slice(0, best);
  const leftover = el.cloneNode(false) as HTMLElement;
  leftover.textContent = text.slice(best);
  return leftover;                  // queue for next page
}
```

**List (UL, OL):** binary-search LI count, retracting from the end. If even one LI overflows, descend into that LI's text.

```typescript
function splitListInPlace(el: HTMLElement, page: HTMLElement, wm: WritingMode): HTMLElement | null {
  const items = Array.from(el.children).filter(c => c.tagName === 'LI') as HTMLElement[];
  if (items.length === 0) return null;

  if (items.length >= 2) {
    // el is already in page with all items. Pop from the end until it fits.
    const removed: HTMLElement[] = [];
    while (overflows(page, wm) && items.length - removed.length > 1) {
      const last = el.lastElementChild;
      if (!last || last.tagName !== 'LI') break;
      el.removeChild(last);
      removed.unshift(last as HTMLElement);
    }
    if (!overflows(page, wm) && removed.length > 0) {
      const leftover = el.cloneNode(false) as HTMLElement;
      for (const li of removed) leftover.appendChild(li);
      return leftover;
    }
    // We're down to one item and still overflow → fall through to per-LI text split.
  }

  // Single-LI list (or multi-LI reduced to single by retraction) whose LI overflows.
  // Move the surviving LIs out, split the first one's text.
  const li = el.firstElementChild as HTMLElement | null;
  if (!li || li.tagName !== 'LI') return null;

  const tail = items.slice(items.indexOf(li) + 1);
  for (const t of tail) if (t.parentElement === el) el.removeChild(t);

  const liLeftover = splitTextInPlace(li, page, wm);
  if (!liLeftover) {
    // restore items we removed
    for (const t of tail) el.appendChild(t);
    return null;
  }

  const leftover = el.cloneNode(false) as HTMLElement;
  leftover.appendChild(liLeftover);
  for (const t of tail) leftover.appendChild(t);
  return leftover;
}
```

**Anything else (IMG, TABLE):** can't split → caller accepts that one page overflows. Image is already capped to `maxBlockSize` by `scaleImageToFit` before placement, so this should be rare in practice.

### Orphan headings

Same idea as today, but expressed in the natural-flow model:

When `pushOntoFreshPage(el, currentPage, ...)` decides to move `el` to a new page, it peeks at the **trailing headings** on `currentPage`. For each trailing `<h1>/h2/h3/h4>`, it asks "would this heading fit alongside `el` on the new page?" — by speculatively moving it and re-checking `overflows`. If yes, carry it; if no, leave it on the previous page.

The speculative re-check is just DOM mutation + `overflows`, no math.

## Public API

```typescript
export type WritingMode = 'vertical-rl' | 'horizontal-tb';

// Builds .slide-page children directly under manuscript. Returns the page elements
// in the order they were created. The slide-pages are appended live; no separate
// renderPages step is needed.
export function paginate(
  article: HTMLElement,
  manuscript: HTMLElement,
  writingMode: WritingMode
): HTMLElement[];

// Show the page at index, hide the rest.
export function showPage(index: number): void;
```

`renderPages` from the previous API is **removed** — `paginate` now creates the slide-pages directly, no two-step process.

`scaleImageToFit` stays internal to paginator; it's called from inside the loop.

## Caller change (`app.js#repaginate`)

**Before** (current):

```javascript
function repaginate() {
  const containerWidth = dom.manuscriptContainer.clientWidth;
  const containerHeight = dom.manuscriptContainer.clientHeight;

  dom.manuscript.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.style.position = 'absolute';
  wrapper.style.visibility = 'hidden';
  wrapper.style.writingMode = currentWritingMode;
  wrapper.style.textOrientation = 'mixed';
  wrapper.style.width = containerWidth + 'px';
  wrapper.style.height = containerHeight + 'px';
  allPageElements.forEach(el => wrapper.appendChild(el));
  dom.manuscript.appendChild(wrapper);

  const pages = paginate(wrapper, containerWidth, containerHeight, currentWritingMode);

  dom.manuscript.removeChild(wrapper);
  renderPages(dom.manuscript, pages, currentWritingMode);

  updatePageCount();
  goToPage(Math.min(state.currentPage, state.totalPages - 1));
}
```

**After** (this spec):

```javascript
function repaginate() {
  // Reattach the original article (or its children) so paginate has a fresh
  // structure to walk. allPageElements is the canonical list captured at load.
  const article = document.createElement('article');
  article.className = 'slide-content';
  allPageElements.forEach(el => article.appendChild(el));

  paginate(article, dom.manuscript, currentWritingMode);

  updatePageCount();
  goToPage(Math.min(state.currentPage, state.totalPages - 1));
}
```

The wrapper, the container W/H snapshots, and the two-step paginate-then-renderPages dance all disappear. The slide-pages already exist as final-context divs by the time `paginate` returns.

## Files changed

| File | Action |
|---|---|
| `aliswa/public/js/paginator.ts` | **Rewrite.** Replace contents with the new algorithm (~120 lines). |
| `aliswa/public/js/paginator.test.ts` | **Rewrite.** Old tests targeted `findMaxFitting` and `splitListByCount`, which no longer exist. New tests target `overflows`, `splitTextInPlace` (via small in-DOM smoke), `paginate` end-to-end (with happy-dom limits acknowledged). |
| `aliswa/public/js/app.js` | **Modify.** Update `repaginate` to the simpler call shape. |
| `CLAUDE.md` | **Modify.** Update the Aliswa pagination bullet to describe natural-overflow detection. |

## Compatibility notes

- `WritingMode` type is re-exported with the same shape; consumers unaffected.
- `paginate`'s signature changes from `(manuscript, w, h, mode) → HTMLElement[][]` to `(article, manuscript, mode) → HTMLElement[]`. The caller in `app.js` is the only one and is updated.
- `renderPages` is removed; `app.js` stops calling it.
- `showPage` is kept with the same signature.
- The exports `findMaxFitting` and `splitListByCount` were public for tests only; both are removed.

## Edge cases & risks

1. **`overflows` flapping during measurement.** Forced layout on every append in a 70-element doc is ~70 reflows. Each reflow is ~1–3 ms in a typical browser, so ~70–200 ms total. Acceptable. If a doc has many splits, binary search adds `log₂(N)` reflows per split — still bounded.
2. **`scrollWidth`/`scrollHeight` rounding.** Browser rounds to integer pixels. The `+1` slack in `overflows` covers sub-pixel cases.
3. **`html2canvas` table conversion.** This runs *before* `paginate` (in `app.js#loadDocument`). Tables become `<img class="table-image">` before pagination. No interaction with the new algorithm.
4. **Lazy image loading.** All images already `await Promise.all(...)` before paginate, per `app.js#loadDocument`. No change.
5. **Empty article.** `paginate` creates one empty slide-page, returns `[page0]`. `updatePageCount` reads `Math.max(1, …)`. Fine.
6. **Forced break elements.** `<hr>` and any element with `forcesBreakBefore` create a new page even if the current one isn't full; this is the only place pages can be "wasted" by design.
7. **happy-dom test limits.** happy-dom doesn't implement layout — `offsetWidth`, `scrollWidth`, etc. return 0/synthetic values. Algorithmic correctness tests will mock `scrollWidth` directly on test fixtures; full overflow behaviour is verified by browser smoke (see Testing).

## Testing

**Unit (happy-dom):**

- `overflows` returns true when `scrollWidth > clientWidth + 1` and false otherwise. Use synthetic objects, not real layout.
- `splitTextInPlace` correctness: given a stubbed `overflows` that flips at a known character index, the function produces the expected first half and leftover and never returns a longer first half than the budget.
- `paginate` with a stubbed `overflows` produces the expected page boundaries for a small fixture (3 elements, 2 pages, single split).

**Browser smoke (manual + Chrome MCP):**

- Reload at scales 0.5×, 1.0×, 1.4×, 1.5×; assert every `.slide-page` has `scrollWidth ≤ clientWidth + 1` AND `scrollHeight ≤ clientHeight + 1`.
- Reproduce the previously-broken cases: 執辦 + UL list at 1.4×, narrow-viewport overflow that triggered this rewrite. Confirm zero clipping.
- Resize the window mid-session; trigger repaginate via the existing 200 ms debounce; assert no overflow on the new pages.

## Out of scope

- Reflowing on `intersectionObserver` (lazy pagination).
- Caching slide-page measurements across repaginates.
- Server-side pre-pagination (Puppeteer / playwright headless).

## Done definition

- `paginator.ts` rewritten to the natural-overflow algorithm, ≤ 150 lines.
- `paginator.test.ts` covers `overflows` and `splitTextInPlace` with stubs; passes under `bun test`.
- `app.js#repaginate` uses the new API; the old wrapper code is gone.
- `bunx tsc --noEmit` clean.
- `bun run build` produces a bundle.
- Browser smoke at 1.0× / 1.4× / 1.5× shows zero overflowing `.slide-page` elements on the migrated doc.
- The narrow-viewport repro that motivated this rewrite no longer clips characters.
- CLAUDE.md updated to describe the new algorithm.
