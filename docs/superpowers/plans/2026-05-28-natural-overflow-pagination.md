# Natural-Overflow Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Use codegraph** for lookups across `aliswa/public/js/` and `aliswa/server/` whenever a task asks you to inspect existing code. `codegraph_context` for "what's the deal with X", `codegraph_node` / `codegraph_explore` for source. Do NOT grep first — codegraph already has the AST.

**Goal:** Replace `paginator.ts` with a natural-overflow algorithm that builds `.slide-page` divs directly inside `manuscript`, uses `scrollWidth`/`scrollHeight` as the only overflow signal, and eliminates the hidden-wrapper measurement context.

**Architecture:** Pages are constructed live in their final display container. Each element is appended, overflow is checked, and on overflow the element is retracted and either moved to a new page or split in place via binary search of `textContent` length. No precomputed pages, no two-step paginate-then-render dance.

**Tech Stack:** TypeScript (Bun built-in TS), `bun test`, happy-dom for unit fixtures, Chrome MCP for browser smoke. Existing aliswa setup unchanged.

**Reference spec:** `docs/superpowers/specs/2026-05-28-natural-overflow-pagination-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `aliswa/public/js/paginator.ts` | **rewrite** | Natural-overflow algorithm. Exports `paginate`, `showPage`, `WritingMode`. |
| `aliswa/public/js/paginator.test.ts` | **rewrite** | Stub-based unit tests for `overflows`, `splitTextInPlace`, plus an end-to-end happy-dom smoke for `paginate` (the algorithm is correctness-testable even when layout is faked — we stub `scrollWidth`). |
| `aliswa/public/js/app.js` | **modify** | `repaginate` drops the hidden wrapper and the two-step paginate/renderPages dance. |
| `CLAUDE.md` | **modify** | Update the Aliswa pagination bullet. |

Existing `bunfig.toml` + happy-dom scoped import in the test file stay as-is.

---

## Task 1: Wipe paginator.ts to a fresh TS skeleton

**Why:** The previous rewrite's binary-search-in-wrapper approach is the wrong starting point. Start from a typed skeleton so we don't accidentally reuse helpers (e.g., `findMaxFitting`, `splitListByCount`) whose contracts don't match the new algorithm.

**Files:**
- Rewrite: `aliswa/public/js/paginator.ts`
- Rewrite: `aliswa/public/js/paginator.test.ts`

- [ ] **Step 1: Use codegraph to confirm the current exports**

```
codegraph_search { query: "paginate", kind: "function" }
codegraph_search { query: "showPage" }
codegraph_search { query: "renderPages" }
```

Note that `paginate`, `renderPages`, `showPage`, `findMaxFitting`, `splitListByCount`, `WritingMode` are currently exported. The new file will export only `paginate`, `showPage`, `WritingMode`.

- [ ] **Step 2: Replace `aliswa/public/js/paginator.ts` contents with this skeleton**

```typescript
// Natural-overflow paginator. Pages are constructed directly inside the final
// manuscript container; `scrollWidth`/`scrollHeight` is the only overflow signal.
// No hidden wrapper, no precomputed page arrays, no separate render step.

export type WritingMode = 'vertical-rl' | 'horizontal-tb';

// ── Overflow detection ────────────────────────────────────────

// `+1` slack absorbs sub-pixel rounding without misfiring on real overflows.
function overflows(page: HTMLElement): boolean {
  return (
    page.scrollWidth  > page.clientWidth  + 1 ||
    page.scrollHeight > page.clientHeight + 1
  );
}
```

- [ ] **Step 3: Replace `aliswa/public/js/paginator.test.ts` contents with a fresh test file**

```typescript
// Register happy-dom BEFORE bun:test so the helpers can operate on real DOM
// elements in the unit tests. Scoped to this file so storage/drust tests still
// see Bun's native fetch.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

import { test, expect } from 'bun:test';
```

- [ ] **Step 4: Type-check + tests pass empty**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator/aliswa
bunx tsc --noEmit
bun test public/js/paginator.test.ts
```

Expected: tsc clean, `0 pass / 0 fail / Ran 0 tests`. Skeleton compiles, no tests yet.

If `bun install` hasn't been run in this worktree, do that first:

```bash
bun install
```

- [ ] **Step 5: Commit**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator
git add aliswa/public/js/paginator.ts aliswa/public/js/paginator.test.ts
git commit -m "$(cat <<'EOF'
feat(aliswa): start natural-overflow paginator — skeleton + overflows

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Unit-test `overflows` with stubbed DOM elements

**Why:** `overflows` is one line, but it's the **only** signal the whole algorithm leans on. Lock its semantics in.

**Files:**
- Modify: `aliswa/public/js/paginator.test.ts`
- Modify: `aliswa/public/js/paginator.ts` (export `overflows` for testing)

- [ ] **Step 1: Add the failing tests**

Append to `paginator.test.ts`:

```typescript

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
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator/aliswa
bun test public/js/paginator.test.ts
```

Expected: 4 fail with `overflows is not defined` / import error.

- [ ] **Step 3: Add `export` to `overflows`**

In `aliswa/public/js/paginator.ts`, change the declaration to:

```typescript
export function overflows(page: HTMLElement): boolean {
  return (
    page.scrollWidth  > page.clientWidth  + 1 ||
    page.scrollHeight > page.clientHeight + 1
  );
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator/aliswa
bun test public/js/paginator.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator
git add aliswa/public/js/paginator.ts aliswa/public/js/paginator.test.ts
git commit -m "$(cat <<'EOF'
feat(aliswa): overflows() helper + unit tests with stubbed DOM dimensions

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `splitTextInPlace` — binary-search character split in the page itself

**Why:** When a text element overflows the page alone, we have to chop its `textContent`. The chop happens in the *final* slide-page, so the same DOM context drives both the measurement and the eventual render.

**Files:**
- Modify: `aliswa/public/js/paginator.test.ts`
- Modify: `aliswa/public/js/paginator.ts`

- [ ] **Step 1: Write failing tests**

Append to `paginator.test.ts`:

```typescript

import { splitTextInPlace } from './paginator';

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
  const { page, el } = makeFakePageAndEl(5);
  el.textContent = 'abcdefghij';     // 10 chars, budget 5 → first 5 fit
  const leftover = splitTextInPlace(el, page);
  expect(el.textContent).toBe('abcde');
  expect(leftover).not.toBeNull();
  expect(leftover!.textContent).toBe('fghij');
  expect(leftover!.tagName).toBe('P');
});

test('splitTextInPlace returns null when even 1 char overflows (restores original)', () => {
  const { page, el } = makeFakePageAndEl(0);
  el.textContent = 'abc';
  expect(splitTextInPlace(el, page)).toBeNull();
  expect(el.textContent).toBe('abc'); // restored
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator/aliswa
bun test public/js/paginator.test.ts
```

Expected: 4 new tests fail with `splitTextInPlace is not defined`.

- [ ] **Step 3: Implement `splitTextInPlace` — append to paginator.ts**

```typescript

// ── In-page split helpers ──────────────────────────────────────

/**
 * Binary-search the largest prefix of `el`'s text that doesn't overflow `page`.
 * `el` must already be a child of `page`. On success, mutates `el.textContent`
 * to the fitting prefix and returns a new element (clone of `el`) holding the
 * remainder. Returns null when no split makes sense (empty / nothing fits /
 * already fits as a whole).
 */
export function splitTextInPlace(
  el: HTMLElement,
  page: HTMLElement
): HTMLElement | null {
  const text = el.textContent ?? '';
  if (text.length < 2) return null;

  // Already fits — caller shouldn't have asked.
  if (!overflows(page)) return null;

  let lo = 1, hi = text.length, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    el.textContent = text.slice(0, mid);
    if (overflows(page)) { hi = mid - 1; } else { best = mid; lo = mid + 1; }
  }

  if (best === 0) {
    el.textContent = text;            // restore; caller decides next step
    return null;
  }

  el.textContent = text.slice(0, best);
  const leftover = el.cloneNode(false) as HTMLElement;
  leftover.textContent = text.slice(best);
  return leftover;
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator/aliswa
bun test public/js/paginator.test.ts
```

Expected: 8/8 pass (4 overflows + 4 splitText).

- [ ] **Step 5: Commit**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator
git add aliswa/public/js/paginator.ts aliswa/public/js/paginator.test.ts
git commit -m "$(cat <<'EOF'
feat(aliswa): splitTextInPlace — binary-search char split within page

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `splitListInPlace` — retract LIs from the end, fall back to LI-text split

**Why:** UL/OL are containers. The natural model: append the whole list, retract items from the end while it overflows. If even one item won't fit, descend into that item's text.

**Files:**
- Modify: `aliswa/public/js/paginator.ts`

- [ ] **Step 1: Implement `splitListInPlace` — append to paginator.ts**

```typescript

/**
 * `el` (a UL or OL) is already a child of `page` and overflows. Retract LIs
 * from the end until it fits; pack the retracted LIs into a cloned list
 * returned to the caller. If the list is down to a single LI and still
 * overflows, descend into that LI's text via `splitTextInPlace`.
 *
 * Returns the leftover list (or null if the list is fundamentally unsplittable).
 */
function splitListInPlace(
  el: HTMLElement,
  page: HTMLElement
): HTMLElement | null {
  const initialItems = Array.from(el.children).filter(c => c.tagName === 'LI') as HTMLElement[];
  if (initialItems.length === 0) return null;

  // Retract LIs from the end until the list fits or only 1 remains.
  const retracted: HTMLElement[] = [];
  while (overflows(page) && el.children.length > 1) {
    const last = el.lastElementChild as HTMLElement | null;
    if (!last || last.tagName !== 'LI') break;
    el.removeChild(last);
    retracted.unshift(last);
  }

  if (!overflows(page) && retracted.length > 0) {
    const leftover = el.cloneNode(false) as HTMLElement;
    for (const li of retracted) leftover.appendChild(li);
    return leftover;
  }

  // Single LI still overflows. Move any retracted tail out of the picture so
  // they end up after the LI-text split in the leftover list.
  const li = el.firstElementChild as HTMLElement | null;
  if (!li || li.tagName !== 'LI') {
    for (const r of retracted) el.appendChild(r);
    return null;
  }

  const liLeftover = splitTextInPlace(li, page);
  if (!liLeftover) {
    // Put retracted items back so render reflects the real state.
    for (const r of retracted) el.appendChild(r);
    return null;
  }

  const leftover = el.cloneNode(false) as HTMLElement;
  leftover.appendChild(liLeftover);
  for (const r of retracted) leftover.appendChild(r);
  return leftover;
}
```

- [ ] **Step 2: Add minimal smoke test for the multi-item retract path**

Append to `paginator.test.ts`:

```typescript

// Direct test of splitListInPlace using a fake `overflows` derived from
// children count. We don't import it (it's not exported) — verify it through
// `paginate` once the main loop is in place (Task 5).
test('paginator.ts exports the public surface', async () => {
  const mod = await import('./paginator');
  expect(typeof mod.overflows).toBe('function');
  expect(typeof mod.splitTextInPlace).toBe('function');
});
```

- [ ] **Step 3: Type-check + run tests**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator/aliswa
bunx tsc --noEmit
bun test public/js/paginator.test.ts
```

Expected: typecheck clean (with `splitListInPlace` showing as never-read — fine, Task 5 wires it up). 9/9 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator
git add aliswa/public/js/paginator.ts aliswa/public/js/paginator.test.ts
git commit -m "$(cat <<'EOF'
feat(aliswa): splitListInPlace — retract LIs / descend into LI text

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Element classification + image scaling helpers

**Why:** The main loop needs the same element predicates the old algorithm had (`isTextElement`, `isHeading`, `isListElement`, `forcesBreakBefore`) plus `scaleImageToFit`. They don't change semantically; just port them.

**Files:**
- Modify: `aliswa/public/js/paginator.ts`

- [ ] **Step 1: Append helpers to paginator.ts**

```typescript

// ── Element classification ─────────────────────────────────────

function forcesBreakBefore(el: HTMLElement): boolean {
  return el.tagName === 'H1' || el.tagName === 'H2';
}

function isTextElement(el: HTMLElement): boolean {
  return ['H1', 'H2', 'H3', 'H4', 'P', 'LI', 'BLOCKQUOTE'].includes(el.tagName);
}

function isHeading(el: HTMLElement): boolean {
  return ['H1', 'H2', 'H3', 'H4'].includes(el.tagName);
}

function isListElement(el: HTMLElement): boolean {
  return el.tagName === 'UL' || el.tagName === 'OL';
}

// ── Image scaling ──────────────────────────────────────────────

/**
 * Cap an oversized image to the page's block dimension so it doesn't single-
 * handedly overflow. Called BEFORE the image is appended to the page so the
 * cap is in place by the time the browser lays out.
 */
function scaleImageToFit(
  el: HTMLElement,
  page: HTMLElement,
  writingMode: WritingMode
): void {
  const maxBlock = writingMode === 'vertical-rl' ? page.clientWidth : page.clientHeight;
  const naturalBlock = writingMode === 'vertical-rl' ? el.offsetWidth : el.offsetHeight;
  if (naturalBlock > maxBlock && naturalBlock > 0) {
    const ratio = maxBlock / naturalBlock;
    el.style.maxWidth = `${el.offsetWidth * ratio}px`;
    el.style.maxHeight = `${el.offsetHeight * ratio}px`;
    el.style.objectFit = 'contain';
  }
}
```

- [ ] **Step 2: Type-check (expect "never read" warnings on the new helpers)**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator/aliswa
bunx tsc --noEmit
```

Expected: exit 0. "never read" warnings on `forcesBreakBefore`, `isTextElement`, `isHeading`, `isListElement`, `scaleImageToFit`, `splitListInPlace` are expected — Task 6 consumes them.

- [ ] **Step 3: Commit**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator
git add aliswa/public/js/paginator.ts
git commit -m "$(cat <<'EOF'
feat(aliswa): element classification + scaleImageToFit helpers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Main `paginate` loop + `showPage`

**Why:** The orchestrator. Walks article children, appends to current page, retracts on overflow, allocates fresh pages, carries orphan headings, queues leftovers from splits.

**Files:**
- Modify: `aliswa/public/js/paginator.ts`

- [ ] **Step 1: Append the main paginate + showPage to paginator.ts**

```typescript

// ── Page lifecycle ─────────────────────────────────────────────

function createSlidePage(manuscript: HTMLElement, writingMode: WritingMode): HTMLElement {
  const page = document.createElement('div');
  page.className = 'slide-page';
  page.dataset.page = String(manuscript.querySelectorAll(':scope > .slide-page').length);
  if (writingMode === 'vertical-rl') {
    page.style.writingMode = 'vertical-rl';
    page.style.textOrientation = 'mixed';
  } else {
    page.style.writingMode = 'horizontal-tb';
  }
  manuscript.appendChild(page);
  return page;
}

// ── Main pagination ───────────────────────────────────────────

/**
 * Lay out `article`'s children into one or more `.slide-page` divs inside
 * `manuscript`. Pages are appended live; the returned array is in
 * page-index order.
 */
export function paginate(
  article: HTMLElement,
  manuscript: HTMLElement,
  writingMode: WritingMode
): HTMLElement[] {
  // Snapshot the children up front so we can mutate the queue (push leftovers).
  // Detach them from `article` so the original parent isn't accidentally
  // measured. After paginate, `article` is empty; `manuscript` holds the pages.
  const queue: HTMLElement[] = Array.from(article.children) as HTMLElement[];
  for (const el of queue) article.removeChild(el);

  manuscript.innerHTML = '';
  let current = createSlidePage(manuscript, writingMode);

  while (queue.length > 0) {
    const el = queue.shift()!;

    if (el.tagName === 'HR') {
      current = createSlidePage(manuscript, writingMode);
      continue;
    }

    if (forcesBreakBefore(el) && current.children.length > 0) {
      current = createSlidePage(manuscript, writingMode);
    }

    if (el.tagName === 'IMG') {
      // Temporarily attach so we can read natural offset dimensions for cap math.
      current.appendChild(el);
      scaleImageToFit(el, current, writingMode);
      // Leave it in place; the overflow check below decides whether to keep it.
    } else {
      current.appendChild(el);
    }

    if (!overflows(current)) continue;

    // Overflow. Retract.
    current.removeChild(el);

    if (current.children.length > 0) {
      // Carry trailing headings (size-aware): only those that would still fit
      // alongside `el` on the new page travel; the rest stay on `current`.
      const carried: HTMLElement[] = [];
      const fresh = createSlidePage(manuscript, writingMode);

      // Move el onto fresh first so size-checks include it.
      fresh.appendChild(el);

      // Walk backwards through `current`'s trailing headings.
      while (current.lastElementChild && isHeading(current.lastElementChild as HTMLElement)) {
        const heading = current.lastElementChild as HTMLElement;
        current.removeChild(heading);
        fresh.insertBefore(heading, fresh.firstChild);
        if (overflows(fresh)) {
          // Heading + el together overflows the fresh page → revert this one heading.
          fresh.removeChild(heading);
          current.appendChild(heading);
          break;
        }
        carried.unshift(heading);
      }

      current = fresh;

      if (!overflows(current)) continue;
      // Even on a fresh page (possibly with carried headings) `el` overflows → must split.
    } else {
      // current was empty; el alone overflows.
      current.appendChild(el);
    }

    // Split `el` in place.
    let leftover: HTMLElement | null = null;
    if (isListElement(el)) {
      leftover = splitListInPlace(el, current);
    } else if (isTextElement(el)) {
      leftover = splitTextInPlace(el, current);
    }

    if (leftover) {
      // Process leftover next (pushes back to the front of the queue).
      queue.unshift(leftover);
    }
    // If split returned null (unsplittable, e.g. image alone too big after scale),
    // leave `el` in place and accept the overflow.
  }

  // showPage default: show first, hide rest.
  const pages = Array.from(manuscript.querySelectorAll<HTMLElement>(':scope > .slide-page'));
  pages.forEach((p, i) => { p.style.display = i === 0 ? '' : 'none'; });
  return pages;
}

// ── Page navigation ───────────────────────────────────────────

export function showPage(index: number): void {
  const pages = document.querySelectorAll<HTMLElement>('#manuscript > .slide-page');
  pages.forEach((p, i) => {
    p.style.display = i === index ? '' : 'none';
  });
}
```

- [ ] **Step 2: Smoke-test that `paginate` is exported correctly**

Append to `paginator.test.ts`:

```typescript

test('paginate is exported', async () => {
  const mod = await import('./paginator');
  expect(typeof mod.paginate).toBe('function');
  expect(typeof mod.showPage).toBe('function');
});
```

- [ ] **Step 3: Type-check + tests**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator/aliswa
bunx tsc --noEmit
bun test public/js/paginator.test.ts
```

Expected: typecheck exit 0 (all "never read" warnings gone — paginate consumes them all). 10/10 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator
git add aliswa/public/js/paginator.ts aliswa/public/js/paginator.test.ts
git commit -m "$(cat <<'EOF'
feat(aliswa): paginate() — natural overflow algorithm

Builds .slide-page divs directly inside manuscript. Each element is
appended live, overflow is detected via scrollWidth/scrollHeight, and
on overflow the element is retracted and moved to a fresh page or
split in place. No hidden wrapper, no precomputed page arrays.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update `app.js#repaginate` to the new API

**Why:** The caller is the only consumer. Drop the hidden wrapper, drop the `renderPages` step.

**Files:**
- Modify: `aliswa/public/js/app.js`

- [ ] **Step 1: Use codegraph to find the current call site**

```
codegraph_node { symbol: "repaginate" }
```

Confirm it lives in `aliswa/public/js/app.js` lines 50-76 with the wrapper code.

- [ ] **Step 2: Replace the body of `repaginate` in `app.js`**

Find this block in `aliswa/public/js/app.js`:

```javascript
function repaginate() {
  const containerWidth = dom.manuscriptContainer.clientWidth;
  const containerHeight = dom.manuscriptContainer.clientHeight;

  // Restore all elements back to manuscript for re-measurement
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

  // Measure and paginate
  const pages = paginate(wrapper, containerWidth, containerHeight, currentWritingMode);

  // Render pages
  dom.manuscript.removeChild(wrapper);
  renderPages(dom.manuscript, pages, currentWritingMode);

  // Update state
  updatePageCount();
  goToPage(Math.min(state.currentPage, state.totalPages - 1));
}
```

Replace with:

```javascript
function repaginate() {
  // Re-wrap the original elements in a fresh <article> so paginate has a
  // queue to walk. allPageElements is the canonical source captured at load.
  const article = document.createElement('article');
  article.className = 'slide-content';
  allPageElements.forEach(el => article.appendChild(el));

  // paginate() builds .slide-page children directly inside dom.manuscript.
  paginate(article, dom.manuscript, currentWritingMode);

  updatePageCount();
  goToPage(Math.min(state.currentPage, state.totalPages - 1));
}
```

- [ ] **Step 3: Remove `renderPages` from the import line in `app.js`**

Find this line near the top of the file:

```javascript
import { paginate, renderPages, showPage } from './paginator.ts';
```

Change to:

```javascript
import { paginate, showPage } from './paginator.ts';
```

- [ ] **Step 4: Type-check + tests**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator/aliswa
bunx tsc --noEmit
bun test public/js/paginator.test.ts
```

Expected: typecheck clean, 10/10 tests pass.

If tsc complains about `renderPages` still being referenced somewhere in `app.js`, search and remove the stale reference:

```bash
grep -n "renderPages" aliswa/public/js/app.js
```

Expected: no matches after the edit.

- [ ] **Step 5: Rebuild the bundle**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator/aliswa
bun run build
ls -la public/dist/app.js
```

Expected: bundle builds successfully. Size should be similar to or smaller than the previous bundle (no new deps).

- [ ] **Step 6: Commit**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator
git add aliswa/public/js/app.js
git commit -m "$(cat <<'EOF'
refactor(aliswa): repaginate uses new paginate API — no wrapper, no renderPages

paginate now builds slide-pages directly inside manuscript. The
hidden wrapper that measured in a different DOM context (and caused
the narrow-viewport overflow) is gone.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Aliswa pagination bullet**

Find this bullet under **Aliswa (Alternate Backend)** → **Key differences from the main stack**:

```markdown
- **Pagination**: pure-DOM binary-search pagination (`paginator.ts`) replaces the main viewer's CSS multi-column layout. Each split helper proves its first half fits via DOM measurement, so there is zero visible overflow at any supported font scale. Repaginates on font scale, orientation, and resize.
```

Replace with:

```markdown
- **Pagination**: natural-overflow pagination (`paginator.ts`). Elements are appended directly into the final `.slide-page` container; `scrollWidth`/`scrollHeight` is the only overflow signal. On overflow the element is retracted and moved to a fresh page or split in place via binary search of `textContent`. Because measurement happens in the final render context, there is no wrapper-vs-page mismatch — what the algorithm sees is exactly what the user sees. Repaginates on font scale, orientation, and resize.
```

- [ ] **Step 2: Update the ASCII pipeline diagram**

Find this block (around line 145-147 in `CLAUDE.md`):

```markdown
              slides.html  ──▶  paginator.ts (pure-DOM binary-search pagination)
                                 ├─ measure block elements (offsetWidth/Height)
                                 └─ binary search splits to prove zero overflow at scale
```

Replace with:

```markdown
              slides.html  ──▶  paginator.ts (natural-overflow pagination)
                                 ├─ append into slide-page; check scrollWidth/Height
                                 └─ retract + new page, or split textContent in place
```

- [ ] **Step 3: Commit**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: paginator is natural-overflow now — no wrapper, no precompute

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Browser smoke at 1.0× / 1.4× / 1.5× and the narrow-viewport repro

**Files:** None changed — verification only. Run the dev server and use Chrome MCP from the controller (this task is performed by the controller, not a subagent, since browser MCP tools aren't available inside subagent sessions).

- [ ] **Step 1: Make sure node_modules + .env are in this worktree**

```bash
cd /Users/kaellim/Desktop/projects/slides/.claude/worktrees/natural-overflow-paginator/aliswa
[ -d node_modules ] || bun install
[ -f .env ] || cp /Users/kaellim/Desktop/projects/slides/aliswa/.env .env
```

- [ ] **Step 2: Stop any existing aliswa server, then start this worktree's**

```bash
# Kill any old listener on :3000
fuser -k 3000/tcp 2>/dev/null || lsof -ti :3000 | xargs -r kill 2>/dev/null
sleep 1
bun run start > /tmp/aliswa-natural.log 2>&1 &
echo $! > /tmp/aliswa-natural.pid
sleep 2
curl -sSI http://localhost:3000/slides.html | head -3
```

Expected: `HTTP/1.1 200 OK` for slides.html. Server logs `Aliswa server running at http://localhost:3000`.

- [ ] **Step 3: Open the test doc and assert zero overflow at each scale**

Via Chrome MCP (controller-side):

For each scale in `[1.0, 1.4, 1.5]`:
- Set `localStorage.setItem('slides-font-size', '<scale>')`
- Reload `http://localhost:3000/?src=1EJi4AabcbPV2EqhxiTiv3KCLmlfD3R0cR1U3eOQHYzs&_b=<timestamp>`
- Wait for pagination to complete (`document.querySelectorAll('#manuscript > .slide-page').length > 0`)
- For each slide-page individually (NOT bulk display-block, which alters layout):
  - Briefly set `display: ''`, force-reflow with `void p.offsetWidth`
  - Read `scrollWidth`, `clientWidth`, `scrollHeight`, `clientHeight`
  - Restore previous display
- Collect pages where `scrollWidth > clientWidth + 1 || scrollHeight > clientHeight + 1`

Expected: zero such pages at every scale.

- [ ] **Step 4: Reproduce the narrow-viewport case the user reported**

Resize the Chrome window to ~700px wide (or use device emulation portrait tablet). Reload at 1.4×. Confirm:
- 執辦 page (look for H3 "執辦") — UL items fully visible, no clipping on leftmost column.
- Any P with long Chinese text — no column extends past the page boundary.

- [ ] **Step 5: Visual spot-check (Chrome MCP screenshot)**

Capture a screenshot of page 4 (the original 魏淑貞師姊 bug location) at 1.4×. Confirm visually no character cropping.

- [ ] **Step 6: Stop the server**

```bash
kill $(cat /tmp/aliswa-natural.pid) 2>/dev/null
```

No commit — verification only.

---

## Done

After Task 9:

- `paginator.ts` is the natural-overflow algorithm (≤ ~150 lines).
- `app.js#repaginate` is reduced to a few lines: rewrap children into an article, call `paginate(article, manuscript, mode)`, update page count.
- The hidden wrapper, `renderPages`, and the precomputed `pages` array are gone.
- 10+ unit tests pass under `bun test` (overflows, splitTextInPlace, module exports).
- Browser smoke at 0.5× → 1.5× and narrow-viewport repro show zero overflowing `.slide-page` elements.
- CLAUDE.md describes the new algorithm.
