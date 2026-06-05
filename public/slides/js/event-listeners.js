import { state, dom } from './state.js';
import { prevPage, nextPage, repaginate, setWritingMode } from './pagination.js';
import { toggleSidebar, closeSidebar, showNav, toggleFullscreen, updateFullscreenButton, toggleNavVisibility } from './display.js';
import { increaseFontSize, decreaseFontSize, applyFont } from './font.js';
import { initLaser, toggleLaser } from './laser.js';
import { initSearch } from './search.js';
import { initLightbox } from './lightbox.js';
import { initGotoModal } from './goto.js';
import { initHelpModal } from './modals.js';
import { initContextMenu } from './context-menu.js';
import { exportPDF } from './pdf-export.js';
import { refresh } from './loader.js';
import { handleKeydown } from './keyboard.js';
import { syncRemoteState } from './remote-control.js';

let eventsInit = false;

export function initEventListeners() {
  if (eventsInit) return;
  eventsInit = true;

  document.getElementById('prevBtn').onclick = () => { prevPage(); syncRemoteState(); };
  document.getElementById('nextBtn').onclick = () => { nextPage(); syncRemoteState(); };
  dom.hamburgerBtn.onclick = toggleSidebar;
  dom.sidebarOverlay.onclick = closeSidebar;
  document.getElementById('fontDecrease').onclick = decreaseFontSize;
  document.getElementById('fontIncrease').onclick = increaseFontSize;
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
  document.getElementById('fontSelect').onchange = function () { applyFont(this.value); };
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
  // Track the last manuscript dimensions so we can skip rebuilds on
  // resize events that didn't actually change the content area —
  // e.g. an iframe exiting fullscreen fires a resize that nets to the
  // same window size, and rebuilding the DOM there produces a visible
  // refresh flash.
  let lastManuscriptSize = '';
  window.addEventListener('resize', () => {
    // Hard skip: a child element (typically a YouTube iframe) is currently
    // fullscreen. repaginate() clears manuscript.innerHTML, which detaches
    // the fullscreen element and force-exits its fullscreen state.
    // Whole-app fullscreen (documentElement) survives a rebuild.
    if (
      document.fullscreenElement &&
      document.fullscreenElement !== document.documentElement
    ) {
      return;
    }
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const m = dom.manuscript;
      if (!m) return;
      const cur = `${m.clientWidth}x${m.clientHeight}`;
      if (cur === lastManuscriptSize) return;  // no real layout change
      lastManuscriptSize = cur;
      repaginate();
    }, 200);
  });

  // Touch input on iPad / phone. Two responsibilities:
  //  1. Every touch wakes the auto-hiding nav. mousemove doesn't fire on
  //     touch-only devices, so without this iPad users get stranded once
  //     the 3-second timer elapses and the nav has hidden itself.
  //  2. Horizontal swipe > 50px flips pages — but only when no modal /
  //     sidebar / lightbox is open. Those have their own gesture handlers
  //     and a document-level swipe would otherwise steal taps inside them.
  function isModalActive() {
    return (
      dom.sidebar?.classList.contains('open') ||
      dom.lightbox?.classList.contains('active') ||
      dom.helpModal?.classList.contains('active') ||
      dom.gotoModal?.classList.contains('active') ||
      dom.remoteModal?.classList.contains('active')
    );
  }
  let touchStartX = 0;
  let touchStartY = 0;
  document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
    showNav();
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (isModalActive()) return;
    const diffX = touchStartX - e.changedTouches[0].screenX;
    const diffY = Math.abs(touchStartY - e.changedTouches[0].screenY);
    // Horizontal dominance: |Δy| < |Δx| / 2. Without it a long vertical
    // scroll with any rightward drift phantom-flips the page.
    if (Math.abs(diffX) > 50 && diffY < Math.abs(diffX) / 2) {
      diffX > 0 ? prevPage() : nextPage();
      syncRemoteState();
    }
  }, { passive: true });

  initLightbox();
  initContextMenu();
}
