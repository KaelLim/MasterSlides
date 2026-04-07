# Pretext Pagination Design

Replace CSS multi-column pagination with pretext-based rich content pagination. Pretext calculates text layout precisely via canvas measureText; combined with image dimension measurement, this enables accurate pre-cut page splitting without relying on DOM scrollHeight.

## Goals

- Replace `scrollHeight / containerHeight` page counting with pretext-driven layout
- Support both `vertical-rl` (直書) and `horizontal-tb` (橫書) via pretext's `writingMode` option (PR #37)
- Pre-split DOM elements into page containers for clean page transitions
- Handle rich HTML content: headings, paragraphs, lists, images, `<hr>` page breaks
- Use `getComputedStyle` to read actual CSS values — no hardcoded font/size mapping

## Non-Goals

- Server-side pagination (stays browser-only for now)
- Changing the visual design or CSS styles
- Modifying remote control or other non-pagination features

## How It Works

### Current Flow (CSS columns)

```
HTML loaded into .manuscript
  → CSS column-width: 100cqw splits into columns
  → JS reads scrollHeight/scrollWidth to count pages
  → transform: translateY/X to navigate
```

### New Flow (pretext)

```
HTML loaded into .manuscript (hidden)
  → JS parses children into blocks
  → For each text block: getComputedStyle → pretext.layout() → height
  → For each image: getComputedStyle → computed height
  → For <hr>: force page break
  → Walk blocks, accumulate heights, split at page boundary
  → Create page divs, move DOM elements into them
  → Show page N, hide others
```

## Architecture

### New File: `aliswa/public/js/paginator.js`

The core pagination engine. Bundled with pretext via `bun build`.

```
Input: .manuscript element (with HTML content already loaded)
       containerWidth, containerHeight
       writingMode ('vertical-rl' | 'horizontal-tb')

Output: Array of page divs, each containing a subset of the original DOM elements
```

### Modified File: `aliswa/public/js/app.js`

Replace `updatePageCount()` / `goToPage()` calls (from `/js/slides/navigation.js`) with paginator-driven equivalents.

### Removed CSS

Remove from `.manuscript`:
```css
column-width: 100cqw;
column-gap: 0;
column-fill: auto;
```

Pages are no longer CSS columns — they're discrete div containers.

### Bundle Setup

```bash
# Build command (added to package.json scripts)
bun build public/js/app.js --outdir public/dist --bundle --format esm

# slides.html changes script src
<script type="module" src="/dist/app.js"></script>
```

Bun's bundler resolves `import { prepare, layout } from '@chenglou/pretext'` from node_modules.

## Block Parsing

The paginator walks `.manuscript.children` and classifies each element:

| Element | Type | Measurement |
|---------|------|-------------|
| `h1, h2, h3, h4` | text | pretext `prepare()` + `layout()` |
| `p` | text | pretext `prepare()` + `layout()` |
| `li` (inside `ul/ol`) | text | pretext per-item, container margins added |
| `img` | image | `getComputedStyle` → offsetHeight after render |
| `hr` | break | Force new page |
| `<article>` | container | Walk children recursively |
| other | opaque | Fall back to `offsetHeight` |

### Text Block Measurement

```js
function measureTextBlock(el, containerSize, writingMode) {
  const style = getComputedStyle(el);
  const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const lineHeight = parseFloat(style.lineHeight);
  const text = el.textContent;

  const prepared = prepare(text, font, { writingMode });

  // In vertical-rl: maxWidth = container height (inline axis)
  // In horizontal-tb: maxWidth = container width (inline axis)
  const maxInline = writingMode === 'vertical-rl' ? containerSize.height : containerSize.width;
  const result = layout(prepared, maxInline, lineHeight);

  // result.height = total block dimension in the block axis
  // vertical-rl: block axis = horizontal → result.height = element width
  // horizontal-tb: block axis = vertical → result.height = element height
  return {
    blockSize: result.height,
    lineCount: result.lineCount
  };
}
```

### Image Measurement

Images need actual render dimensions. Since they're already in the DOM (loaded into `.manuscript`), we read their computed size:

```js
function measureImage(img, writingMode) {
  // Block axis size: width in vertical-rl, height in horizontal-tb
  const blockSize = writingMode === 'vertical-rl'
    ? img.offsetWidth
    : img.offsetHeight;
  return { blockSize };
}
```

### Margin/Spacing

Each element's margin in the block axis (margin-right for vertical-rl, margin-bottom for horizontal-tb) is included in the accumulated size via `getComputedStyle`.

## Page Splitting Algorithm

```js
function paginate(manuscript, containerWidth, containerHeight, writingMode) {
  const maxBlockSize = writingMode === 'vertical-rl' ? containerWidth : containerHeight;
  const pages = [[]];
  let currentBlockUsed = 0;

  for (const el of manuscript.children) {
    // <hr> = forced page break
    if (el.tagName === 'HR') {
      pages.push([]);
      currentBlockUsed = 0;
      continue;
    }

    // h1, h2 with break-before: column → force new page (unless page is empty)
    if ((el.tagName === 'H1' || el.tagName === 'H2') && currentBlockUsed > 0) {
      pages.push([]);
      currentBlockUsed = 0;
    }

    const measurement = measureBlock(el, { width: containerWidth, height: containerHeight }, writingMode);
    const blockMargin = getBlockMargin(el, writingMode);
    const totalSize = measurement.blockSize + blockMargin;

    // If block doesn't fit on current page and page isn't empty, start new page
    if (currentBlockUsed + totalSize > maxBlockSize && currentBlockUsed > 0) {
      pages.push([]);
      currentBlockUsed = 0;
    }

    pages[pages.length - 1].push(el);
    currentBlockUsed += totalSize;
  }

  return pages; // Array<Array<Element>>
}
```

## DOM Rendering

After pagination, create page containers and move elements:

```js
function renderPages(manuscript, pages, writingMode) {
  manuscript.innerHTML = '';
  manuscript.style.columnWidth = '';  // Remove CSS columns

  pages.forEach((pageElements, i) => {
    const page = document.createElement('div');
    page.className = 'slide-page';
    page.dataset.page = i;
    if (writingMode === 'vertical-rl') {
      page.style.writingMode = 'vertical-rl';
    }

    pageElements.forEach(el => page.appendChild(el));
    manuscript.appendChild(page);
  });

  // Show first page, hide rest
  showPage(0);
}

function showPage(index) {
  const pages = document.querySelectorAll('.slide-page');
  pages.forEach((p, i) => {
    p.style.display = i === index ? '' : 'none';
  });
}
```

## Navigation Changes

Current navigation uses `transform` to scroll. New navigation simply shows/hides page divs:

```js
function goToPage(page) {
  if (page < 0 || page >= totalPages) return;
  state.currentPage = page;
  showPage(page);
  updatePageDisplay();
}
```

`updatePageCount()` becomes trivial — it's just the number of `.slide-page` elements.

`prevPage()` / `nextPage()` logic stays the same (increment/decrement + goToPage).

## CSS Changes

### Remove from `.manuscript`

```css
/* DELETE these lines */
column-width: 100cqw;
column-gap: 0;
column-fill: auto;
```

### Add `.slide-page`

```css
.slide-page {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.slide-page[style*="vertical-rl"] {
  text-orientation: mixed;
}
```

## Resize Handling

On window resize, re-run pagination:

```js
window.addEventListener('resize', debounce(() => {
  const savedPage = state.currentPage;
  repaginate();
  goToPage(Math.min(savedPage, state.totalPages - 1));
}, 200));
```

`repaginate()` re-measures everything and rebuilds pages. The debounce prevents thrashing during drag-resize.

## Orientation Switch

When switching vertical↔horizontal, re-run pagination with the new `writingMode`:

```js
function setVerticalMode() {
  currentWritingMode = 'vertical-rl';
  repaginate();
}
function setHorizontalMode() {
  currentWritingMode = 'horizontal-tb';
  repaginate();
}
```

## Build Pipeline

Add to `aliswa/package.json`:

```json
{
  "scripts": {
    "build": "bun build public/js/app.js --outdir public/dist --bundle --format esm --external html2canvas",
    "dev": "bun --watch server/index.ts",
    "start": "bun server/index.ts"
  }
}
```

`html2canvas` is external (loaded via `<script>` tag, not bundled).

`slides.html` changes:
```html
<!-- Before -->
<script type="module" src="js/app.js"></script>
<!-- After -->
<script type="module" src="dist/app.js"></script>
```

Server adds `/dist/*` static route.

## File Inventory

| File | Action | Description |
|------|--------|-------------|
| `public/js/paginator.js` | Create | Pretext-based block parser + page splitter |
| `public/js/app.js` | Modify | Import paginator, replace navigation calls |
| `public/slides.html` | Modify | Script src → dist/app.js |
| `public/css/slides-aliswa.css` | Create | Override: remove columns, add .slide-page |
| `server/index.ts` | Modify | Add /dist/* static route |
| `package.json` | Modify | Add build script |

## Data Flow

```
HTML content loaded into .manuscript
  ↓
paginator.js: parse children into blocks
  ↓
For each block:
  text → getComputedStyle → pretext prepare() + layout() → blockSize
  img  → offsetHeight/offsetWidth → blockSize
  hr   → page break signal
  ↓
Walk blocks, accumulate blockSize, split at container boundary
  ↓
Create .slide-page divs, move elements in
  ↓
showPage(0) — display first page
  ↓
goToPage(n) — show/hide pages
```
