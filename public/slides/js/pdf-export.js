import { dom } from './state.js';

let printContainer = null;
let printStyle = null;

export function exportPDF() {
  if (printContainer) { printContainer.remove(); printContainer = null; }
  if (printStyle) { printStyle.remove(); printStyle = null; }

  const containerW = dom.manuscriptContainer.clientWidth;
  const containerH = dom.manuscriptContainer.clientHeight;
  // pageW/H = containerW/H + .content-area padding (10/20 each side) so
  // @page exactly matches the live viewport. Update in lockstep with
  // .content-area padding in manuscript.css.
  const pageW = containerW + 40;
  const pageH = containerH + 20;

  printStyle = document.createElement('style');
  printStyle.id = 'printPageStyle';
  printStyle.textContent = `@page { size: ${pageW}px ${pageH}px; margin: 0; }`;
  document.head.appendChild(printStyle);

  printContainer = document.createElement('div');
  printContainer.id = 'printContainer';

  const slidePages = document.querySelectorAll('.slide-page');
  slidePages.forEach(sp => {
    const page = document.createElement('div');
    page.className = 'print-page';
    const bgWrap = document.createElement('div');
    bgWrap.className = 'print-page-bg';
    const clipArea = document.createElement('div');
    clipArea.className = 'print-page-clip';
    const clone = sp.cloneNode(true);
    clone.style.display = '';
    clone.style.width = containerW + 'px';
    clone.style.height = containerH + 'px';
    clipArea.appendChild(clone);
    bgWrap.appendChild(clipArea);
    page.appendChild(bgWrap);
    printContainer.appendChild(page);
  });

  document.body.appendChild(printContainer);

  const cleanup = () => {
    if (printContainer) { printContainer.remove(); printContainer = null; }
    if (printStyle) { printStyle.remove(); printStyle = null; }
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
}
