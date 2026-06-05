import { state, dom, isMac } from './state.js';
import { goToPage, prevPage, nextPage, isVerticalMode, setWritingMode, repaginate } from './pagination.js';
import { showGoToPageDialog } from './goto.js';
import { toggleFullscreen, toggleSidebar, toggleNavVisibility, showNav } from './display.js';
import { closeLightbox } from './lightbox.js';
import { openSearch, closeSearch, isSearchOpen } from './search.js';
import { toggleLaser } from './laser.js';
import { showHelpModal, closeAllModals } from './modals.js';
import { openRemoteModal } from './remote-control.js';
import { setFontScale, increaseFontSize, decreaseFontSize } from './font.js';
import { exportPDF } from './pdf-export.js';
import { syncRemoteState } from './remote-control.js';

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
  'Escape': 'escape',
};

const COMBO_KEYS = {
  'Enter': 'fullscreen', '=': 'fontUp', '+': 'fontUp',
  '-': 'fontDown', '0': 'fontReset',
  ',': 'sidebar', 'f': 'search', 'p': 'exportPDF',
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
    // setWritingMode() handles the toggle buttons' .active + aria-pressed sync.
    setWritingMode(isVerticalMode() ? 'horizontal-tb' : 'vertical-rl');
    state.currentPage = 0;
    repaginate();
  },
  toggleNav: toggleNavVisibility,
  remoteQR: openRemoteModal,
  laser: toggleLaser,
  help: showHelpModal,
  escape: () => { if (isSearchOpen()) closeSearch(); else closeAllModals(); },
  fontUp: increaseFontSize,
  fontDown: decreaseFontSize,
  fontReset: () => setFontScale(1.0),
  search: openSearch,
  exportPDF: exportPDF,
};

export function handleKeydown(e) {
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
