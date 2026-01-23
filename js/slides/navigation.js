import { state, dom } from './state.js';

export function isVerticalMode() {
  return !document.body.classList.contains('horizontal-mode');
}

export function updatePageCount() {
  const containerWidth = dom.manuscriptContainer.clientWidth;
  const containerHeight = dom.manuscriptContainer.clientHeight;

  if (isVerticalMode()) {
    const scrollHeight = dom.manuscript.scrollHeight;
    state.totalPages = Math.max(1, Math.ceil(scrollHeight / containerHeight));
  } else {
    const scrollWidth = dom.manuscript.scrollWidth;
    state.totalPages = Math.max(1, Math.ceil(scrollWidth / containerWidth));
  }

  dom.totalPagesEl.textContent = state.totalPages;

  if (state.currentPage >= state.totalPages) {
    state.currentPage = state.totalPages - 1;
  }
  updatePageDisplay();

  console.log(`Mode: ${isVerticalMode() ? 'vertical' : 'horizontal'}, Container: ${containerWidth}x${containerHeight}, Pages: ${state.totalPages}`);
}

export function updatePageDisplay() {
  dom.currentPageEl.textContent = state.currentPage + 1;
}

export function goToPage(page) {
  if (page < 0 || page >= state.totalPages) return;
  state.currentPage = page;

  const containerWidth = dom.manuscriptContainer.clientWidth;
  const containerHeight = dom.manuscriptContainer.clientHeight;

  if (isVerticalMode()) {
    dom.manuscript.style.transform = `translateY(-${state.currentPage * containerHeight}px)`;
  } else {
    dom.manuscript.style.transform = `translateX(-${state.currentPage * containerWidth}px)`;
  }
  updatePageDisplay();
  // syncRemoteState is called by main via onPageChange callback
  if (navigation.onPageChange) navigation.onPageChange();
}

export function prevPage() {
  if (state.currentPage === 0 && state.playlistDocs.length > 1 && state.playlistIndex > 0) {
    state.playlistIndex--;
    if (navigation.onLoadPlaylistDoc) navigation.onLoadPlaylistDoc(state.playlistIndex);
    return;
  }
  goToPage(state.currentPage - 1);
}

export function nextPage() {
  if (state.currentPage === state.totalPages - 1 && state.playlistDocs.length > 1 && state.playlistIndex < state.playlistDocs.length - 1) {
    state.playlistIndex++;
    if (navigation.onLoadPlaylistDoc) navigation.onLoadPlaylistDoc(state.playlistIndex);
    return;
  }
  goToPage(state.currentPage + 1);
}

// Callbacks set by main.js to avoid circular dependencies
export const navigation = {
  onPageChange: null,
  onLoadPlaylistDoc: null
};
