import { state, dom } from './state.js';
import { goToPage, isVerticalMode } from './navigation.js';
import { closeSidebar } from './display.js';

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

export function showGoToPageDialog() {
  const input = dom.gotoPageInput;
  input.max = state.totalPages;
  input.placeholder = `頁碼 (1-${state.totalPages})`;
  buildTocList();
  dom.gotoModal.classList.add('active');
  closeSidebar();
  setTimeout(() => input.focus(), 50);
}

export function closeGotoModal() {
  dom.gotoModal.classList.remove('active');
  dom.gotoPageInput.value = '';
}

export function initGotoModal() {
  document.querySelector('.goto-modal-close').onclick = closeGotoModal;
  dom.gotoModal.onclick = (e) => {
    if (e.target === dom.gotoModal) closeGotoModal();
  };
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
    }
  });
}
