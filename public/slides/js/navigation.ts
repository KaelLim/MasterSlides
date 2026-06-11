import { state, dom } from './state.js';

export function isVerticalMode(): boolean {
  return !document.body.classList.contains('horizontal-mode');
}

export function updatePageCount(): void {
  const containerWidth = dom.manuscriptContainer.clientWidth;
  const containerHeight = dom.manuscriptContainer.clientHeight;

  if (isVerticalMode()) {
    const scrollHeight = dom.manuscript.scrollHeight;
    state.totalPages = Math.max(1, Math.ceil(scrollHeight / containerHeight));
  } else {
    const scrollWidth = dom.manuscript.scrollWidth;
    state.totalPages = Math.max(1, Math.ceil(scrollWidth / containerWidth));
  }

  dom.totalPagesEl.textContent = String(state.totalPages);

  if (state.currentPage >= state.totalPages) {
    state.currentPage = state.totalPages - 1;
  }
  updatePageDisplay();

  console.log(`Mode: ${isVerticalMode() ? 'vertical' : 'horizontal'}, Container: ${containerWidth}x${containerHeight}, Pages: ${state.totalPages}`);
}

function updatePageDisplay(): void {
  dom.currentPageEl.textContent = String(state.currentPage + 1);
}

export function goToPage(page: number): void {
  if (page < 0 || page >= state.totalPages) return;
  state.currentPage = page;

  // Aliswa-style pagination renders `.slide-page` divs and toggles display.
  // Main-stack pagination scrolls one big manuscript via transform. Detect
  // which model we're in by the presence of `.slide-page` elements within
  // the manuscript itself (the goto modal clones slide-pages too, so we
  // must NOT query the whole document).
  const slidePages = dom.manuscript.querySelectorAll<HTMLElement>('.slide-page');
  if (slidePages.length > 0) {
    slidePages.forEach((p, i) => {
      p.style.display = i === state.currentPage ? '' : 'none';
    });
  } else {
    const containerWidth = dom.manuscriptContainer.clientWidth;
    const containerHeight = dom.manuscriptContainer.clientHeight;
    if (isVerticalMode()) {
      dom.manuscript.style.transform = `translateY(-${state.currentPage * containerHeight}px)`;
    } else {
      dom.manuscript.style.transform = `translateX(-${state.currentPage * containerWidth}px)`;
    }
  }
  updatePageDisplay();
  // syncRemoteState is called by main via onPageChange callback
  if (navigation.onPageChange) navigation.onPageChange();
}

export function prevPage(): void {
  if (state.currentPage === 0 && state.playlistDocs.length > 1 && state.playlistIndex > 0) {
    state.playlistIndex--;
    if (navigation.onLoadPlaylistDoc) navigation.onLoadPlaylistDoc(state.playlistIndex);
    return;
  }
  goToPage(state.currentPage - 1);
}

export function nextPage(): void {
  if (state.currentPage === state.totalPages - 1 && state.playlistDocs.length > 1 && state.playlistIndex < state.playlistDocs.length - 1) {
    state.playlistIndex++;
    if (navigation.onLoadPlaylistDoc) navigation.onLoadPlaylistDoc(state.playlistIndex);
    return;
  }
  goToPage(state.currentPage + 1);
}

// Callbacks set by main.js to avoid circular dependencies
export interface NavigationCallbacks {
  onPageChange: (() => void) | null;
  onLoadPlaylistDoc: ((index: number) => void) | null;
}

export const navigation: NavigationCallbacks = {
  onPageChange: null,
  onLoadPlaylistDoc: null,
};
