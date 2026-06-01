import { state, dom, isMac } from './state.js';
import { closeLightbox } from './lightbox.js';
import { goToPage, prevPage, nextPage } from './navigation.js';
import { toggleFullscreen, toggleSidebar, toggleNavVisibility, setVerticalMode, setHorizontalMode, increaseFontSize, decreaseFontSize, setFontScale, showNav } from './display.js';
import { isVerticalMode } from './navigation.js';
import { openRemoteModal } from './remote.js';
import { showGoToPageDialog } from './goto.js';
import { showHelpModal, closeAllModals } from './modals.js';
import { openSearch, closeSearch, isSearchOpen } from './search.js';
import { exportPDF } from './print.js';
import { toggleLaser } from './laser.js';

const HOTKEYS = {
  'ArrowRight': 'nextPage',
  ' ': 'nextPage',
  'PageDown': 'nextPage',
  'ArrowLeft': 'prevPage',
  'PageUp': 'prevPage',
  'Home': 'firstPage',
  'End': 'lastPage',
  'g': 'goToPage',
  'G': 'goToPage',
  'f': 'fullscreen',
  'F': 'fullscreen',
  's': 'sidebar',
  'S': 'sidebar',
  'o': 'toggleOrientation',
  'O': 'toggleOrientation',
  'n': 'toggleNav',
  'N': 'toggleNav',
  'r': 'remoteQR',
  'R': 'remoteQR',
  'l': 'laser',
  'L': 'laser',
  '?': 'help',
  'h': 'help',
  'H': 'help',
  'Escape': 'closeModal'
};

const COMBO_HOTKEYS = {
  'Enter': 'fullscreen',
  '=': 'fontIncrease',
  '+': 'fontIncrease',
  '-': 'fontDecrease',
  '0': 'fontReset',
  ',': 'sidebar',
  'f': 'search',
  'p': 'exportPDF'
};

function closeLightboxIfActive() {
  if (dom.lightbox.classList.contains('active')) {
    closeLightbox();
    return true;
  }
  return false;
}

const ACTIONS = {
  nextPage: () => { if (!closeLightboxIfActive()) nextPage(); },
  prevPage: () => { if (!closeLightboxIfActive()) prevPage(); },
  firstPage: () => { if (!closeLightboxIfActive()) goToPage(0); },
  lastPage: () => { if (!closeLightboxIfActive()) goToPage(state.totalPages - 1); },
  goToPage: () => showGoToPageDialog(),
  fullscreen: () => toggleFullscreen(),
  sidebar: () => toggleSidebar(),
  toggleOrientation: () => {
    if (isVerticalMode()) setHorizontalMode();
    else setVerticalMode();
  },
  toggleNav: () => toggleNavVisibility(),
  remoteQR: () => openRemoteModal(),
  help: () => showHelpModal(),
  closeModal: () => {
    if (isSearchOpen()) { closeSearch(); }
    else { closeAllModals(); }
  },
  search: () => openSearch(),
  laser: () => toggleLaser(),
  fontIncrease: () => increaseFontSize(),
  fontDecrease: () => decreaseFontSize(),
  fontReset: () => setFontScale(1.0),
  exportPDF: () => exportPDF()
};

export function handleKeydown(e) {
  const tagName = e.target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return;
  }

  const hasModKey = isMac ? e.metaKey : e.ctrlKey;
  const key = e.key;

  // Combo keys first
  if (hasModKey && !e.shiftKey && !e.altKey) {
    const action = COMBO_HOTKEYS[key];
    if (action && ACTIONS[action]) {
      e.preventDefault();
      ACTIONS[action]();
      showNav();
      return;
    }
  }

  // Single keys (no modifiers)
  if (!e.metaKey && !e.ctrlKey && !e.altKey) {
    const action = HOTKEYS[key];
    if (action && ACTIONS[action]) {
      e.preventDefault();
      ACTIONS[action]();
      if (action !== 'closeModal') {
        showNav();
      }
      return;
    }
  }
}
