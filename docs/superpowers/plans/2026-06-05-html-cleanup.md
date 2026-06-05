# HTML Cleanup (a11y + Inline SVG Sprite) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize the 10 inline SVG icons in `slides/index.html` and 2 in `remote/index.html` into per-file `<symbol>` sprite blocks; add `aria-label` / `aria-pressed` / `aria-expanded` to every icon-only button; swap the eye-icon `innerHTML` hack for a `<use href>` reference.

**Architecture:** Native HTML5 `<svg><symbol>` + `<use>` pattern, inline sprite block per HTML file. ARIA static on the element where it can be; dynamic ARIA wired into the existing JS handlers that already mutate the button's class. No new JS module, no new dependency, no test infrastructure changes.

**Tech Stack:** HTML5 SVG sprite, ARIA 1.2, Bun bundler (no config change). Manual VoiceOver verification (Mac Safari + iPad Safari).

**Spec:** `docs/superpowers/specs/2026-06-05-html-cleanup-design.md`

---

## File Structure

**Modified (5 files):**

| Path | What changes |
|---|---|
| `public/slides/index.html` | Sprite block inserted at top of `<body>`. All inline SVGs replaced with `<svg><use/></svg>`. Two `<span>` glyphs (`⛶`, `?`) replaced with `<use>` refs. 9 buttons gain ARIA attributes. |
| `public/remote/index.html` | Same pattern: 2-symbol sprite block, button SVGs → `<use>`, multiple `aria-label`. |
| `public/slides/js/display.js` | 4 dynamic ARIA spots: hamburger `aria-expanded`, fullscreen `aria-label` swap, toggleNav `aria-label` swap, AND rewrite eye-icon `innerHTML` to `<use>.setAttribute('href', ...)`. Same change applied in `loadSettings`. |
| `public/slides/js/laser.js` | `aria-pressed` set/cleared inside `toggleLaser()`. |
| `public/slides/js/event-listeners.js` | `aria-pressed` toggled inside the `verticalBtn` / `horizontalBtn` onclick handlers. |

**Created:** 0

---

## Task 1: slides/index.html — sprite block + replace button SVGs with `<use>`

**Files:**
- Modify: `public/slides/index.html`

This task swaps mechanism only (icons render identically); ARIA labels are added in Task 2.

- [ ] **Step 1.1: Open `public/slides/index.html` and locate the `<body>` opening tag (line 14)**

Read lines 14-17 first to confirm position:

```bash
sed -n '14,17p' public/slides/index.html
```

Expected: `<body>` followed by the existing search-bar block.

- [ ] **Step 1.2: Insert the sprite block immediately after `<body>` (before the search-bar)**

Use Edit to add this block right after `<body>`:

```html
<body>
  <!-- Icon sprite — every <use href="#icon-..."/> in this page resolves here.
       Kept inside <body> so the symbols are present before any <use> renders.
       aria-hidden so screen readers don't announce the container. -->
  <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
    <symbol id="icon-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </symbol>
    <symbol id="icon-vertical" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="12" y1="3" x2="12" y2="21"/>
      <polyline points="8 7 12 3 16 7"/>
      <polyline points="8 17 12 21 16 17"/>
    </symbol>
    <symbol id="icon-horizontal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="3" y1="12" x2="21" y2="12"/>
      <polyline points="7 8 3 12 7 16"/>
      <polyline points="17 8 21 12 17 16"/>
    </symbol>
    <symbol id="icon-fullscreen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="15 3 21 3 21 9"/>
      <polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/>
      <line x1="3" y1="21" x2="10" y2="14"/>
    </symbol>
    <symbol id="icon-eye-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </symbol>
    <symbol id="icon-eye-closed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </symbol>
    <symbol id="icon-remote" viewBox="0 -960 960 960" fill="currentColor">
      <path d="M320-40q-33 0-56.5-23.5T240-120v-720q0-33 23.5-56.5T320-920h320q33 0 56.5 23.5T720-840v720q0 33-23.5 56.5T640-40H320Zm0-80h320v-720H320v720Zm160-440q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0-80q-17 0-28.5-11.5T440-680q0-17 11.5-28.5T480-720q17 0 28.5 11.5T520-680q0 17-11.5 28.5T480-640Zm-80 240q17 0 28.5-11.5T440-440q0-17-11.5-28.5T400-480q-17 0-28.5 11.5T360-440q0 17 11.5 28.5T400-400Zm160 0q17 0 28.5-11.5T600-440q0-17-11.5-28.5T560-480q-17 0-28.5 11.5T520-440q0 17 11.5 28.5T560-400ZM400-280q17 0 28.5-11.5T440-320q0-17-11.5-28.5T400-360q-17 0-28.5 11.5T360-320q0 17 11.5 28.5T400-280Zm160 0q17 0 28.5-11.5T600-320q0-17-11.5-28.5T560-360q-17 0-28.5 11.5T520-320q0 17 11.5 28.5T560-280ZM400-160q17 0 28.5-11.5T440-200q0-17-11.5-28.5T400-240q-17 0-28.5 11.5T360-200q0 17 11.5 28.5T400-160Zm160 0q17 0 28.5-11.5T600-200q0-17-11.5-28.5T560-240q-17 0-28.5 11.5T520-200q0 17 11.5 28.5T560-160Zm-240 40v-720 720Z"/>
    </symbol>
    <symbol id="icon-laser" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3"/>
      <line x1="12" y1="2" x2="12" y2="5"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="5" y2="12"/>
      <line x1="19" y1="12" x2="22" y2="12"/>
    </symbol>
    <symbol id="icon-pdf" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="18" x2="12" y2="12"/>
      <polyline points="9 15 12 18 15 15"/>
    </symbol>
    <symbol id="icon-help" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </symbol>
    <symbol id="icon-refresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </symbol>
    <symbol id="icon-prev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </symbol>
    <symbol id="icon-next" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </symbol>
  </svg>

  <!-- Search Bar -->
```

(The existing `<!-- Search Bar -->` comment that previously immediately followed `<body>` is now after this block — don't duplicate it; the comment in the snippet above is the existing one.)

- [ ] **Step 1.3: Replace the search-bar's inline SVG with a `<use>`**

In `public/slides/index.html` find the line:

```html
<svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
```

Replace with:

```html
<svg class="search-icon" width="18" height="18" aria-hidden="true" focusable="false"><use href="#icon-search"/></svg>
```

- [ ] **Step 1.4: Replace verticalBtn / horizontalBtn inline SVGs**

Inside `<button id="verticalBtn" class="active">` replace the multi-line `<svg>...</svg>` block with:

```html
<svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-vertical"/></svg>
```

And inside `<button id="horizontalBtn">`:

```html
<svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-horizontal"/></svg>
```

The `直書` / `橫書` text after the SVG stays unchanged.

- [ ] **Step 1.5: Replace fullscreenBtn `<span>` glyph with a `<use>`**

Find:

```html
<button class="icon-btn" id="fullscreenBtn" data-tooltip="全螢幕">
  <span id="fullscreenIcon">⛶</span>
</button>
```

Replace with:

```html
<button class="icon-btn" id="fullscreenBtn" data-tooltip="全螢幕">
  <svg width="20" height="20" aria-hidden="true" focusable="false"><use href="#icon-fullscreen"/></svg>
</button>
```

Note: `id="fullscreenIcon"` is dropped. Nothing reads it (search confirms: `display.js:updateFullscreenButton` only touches `dataset.tooltip` and `classList`).

- [ ] **Step 1.6: Replace toggleNavBtn SVG**

Replace the entire `<svg id="toggleNavIcon">...</svg>` block inside `<button id="toggleNavBtn">` with:

```html
<svg width="20" height="20" aria-hidden="true" focusable="false">
  <use id="toggleNavIcon" href="#icon-eye-open"/>
</svg>
```

The `id="toggleNavIcon"` moves from the outer `<svg>` to the inner `<use>` — Task 4 swaps its `href` attribute instead of `innerHTML`.

- [ ] **Step 1.7: Replace remoteBtn / laserBtn / exportPdfBtn / helpBtn SVGs**

In each of these 4 buttons, replace the inline SVG with a `<use>`:

```html
<button class="icon-btn" id="remoteBtn" data-tooltip="遙控器">
  <svg width="20" height="20" aria-hidden="true" focusable="false"><use href="#icon-remote"/></svg>
</button>
<button class="icon-btn" id="laserBtn" data-tooltip="聚光燈">
  <svg width="20" height="20" aria-hidden="true" focusable="false"><use href="#icon-laser"/></svg>
</button>
<button class="icon-btn" id="exportPdfBtn" data-tooltip="匯出 PDF">
  <svg width="20" height="20" aria-hidden="true" focusable="false"><use href="#icon-pdf"/></svg>
</button>
<button class="icon-btn" id="helpBtn" data-tooltip="快捷鍵說明">
  <svg width="20" height="20" aria-hidden="true" focusable="false"><use href="#icon-help"/></svg>
</button>
```

(The `<span style="font-size: 18px; font-weight: bold;">?</span>` inside helpBtn is gone.)

- [ ] **Step 1.8: Replace refreshBtn SVG**

Inside `<button class="refresh-btn" id="refreshBtn" title="重新載入 / 同步" aria-label="重新載入">` replace the multi-line `<svg>` block with:

```html
<svg width="24" height="24" aria-hidden="true" focusable="false"><use href="#icon-refresh"/></svg>
```

- [ ] **Step 1.9: Replace prevBtn / nextBtn SVGs**

```html
<button id="prevBtn">
  <svg width="20" height="20" aria-hidden="true" focusable="false"><use href="#icon-prev"/></svg>
</button>
<button id="nextBtn">
  <svg width="20" height="20" aria-hidden="true" focusable="false"><use href="#icon-next"/></svg>
</button>
```

- [ ] **Step 1.10: Visual smoke test**

```bash
# Confirm dev server is running on :3000 (per earlier session, it is)
curl -s http://localhost:3000/slides/?src=somedoc | head -5
```

Open `http://localhost:3000/slides/?src=<a-known-doc-id>` in a browser. Walk through:
- Sidebar (hamburger): opens → see vertical/horizontal/font/icon buttons ✓ icons render
- Fullscreen / Nav-toggle / Remote / Laser / PDF / Help icons in the sidebar render ✓
- prev/next buttons in the bottom nav render ✓
- Refresh button on the left rail renders ✓
- Search bar icon (`Cmd+F`) renders ✓

Expected: every icon looks identical to before. If any icon is missing or shows a broken-image box, the `#icon-*` id in the `<use>` doesn't match the `<symbol id>` — fix the typo.

- [ ] **Step 1.11: Run existing tests as sanity check**

```bash
bun test public/slides/js/paginator.test.ts
```

Expected: `13 pass, 0 fail` (unchanged from baseline).

- [ ] **Step 1.12: Commit**

```bash
git add public/slides/index.html
git commit -m "refactor(slides): consolidate inline SVGs into sprite block

13 inline icon definitions (10 SVGs + 2 glyphs + search-bar icon)
move into a single <svg><symbol> block at the top of <body>. Each
button now references the sprite via <svg><use href='#icon-...'/></svg>.

Behavior: visually identical. Net HTML diff: roughly even (sprite block
adds ~80 lines, button SVGs shrink by ~50 lines, glyph spans removed).
Future icon changes touch one symbol definition instead of N call-sites.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: slides/index.html — static ARIA attributes

**Files:**
- Modify: `public/slides/index.html`

- [ ] **Step 2.1: Add `aria-label` + `aria-expanded` to hamburgerBtn**

Find:

```html
<button class="hamburger-btn" id="hamburgerBtn">
```

Replace with:

```html
<button class="hamburger-btn" id="hamburgerBtn" aria-label="開啟選單" aria-expanded="false">
```

- [ ] **Step 2.2: Add `aria-label` to prevBtn / nextBtn**

```html
<button id="prevBtn" aria-label="上一頁">
  <svg width="20" height="20" aria-hidden="true" focusable="false"><use href="#icon-prev"/></svg>
</button>
<button id="nextBtn" aria-label="下一頁">
  <svg width="20" height="20" aria-hidden="true" focusable="false"><use href="#icon-next"/></svg>
</button>
```

- [ ] **Step 2.3: Add `aria-label` to the 6 toolbar icon buttons**

Inside the `.icon-btn-row` div, each button gets an `aria-label` matching the visible tooltip text:

```html
<button class="icon-btn" id="fullscreenBtn" data-tooltip="全螢幕" aria-label="全螢幕">
<button class="icon-btn" id="toggleNavBtn" data-tooltip="隱藏導航列" aria-label="隱藏導航列">
<button class="icon-btn" id="remoteBtn" data-tooltip="遙控器" aria-label="遙控器">
<button class="icon-btn" id="laserBtn" data-tooltip="聚光燈" aria-label="聚光燈" aria-pressed="false">
<button class="icon-btn" id="exportPdfBtn" data-tooltip="匯出 PDF" aria-label="匯出 PDF">
<button class="icon-btn" id="helpBtn" data-tooltip="快捷鍵說明" aria-label="快捷鍵說明">
```

(`laserBtn` gains both `aria-label` and `aria-pressed="false"`; the JS in Task 3 will toggle the value.)

- [ ] **Step 2.4: Add `aria-pressed` to verticalBtn / horizontalBtn**

```html
<button id="verticalBtn" class="active" aria-pressed="true">
  ...
</button>
<button id="horizontalBtn" aria-pressed="false">
  ...
</button>
```

Initial values reflect the default mode (vertical-rl is the default per `manuscript.css`).

- [ ] **Step 2.5: Verify with grep**

```bash
grep -E 'aria-(label|pressed|expanded)' public/slides/index.html | wc -l
```

Expected: `12` (1 hamburger expanded + 1 hamburger label + 1 refresh-btn label (pre-existing) + 2 prev/next labels + 6 toolbar labels + 1 laser pressed + 2 vertical/horizontal pressed = 13... actually let me recount). 

Count target: hamburger(2) + refresh(1, pre-existing) + prev(1) + next(1) + fullscreen(1) + toggleNav(1) + remote(1) + laser(2: label+pressed) + pdf(1) + help(1) + vertical(1) + horizontal(1) = **14 attributes**.

Adjusted expectation: `14`. If your number is off by ≥2, double-check Step 2.1-2.4 didn't miss a button.

- [ ] **Step 2.6: Commit**

```bash
git add public/slides/index.html
git commit -m "feat(slides): add aria-label to icon-only buttons

Screen-reader users now hear the function name (聚光燈, 全螢幕, etc.)
instead of just 'button'. Static labels for 9 icon-only buttons in
slides/index.html; dynamic state (aria-pressed / aria-expanded /
state-aware aria-label) lands in the next task via JS hooks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: slides/ JS — dynamic aria-pressed

**Files:**
- Modify: `public/slides/js/laser.js`
- Modify: `public/slides/js/event-listeners.js`

- [ ] **Step 3.1: Update `toggleLaser` to set aria-pressed**

In `public/slides/js/laser.js`, find `toggleLaser` (lines 161-183 currently). The two `classList.add('active')` / `classList.remove('active')` lines on the laser button need a matching `setAttribute` call.

Find:

```js
    blurOverlay.style.display = 'block';
    document.getElementById('laserBtn')?.classList.add('active');
```

Replace with:

```js
    blurOverlay.style.display = 'block';
    const laserBtn = document.getElementById('laserBtn');
    laserBtn?.classList.add('active');
    laserBtn?.setAttribute('aria-pressed', 'true');
```

Then find:

```js
    blurOverlay.style.display = 'none';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('laserBtn')?.classList.remove('active');
```

Replace with:

```js
    blurOverlay.style.display = 'none';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const laserBtn = document.getElementById('laserBtn');
    laserBtn?.classList.remove('active');
    laserBtn?.setAttribute('aria-pressed', 'false');
```

- [ ] **Step 3.2: Update verticalBtn / horizontalBtn handlers**

In `public/slides/js/event-listeners.js`, find the two onclick handlers (currently lines 28-41):

```js
  document.getElementById('verticalBtn').onclick = () => {
    setWritingMode('vertical-rl');
    document.getElementById('verticalBtn').classList.add('active');
    document.getElementById('horizontalBtn').classList.remove('active');
    state.currentPage = 0;
    repaginate();
  };
  document.getElementById('horizontalBtn').onclick = () => {
    setWritingMode('horizontal-tb');
    document.getElementById('horizontalBtn').classList.add('active');
    document.getElementById('verticalBtn').classList.remove('active');
    state.currentPage = 0;
    repaginate();
  };
```

Replace with:

```js
  const verticalBtn = document.getElementById('verticalBtn');
  const horizontalBtn = document.getElementById('horizontalBtn');
  verticalBtn.onclick = () => {
    setWritingMode('vertical-rl');
    verticalBtn.classList.add('active');
    verticalBtn.setAttribute('aria-pressed', 'true');
    horizontalBtn.classList.remove('active');
    horizontalBtn.setAttribute('aria-pressed', 'false');
    state.currentPage = 0;
    repaginate();
  };
  horizontalBtn.onclick = () => {
    setWritingMode('horizontal-tb');
    horizontalBtn.classList.add('active');
    horizontalBtn.setAttribute('aria-pressed', 'true');
    verticalBtn.classList.remove('active');
    verticalBtn.setAttribute('aria-pressed', 'false');
    state.currentPage = 0;
    repaginate();
  };
```

- [ ] **Step 3.3: Also update `loadSettings` for restored orientation**

`display.js:loadSettings` already sets `horizontalBtn.classList.add('active')` when the saved orientation is horizontal — we need a parallel aria-pressed update there. Find:

```js
  const savedOrientation = localStorage.getItem(STORAGE_KEYS.orientation);
  if (savedOrientation === 'horizontal') {
    document.body.classList.add('horizontal-mode');
    document.getElementById('horizontalBtn').classList.add('active');
    document.getElementById('verticalBtn').classList.remove('active');
  }
```

Replace with:

```js
  const savedOrientation = localStorage.getItem(STORAGE_KEYS.orientation);
  if (savedOrientation === 'horizontal') {
    document.body.classList.add('horizontal-mode');
    const horizontalBtn = document.getElementById('horizontalBtn');
    const verticalBtn = document.getElementById('verticalBtn');
    horizontalBtn.classList.add('active');
    horizontalBtn.setAttribute('aria-pressed', 'true');
    verticalBtn.classList.remove('active');
    verticalBtn.setAttribute('aria-pressed', 'false');
  }
```

- [ ] **Step 3.4: Build the bundle**

```bash
bun run build
```

Expected: `Bundled 21 modules in <X>ms ... app.js ~70 KB`.

- [ ] **Step 3.5: Browser smoke test**

Open viewer. In DevTools console:

```js
document.getElementById('laserBtn').getAttribute('aria-pressed')
// → "false"
```

Click 聚光燈 button. Re-run:

```js
document.getElementById('laserBtn').getAttribute('aria-pressed')
// → "true"
```

Click again → back to "false".

Same check for verticalBtn / horizontalBtn:

```js
document.getElementById('horizontalBtn').getAttribute('aria-pressed')
```

Click 橫書 → "true". Click 直書 → "false" (and verticalBtn becomes "true").

- [ ] **Step 3.6: Commit**

```bash
git add public/slides/js/laser.js public/slides/js/event-listeners.js public/slides/js/display.js
git commit -m "feat(slides): wire aria-pressed for toggle buttons

Toggling laser, 直書, or 橫書 now updates aria-pressed on the
corresponding button so screen readers announce the new state.
loadSettings does the same on initial mount when a saved
orientation is restored.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: slides/js/display.js — aria-expanded, dynamic aria-label, eye-icon swap

**Files:**
- Modify: `public/slides/js/display.js`

- [ ] **Step 4.1: Wire aria-expanded in openSidebar / closeSidebar**

Find:

```js
export function openSidebar() {
  dom.sidebar.classList.add('open');
  dom.sidebarOverlay.classList.add('visible');
  dom.hamburgerBtn.classList.add('active');
}

export function closeSidebar() {
  dom.sidebar.classList.remove('open');
  dom.sidebarOverlay.classList.remove('visible');
  dom.hamburgerBtn.classList.remove('active');
}
```

Replace with:

```js
export function openSidebar() {
  dom.sidebar.classList.add('open');
  dom.sidebarOverlay.classList.add('visible');
  dom.hamburgerBtn.classList.add('active');
  dom.hamburgerBtn.setAttribute('aria-expanded', 'true');
}

export function closeSidebar() {
  dom.sidebar.classList.remove('open');
  dom.sidebarOverlay.classList.remove('visible');
  dom.hamburgerBtn.classList.remove('active');
  dom.hamburgerBtn.setAttribute('aria-expanded', 'false');
}
```

- [ ] **Step 4.2: Wire dynamic aria-label on fullscreen button**

Find:

```js
export function updateFullscreenButton() {
  const btn = document.getElementById('fullscreenBtn');
  if (document.fullscreenElement) {
    btn.classList.add('active');
    btn.dataset.tooltip = '退出全螢幕';
  } else {
    btn.classList.remove('active');
    btn.dataset.tooltip = '全螢幕';
  }
}
```

Replace with:

```js
export function updateFullscreenButton() {
  const btn = document.getElementById('fullscreenBtn');
  if (document.fullscreenElement) {
    btn.classList.add('active');
    btn.dataset.tooltip = '退出全螢幕';
    btn.setAttribute('aria-label', '退出全螢幕');
  } else {
    btn.classList.remove('active');
    btn.dataset.tooltip = '全螢幕';
    btn.setAttribute('aria-label', '全螢幕');
  }
}
```

- [ ] **Step 4.3: Rewrite `toggleNavVisibility` to swap `<use href>` instead of innerHTML**

Find the entire `toggleNavVisibility` function:

```js
export function toggleNavVisibility() {
  state.navPermanentlyHidden = !state.navPermanentlyHidden;
  const eyeOpen = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
  const eyeClosed = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';

  if (state.navPermanentlyHidden) {
    dom.slideNav.style.display = 'none';
    document.getElementById('toggleNavIcon').innerHTML = eyeClosed;
    document.getElementById('toggleNavBtn').dataset.tooltip = '顯示導航列';
    localStorage.setItem(STORAGE_KEYS.navHidden, 'true');
  } else {
    dom.slideNav.style.display = 'flex';
    document.getElementById('toggleNavIcon').innerHTML = eyeOpen;
    document.getElementById('toggleNavBtn').dataset.tooltip = '隱藏導航列';
    localStorage.setItem(STORAGE_KEYS.navHidden, 'false');
  }
}
```

Replace with:

```js
export function toggleNavVisibility() {
  state.navPermanentlyHidden = !state.navPermanentlyHidden;
  const useEl = document.getElementById('toggleNavIcon');
  const btnEl = document.getElementById('toggleNavBtn');

  if (state.navPermanentlyHidden) {
    dom.slideNav.style.display = 'none';
    useEl.setAttribute('href', '#icon-eye-closed');
    btnEl.dataset.tooltip = '顯示導航列';
    btnEl.setAttribute('aria-label', '顯示導航列');
    localStorage.setItem(STORAGE_KEYS.navHidden, 'true');
  } else {
    dom.slideNav.style.display = 'flex';
    useEl.setAttribute('href', '#icon-eye-open');
    btnEl.dataset.tooltip = '隱藏導航列';
    btnEl.setAttribute('aria-label', '隱藏導航列');
    localStorage.setItem(STORAGE_KEYS.navHidden, 'false');
  }
}
```

- [ ] **Step 4.4: Update `loadSettings` for restored navHidden state**

In `loadSettings`, find:

```js
  const savedNavHidden = localStorage.getItem(STORAGE_KEYS.navHidden);
  if (savedNavHidden === 'true') {
    state.navPermanentlyHidden = true;
    dom.slideNav.style.display = 'none';
    document.getElementById('toggleNavIcon').innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
    document.getElementById('toggleNavBtn').dataset.tooltip = '顯示導航列';
  }
```

Replace with:

```js
  const savedNavHidden = localStorage.getItem(STORAGE_KEYS.navHidden);
  if (savedNavHidden === 'true') {
    state.navPermanentlyHidden = true;
    dom.slideNav.style.display = 'none';
    document.getElementById('toggleNavIcon').setAttribute('href', '#icon-eye-closed');
    const btnEl = document.getElementById('toggleNavBtn');
    btnEl.dataset.tooltip = '顯示導航列';
    btnEl.setAttribute('aria-label', '顯示導航列');
  }
```

- [ ] **Step 4.5: Build & smoke test**

```bash
bun run build
```

Open viewer:
1. Click hamburger → DevTools: `document.getElementById('hamburgerBtn').getAttribute('aria-expanded')` → `"true"`
2. Click again → `"false"`
3. Enter fullscreen (press `F`) → DevTools: `document.getElementById('fullscreenBtn').getAttribute('aria-label')` → `"退出全螢幕"`
4. Exit fullscreen → `"全螢幕"`
5. Press `N` to hide nav → 眼睛 icon 變閉眼 ✓; `document.getElementById('toggleNavBtn').getAttribute('aria-label')` → `"顯示導航列"`
6. Press `N` again → 開眼回來 ✓; aria-label → `"隱藏導航列"`
7. Reload page with `localStorage` already having `slides-nav-hidden=true` → icon starts as closed-eye ✓ (this is the loadSettings path)

- [ ] **Step 4.6: Commit**

```bash
git add public/slides/js/display.js
git commit -m "feat(slides): dynamic ARIA + sprite-based nav-toggle icon

- openSidebar / closeSidebar set aria-expanded on hamburger
- updateFullscreenButton swaps aria-label between '全螢幕' /
  '退出全螢幕' alongside the existing data-tooltip swap
- toggleNavVisibility now flips the inner <use href> between
  #icon-eye-open / #icon-eye-closed instead of overwriting
  innerHTML with a hardcoded SVG path string; also updates
  aria-label so screen readers hear the new state
- loadSettings does the same href + aria-label update when
  restoring navHidden from localStorage on initial mount

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: remote/index.html — sprite block + button SVGs + aria-labels

**Files:**
- Modify: `public/remote/index.html`

- [ ] **Step 5.1: Insert sprite block at top of body**

Find `<body>` (line 9). Insert immediately after:

```html
<body>
  <!-- Icon sprite — see slides/index.html for the same pattern. -->
  <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
    <symbol id="icon-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </symbol>
    <symbol id="icon-chevron-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="9 18 15 12 9 6"/>
    </symbol>
  </svg>

  <div id="mainControls">
```

(The existing `<div id="mainControls">` was previously the first child after `<body>` — leave it where it is, just insert the sprite block before it.)

- [ ] **Step 5.2: Replace toolSearch / toolGoto inline SVGs with `<use>` and add aria-labels**

Find:

```html
<button class="action-btn" id="toolSearch">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  搜尋
</button>
<button class="action-btn" id="toolGoto">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
  跳頁
</button>
```

Replace with:

```html
<button class="action-btn" id="toolSearch">
  <svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-search"/></svg>
  搜尋
</button>
<button class="action-btn" id="toolGoto">
  <svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-chevron-right"/></svg>
  跳頁
</button>
```

(These two already have visible text labels so no aria-label needed.)

- [ ] **Step 5.3: Add aria-labels to glyph-only buttons**

Find and replace each line:

```html
<button class="panel-nav-btn" id="remoteSearchPrev">▲</button>
<button class="panel-nav-btn" id="remoteSearchNext">▼</button>
<button class="panel-close-btn" id="remoteSearchClose">✕</button>
```

Replace with:

```html
<button class="panel-nav-btn" id="remoteSearchPrev" aria-label="上一個結果">▲</button>
<button class="panel-nav-btn" id="remoteSearchNext" aria-label="下一個結果">▼</button>
<button class="panel-close-btn" id="remoteSearchClose" aria-label="關閉搜尋">✕</button>
```

Find and replace the zoom buttons:

```html
<button class="zoom-btn" id="zoomInBtn">+</button>
<button class="zoom-btn" id="zoomOutBtn">−</button>
<button class="zoom-btn" id="zoomResetBtn">⟲</button>
```

Replace with:

```html
<button class="zoom-btn" id="zoomInBtn" aria-label="放大">+</button>
<button class="zoom-btn" id="zoomOutBtn" aria-label="縮小">−</button>
<button class="zoom-btn" id="zoomResetBtn" aria-label="重設縮放">⟲</button>
```

Find and replace the bottom nav buttons:

```html
<button id="prevBtn">‹</button>
<button id="nextBtn">›</button>
```

Replace with:

```html
<button id="prevBtn" aria-label="上一頁">‹</button>
<button id="nextBtn" aria-label="下一頁">›</button>
```

- [ ] **Step 5.4: Verify with grep**

```bash
grep -c 'aria-label' public/remote/index.html
```

Expected: `8` (3 search-panel + 3 zoom + 2 bottom-nav).

```bash
grep -c '<use href=' public/remote/index.html
```

Expected: `2`.

- [ ] **Step 5.5: Smoke test remote on browser**

Open `http://localhost:3000/remote/?id=test` in browser (a roomId is required by `remote.js`; any string works for a render-only smoke test).

Walk through:
- Search icon (🔍) renders next to "搜尋" button text ✓
- Chevron icon (›) renders next to "跳頁" button text ✓
- All other glyph buttons (▲ ▼ ✕ + − ⟲ ‹ ›) render their characters ✓
- DevTools: `document.querySelector('#zoomInBtn').getAttribute('aria-label')` → `"放大"`

- [ ] **Step 5.6: Commit**

```bash
git add public/remote/index.html
git commit -m "feat(remote): sprite block + aria-labels for screen readers

2-symbol sprite (search + chevron-right) replaces the two inline
SVGs. 8 glyph-only buttons gain aria-labels so VoiceOver reads
'放大' instead of '+', '上一頁' instead of '‹', etc.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Build, manual VoiceOver verification, deploy

**Files:**
- Modify: none (verification + deploy only)

- [ ] **Step 6.1: Final build**

```bash
bun run build
```

Expected: `Bundled 21 modules in <X>ms ... app.js ~70 KB`. Bundle size should be roughly identical to before (display.js/laser.js/event-listeners.js gained ~20-30 lines total).

- [ ] **Step 6.2: Run all tests**

```bash
bun test
```

Expected: all tests pass. Specifically `paginator.test.ts` must show `13 pass, 0 fail`.

- [ ] **Step 6.3: VoiceOver — Mac Safari**

On macOS:
1. Open Safari, navigate to `http://localhost:3000/slides/?src=<known-doc-id>`.
2. `Cmd+F5` to start VoiceOver.
3. `Ctrl+Opt+→` to navigate through the page elements.
4. Expected announcements (in order, varies by tab order):
   - 「開啟選單，按鈕，收合」 (hamburgerBtn, when aria-expanded=false)
   - 「重新載入，按鈕」 (refreshBtn)
   - 「直書，已按下，按鈕」 (verticalBtn with aria-pressed=true)
   - 「橫書，按鈕」 (horizontalBtn with aria-pressed=false)
   - 「字體大小，A-，按鈕」 / 「A+，按鈕」 (font controls, visible text labels)
   - 「全螢幕，按鈕」 (fullscreenBtn)
   - 「隱藏導航列，按鈕」 (toggleNavBtn)
   - 「遙控器，按鈕」 (remoteBtn)
   - 「聚光燈，按鈕」 (laserBtn, aria-pressed=false)
   - 「匯出 PDF，按鈕」 (exportPdfBtn)
   - 「快捷鍵說明，按鈕」 (helpBtn)
   - 「上一頁，按鈕」 / 「下一頁，按鈕」 (prev/next)

5. Activate laser → re-navigate to laserBtn → expected: 「聚光燈，已按下，按鈕」.
6. Open hamburger → re-navigate to hamburgerBtn → expected: 「開啟選單，按鈕，已展開」.
7. Enter fullscreen → re-navigate to fullscreenBtn → expected: 「退出全螢幕，按鈕」.

Stop VoiceOver: `Cmd+F5`.

- [ ] **Step 6.4: VoiceOver — iPad Safari (if iPad available)**

1. Settings → 輔助使用 → VoiceOver → ON.
2. Open viewer URL in Safari.
3. Triple-finger swipe to navigate through buttons; expect same labels as Step 6.3.
4. Settings → VoiceOver → OFF.

If no iPad available, skip this step but note in commit message.

- [ ] **Step 6.5: Visual regression sweep**

In a fresh browser session (cmd-shift-N for incognito so localStorage is empty):
1. Open `/slides/?src=<known-doc-id>`.
2. Confirm every icon renders identically to before (compare against a screenshot if available, or against the live `slides-6rb.pages.dev` deploy from yesterday).
3. Click through: hamburger, vertical/horizontal, all 6 toolbar icons, fullscreen enter/exit, nav-toggle, prev/next, refresh.
4. Open `/remote/?id=test`. Confirm all glyphs + sprite icons render.

- [ ] **Step 6.6: Push to GitHub**

```bash
git push origin main
```

Expected: `Writing objects: 100% ... main -> main`.

- [ ] **Step 6.7: Deploy to Cloudflare Pages**

```bash
CLOUDFLARE_ACCOUNT_ID=<from key.md> \
CLOUDFLARE_API_TOKEN=<from key.md> \
bunx wrangler pages deploy public --project-name=slides --branch=main \
  --commit-message="feat: HTML cleanup — sprite + aria-labels"
```

Expected: `✨ Deployment complete! Take a peek over at https://<hash>.slides-6rb.pages.dev`.

- [ ] **Step 6.8: Verify the live deploy**

Open the alias `https://slides-6rb.pages.dev/slides/?src=<known-doc-id>` (force-reload with Cmd-Shift-R to bypass cache). Confirm icons render. Confirm DevTools `getAttribute('aria-label')` works on a couple of buttons.

If anything is wrong, `git revert HEAD~5..HEAD` (this plan produced 5 commits — adjust as needed) and re-deploy.

---

## Self-review checklist

Run through these before declaring done:

- [ ] `grep -c '<svg' public/slides/index.html` → expected **13** (1 sprite container + 12 button/icon-using `<svg>` elements: search-icon, vertical, horizontal, fullscreen, toggleNav, remote, laser, pdf, help, refresh, prev, next)
- [ ] `grep -c '<use href=' public/slides/index.html` → expected **12** (one per button/icon-using `<svg>`; the sprite container itself has no `<use>`)
- [ ] `grep -c '<symbol id=' public/slides/index.html` → expected **13** (one per icon definition inside the sprite block)
- [ ] No remaining `<span>⛶</span>` or `<span ...>?</span>` in `public/slides/index.html`
- [ ] No remaining hardcoded SVG `d="M17.94...` path string in `public/slides/js/display.js`
- [ ] `grep -c 'aria-label\|aria-pressed\|aria-expanded' public/slides/index.html` → expected **≥14** (per Task 2.5 count)
- [ ] `grep -c '<use href=' public/remote/index.html` → expected **2**
- [ ] `grep -c 'aria-label' public/remote/index.html` → expected **8**
- [ ] `bun test public/slides/js/paginator.test.ts` passes 13/13
- [ ] `bun run build` succeeds without errors

If any of these fail, the corresponding task needs review.
