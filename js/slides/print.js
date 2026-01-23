import { state, dom } from './state.js';
import { isVerticalMode } from './navigation.js';

let printContainer = null;
let printStyle = null;

function buildPrintPages() {
  cleanup();

  const containerW = dom.manuscriptContainer.clientWidth;
  const containerH = dom.manuscriptContainer.clientHeight;
  const vertical = isVerticalMode();
  const totalPages = state.totalPages;

  // Set @page size to match content-area dimensions (container + padding)
  // .content-area has padding: 60px 80px
  const pageW = containerW + 160; // 80px * 2
  const pageH = containerH + 120; // 60px * 2
  printStyle = document.createElement('style');
  printStyle.id = 'printPageStyle';
  printStyle.textContent = `@page { size: ${pageW}px ${pageH}px; margin: 0; }`;
  document.head.appendChild(printStyle);

  // Create print container
  printContainer = document.createElement('div');
  printContainer.id = 'printContainer';

  for (let i = 0; i < totalPages; i++) {
    const page = document.createElement('div');
    page.className = 'print-page';

    // Background (reproduces .app-layout background)
    const bgWrap = document.createElement('div');
    bgWrap.className = 'print-page-bg';

    // Manuscript clip area (fills entire page)
    const clipArea = document.createElement('div');
    clipArea.className = 'print-page-clip';

    // Clone manuscript and position for this page
    const clone = dom.manuscript.cloneNode(true);
    clone.removeAttribute('id');

    if (vertical) {
      clone.style.transform = `translateY(-${i * containerH}px)`;
    } else {
      clone.style.transform = `translateX(-${i * containerW}px)`;
    }

    clipArea.appendChild(clone);
    bgWrap.appendChild(clipArea);
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
  if (printStyle) {
    printStyle.remove();
    printStyle = null;
  }
}

export function exportPDF() {
  buildPrintPages();

  // Clean up after print dialog closes
  window.addEventListener('afterprint', cleanup, { once: true });

  window.print();
}
