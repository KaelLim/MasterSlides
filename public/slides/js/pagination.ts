// Pagination + writing-mode shell — orchestrates paginate() from paginator.ts
// for the viewer. Shared state (currentWritingMode, allPageElements) lives in
// state.js so other modules read/write the same identity.
import { state, dom, type WritingMode } from './state.js';
import { paginate, showPage } from './paginator.ts';

export function isVerticalMode(): boolean {
  return state.currentWritingMode === 'vertical-rl';
}

export function setWritingMode(mode: WritingMode): void {
  state.currentWritingMode = mode;
  if (mode === 'horizontal-tb') document.body.classList.add('horizontal-mode');
  else document.body.classList.remove('horizontal-mode');
  // Keep the orientation toggle buttons (.active + aria-pressed) in sync with
  // the writing mode for EVERY caller — click handlers, context menu, the `O`
  // hotkey, and remote-control commands all flow through here. Centralizing
  // this avoids the previous bug where only the click handlers updated ARIA
  // while other paths left the buttons' pressed state stale.
  const verticalBtn = document.getElementById('verticalBtn');
  const horizontalBtn = document.getElementById('horizontalBtn');
  if (verticalBtn && horizontalBtn) {
    const vertical = mode === 'vertical-rl';
    verticalBtn.classList.toggle('active', vertical);
    verticalBtn.setAttribute('aria-pressed', vertical ? 'true' : 'false');
    horizontalBtn.classList.toggle('active', !vertical);
    horizontalBtn.setAttribute('aria-pressed', vertical ? 'false' : 'true');
  }
}

export function updatePageCount(): void {
  const pageCount = document.querySelectorAll('.slide-page').length;
  state.totalPages = Math.max(1, pageCount);
  dom.totalPagesEl.textContent = String(state.totalPages);
  if (state.currentPage >= state.totalPages) state.currentPage = state.totalPages - 1;
  dom.currentPageEl.textContent = String(state.currentPage + 1);
}

export function goToPage(page: number): void {
  if (page < 0 || page >= state.totalPages) return;
  state.currentPage = page;
  showPage(page);
  dom.currentPageEl.textContent = String(state.currentPage + 1);
}

export function prevPage(): void {
  goToPage(state.currentPage - 1);
}

export function nextPage(): void {
  goToPage(state.currentPage + 1);
}

export function repaginate(): void {
  // Deep-clone canonical elements so paginate's in-place splits never touch
  // the originals captured at load.
  const article = document.createElement('article');
  article.className = 'slide-content';
  state.allPageElements.forEach(el => article.appendChild(el.cloneNode(true)));
  paginate(article, dom.manuscript, state.currentWritingMode);
  updatePageCount();
  goToPage(Math.min(state.currentPage, state.totalPages - 1));
}
