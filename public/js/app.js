// Slides app — Bun server backend, Drust broadcast remote control.
// Loads via /api/docs/:id or direct URL.

import { initDOM, state, dom, isMac, modKey, FONT_SCALES, STORAGE_KEYS } from '/js/slides/state.js';
import { paginate, showPage } from './paginator.ts';
import {
  loadSettings, resetNavHideTimer, updateFullscreenButton, showNav,
  toggleFullscreen, toggleSidebar, closeSidebar, toggleNavVisibility
} from '/js/slides/display.js';
import { initLightbox, closeLightbox, openLightbox, setLightboxZoom, resetLightboxZoom, panLightbox } from '/js/slides/lightbox.js';
import { initSearch, openSearch, closeSearch, isSearchOpen, searchFor, nextMatch, prevMatch, getSearchState } from '/js/slides/search.js';
import { showGoToPageDialog, initGotoModal, closeGotoModal } from '/js/slides/goto.js';
import { initLaser, toggleLaser, isLaserActive } from '/js/slides/laser.js';
import { navigation } from '/js/slides/navigation.js';
import { connectRoom } from './drust-broadcast.js';

// ── Pagination + Navigation (pretext-based) ────────────────────

let currentWritingMode = 'vertical-rl';
let allPageElements = [];

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
  // Deep-clone the canonical elements so paginate's in-place splits (which
  // mutate textContent and move LIs) never touch the originals captured at
  // load. Without this, a second repaginate at a different font scale would
  // see already-truncated text and silently lose the leftover halves.
  const article = document.createElement('article');
  article.className = 'slide-content';
  allPageElements.forEach(el => article.appendChild(el.cloneNode(true)));

  // paginate() builds .slide-page children directly inside dom.manuscript.
  paginate(article, dom.manuscript, currentWritingMode);

  updatePageCount();
  goToPage(Math.min(state.currentPage, state.totalPages - 1));
}

// ── Font Scale (local, triggers repaginate) ─────────────────────

function localSetFontScale(scale, save = true) {
  state.fontScale = scale;
  document.documentElement.style.setProperty('--font-scale', scale);
  dom.fontSizeDisplayEl.textContent = Math.round(scale * 100) + '%';
  if (save) localStorage.setItem(STORAGE_KEYS.fontSize, scale.toString());
  setTimeout(() => repaginate(), 50);
}

function localIncreaseFontSize() {
  const idx = FONT_SCALES.indexOf(state.fontScale);
  if (idx < FONT_SCALES.length - 1) localSetFontScale(FONT_SCALES[idx + 1]);
  else if (idx === -1) {
    const larger = FONT_SCALES.filter(s => s > state.fontScale);
    if (larger.length > 0) localSetFontScale(larger[0]);
  }
}

function localDecreaseFontSize() {
  const idx = FONT_SCALES.indexOf(state.fontScale);
  if (idx > 0) localSetFontScale(FONT_SCALES[idx - 1]);
  else if (idx === -1) {
    const smaller = FONT_SCALES.filter(s => s < state.fontScale);
    if (smaller.length > 0) localSetFontScale(smaller[smaller.length - 1]);
  }
}

function localApplyFont(fontFamily, save = true) {
  let fontValue;
  if (fontFamily === 'DFKai-SB') {
    fontValue = '"DFKai-SB", "BiauKai", "標楷體", serif';
  } else {
    fontValue = `"${fontFamily}", sans-serif`;
  }
  document.documentElement.style.setProperty('--font-family-body', fontValue);
  if (save) localStorage.setItem(STORAGE_KEYS.fontFamily, fontFamily);
  setTimeout(() => repaginate(), 50);
}

// ── PDF Export (slide-page based) ───────────────────────────────

let printContainer = null;
let printStyle = null;

function exportPDF() {
  // Cleanup previous
  if (printContainer) { printContainer.remove(); printContainer = null; }
  if (printStyle) { printStyle.remove(); printStyle = null; }

  const containerW = dom.manuscriptContainer.clientWidth;
  const containerH = dom.manuscriptContainer.clientHeight;
  const pageW = containerW + 160; // content-area padding: 80px * 2
  const pageH = containerH + 120; // content-area padding: 60px * 2

  // Set @page size
  printStyle = document.createElement('style');
  printStyle.id = 'printPageStyle';
  printStyle.textContent = `@page { size: ${pageW}px ${pageH}px; margin: 0; }`;
  document.head.appendChild(printStyle);

  // Build print pages from existing .slide-page divs
  printContainer = document.createElement('div');
  printContainer.id = 'printContainer';

  const slidePages = document.querySelectorAll('.slide-page');
  slidePages.forEach(sp => {
    const page = document.createElement('div');
    page.className = 'print-page';

    const bgWrap = document.createElement('div');
    bgWrap.className = 'print-page-bg';

    const clipArea = document.createElement('div');
    clipArea.className = 'print-page-clip';

    const clone = sp.cloneNode(true);
    clone.style.display = '';
    clone.style.width = containerW + 'px';
    clone.style.height = containerH + 'px';

    clipArea.appendChild(clone);
    bgWrap.appendChild(clipArea);
    page.appendChild(bgWrap);
    printContainer.appendChild(page);
  });

  document.body.appendChild(printContainer);

  const cleanup = () => {
    if (printContainer) { printContainer.remove(); printContainer = null; }
    if (printStyle) { printStyle.remove(); printStyle = null; }
  };

  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
}

// ── Drust Broadcast Remote Control ─────────────────────────────

// Module-level state for the viewer's broadcast subscription.
// `room` is the connectRoom() handle (publish + stop); `roomChannel` is the
// Drust room name we opened it with, used by the singleton guard in
// initRemote. `syncTimer` throttles syncRemoteState to ~20/sec.
let room = null;
let roomChannel = null;
let syncTimer = null;

function getCurrentPageImages() {
  const containerWidth = dom.manuscriptContainer.clientWidth;
  const containerHeight = dom.manuscriptContainer.clientHeight;
  const images = dom.manuscript.querySelectorAll('img');
  const visible = [];
  images.forEach(img => {
    const rect = img.getBoundingClientRect();
    const cRect = dom.manuscriptContainer.getBoundingClientRect();
    const iL = rect.left - cRect.left, iT = rect.top - cRect.top;
    const vW = Math.min(iL + rect.width, containerWidth) - Math.max(iL, 0);
    const vH = Math.min(iT + rect.height, containerHeight) - Math.max(iT, 0);
    if (!(vW > rect.width * 0.5 && vH > rect.height * 0.5 && img.src)) return;
    // Table-image is a html2canvas dataURL (too large for the 64 KiB Drust
    // broadcast cap). The originals are stashed on dataset.innerImages
    // during convertTablesToImages.
    if (img.classList.contains('table-image')) {
      try {
        const inner = JSON.parse(img.dataset.innerImages || '[]');
        visible.push(...inner);
      } catch {
        /* malformed stash — skip */
      }
      return;
    }
    visible.push({ src: img.src, alt: img.alt || '' });
  });
  return visible;
}

// Build a snapshot of the viewer's current state. Wire-shape: { type:'sync',
// ...fields } — recipients (phones) discriminate by `type`. Viewer ignores
// its own echo because it has no 'sync' branch.
function buildSyncPayload() {
  const searchState = getSearchState();
  return {
    type: 'sync',
    currentPage: state.currentPage + 1,
    totalPages: state.totalPages,
    images: getCurrentPageImages(),
    lightboxActive: dom.lightbox.classList.contains('active'),
    lightboxZoom: state.lbZoom,
    spotlightActive: isLaserActive(),
    ...searchState
  };
}

// Publish a sync to the room (best-effort).
function publishSync() {
  if (!room) return;
  room.publish(buildSyncPayload());
}

// Trailing-edge throttle: coalesce calls within a 50ms window. The payload
// is captured at FIRE TIME via buildSyncPayload() so the publish always
// reflects the latest state, not the state at first-call time. Bounds
// publish rate at 20/sec even during joystick pan storms.
function syncRemoteState() {
  if (syncTimer != null) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    publishSync();
  }, 50);
}

function handleRemoteCommand(payload) {
  const { action } = payload;
  const lightboxActive = dom.lightbox.classList.contains('active');

  switch (action) {
    case 'prev': lightboxActive ? closeLightbox() : prevPage(); break;
    case 'next': lightboxActive ? closeLightbox() : nextPage(); break;
    case 'first': lightboxActive ? closeLightbox() : goToPage(0); break;
    case 'last': lightboxActive ? closeLightbox() : goToPage(state.totalPages - 1); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'toggleMode':
      if (isVerticalMode()) {
        currentWritingMode = 'horizontal-tb';
        document.body.classList.add('horizontal-mode');
      } else {
        currentWritingMode = 'vertical-rl';
        document.body.classList.remove('horizontal-mode');
      }
      state.currentPage = 0;
      repaginate();
      break;
    case 'toggleLightbox':
      if (payload.src) {
        if (lightboxActive) {
          const cur = dom.lightboxImg.src;
          const same = cur && new URL(cur, location.href).pathname === new URL(payload.src, location.href).pathname;
          same ? closeLightbox() : openLightbox(payload.src, payload.alt || '');
        } else {
          openLightbox(payload.src, payload.alt || '');
        }
      }
      break;
    case 'zoomIn': setLightboxZoom(state.lbZoom + 0.25); break;
    case 'zoomOut': setLightboxZoom(state.lbZoom - 0.25); break;
    case 'zoomReset': resetLightboxZoom(); break;
    case 'pan': panLightbox(payload.dx || 0, payload.dy || 0); break;
    case 'toggleSpotlight': toggleLaser(); break;
    case 'search': if (payload.keyword) searchFor(payload.keyword); break;
    case 'searchPrev': prevMatch(); break;
    case 'searchNext': nextMatch(); break;
    case 'searchClose': closeSearch(); break;
    case 'goto':
      if (payload.page >= 1 && payload.page <= state.totalPages) {
        if (lightboxActive) closeLightbox();
        goToPage(payload.page - 1);
      }
      break;
  }
  syncRemoteState();
}

// (I1) Shared helper used by BOTH the 'init' (when phoneConnected=true) and
// 'remote-joined' handlers so the "phone connected" UX is consistent.
function markRemoteConnected() {
  const status = document.getElementById('remoteStatus');
  if (status) {
    status.textContent = '遙控器已連線！';
    status.classList.add('connected');
  }
  setTimeout(closeRemoteModal, 2000);
}

// Drust requires room names to match ^[a-zA-Z][a-zA-Z0-9_:.-]{0,127}$ —
// our 6-char random suffix is alphanumeric so a static 'slides-' prefix
// satisfies the leading-letter rule.
function drustRoomFor(roomId) {
  return `slides-${roomId}`;
}

async function initRemote() {
  // First-time-only setup: allocate room id, wire navigation callback, modal
  // handlers. Gated on falsy state.roomId so refresh-triggered loadDocument
  // re-runs don't change the room id (QR code stays stable).
  if (!state.roomId) {
    state.roomId = Math.random().toString(36).substring(2, 8);
    // Shared modules (e.g. goto.js) call into navigation.goToPage, which now
    // toggles `.slide-page` displays directly. Wire the page-change callback
    // so connected remotes still receive sync updates when those callers
    // change the current page.
    navigation.onPageChange = syncRemoteState;
    document.getElementById('remoteBtn').onclick = openRemoteModal;
    document.getElementById('remoteModalClose').onclick = closeRemoteModal;
    dom.remoteModal.onclick = (e) => { if (e.target === dom.remoteModal) closeRemoteModal(); };
  }

  const channel = drustRoomFor(state.roomId);

  // Singleton + stale-channel guard. If we're already on the right channel,
  // do nothing. If state.roomId changed, tear down the old subscription.
  if (room != null) {
    if (roomChannel === channel) return;
    room.stop();
    room = null;
    roomChannel = null;
  }

  roomChannel = channel;
  room = await connectRoom(channel, {
    onMessage: (msg) => {
      if (!msg || typeof msg !== 'object') return;
      switch (msg.type) {
        case 'command':
          handleRemoteCommand(msg);
          break;
        case 'phone-join':
          // Phone is announcing itself (initial connect or reconnect). Mark
          // the UI as connected and push the current snapshot so the phone
          // catches up immediately. Bypass the throttle.
          markRemoteConnected();
          publishSync();
          break;
        // 'sync' is our own echo — ignore.
      }
    },
  });
}

function openRemoteModal() {
  const qrcodeEl = document.getElementById('qrcode');
  const urlEl = document.getElementById('remoteUrl');
  qrcodeEl.innerHTML = '';
  const host = window.location.hostname;
  const port = window.location.port;
  const remoteUrl = `${location.protocol}//${host}${port ? ':' + port : ''}/remote.html?id=${state.roomId}`;
  new QRCode(qrcodeEl, { text: remoteUrl, width: 200, height: 200 });
  urlEl.textContent = remoteUrl;
  dom.remoteModal.classList.add('active');
  closeSidebar();
}

function closeRemoteModal() {
  dom.remoteModal.classList.remove('active');
}

// ── Table conversion (html2canvas) ──────────────────────────────

async function convertTablesToImages() {
  const tables = dom.manuscript.querySelectorAll('table');
  if (tables.length === 0) return;
  const containerWidth = dom.manuscriptContainer.clientWidth * 0.95;
  for (const table of tables) {
    try {
      table.style.cssText = `writing-mode:horizontal-tb;width:${containerWidth}px;background:rgba(0,0,0,0.3);color:white;border-collapse:collapse;font-size:24px`;
      table.querySelectorAll('td').forEach(td => {
        td.style.cssText = 'writing-mode:horizontal-tb;border:1px solid rgba(255,255,255,0.3);padding:10px 14px;color:white;vertical-align:middle;text-align:left';
      });
      table.querySelectorAll('th').forEach(th => {
        th.style.cssText = 'writing-mode:horizontal-tb;border:1px solid rgba(255,255,255,0.3);padding:10px 14px;color:white;vertical-align:middle;text-align:center;background:#1a365d;font-weight:bold';
      });
      // Kill inline-image baseline strut so row height = image height (no extra
      // gap below). Without this, text cells appear top-biased because their
      // vertical-align: middle is centered within the strut-inflated row.
      table.querySelectorAll('img').forEach(img => {
        img.style.display = 'block';
        img.style.margin = '0 auto';
      });
      // html2canvas does not reliably respect vertical-align on td/th, nor
      // does it resolve `height: 100%` on divs inside td (so flex centering
      // via a wrapper collapses). Center via plain padding math instead:
      // measure each cell's intrinsic height, add (max - height)/2 to the
      // top/bottom padding of shorter cells so all cells in a row reach the
      // row's max height with content visually centered. Pure box model —
      // html2canvas handles this correctly.
      table.querySelectorAll('tr').forEach(tr => {
        const cells = Array.from(tr.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
        if (cells.length === 0) return;
        const heights = cells.map(c => c.offsetHeight);
        const maxH = Math.max(...heights);
        cells.forEach((c, i) => {
          const diff = maxH - heights[i];
          if (diff <= 0) return;
          const extra = Math.round(diff / 2);
          // We set padding:10px 14px above — preserve horizontal, bump vertical.
          c.style.padding = `${10 + extra}px 14px`;
        });
      });
      // Capture inner-image refs BEFORE html2canvas + DOM replacement: the
      // remote sends thumbnails of every visible image on the current page,
      // and the replacement img's dataURL is too large to ship (Drust
      // broadcast caps payloads at 64 KiB). Stash real URLs on the
      // replacement so getCurrentPageImages can surface them instead.
      const innerImages = Array.from(table.querySelectorAll('img'))
        .map((img) => ({ src: img.src, alt: img.alt || '' }))
        .filter((it) => it.src);
      const canvas = await html2canvas(table, { backgroundColor: 'transparent', scale: 2, logging: false });
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      img.className = 'table-image';
      if (innerImages.length) {
        img.dataset.innerImages = JSON.stringify(innerImages);
      }
      table.parentNode.replaceChild(img, table);
    } catch (err) {
      console.error('table conversion failed:', err);
    }
  }
}

// ── Document loader ─────────────────────────────────────────────

// Original src from the URL bar, captured on first load. Refresh re-runs
// loadDocument with this value, so if the user landed via a Google Docs URL
// (?src=https://docs.google.com/...) refresh triggers a real re-sync; if they
// used a bare doc_id it re-reads the cached HTML.
let currentSrc = null;

async function refresh() {
  if (!currentSrc) return;
  const btn = document.getElementById('refreshBtn');
  if (btn?.classList.contains('refreshing')) return;
  btn?.classList.add('refreshing');
  try {
    // forceSync: always re-pull from Google, bypassing the Drust cache.
    await loadDocument(currentSrc, { forceSync: true });
  } finally {
    btn?.classList.remove('refreshing');
  }
}

function extractDocId(url) {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function syncFromGoogle(googleUrl) {
  const res = await fetch('/api/fetch-doc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: googleUrl })
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
  return result;
}

async function loadDocument(src, { forceSync = false } = {}) {
  try {
    // Normalise `src` into a doc_id (or leave as external URL) and decide
    // whether to re-pull from Google.
    const googleDocId = extractDocId(src);
    const isDocId = !googleDocId && /^[a-zA-Z0-9_-]+$/.test(src);
    let docId = null;

    if (googleDocId) {
      // src is a Google Docs URL — always sync (that's the intent of pasting one).
      dom.manuscript.innerHTML = '<p class="loading-message">轉換中，請稍候...</p>';
      const result = await syncFromGoogle(src);
      docId = result.doc_id;
    } else if (isDocId) {
      docId = src;
      if (forceSync) {
        dom.manuscript.innerHTML = '<p class="loading-message">同步中，請稍候...</p>';
        await syncFromGoogle(`https://docs.google.com/document/d/${docId}/edit`);
      }
    }

    if (docId) {
      // Cache-first read; on miss (and we didn't already force-sync) auto-sync
      // and retry so first-time visits via short /?src=<doc_id> still work.
      let res = await fetch(`/api/docs/${docId}`);
      if (!res.ok && !forceSync) {
        dom.manuscript.innerHTML = '<p class="loading-message">首次載入，同步中...</p>';
        await syncFromGoogle(`https://docs.google.com/document/d/${docId}/edit`);
        res = await fetch(`/api/docs/${docId}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      dom.manuscript.innerHTML = await res.text();
    } else {
      // External URL (not Google Docs, not doc_id) — fetch directly.
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      dom.manuscript.innerHTML = await res.text();
    }
  } catch (err) {
    dom.manuscript.innerHTML = `<p style="color:#ff6b6b;font-size:24px;">載入失敗: ${err.message}</p>`;
    return;
  }

  loadSettings();
  updateModKeyDisplay();
  await convertTablesToImages();

  // Wait for fonts to load (critical for accurate pretext measurement)
  await document.fonts.ready;

  // Wait for all images to load (critical for accurate dimension measurement)
  const images = dom.manuscript.querySelectorAll('img');
  if (images.length > 0) {
    await Promise.all(Array.from(images).map(img =>
      img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
    ));
  }

  // Store all content elements for repagination
  const content = dom.manuscript.firstElementChild;
  if (content && content.tagName === 'ARTICLE') {
    allPageElements = Array.from(content.children);
  } else {
    allPageElements = Array.from(dom.manuscript.children);
  }

  repaginate();
  initEventListeners();
  initRemote();
  // After refresh, initRemote's singleton guard early-returns (same channel),
  // so no fresh subscribe happens. Push the new doc's snapshot explicitly so
  // any already-connected phone sees the new pagination/images immediately.
  // On first load this is redundant (the phone-join handler will publish a
  // sync once the phone announces itself), but harmless — Drust is
  // fire-and-forget and the next snapshot supersedes any prior.
  syncRemoteState();
  resetNavHideTimer();
}

// ── Modals ──────────────────────────────────────────────────────

function updateModKeyDisplay() {
  document.querySelectorAll('.mod-key').forEach(el => { el.textContent = modKey; });
}

function showHelpModal() {
  if (dom.helpModal) { dom.helpModal.classList.add('active'); closeSidebar(); }
}

function closeHelpModal() {
  if (dom.helpModal) dom.helpModal.classList.remove('active');
}

function closeAllModals() {
  if (dom.lightbox.classList.contains('active')) closeLightbox();
  else if (dom.remoteModal?.classList.contains('active')) closeRemoteModal();
  else if (dom.gotoModal?.classList.contains('active')) closeGotoModal();
  else if (dom.helpModal?.classList.contains('active')) closeHelpModal();
  else if (dom.sidebar.classList.contains('open')) closeSidebar();
}

function initHelpModal() {
  const closeBtn = document.querySelector('.help-modal-close');
  if (closeBtn) closeBtn.onclick = closeHelpModal;
  if (dom.helpModal) {
    dom.helpModal.onclick = (e) => { if (e.target === dom.helpModal) closeHelpModal(); };
  }
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) helpBtn.onclick = showHelpModal;
}

// ── Keyboard ────────────────────────────────────────────────────

const HOTKEYS = {
  'ArrowRight': 'next', ' ': 'next', 'PageDown': 'next',
  'ArrowLeft': 'prev', 'PageUp': 'prev',
  'Home': 'first', 'End': 'last',
  'g': 'goto', 'G': 'goto',
  'f': 'fullscreen', 'F': 'fullscreen',
  's': 'sidebar', 'S': 'sidebar',
  'o': 'orientation', 'O': 'orientation',
  'n': 'toggleNav', 'N': 'toggleNav',
  'r': 'remoteQR', 'R': 'remoteQR',
  'l': 'laser', 'L': 'laser',
  '?': 'help', 'h': 'help', 'H': 'help',
  'Escape': 'escape'
};

const COMBO_KEYS = {
  'Enter': 'fullscreen', '=': 'fontUp', '+': 'fontUp',
  '-': 'fontDown', '0': 'fontReset',
  ',': 'sidebar', 'f': 'search', 'p': 'exportPDF'
};

function closeLightboxIfActive() {
  if (dom.lightbox.classList.contains('active')) { closeLightbox(); return true; }
  return false;
}

const ACTIONS = {
  next: () => { if (!closeLightboxIfActive()) nextPage(); syncRemoteState(); },
  prev: () => { if (!closeLightboxIfActive()) prevPage(); syncRemoteState(); },
  first: () => { if (!closeLightboxIfActive()) goToPage(0); syncRemoteState(); },
  last: () => { if (!closeLightboxIfActive()) goToPage(state.totalPages - 1); syncRemoteState(); },
  goto: showGoToPageDialog,
  fullscreen: toggleFullscreen,
  sidebar: toggleSidebar,
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
  toggleNav: toggleNavVisibility,
  remoteQR: openRemoteModal,
  laser: toggleLaser,
  help: showHelpModal,
  escape: () => { if (isSearchOpen()) closeSearch(); else closeAllModals(); },
  fontUp: localIncreaseFontSize,
  fontDown: localDecreaseFontSize,
  fontReset: () => localSetFontScale(1.0),
  search: openSearch,
  exportPDF: exportPDF
};

function handleKeydown(e) {
  const tag = e.target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  const mod = isMac ? e.metaKey : e.ctrlKey;

  if (mod && !e.shiftKey && !e.altKey) {
    const a = COMBO_KEYS[e.key];
    if (a && ACTIONS[a]) { e.preventDefault(); ACTIONS[a](); showNav(); return; }
  }

  if (!e.metaKey && !e.ctrlKey && !e.altKey) {
    const a = HOTKEYS[e.key];
    if (a && ACTIONS[a]) { e.preventDefault(); ACTIONS[a](); if (a !== 'escape') showNav(); return; }
  }
}

// ── Context Menu ────────────────────────────────────────────────

const CTX_ICONS = {
  spotlight: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>',
  search: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  pdf: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>',
  remote: '<svg width="28" height="28" viewBox="0 -960 960 960" fill="currentColor"><path d="M320-40q-33 0-56.5-23.5T240-120v-720q0-33 23.5-56.5T320-920h320q33 0 56.5 23.5T720-840v720q0 33-23.5 56.5T640-40H320Zm0-80h320v-720H320v720Zm160-440q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Z"/></svg>',
  orientation: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/></svg>',
  fullscreen: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  help: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
};

const CTX_ITEMS = [
  { id: 'ctx-spotlight', icon: CTX_ICONS.spotlight, label: '聚光燈', action: toggleLaser },
  { id: 'ctx-search', icon: CTX_ICONS.search, label: '文字搜尋', action: openSearch },
  { id: 'ctx-pdf', icon: CTX_ICONS.pdf, label: '匯出 PDF', action: exportPDF },
  { id: 'ctx-remote', icon: CTX_ICONS.remote, label: '遙控器', action: openRemoteModal },
  { divider: true },
  { id: 'ctx-orientation', icon: CTX_ICONS.orientation, label: '', action: () => ACTIONS.orientation() },
  { id: 'ctx-fullscreen', icon: CTX_ICONS.fullscreen, label: '全螢幕', action: toggleFullscreen },
  { divider: true },
  { id: 'ctx-help', icon: CTX_ICONS.help, label: '快捷鍵說明', action: showHelpModal }
];

let ctxMenu = null;
let longPressTimer = null;

function getOrientationLabel() {
  return isVerticalMode() ? '切換為橫書' : '切換為直書';
}

function buildMenu() {
  ctxMenu = document.createElement('div');
  ctxMenu.className = 'context-menu';
  ctxMenu.id = 'contextMenu';
  CTX_ITEMS.forEach(item => {
    if (item.divider) {
      const d = document.createElement('div');
      d.className = 'context-menu-divider';
      ctxMenu.appendChild(d);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'context-menu-item';
    btn.id = item.id;
    btn.innerHTML = `<span class="context-menu-icon">${item.icon}</span><span class="context-menu-label">${item.label}</span>`;
    btn.addEventListener('click', (e) => { e.stopPropagation(); hideMenu(); item.action(); });
    ctxMenu.appendChild(btn);
  });
  document.body.appendChild(ctxMenu);
}

function showMenu(x, y) {
  if (!ctxMenu) buildMenu();
  const ol = ctxMenu.querySelector('#ctx-orientation .context-menu-label');
  if (ol) ol.textContent = getOrientationLabel();
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top = y + 'px';
  ctxMenu.classList.add('active');
  requestAnimationFrame(() => {
    const r = ctxMenu.getBoundingClientRect();
    if (r.right > window.innerWidth) ctxMenu.style.left = (x - r.width) + 'px';
    if (r.bottom > window.innerHeight) ctxMenu.style.top = (y - r.height) + 'px';
  });
}

function hideMenu() {
  if (ctxMenu) ctxMenu.classList.remove('active');
}

function initContextMenu() {
  buildMenu();
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.sidebar,.help-modal,.remote-modal,.goto-modal,.search-bar')) return;
    e.preventDefault();
    showMenu(e.clientX, e.clientY);
  });
  document.addEventListener('click', (e) => {
    if (ctxMenu?.classList.contains('active') && !ctxMenu.contains(e.target)) hideMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ctxMenu?.classList.contains('active')) { hideMenu(); e.stopPropagation(); }
  }, true);
  document.addEventListener('touchstart', (e) => {
    if (e.target.closest('.sidebar,.help-modal,.remote-modal,.goto-modal,.search-bar,.context-menu,.slide-nav,.left-panel')) return;
    const t = e.touches[0];
    longPressTimer = setTimeout(() => showMenu(t.clientX, t.clientY), 600);
  }, { passive: true });
  document.addEventListener('touchmove', () => { clearTimeout(longPressTimer); }, { passive: true });
  document.addEventListener('touchend', () => { clearTimeout(longPressTimer); }, { passive: true });
}

// ── Event Listeners ─────────────────────────────────────────────

let eventsInit = false;

function initEventListeners() {
  if (eventsInit) return;
  eventsInit = true;

  document.getElementById('prevBtn').onclick = () => { prevPage(); syncRemoteState(); };
  document.getElementById('nextBtn').onclick = () => { nextPage(); syncRemoteState(); };
  dom.hamburgerBtn.onclick = toggleSidebar;
  dom.sidebarOverlay.onclick = closeSidebar;
  document.getElementById('fontDecrease').onclick = localDecreaseFontSize;
  document.getElementById('fontIncrease').onclick = localIncreaseFontSize;
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
  document.getElementById('fontSelect').onchange = function () { localApplyFont(this.value); };
  document.getElementById('fullscreenBtn').onclick = toggleFullscreen;
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  document.getElementById('toggleNavBtn').onclick = toggleNavVisibility;
  document.getElementById('laserBtn').onclick = toggleLaser;
  initLaser();
  document.getElementById('exportPdfBtn').onclick = exportPDF;
  document.getElementById('refreshBtn').onclick = refresh;

  initHelpModal();
  initGotoModal();
  initSearch();

  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('mousemove', showNav);

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      repaginate();
    }, 200);
  });

  // Touch swipe
  let touchStartX = 0;
  document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const diff = touchStartX - e.changedTouches[0].screenX;
    if (Math.abs(diff) > 50) {
      diff > 0 ? prevPage() : nextPage();
      syncRemoteState();
    }
  }, { passive: true });

  initLightbox();
  initContextMenu();
}

// ── Entry Point ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initDOM();
  const src = new URLSearchParams(window.location.search).get('src');
  if (!src) {
    dom.manuscript.innerHTML = '<p style="color:#ff6b6b;font-size:24px;">請提供 src 參數</p>';
    return;
  }
  currentSrc = src;
  loadDocument(src);
});
