// Pure-DOM paginator. No pretext, no font-string heuristics — DOM is the
// only source of truth for fits/doesn't-fit decisions.

export type WritingMode = 'vertical-rl' | 'horizontal-tb';

// ── DOM measurement (unchanged from paginator.js) ───────────────

function getBlockSize(el: HTMLElement, writingMode: WritingMode): number {
  return writingMode === 'vertical-rl' ? el.offsetWidth : el.offsetHeight;
}

function getBlockMargin(el: HTMLElement, writingMode: WritingMode): number {
  const style = getComputedStyle(el);
  if (writingMode === 'vertical-rl') {
    return parseFloat(style.marginLeft || '0') + parseFloat(style.marginRight || '0');
  }
  return parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0');
}

function measureBlock(el: HTMLElement, writingMode: WritingMode): number {
  return getBlockSize(el, writingMode) + getBlockMargin(el, writingMode);
}

// ── Image scaling (unchanged) ───────────────────────────────────

function scaleImageToFit(el: HTMLElement, maxBlockSize: number, writingMode: WritingMode): void {
  const blockSize = getBlockSize(el, writingMode);
  if (blockSize > maxBlockSize && blockSize > 0) {
    const ratio = maxBlockSize / blockSize;
    el.style.maxWidth = `${el.offsetWidth * ratio}px`;
    el.style.maxHeight = `${el.offsetHeight * ratio}px`;
    el.style.objectFit = 'contain';
  }
}

// ── Element classification (unchanged) ──────────────────────────

function forcesBreakBefore(el: HTMLElement): boolean {
  return el.tagName === 'H1' || el.tagName === 'H2';
}

function isTextElement(el: HTMLElement): boolean {
  return ['H1', 'H2', 'H3', 'H4', 'P', 'LI', 'BLOCKQUOTE'].includes(el.tagName);
}

function isHeading(el: HTMLElement): boolean {
  return ['H1', 'H2', 'H3', 'H4'].includes(el.tagName);
}

function isListElement(el: HTMLElement): boolean {
  return el.tagName === 'UL' || el.tagName === 'OL';
}

// ── Pure binary search core ────────────────────────────────────
// Find the largest n in [1, upperBound] such that measure(n) <= maxAllowed.
// Returns 0 if even n=1 overflows.
export function findMaxFitting(
  upperBound: number,
  measure: (n: number) => number,
  maxAllowed: number
): number {
  let lo = 1, hi = upperBound, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (measure(mid) <= maxAllowed) { best = mid; lo = mid + 1; }
    else                              { hi = mid - 1; }
  }
  return best;
}

// ── DOM-bound split helpers ────────────────────────────────────
// All split helpers obey the invariant: if they return [first, second],
// then measureBlock(first, writingMode) <= maxAllowed. Zero-overflow is
// guaranteed because `findMaxFitting` only commits a `best` index whose
// DOM measurement came back under the budget.

function splitTextDOM(
  el: HTMLElement,
  maxAllowed: number,
  writingMode: WritingMode,
  host: HTMLElement
): [HTMLElement, HTMLElement] | null {
  const text = el.textContent ?? '';
  if (text.length < 2) return null;

  // Probe inherits the element's tag + CSS but starts empty so we can
  // mutate textContent freely between measurements.
  const probe = el.cloneNode(false) as HTMLElement;
  host.appendChild(probe);

  const best = findMaxFitting(text.length, (n: number) => {
    probe.textContent = text.slice(0, n);
    return measureBlock(probe, writingMode);
  }, maxAllowed);

  host.removeChild(probe);

  if (best === 0 || best >= text.length) return null;

  const first = el.cloneNode(false) as HTMLElement;
  first.textContent = text.slice(0, best);
  const second = el.cloneNode(false) as HTMLElement;
  second.textContent = text.slice(best);
  return [first, second];
}

// ── List splitters ─────────────────────────────────────────────

export function splitListByCount(
  listEl: HTMLElement,
  items: HTMLElement[],
  count: number
): [HTMLElement, HTMLElement] {
  const first  = listEl.cloneNode(false) as HTMLElement;
  const second = listEl.cloneNode(false) as HTMLElement;
  for (let j = 0; j < count; j++)              first.appendChild(items[j]);
  for (let j = count; j < items.length; j++)   second.appendChild(items[j]);
  return [first, second];
}

function findFittingItemCount(
  listEl: HTMLElement,
  items: HTMLElement[],
  maxSize: number,
  writingMode: WritingMode,
  host: HTMLElement
): number {
  const probe = listEl.cloneNode(false) as HTMLElement;
  host.appendChild(probe);

  const best = findMaxFitting(items.length, (n: number) => {
    probe.innerHTML = '';
    for (let j = 0; j < n; j++) probe.appendChild(items[j].cloneNode(true));
    return measureBlock(probe, writingMode);
  }, maxSize);

  host.removeChild(probe);
  return best;
}

function splitListDOM(
  el: HTMLElement,
  maxAllowed: number,
  writingMode: WritingMode,
  host: HTMLElement
): [HTMLElement, HTMLElement] | null {
  const items = Array.from(el.children).filter(c => c.tagName === 'LI') as HTMLElement[];
  if (items.length === 0) return null;

  // Case A — multi-item list, at least one whole item fits
  if (items.length >= 2) {
    const fits = findFittingItemCount(el, items, maxAllowed, writingMode, host);
    if (fits >= 1 && fits < items.length) {
      return splitListByCount(el, items, fits);
    }
    // fits === 0 → fall through to Case B
    // fits === N → caller bug; would have fit in the "fits on current page" check
  }

  // Case B — split items[0] text, carry remaining items into second list
  const li = items[0];
  const innerMargin = getBlockMargin(el, writingMode);
  const parts = splitTextDOM(li, maxAllowed - innerMargin, writingMode, host);
  if (!parts) return null;

  const first  = el.cloneNode(false) as HTMLElement;
  first.appendChild(parts[0]);
  const second = el.cloneNode(false) as HTMLElement;
  second.appendChild(parts[1]);
  for (let j = 1; j < items.length; j++) second.appendChild(items[j]);
  return [first, second];
}

// ── Main pagination ───────────────────────────────────────────

export function paginate(
  manuscript: HTMLElement,
  containerWidth: number,
  containerHeight: number,
  writingMode: WritingMode
): HTMLElement[][] {
  const maxBlockSize = writingMode === 'vertical-rl' ? containerWidth : containerHeight;
  const pages: HTMLElement[][] = [[]];
  let currentBlockUsed = 0;

  let children: HTMLElement[];
  const firstChild = manuscript.firstElementChild as HTMLElement | null;
  if (firstChild && firstChild.tagName === 'ARTICLE') {
    children = Array.from(firstChild.children) as HTMLElement[];
  } else {
    children = Array.from(manuscript.children) as HTMLElement[];
  }

  for (let i = 0; i < children.length; i++) {
    const el = children[i];

    // <hr> = forced page break
    if (el.tagName === 'HR') {
      pages.push([]);
      currentBlockUsed = 0;
      continue;
    }

    // h1, h2 → force new page (unless current page is empty)
    if (forcesBreakBefore(el) && currentBlockUsed > 0) {
      pages.push([]);
      currentBlockUsed = 0;
    }

    // Scale oversized images
    if (el.tagName === 'IMG') {
      scaleImageToFit(el, maxBlockSize, writingMode);
    }

    const blockSize = measureBlock(el, writingMode);

    // Fits on current page
    if (currentBlockUsed + blockSize <= maxBlockSize) {
      pages[pages.length - 1].push(el);
      currentBlockUsed += blockSize;
      continue;
    }

    // Doesn't fit — try splitting
    const maxAllowed = maxBlockSize - currentBlockUsed;
    let parts: [HTMLElement, HTMLElement] | null = null;
    if (isListElement(el)) {
      parts = splitListDOM(el, maxAllowed, writingMode, manuscript);
    } else if (isTextElement(el)) {
      parts = splitTextDOM(el, maxAllowed, writingMode, manuscript);
    }

    if (parts) {
      const [first, second] = parts;
      pages[pages.length - 1].push(first);
      children.splice(i + 1, 0, second);
      manuscript.appendChild(second);   // keep in DOM so further measurements work
      pages.push([]);
      currentBlockUsed = 0;
      continue;
    }

    // Can't split — start a new page, carrying any orphaned headings
    // that still fit alongside `el` on the new page.
    if (currentBlockUsed > 0) {
      const currentPage = pages[pages.length - 1];
      const carried: HTMLElement[] = [];
      let carriedSize = 0;
      while (currentPage.length > 0 && isHeading(currentPage[currentPage.length - 1])) {
        const last = currentPage[currentPage.length - 1];
        const lastSize = measureBlock(last, writingMode);
        if (carriedSize + lastSize + blockSize > maxBlockSize) break;
        carried.unshift(currentPage.pop()!);
        carriedSize += lastSize;
      }
      pages.push([]);
      currentBlockUsed = 0;
      for (const h of carried) {
        pages[pages.length - 1].push(h);
        currentBlockUsed += measureBlock(h, writingMode);
      }
    }
    pages[pages.length - 1].push(el);
    currentBlockUsed += blockSize;
  }

  return pages.filter(p => p.length > 0);
}

// ── Rendering ──────────────────────────────────────────────────

export function renderPages(
  manuscript: HTMLElement,
  pages: HTMLElement[][],
  writingMode: WritingMode
): void {
  manuscript.innerHTML = '';
  manuscript.style.columnWidth = 'unset';
  manuscript.style.columnGap = 'unset';
  manuscript.style.columnFill = 'unset';

  pages.forEach((pageElements, i) => {
    const page = document.createElement('div');
    page.className = 'slide-page';
    page.dataset.page = String(i);

    if (writingMode === 'vertical-rl') {
      page.style.writingMode = 'vertical-rl';
      page.style.textOrientation = 'mixed';
    } else {
      page.style.writingMode = 'horizontal-tb';
    }

    pageElements.forEach((el: HTMLElement) => page.appendChild(el));
    manuscript.appendChild(page);
  });
}

export function showPage(index: number): void {
  const pages = document.querySelectorAll<HTMLElement>('.slide-page');
  pages.forEach((p: HTMLElement, i: number) => {
    p.style.display = i === index ? '' : 'none';
  });
}
