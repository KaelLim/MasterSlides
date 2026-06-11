import { dom } from './state.js';

let printContainer: HTMLDivElement | null = null;
let printStyle: HTMLStyleElement | null = null;

export function exportPDF(): void {
  // Single cleanup closure used twice: once up-front (in case a prior export
  // was interrupted before afterprint fired) and once as the afterprint
  // listener. Keeping the body in one place prevents the two copies from
  // silently drifting if a new field is added to the print cycle.
  const cleanup = (): void => {
    if (printContainer) { printContainer.remove(); printContainer = null; }
    if (printStyle) { printStyle.remove(); printStyle = null; }
  };
  cleanup();

  const containerW = dom.manuscriptContainer.clientWidth;
  const containerH = dom.manuscriptContainer.clientHeight;
  const pageW = containerW + 160;
  const pageH = containerH + 120;

  printStyle = document.createElement('style');
  printStyle.id = 'printPageStyle';
  printStyle.textContent = `@page { size: ${pageW}px ${pageH}px; margin: 0; }`;
  document.head.appendChild(printStyle);

  printContainer = document.createElement('div');
  printContainer.id = 'printContainer';

  const slidePages = document.querySelectorAll<HTMLElement>('.slide-page');
  slidePages.forEach(sp => {
    const page = document.createElement('div');
    page.className = 'print-page';
    const bgWrap = document.createElement('div');
    bgWrap.className = 'print-page-bg';
    const clipArea = document.createElement('div');
    clipArea.className = 'print-page-clip';
    const clone = sp.cloneNode(true) as HTMLElement;
    clone.style.display = '';
    clone.style.width = containerW + 'px';
    clone.style.height = containerH + 'px';
    clipArea.appendChild(clone);
    bgWrap.appendChild(clipArea);
    page.appendChild(bgWrap);
    printContainer!.appendChild(page);
  });

  document.body.appendChild(printContainer);

  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
}
