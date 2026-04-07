// Aliswa slides app — standalone Bun backend, no Supabase
// Loads via /api/docs/:id or direct URL, WebSocket remote control

import { initDOM, state, dom, isMac, modKey, FONT_SCALES, STORAGE_KEYS } from '/js/slides/state.js';
import { paginate, renderPages, showPage } from './paginator.js';
import {
  loadSettings, resetNavHideTimer, updateFullscreenButton, showNav,
  toggleFullscreen, toggleSidebar, closeSidebar, toggleNavVisibility
} from '/js/slides/display.js';
import { initLightbox, closeLightbox, openLightbox, setLightboxZoom, resetLightboxZoom, panLightbox } from '/js/slides/lightbox.js';
import { initSearch, openSearch, closeSearch, isSearchOpen, searchFor, nextMatch, prevMatch, getSearchState } from '/js/slides/search.js';
import { showGoToPageDialog, initGotoModal, closeGotoModal } from '/js/slides/goto.js';
import { exportPDF } from '/js/slides/print.js';
import { initLaser, toggleLaser, isLaserActive } from '/js/slides/laser.js';

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

// ── WebSocket Remote Control ────────────────────────────────────

let ws = null;

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
    if (vW > rect.width * 0.5 && vH > rect.height * 0.5 && img.src) {
      visible.push({ src: img.src, alt: img.alt || '' });
    }
  });
  return visible;
}

function syncRemoteState() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const searchState = getSearchState();
  ws.send(JSON.stringify({
    type: 'sync',
    currentPage: state.currentPage + 1,
    totalPages: state.totalPages,
    images: getCurrentPageImages(),
    lightboxActive: dom.lightbox.classList.contains('active'),
    lightboxZoom: state.lbZoom,
    spotlightActive: isLaserActive(),
    ...searchState
  }));
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

function initRemote() {
  state.roomId = Math.random().toString(36).substring(2, 8);
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws/${state.roomId}`);

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'command') handleRemoteCommand(data);
      if (data.type === 'remote-joined') {
        document.getElementById('remoteStatus').textContent = '遙控器已連線！';
        document.getElementById('remoteStatus').classList.add('connected');
        syncRemoteState();
        setTimeout(closeRemoteModal, 2000);
      }
    } catch {}
  };

  document.getElementById('remoteBtn').onclick = openRemoteModal;
  document.getElementById('remoteModalClose').onclick = closeRemoteModal;
  dom.remoteModal.onclick = (e) => { if (e.target === dom.remoteModal) closeRemoteModal(); };
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
      table.style.cssText = `writing-mode:horizontal-tb;width:${containerWidth}px;background:rgba(0,0,0,0.3);color:white;border-collapse:collapse;font-size:18px`;
      table.querySelectorAll('td').forEach(td => {
        td.style.cssText = 'writing-mode:horizontal-tb;border:1px solid rgba(255,255,255,0.3);padding:10px 14px;color:white;vertical-align:middle;text-align:left';
      });
      table.querySelectorAll('th').forEach(th => {
        th.style.cssText = 'writing-mode:horizontal-tb;border:1px solid rgba(255,255,255,0.3);padding:10px 14px;color:white;vertical-align:middle;text-align:center;background:#1a365d;font-weight:bold';
      });
      const canvas = await html2canvas(table, { backgroundColor: 'transparent', scale: 2, logging: false });
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      img.className = 'table-image';
      table.parentNode.replaceChild(img, table);
    } catch (err) {
      console.error('table conversion failed:', err);
    }
  }
}

// ── Document loader ─────────────────────────────────────────────

function extractDocId(url) {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function loadDocument(src) {
  try {
    // Detect Google Docs URL → convert first, then load
    const googleDocId = extractDocId(src);
    if (googleDocId) {
      dom.manuscript.innerHTML = '<p class="loading-message">轉換中，請稍候...</p>';
      const convertRes = await fetch('/api/fetch-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: src })
      });
      const result = await convertRes.json();
      if (!result.success) throw new Error(result.error);
      src = result.doc_id;
    }

    // If src looks like a doc_id (alphanumeric/hyphens/underscores), use API
    const isDocId = /^[a-zA-Z0-9_-]+$/.test(src);
    const url = isDocId ? `/api/docs/${src}` : src;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    dom.manuscript.innerHTML = await res.text();
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

  requestAnimationFrame(() => {
    repaginate();
    initEventListeners();
    initRemote();
    resetNavHideTimer();
  });
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
  loadDocument(src);
});
