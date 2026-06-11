import { state, dom, STORAGE_KEYS } from './state.js';
import { goToPage, isVerticalMode } from './navigation.js';
import { closeSidebar } from './display.js';

let activeTab: 'toc' | 'grid' = 'toc';

// Detailed-TOC toggle. false = show only doc <h2> (post-promotion top-level
// section dividers); true = include <h3>/<h4>. Persisted to localStorage so
// the user's preference survives reload — defaults to false because the
// audience is older and a flat top-level outline is what they want by default.
let tocDetailed: boolean = localStorage.getItem(STORAGE_KEYS.tocDetailed) === 'true';

function getPageForElement(el: HTMLElement): number {
  // Aliswa: element lives inside a `.slide-page` with dataset.page set.
  const slidePage = el.closest<HTMLElement>('.slide-page');
  if (slidePage && slidePage.dataset.page != null) {
    return parseInt(slidePage.dataset.page, 10);
  }
  // Main-stack: derive from offset within scrolling manuscript.
  const containerWidth = dom.manuscriptContainer.clientWidth;
  const containerHeight = dom.manuscriptContainer.clientHeight;
  if (isVerticalMode()) {
    return Math.floor(el.offsetTop / containerHeight);
  } else {
    return Math.floor(el.offsetLeft / containerWidth);
  }
}

function buildTocList(): void {
  const toc = document.getElementById('gotoToc')!;
  // H1 is hidden by manuscript.css and the body H2/H3/H4 are visually demoted
  // one level (so H2 reads as level-1). Map the TOC indent accordingly: H2→1,
  // H3→2, H4→3 — that's what the existing data-level CSS expects.
  // When tocDetailed is false (default), only h2 is queried — the audience
  // is older and the flat top-level outline is what they want by default.
  const selector = tocDetailed ? 'h2, h3, h4' : 'h2';
  const headings = dom.manuscript.querySelectorAll<HTMLElement>(selector);
  if (headings.length === 0) {
    toc.innerHTML = '<div class="goto-toc-empty">此文件沒有標題</div>';
    return;
  }
  toc.innerHTML = '<div class="goto-toc-title">目錄</div>';
  headings.forEach(h => {
    const level = parseInt(h.tagName[1]) - 1;
    const page = getPageForElement(h);
    const item = document.createElement('div');
    item.className = 'goto-toc-item';
    item.dataset.level = String(level);
    item.innerHTML = `<span class="toc-page">${page + 1}</span><span class="toc-text">${h.textContent}</span>`;
    item.onclick = () => { goToPage(page); closeGotoModal(); };
    toc.appendChild(item);
  });
}

function applyTocToggleState(): void {
  const btn = document.getElementById('gotoTocToggle');
  if (!btn) return;
  btn.setAttribute('aria-checked', tocDetailed ? 'true' : 'false');
}

let gridObserver: IntersectionObserver | null = null;
let gridResizeObserver: ResizeObserver | null = null;
// Snapshot of live .slide-page refs taken at buildGrid time. Using a frozen
// snapshot makes the grid stable against any repaginate() that fires while
// the modal is open (e.g. via resize) — every tile renders from the same
// set of refs, not from whatever dom.manuscript happens to look like when
// the IntersectionObserver lazily fires for that tile.
let slidePageSnapshot: HTMLElement[] = [];

/**
 * Compute and apply the contain-scale transform for a single tile. Called
 * both at render time and from a ResizeObserver — that observer is what
 * corrects the scale when the modal's max-width transition (72% → 95%) ends
 * after the tile was already rendered at a smaller intermediate size.
 */
function applyPreviewScale(item: HTMLElement, containerW: number, containerH: number): void {
  const preview = item.querySelector<HTMLElement>('.goto-grid-preview');
  if (!preview) return;

  const hasSnapshot = slidePageSnapshot.length > 0;
  // +160/+120 = .content-area padding (80 horizontal, 60 vertical) doubled,
  // matching the bg-padding the rendered preview applies. Keep in lockstep
  // with the renderPreview block below.
  const previewW = hasSnapshot ? containerW + 160 : containerW;
  const previewH = hasSnapshot ? containerH + 120 : containerH;

  const itemW = item.clientWidth;
  const itemH = item.clientHeight;
  if (itemW === 0 || itemH === 0) return; // not laid out yet

  const scale = Math.min(itemW / previewW, itemH / previewH);
  const offsetX = (itemW - previewW * scale) / 2;
  const offsetY = (itemH - previewH * scale) / 2;
  preview.style.transformOrigin = 'top left';
  preview.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

function renderPreview(item: Element, containerW: number, containerH: number, vertical: boolean): void {
  const itemEl = item as HTMLElement;
  if (itemEl.dataset.rendered) return;
  itemEl.dataset.rendered = 'true';

  const pageIndex = parseInt(itemEl.dataset.page!);
  const preview = document.createElement('div');
  preview.className = 'goto-grid-preview';
  preview.style.writingMode = vertical ? 'vertical-rl' : 'horizontal-tb';

  if (slidePageSnapshot.length > 0) {
    // Aliswa: mirror the PDF-print structure — one slide-page clone wrapped
    // in bg (theme background + content-area padding) and clip (restores the
    // container-type: size chain so cqw/cqh and percent units behave like
    // the live render).
    const sourcePage = slidePageSnapshot[pageIndex];
    if (!sourcePage) {
      itemEl.insertBefore(preview, itemEl.firstChild);
      return;
    }

    const bg = document.createElement('div');
    bg.className = 'goto-preview-bg';

    const clip = document.createElement('div');
    clip.className = 'goto-preview-clip';

    const clone = sourcePage.cloneNode(true) as HTMLElement;
    clone.style.display = '';
    clone.style.width = containerW + 'px';
    clone.style.height = containerH + 'px';

    clip.appendChild(clone);
    bg.appendChild(clip);
    preview.appendChild(bg);

    // Outer mirrors the print @page (containerW + 80*2, containerH + 60*2)
    // so bg padding leaves an inner clip of exactly containerW × containerH.
    // Must stay in sync with .content-area / .print-page-bg / .goto-preview-bg
    // padding (currently 60px 80px = 60 vertical, 80 horizontal).
    preview.style.width = (containerW + 160) + 'px';
    preview.style.height = (containerH + 120) + 'px';
  } else {
    // Main-stack fallback (no .slide-page divs — CSS columns scroll model):
    // clone the whole manuscript and translate to the target page offset.
    preview.style.width = containerW + 'px';
    preview.style.height = containerH + 'px';

    const clone = dom.manuscript.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.style.width = '100%';
    clone.style.height = '100%';

    if (vertical) {
      clone.style.transform = `translateY(-${pageIndex * containerH}px)`;
    } else {
      clone.style.transform = `translateX(-${pageIndex * containerW}px)`;
    }
    preview.appendChild(clone);
  }

  itemEl.insertBefore(preview, itemEl.firstChild);
  applyPreviewScale(itemEl, containerW, containerH);
}

function buildGrid(): void {
  const grid = document.getElementById('gotoGrid')!;
  grid.innerHTML = '';

  // Clean up previous observers
  if (gridObserver) {
    gridObserver.disconnect();
    gridObserver = null;
  }
  if (gridResizeObserver) {
    gridResizeObserver.disconnect();
    gridResizeObserver = null;
  }

  const containerW = dom.manuscriptContainer.clientWidth;
  const containerH = dom.manuscriptContainer.clientHeight;
  const vertical = isVerticalMode();

  // Take the slide-page snapshot now, NOT lazily inside renderPreview, so
  // every tile uses a consistent set of refs even if repaginate runs later.
  slidePageSnapshot = Array.from(
    dom.manuscript.querySelectorAll<HTMLElement>(':scope > .slide-page')
  );

  // Cell aspect mirrors the preview's outer aspect: when slide-pages exist we
  // include the content-area padding (matches PDF print's @page); otherwise
  // we use raw container aspect (no padding wrapper).
  const cellAspect = slidePageSnapshot.length > 0
    ? `${containerW + 160} / ${containerH + 120}`
    : `${containerW} / ${containerH}`;

  // Create lightweight placeholder items (no cloning yet)
  for (let i = 0; i < state.totalPages; i++) {
    const item = document.createElement('div');
    item.className = 'goto-grid-item' + (i === state.currentPage ? ' current' : '');
    item.dataset.page = String(i);
    item.style.aspectRatio = cellAspect;

    const badge = document.createElement('span');
    badge.className = 'goto-grid-page';
    badge.textContent = String(i + 1);
    item.appendChild(badge);

    item.onclick = () => { goToPage(i); closeGotoModal(); };
    grid.appendChild(item);
  }

  requestAnimationFrame(() => {
    const items = grid.querySelectorAll<HTMLElement>('.goto-grid-item');

    // Observe visibility — only render previews when scrolled into view
    gridObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          renderPreview(entry.target, containerW, containerH, vertical);
        }
      });
    }, { root: grid, rootMargin: '200px' });

    // Re-scale any already-rendered preview when its cell size changes.
    // Handles: modal max-width transition, window resize, future layout shifts.
    gridResizeObserver = new ResizeObserver(entries => {
      entries.forEach(entry => {
        applyPreviewScale(entry.target as HTMLElement, containerW, containerH);
      });
    });

    items.forEach(item => {
      gridObserver!.observe(item);
      gridResizeObserver!.observe(item);
    });
  });
}

function switchTab(tab: 'toc' | 'grid'): void {
  activeTab = tab;
  const tabs = dom.gotoModal.querySelectorAll<HTMLElement>('.goto-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

  document.getElementById('gotoPanelToc')!.classList.toggle('goto-panel-hidden', tab !== 'toc');
  document.getElementById('gotoPanelGrid')!.classList.toggle('goto-panel-hidden', tab !== 'grid');

  // Wider layout for grid mode
  dom.gotoModal.querySelector('.goto-content')!.classList.toggle('grid-mode', tab === 'grid');

  if (tab === 'toc') {
    setTimeout(() => dom.gotoPageInput.focus(), 50);
  } else if (tab === 'grid') {
    buildGrid();
  }
}

export function showGoToPageDialog(): void {
  const input = dom.gotoPageInput;
  input.max = String(state.totalPages);
  input.placeholder = `頁碼 (1-${state.totalPages})`;
  applyTocToggleState();
  buildTocList();
  dom.gotoModal.classList.add('active');
  closeSidebar();

  // Reset to toc tab
  switchTab('toc');
}

export function closeGotoModal(): void {
  dom.gotoModal.classList.remove('active');
  dom.gotoPageInput.value = '';
  // Clean up observers, clones, and snapshot refs
  if (gridObserver) {
    gridObserver.disconnect();
    gridObserver = null;
  }
  if (gridResizeObserver) {
    gridResizeObserver.disconnect();
    gridResizeObserver = null;
  }
  document.getElementById('gotoGrid')!.innerHTML = '';
  slidePageSnapshot = [];
}

export function initGotoModal(): void {
  document.querySelector<HTMLElement>('.goto-modal-close')!.onclick = closeGotoModal;
  dom.gotoModal.onclick = (e: MouseEvent) => {
    if (e.target === dom.gotoModal) closeGotoModal();
  };

  const toggle = document.getElementById('gotoTocToggle');
  if (toggle) {
    toggle.onclick = () => {
      tocDetailed = !tocDetailed;
      localStorage.setItem(STORAGE_KEYS.tocDetailed, tocDetailed ? 'true' : 'false');
      applyTocToggleState();
      buildTocList();
    };
  }

  // Tab switching
  dom.gotoModal.querySelectorAll<HTMLElement>('.goto-tab').forEach(tab => {
    tab.onclick = () => switchTab(tab.dataset.tab as 'toc' | 'grid');
  });

  // Page input
  document.getElementById('gotoPageBtn')!.onclick = () => {
    const val = parseInt(dom.gotoPageInput.value, 10);
    if (!isNaN(val) && val >= 1 && val <= state.totalPages) {
      goToPage(val - 1);
      closeGotoModal();
    }
  };

  dom.gotoPageInput.addEventListener('keydown', (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      (document.getElementById('gotoPageBtn') as HTMLElement).click();
    } else if (e.key === 'Escape') {
      closeGotoModal();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      switchTab(activeTab === 'toc' ? 'grid' : 'toc');
    }
  });

  // Tab key switching when grid is focused
  dom.gotoModal.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Tab' && dom.gotoModal.classList.contains('active')) {
      // Only intercept if not in input
      if (e.target !== dom.gotoPageInput) {
        e.preventDefault();
        switchTab(activeTab === 'toc' ? 'grid' : 'toc');
      }
    }
  });
}
