import { state, dom } from './state.js';
import { isVerticalMode } from './navigation.js';

let printContainer = null;

function buildPrintPages() {
  // Remove existing print container if any
  cleanup();

  const containerW = dom.manuscriptContainer.clientWidth;
  const containerH = dom.manuscriptContainer.clientHeight;
  const vertical = isVerticalMode();
  const totalPages = state.totalPages;

  // Create print container
  printContainer = document.createElement('div');
  printContainer.id = 'printContainer';

  for (let i = 0; i < totalPages; i++) {
    const page = document.createElement('div');
    page.className = 'print-page';

    // Background wrapper (reproduces .app-layout background)
    const bgWrap = document.createElement('div');
    bgWrap.className = 'print-page-bg';

    // Content wrapper (reproduces .content-area padding)
    const contentWrap = document.createElement('div');
    contentWrap.className = 'print-page-content';

    // Manuscript clip area (reproduces .manuscript-container)
    const clipArea = document.createElement('div');
    clipArea.className = 'print-page-clip';
    clipArea.style.width = containerW + 'px';
    clipArea.style.height = containerH + 'px';

    // Clone manuscript and position for this page
    const clone = dom.manuscript.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.width = containerW + 'px';
    clone.style.height = containerH + 'px';

    if (vertical) {
      clone.style.transform = `translateY(-${i * containerH}px)`;
    } else {
      clone.style.transform = `translateX(-${i * containerW}px)`;
    }

    clipArea.appendChild(clone);
    contentWrap.appendChild(clipArea);
    bgWrap.appendChild(contentWrap);
    page.appendChild(bgWrap);
    printContainer.appendChild(page);
  }

  document.body.appendChild(printContainer);
}

function cleanup() {
  if (printContainer) {
    printContainer.remove();
    printContainer = null;
  }
}

export function exportPDF() {
  buildPrintPages();

  // Clean up after print dialog closes
  window.addEventListener('afterprint', cleanup, { once: true });

  window.print();
}
