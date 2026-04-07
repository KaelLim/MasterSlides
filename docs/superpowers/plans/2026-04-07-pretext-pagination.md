# Pretext Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CSS multi-column pagination with pretext-based rich content pagination that pre-splits DOM elements into discrete page containers.

**Architecture:** New `paginator.js` module measures each HTML block (text via pretext, images via offsetHeight) and splits them into pages. `app.js` is bundled with pretext via `bun build`. CSS columns removed; pages rendered as show/hide divs. Navigation simplified to page index switching.

**Tech Stack:** @chenglou/pretext (with vertical-rl PR #37), Bun bundler, ES modules

---

## File Structure

```
aliswa/
├── public/
│   ├── js/
│   │   ├── app.js          # Modified: import paginator, replace navigation
│   │   └── paginator.js    # NEW: pretext-based block measurement + page splitting
│   ├── dist/
│   │   └── app.js          # Bundled output (app.js + pretext + paginator)
│   └── slides.html         # Modified: script src → dist/app.js
├── server/
│   └── index.ts            # Modified: add /dist/* static route
└── package.json            # Modified: add build script
```

---

### Task 1: Add Build Pipeline

**Files:**
- Modify: `aliswa/package.json`
- Modify: `aliswa/server/index.ts`
- Modify: `aliswa/public/slides.html`

- [ ] **Step 1: Add build script to package.json**

Add `"build"` to the scripts section in `aliswa/package.json`:

```json
{
  "scripts": {
    "build": "bun build public/js/app.js --outdir public/dist --bundle --format esm --external html2canvas --external qrcodejs",
    "dev": "bun --watch server/index.ts",
    "start": "bun server/index.ts"
  }
}
```

- [ ] **Step 2: Add /dist/* static route to server**

In `aliswa/server/index.ts`, in the `serveStatic` function, add a `/dist/*` handler BEFORE the catch-all public/ handler:

```ts
  // /dist/* → public/dist/ (bundled JS)
  if (pathname.startsWith("/dist/")) {
    return serveFile(join(PUBLIC_DIR, pathname));
  }
```

Add this right before the line `// Everything else → public/ directory`.

- [ ] **Step 3: Update slides.html script src**

In `aliswa/public/slides.html`, change:

```html
  <script type="module" src="js/app.js"></script>
```

to:

```html
  <script type="module" src="/dist/app.js"></script>
```

- [ ] **Step 4: Test build**

```bash
cd aliswa && bun run build
```

Expected: `public/dist/app.js` created. This will initially fail to resolve paginator.js (not yet created), which is fine — just verify the build command itself runs. If it errors on missing paginator, that's expected and will be fixed in Task 2.

- [ ] **Step 5: Commit**

```bash
git add aliswa/package.json aliswa/server/index.ts aliswa/public/slides.html
git commit -m "chore(aliswa): add bun build pipeline, update script src to dist/"
```

---

### Task 2: Create Paginator Module

**Files:**
- Create: `aliswa/public/js/paginator.js`

- [ ] **Step 1: Create paginator.js**

This is the core module. It exports two functions: `paginate()` and `showPage()`.

```js
import { prepare, layout } from '@chenglou/pretext';

/**
 * Measure the block-axis size of a text element using pretext.
 * In vertical-rl: block axis = horizontal (width), inline axis = vertical (height)
 * In horizontal-tb: block axis = vertical (height), inline axis = horizontal (width)
 */
function measureTextBlock(el, containerWidth, containerHeight, writingMode) {
  const style = getComputedStyle(el);
  const fontSize = style.fontSize;       // e.g. "36px"
  const fontWeight = style.fontWeight;   // e.g. "700"
  const fontFamily = style.fontFamily;   // e.g. '"DFKai-SB", serif'
  const font = `${fontWeight} ${fontSize} ${fontFamily}`;

  const lineHeightRaw = style.lineHeight;
  let lineHeight;
  if (lineHeightRaw === 'normal') {
    lineHeight = parseFloat(fontSize) * 1.2;
  } else {
    lineHeight = parseFloat(lineHeightRaw);
    // If lineHeight is a unitless multiplier (CSS computed always returns px, but just in case)
    if (lineHeight < 10) {
      lineHeight = lineHeight * parseFloat(fontSize);
    }
  }

  const text = el.textContent || '';
  if (!text.trim()) return 0;

  const pretextMode = writingMode === 'vertical-rl' ? 'vertical-rl' : undefined;
  const prepared = prepare(text, font, pretextMode ? { writingMode: pretextMode } : undefined);

  // maxWidth = inline axis constraint
  const maxInline = writingMode === 'vertical-rl' ? containerHeight : containerWidth;
  const result = layout(prepared, maxInline, lineHeight);

  // result.height = total size in block axis
  return result.height;
}

/**
 * Measure the block-axis size of an image element.
 * Uses actual rendered dimensions.
 */
function measureImage(el, writingMode) {
  return writingMode === 'vertical-rl' ? el.offsetWidth : el.offsetHeight;
}

/**
 * Get the block-axis margin of an element.
 * vertical-rl: marginLeft + marginRight (block axis is horizontal)
 * horizontal-tb: marginTop + marginBottom (block axis is vertical)
 */
function getBlockMargin(el, writingMode) {
  const style = getComputedStyle(el);
  if (writingMode === 'vertical-rl') {
    return parseFloat(style.marginLeft || '0') + parseFloat(style.marginRight || '0');
  }
  return parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0');
}

/**
 * Measure one block element's total block-axis size (content + margin).
 */
function measureBlock(el, containerWidth, containerHeight, writingMode) {
  const tag = el.tagName;
  const margin = getBlockMargin(el, writingMode);

  // Text elements → pretext measurement
  if (['H1', 'H2', 'H3', 'H4', 'P', 'LI', 'BLOCKQUOTE'].includes(tag)) {
    return measureTextBlock(el, containerWidth, containerHeight, writingMode) + margin;
  }

  // Images → rendered dimensions
  if (tag === 'IMG') {
    return measureImage(el, writingMode) + margin;
  }

  // Lists → sum of children
  if (tag === 'UL' || tag === 'OL') {
    let total = getBlockMargin(el, writingMode);
    for (const li of el.children) {
      total += measureBlock(li, containerWidth, containerHeight, writingMode);
    }
    return total;
  }

  // Containers (article, div, section) → sum of children
  if (tag === 'ARTICLE' || tag === 'DIV' || tag === 'SECTION') {
    let total = getBlockMargin(el, writingMode);
    for (const child of el.children) {
      total += measureBlock(child, containerWidth, containerHeight, writingMode);
    }
    return total;
  }

  // HR → zero size (handled as page break signal)
  if (tag === 'HR') {
    return 0;
  }

  // Fallback: use DOM measurement
  return (writingMode === 'vertical-rl' ? el.offsetWidth : el.offsetHeight) + margin;
}

/**
 * Check if an element forces a page break before it.
 * h1, h2 have CSS break-before: column in the original styles.
 */
function forcesBreakBefore(el) {
  const tag = el.tagName;
  return tag === 'H1' || tag === 'H2';
}

/**
 * Paginate manuscript children into page groups.
 *
 * @param {HTMLElement} manuscript - The .manuscript element with content loaded
 * @param {number} containerWidth - Available width in px
 * @param {number} containerHeight - Available height in px
 * @param {string} writingMode - 'vertical-rl' or 'horizontal-tb'
 * @returns {Array<Array<Element>>} Array of pages, each an array of DOM elements
 */
export function paginate(manuscript, containerWidth, containerHeight, writingMode) {
  const maxBlockSize = writingMode === 'vertical-rl' ? containerWidth : containerHeight;
  const pages = [[]];
  let currentBlockUsed = 0;

  // Collect top-level children. If content is wrapped in <article>, unwrap it.
  let children;
  const firstChild = manuscript.firstElementChild;
  if (firstChild && firstChild.tagName === 'ARTICLE') {
    children = Array.from(firstChild.children);
  } else {
    children = Array.from(manuscript.children);
  }

  for (const el of children) {
    // <hr> = forced page break
    if (el.tagName === 'HR') {
      pages.push([]);
      currentBlockUsed = 0;
      continue;
    }

    // h1, h2 → force new page (unless current page is empty)
    if (forcesBreakBefore(el) && currentBlockUsed > 0) {
      pages.push([]);
      currentBlockUsed = 0;
    }

    const blockSize = measureBlock(el, containerWidth, containerHeight, writingMode);

    // If block doesn't fit and page isn't empty, start new page
    if (currentBlockUsed + blockSize > maxBlockSize && currentBlockUsed > 0) {
      pages.push([]);
      currentBlockUsed = 0;
    }

    pages[pages.length - 1].push(el);
    currentBlockUsed += blockSize;
  }

  // Filter out empty pages
  return pages.filter(p => p.length > 0);
}

/**
 * Render paginated content into .manuscript as .slide-page divs.
 * Moves actual DOM elements into page containers.
 *
 * @param {HTMLElement} manuscript - The .manuscript element
 * @param {Array<Array<Element>>} pages - Output from paginate()
 * @param {string} writingMode - 'vertical-rl' or 'horizontal-tb'
 */
export function renderPages(manuscript, pages, writingMode) {
  // Clear manuscript
  manuscript.innerHTML = '';

  // Remove CSS column properties (in case they're still applied)
  manuscript.style.columnWidth = 'unset';
  manuscript.style.columnGap = 'unset';
  manuscript.style.columnFill = 'unset';

  pages.forEach((pageElements, i) => {
    const page = document.createElement('div');
    page.className = 'slide-page';
    page.dataset.page = String(i);

    if (writingMode === 'vertical-rl') {
      page.style.writingMode = 'vertical-rl';
      page.style.textOrientation = 'mixed';
    } else {
      page.style.writingMode = 'horizontal-tb';
    }

    pageElements.forEach(el => page.appendChild(el));
    manuscript.appendChild(page);
  });
}

/**
 * Show a specific page and hide all others.
 *
 * @param {number} index - Page index (0-based)
 */
export function showPage(index) {
  const pages = document.querySelectorAll('.slide-page');
  pages.forEach((p, i) => {
    p.style.display = i === index ? '' : 'none';
  });
}
```

- [ ] **Step 2: Verify build works with paginator**

```bash
cd aliswa && bun run build
```

Expected: `public/dist/app.js` is created without errors (even though app.js doesn't import paginator yet, the file should be valid).

- [ ] **Step 3: Commit**

```bash
git add aliswa/public/js/paginator.js
git commit -m "feat(aliswa): add pretext-based paginator module"
```

---

### Task 3: Integrate Paginator into app.js

**Files:**
- Modify: `aliswa/public/js/app.js`

This task modifies app.js to:
1. Import paginator
2. Replace the `updatePageCount()` / `goToPage()` imports from `/js/slides/navigation.js` with local implementations using paginator
3. Add `repaginate()` function
4. Update `loadDocument()` to call paginator after loading content
5. Update resize/orientation handlers to call `repaginate()`

- [ ] **Step 1: Update imports at top of app.js**

Replace the first two import lines:

```js
import { initDOM, state, dom, isMac, modKey } from '/js/slides/state.js';
import { updatePageCount, goToPage, prevPage, nextPage, isVerticalMode } from '/js/slides/navigation.js';
```

With:

```js
import { initDOM, state, dom, isMac, modKey } from '/js/slides/state.js';
import { paginate, renderPages, showPage } from './paginator.js';
```

- [ ] **Step 2: Add local navigation state and functions after imports**

Add this block right after all the import statements (before the `// ── WebSocket Remote Control` section):

```js
// ── Pagination + Navigation (pretext-based) ────────────────────

let currentWritingMode = 'vertical-rl';
let allPageElements = []; // stored for repagination

function isVerticalMode() {
  return currentWritingMode === 'vertical-rl';
}

function updatePageCount() {
  const pageCount = document.querySelectorAll('.slide-page').length;
  state.totalPages = Math.max(1, pageCount);
  dom.totalPagesEl.textContent = state.totalPages;
  if (state.currentPage >= state.totalPages) {
    state.currentPage = state.totalPages - 1;
  }
  dom.currentPageEl.textContent = state.currentPage + 1;
}

function goToPage(page) {
  if (page < 0 || page >= state.totalPages) return;
  state.currentPage = page;
  showPage(page);
  dom.currentPageEl.textContent = state.currentPage + 1;
}

function prevPage() {
  goToPage(state.currentPage - 1);
}

function nextPage() {
  goToPage(state.currentPage + 1);
}

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

- [ ] **Step 3: Update loadDocument() function**

Replace the current `loadDocument` function body. Find the section after the fetch that currently reads:

```js
  loadSettings();
  updateModKeyDisplay();
  await convertTablesToImages();

  requestAnimationFrame(() => {
    updatePageCount();
    initEventListeners();
    initRemote();
    resetNavHideTimer();
  });
```

Replace it with:

```js
  loadSettings();
  updateModKeyDisplay();
  await convertTablesToImages();

  // Store all content elements for repagination
  const content = dom.manuscript.firstElementChild;
  if (content && content.tagName === 'ARTICLE') {
    allPageElements = Array.from(content.children);
  } else {
    allPageElements = Array.from(dom.manuscript.children);
  }

  requestAnimationFrame(() => {
    repaginate();
    initEventListeners();
    initRemote();
    resetNavHideTimer();
  });
```

- [ ] **Step 4: Remove old navigation import usages**

In the `setVerticalMode` and `setHorizontalMode` imports from `/js/slides/display.js`, those functions call `updatePageCount()` and `goToPage()` from the original navigation module. We need to NOT use those and instead provide our own orientation switchers.

Find the `orientation` action in the `ACTIONS` object:

```js
  orientation: () => { isVerticalMode() ? setHorizontalMode() : setVerticalMode(); },
```

Replace it with:

```js
  orientation: () => {
    if (isVerticalMode()) {
      currentWritingMode = 'horizontal-tb';
      document.body.classList.add('horizontal-mode');
      document.getElementById('horizontalBtn').classList.add('active');
      document.getElementById('verticalBtn').classList.remove('active');
    } else {
      currentWritingMode = 'vertical-rl';
      document.body.classList.remove('horizontal-mode');
      document.getElementById('verticalBtn').classList.add('active');
      document.getElementById('horizontalBtn').classList.remove('active');
    }
    state.currentPage = 0;
    repaginate();
  },
```

- [ ] **Step 5: Update the orientation buttons in initEventListeners**

Find these lines in `initEventListeners`:

```js
  document.getElementById('verticalBtn').onclick = setVerticalMode;
  document.getElementById('horizontalBtn').onclick = setHorizontalMode;
```

Replace with:

```js
  document.getElementById('verticalBtn').onclick = () => {
    currentWritingMode = 'vertical-rl';
    document.body.classList.remove('horizontal-mode');
    document.getElementById('verticalBtn').classList.add('active');
    document.getElementById('horizontalBtn').classList.remove('active');
    state.currentPage = 0;
    repaginate();
  };
  document.getElementById('horizontalBtn').onclick = () => {
    currentWritingMode = 'horizontal-tb';
    document.body.classList.add('horizontal-mode');
    document.getElementById('horizontalBtn').classList.add('active');
    document.getElementById('verticalBtn').classList.remove('active');
    state.currentPage = 0;
    repaginate();
  };
```

- [ ] **Step 6: Update resize handler**

Find in `initEventListeners`:

```js
  window.addEventListener('resize', () => {
    updatePageCount();
    goToPage(state.currentPage);
  });
```

Replace with:

```js
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      repaginate();
    }, 200);
  });
```

- [ ] **Step 7: Remove unused imports**

Remove `setVerticalMode, setHorizontalMode` from the display.js import since we handle orientation locally now. The import line:

```js
import {
  loadSettings, resetNavHideTimer, updateFullscreenButton, showNav,
  toggleFullscreen, toggleSidebar, closeSidebar, toggleNavVisibility,
  setVerticalMode, setHorizontalMode,
  increaseFontSize, decreaseFontSize, setFontScale, applyFont
} from '/js/slides/display.js';
```

Becomes:

```js
import {
  loadSettings, resetNavHideTimer, updateFullscreenButton, showNav,
  toggleFullscreen, toggleSidebar, closeSidebar, toggleNavVisibility,
  increaseFontSize, decreaseFontSize, setFontScale, applyFont
} from '/js/slides/display.js';
```

- [ ] **Step 8: Build and verify**

```bash
cd aliswa && bun run build
```

Expected: `public/dist/app.js` created successfully with pretext bundled in.

- [ ] **Step 9: Commit**

```bash
git add aliswa/public/js/app.js
git commit -m "feat(aliswa): integrate pretext paginator into app.js"
```

---

### Task 4: Add CSS for Slide Pages

**Files:**
- Create: `aliswa/public/css/slides-aliswa.css`
- Modify: `aliswa/public/slides.html`

- [ ] **Step 1: Create slides-aliswa.css**

This CSS overrides the original slides.css to remove CSS columns and add `.slide-page` styles:

```css
/* Aliswa overrides — pretext pagination replaces CSS columns */

/* Remove CSS multi-column layout from manuscript */
.manuscript {
  column-width: unset !important;
  column-gap: unset !important;
  column-fill: unset !important;
  /* Keep writing-mode and other base styles from slides.css */
  overflow: hidden;
}

/* Each page is a full-size container */
.slide-page {
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

/* Ensure elements inside pages maintain their original styles */
.slide-page h1,
.slide-page h2,
.slide-page h3,
.slide-page h4,
.slide-page p,
.slide-page ul,
.slide-page ol,
.slide-page li {
  /* Break properties no longer needed — paginator handles breaks */
  break-before: auto !important;
  break-after: auto !important;
  break-inside: auto !important;
}
```

- [ ] **Step 2: Add CSS link to slides.html**

In `aliswa/public/slides.html`, after the existing CSS link:

```html
  <link rel="stylesheet" href="/css/slides.css">
```

Add:

```html
  <link rel="stylesheet" href="/css/slides-aliswa.css">
```

- [ ] **Step 3: Add /css/slides-aliswa.css route to server**

The file is in `public/css/` not the project root `css/`. In `aliswa/server/index.ts`, update the `/css/*` handler to check public first:

In the `serveStatic` function, change:

```ts
  // /css/* and /theme/* → project root (shared assets)
  if (pathname.startsWith("/css/") || pathname.startsWith("/theme/")) {
    return serveFile(join(PROJECT_ROOT, pathname));
  }
```

To:

```ts
  // /css/* → check public first (aliswa overrides), then project root
  if (pathname.startsWith("/css/")) {
    const publicFile = Bun.file(join(PUBLIC_DIR, pathname));
    if (await publicFile.exists()) {
      return new Response(publicFile, {
        headers: { "Content-Type": getMime(pathname) },
      });
    }
    return serveFile(join(PROJECT_ROOT, pathname));
  }

  // /theme/* → project root (shared assets)
  if (pathname.startsWith("/theme/")) {
    return serveFile(join(PROJECT_ROOT, pathname));
  }
```

- [ ] **Step 4: Commit**

```bash
git add aliswa/public/css/slides-aliswa.css aliswa/public/slides.html aliswa/server/index.ts
git commit -m "feat(aliswa): add slide-page CSS overrides, update server routing"
```

---

### Task 5: Build, Test, and Verify

- [ ] **Step 1: Run the build**

```bash
cd aliswa && bun run build
```

Expected: `public/dist/app.js` created with pretext bundled.

- [ ] **Step 2: Add dist/ to .gitignore**

In `aliswa/.gitignore`, add:

```
public/dist/
```

- [ ] **Step 3: Start the server**

```bash
cd aliswa && bun run dev
```

Expected: `Aliswa server running at http://localhost:3000`

- [ ] **Step 4: Test with a Google Doc**

Open browser to:
```
http://localhost:3000/slides.html?src=https://docs.google.com/document/d/1EJi4AabcbPV2EqhxiTiv3KCLmlfD3R0cR1U3eOQHYzs/edit?tab=t.0
```

Expected:
- Document converts and loads
- Content is split into `.slide-page` divs (inspect DOM)
- Page count shows in the page indicator
- Arrow keys / prev/next buttons navigate between pages
- Each page shows a subset of content, not overflowing

- [ ] **Step 5: Test vertical/horizontal switching**

Press `O` to switch to horizontal mode.
Expected: Content re-paginates in horizontal layout. Press `O` again to return to vertical.

- [ ] **Step 6: Test resize**

Resize the browser window.
Expected: After 200ms debounce, content re-paginates to fit new dimensions.

- [ ] **Step 7: Test remote control**

Press `R`, scan QR code or open remote URL in another tab.
Expected: Remote control still works (next/prev commands switch pages).

- [ ] **Step 8: Commit build config and gitignore**

```bash
git add aliswa/.gitignore
git commit -m "chore(aliswa): add dist/ to gitignore"
```

- [ ] **Step 9: Final commit**

```bash
cd /Users/kaellim/Desktop/projects/slides
git add -A aliswa/
git commit -m "feat(aliswa): complete pretext-based pagination refactor"
```
