import { state, dom } from './state.js';
import { goToPage, isVerticalMode } from './navigation.js';
import { closeSidebar } from './display.js';

let activeTab = 'toc';

function getPageForElement(el) {
  // Aliswa: element lives inside a `.slide-page` with dataset.page set.
  const slidePage = el.closest('.slide-page');
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

function buildTocList() {
  const toc = document.getElementById('gotoToc');
  const headings = dom.manuscript.querySelectorAll('h1, h2, h3');
  if (headings.length === 0) {
    toc.innerHTML = '<div class="goto-toc-empty">此文件沒有標題</div>';
    return;
  }
  toc.innerHTML = '<div class="goto-toc-title">目錄</div>';
  headings.forEach(h => {
    const level = parseInt(h.tagName[1]);
    const page = getPageForElement(h);
    const item = document.createElement('div');
    item.className = 'goto-toc-item';
    item.dataset.level = level;
    item.innerHTML = `<span class="toc-page">${page + 1}</span><span class="toc-text">${h.textContent}</span>`;
    item.onclick = () => { goToPage(page); closeGotoModal(); };
    toc.appendChild(item);
  });
}

let gridObserver = null;
let gridResizeObserver = null;
// Snapshot of live .slide-page refs taken at buildGrid time. Using a frozen
// snapshot makes the grid stable against any repaginate() that fires while
// the modal is open (e.g. via resize) — every tile renders from the same
// set of refs, not from whatever dom.manuscript happens to look like when
// the IntersectionObserver lazily fires for that tile.
let slidePageSnapshot = [];

/**
 * Compute and apply the contain-scale transform for a single tile. Called
 * both at render time and from a ResizeObserver — that observer is what
 * corrects the scale when the modal's max-width transition (50% → 95%) ends
 * after the tile was already rendered at a smaller intermediate size.
 */
function applyPreviewScale(item, containerW, containerH) {
  const preview = item.querySelector('.goto-grid-preview');
  if (!preview) return;

  const hasSnapshot = slidePageSnapshot.length > 0;
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

function renderPreview(item, containerW, containerH, vertical) {
  if (item.dataset.rendered) return;
  item.dataset.rendered = 'true';

  const pageIndex = parseInt(item.dataset.page);
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
      item.insertBefore(preview, item.firstChild);
      return;
    }

    const bg = document.createElement('div');
    bg.className = 'goto-preview-bg';

    const clip = document.createElement('div');
    clip.className = 'goto-preview-clip';

    const clone = sourcePage.cloneNode(true);
    clone.style.display = '';
    clone.style.width = containerW + 'px';
    clone.style.height = containerH + 'px';

    clip.appendChild(clone);
    bg.appendChild(clip);
    preview.appendChild(bg);

    // Outer mirrors the print @page (containerW + 80*2, containerH + 60*2)
    // so bg padding leaves an inner clip of exactly containerW × containerH.
    preview.style.width = (containerW + 160) + 'px';
    preview.style.height = (containerH + 120) + 'px';
  } else {
    // Main-stack fallback (no .slide-page divs — CSS columns scroll model):
    // clone the whole manuscript and translate to the target page offset.
    preview.style.width = containerW + 'px';
    preview.style.height = containerH + 'px';

    const clone = dom.manuscript.cloneNode(true);
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

  item.insertBefore(preview, item.firstChild);
  applyPreviewScale(item, containerW, containerH);
}

function buildGrid() {
  const grid = document.getElementById('gotoGrid');
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
    dom.manuscript.querySelectorAll(':scope > .slide-page')
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
    item.dataset.page = i;
    item.style.aspectRatio = cellAspect;

    const badge = document.createElement('span');
    badge.className = 'goto-grid-page';
    badge.textContent = i + 1;
    item.appendChild(badge);

    item.onclick = () => { goToPage(i); closeGotoModal(); };
    grid.appendChild(item);
  }

  requestAnimationFrame(() => {
    const items = grid.querySelectorAll('.goto-grid-item');

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
        applyPreviewScale(entry.target, containerW, containerH);
      });
    });

    items.forEach(item => {
      gridObserver.observe(item);
      gridResizeObserver.observe(item);
    });
  });
}

function switchTab(tab) {
  activeTab = tab;
  const tabs = dom.gotoModal.querySelectorAll('.goto-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

  document.getElementById('gotoPanelToc').classList.toggle('goto-panel-hidden', tab !== 'toc');
  document.getElementById('gotoPanelGrid').classList.toggle('goto-panel-hidden', tab !== 'grid');

  // Wider layout for grid mode
  dom.gotoModal.querySelector('.goto-content').classList.toggle('grid-mode', tab === 'grid');

  if (tab === 'toc') {
    setTimeout(() => dom.gotoPageInput.focus(), 50);
  } else if (tab === 'grid') {
    buildGrid();
  }
}

export function showGoToPageDialog() {
  const input = dom.gotoPageInput;
  input.max = state.totalPages;
  input.placeholder = `頁碼 (1-${state.totalPages})`;
  buildTocList();
  dom.gotoModal.classList.add('active');
  closeSidebar();

  // Reset to toc tab
  switchTab('toc');
}

export function closeGotoModal() {
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
  document.getElementById('gotoGrid').innerHTML = '';
  slidePageSnapshot = [];
}

export function initGotoModal() {
  document.querySelector('.goto-modal-close').onclick = closeGotoModal;
  dom.gotoModal.onclick = (e) => {
    if (e.target === dom.gotoModal) closeGotoModal();
  };

  // Tab switching
  dom.gotoModal.querySelectorAll('.goto-tab').forEach(tab => {
    tab.onclick = () => switchTab(tab.dataset.tab);
  });

  // Page input
  document.getElementById('gotoPageBtn').onclick = () => {
    const val = parseInt(dom.gotoPageInput.value, 10);
    if (!isNaN(val) && val >= 1 && val <= state.totalPages) {
      goToPage(val - 1);
      closeGotoModal();
    }
  };

  dom.gotoPageInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      document.getElementById('gotoPageBtn').click();
    } else if (e.key === 'Escape') {
      closeGotoModal();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      switchTab(activeTab === 'toc' ? 'grid' : 'toc');
    }
  });

  // Tab key switching when grid is focused
  dom.gotoModal.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && dom.gotoModal.classList.contains('active')) {
      // Only intercept if not in input
      if (e.target !== dom.gotoPageInput) {
        e.preventDefault();
        switchTab(activeTab === 'toc' ? 'grid' : 'toc');
      }
    }
  });
}
