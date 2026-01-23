import { state, dom } from './state.js';
import { goToPage, isVerticalMode } from './navigation.js';
import { closeSidebar } from './display.js';

let activeTab = 'toc';

function getPageForElement(el) {
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

function renderPreview(item, containerW, containerH, vertical) {
  if (item.dataset.rendered) return;
  item.dataset.rendered = 'true';

  const pageIndex = parseInt(item.dataset.page);
  const preview = document.createElement('div');
  preview.className = 'goto-grid-preview';
  preview.style.width = containerW + 'px';
  preview.style.height = containerH + 'px';
  preview.style.writingMode = vertical ? 'vertical-rl' : 'horizontal-tb';

  const clone = dom.manuscript.cloneNode(true);
  clone.removeAttribute('id');
  if (vertical) {
    clone.style.transform = `translateY(-${pageIndex * containerH}px)`;
  } else {
    clone.style.transform = `translateX(-${pageIndex * containerW}px)`;
  }

  preview.appendChild(clone);
  item.insertBefore(preview, item.firstChild);

  const itemW = item.clientWidth;
  const scale = itemW / containerW;
  preview.style.transform = `scale(${scale})`;
}

function buildGrid() {
  const grid = document.getElementById('gotoGrid');
  grid.innerHTML = '';

  // Clean up previous observer
  if (gridObserver) {
    gridObserver.disconnect();
    gridObserver = null;
  }

  const containerW = dom.manuscriptContainer.clientWidth;
  const containerH = dom.manuscriptContainer.clientHeight;
  const vertical = isVerticalMode();

  // Create lightweight placeholder items (no cloning yet)
  for (let i = 0; i < state.totalPages; i++) {
    const item = document.createElement('div');
    item.className = 'goto-grid-item' + (i === state.currentPage ? ' current' : '');
    item.dataset.page = i;

    const badge = document.createElement('span');
    badge.className = 'goto-grid-page';
    badge.textContent = i + 1;
    item.appendChild(badge);

    item.onclick = () => { goToPage(i); closeGotoModal(); };
    grid.appendChild(item);
  }

  // Set explicit heights after layout
  requestAnimationFrame(() => {
    const items = grid.querySelectorAll('.goto-grid-item');
    items.forEach(item => {
      const itemW = item.clientWidth;
      item.style.height = (itemW * containerH / containerW) + 'px';
    });

    // Observe visibility — only render previews when scrolled into view
    gridObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          renderPreview(entry.target, containerW, containerH, vertical);
        }
      });
    }, { root: grid, rootMargin: '200px' });

    items.forEach(item => gridObserver.observe(item));
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
  // Clean up observer and clones
  if (gridObserver) {
    gridObserver.disconnect();
    gridObserver = null;
  }
  document.getElementById('gotoGrid').innerHTML = '';
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
