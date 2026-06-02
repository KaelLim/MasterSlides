// Pagination + writing-mode shell — orchestrates paginate() from paginator.ts
// for the viewer. Shared state (currentWritingMode, allPageElements) lives in
// state.js so other modules read/write the same identity.
import { state, dom } from './state.js';
import { paginate, showPage } from './paginator.ts';

export function isVerticalMode() {
  return state.currentWritingMode === 'vertical-rl';
}

export function setWritingMode(mode) {
  state.currentWritingMode = mode;
  if (mode === 'horizontal-tb') document.body.classList.add('horizontal-mode');
  else document.body.classList.remove('horizontal-mode');
}

export function updatePageCount() {
  const pageCount = document.querySelectorAll('.slide-page').length;
  state.totalPages = Math.max(1, pageCount);
  dom.totalPagesEl.textContent = state.totalPages;
  if (state.currentPage >= state.totalPages) state.currentPage = state.totalPages - 1;
  dom.currentPageEl.textContent = state.currentPage + 1;
}

export function goToPage(page) {
  if (page < 0 || page >= state.totalPages) return;
  state.currentPage = page;
  showPage(page);
  dom.currentPageEl.textContent = state.currentPage + 1;
}

export function prevPage() {
  if (state.currentPage <= 0 && state.playlistState) {
    // Boundary jump handled by playlist.js; expose a hook via a callback
    // registered at app entry to avoid pagination→playlist coupling.
    if (pagination._onLeftBoundary) {
      void pagination._onLeftBoundary();
      return;
    }
  }
  goToPage(state.currentPage - 1);
}

export function nextPage() {
  if (state.currentPage >= state.totalPages - 1 && state.playlistState) {
    if (pagination._onRightBoundary) {
      void pagination._onRightBoundary();
      return;
    }
  }
  goToPage(state.currentPage + 1);
}

// Callback registry — playlist.js sets these at app entry.
export const pagination = { _onLeftBoundary: null, _onRightBoundary: null };

export function repaginate() {
  // Deep-clone canonical elements so paginate's in-place splits never touch
  // the originals captured at load.
  const article = document.createElement('article');
  article.className = 'slide-content';
  state.allPageElements.forEach(el => article.appendChild(el.cloneNode(true)));
  paginate(article, dom.manuscript, state.currentWritingMode);
  updatePageCount();
  goToPage(Math.min(state.currentPage, state.totalPages - 1));
}
