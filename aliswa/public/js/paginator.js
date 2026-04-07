import { prepare, layout } from '@chenglou/pretext';

/**
 * Measure the block-axis size of a text element using pretext.
 */
function measureTextBlock(el, containerWidth, containerHeight, writingMode) {
  const style = getComputedStyle(el);
  const fontSize = style.fontSize;
  const fontWeight = style.fontWeight;
  const fontFamily = style.fontFamily;
  const font = `${fontWeight} ${fontSize} ${fontFamily}`;

  const lineHeightRaw = style.lineHeight;
  let lineHeight;
  if (lineHeightRaw === 'normal') {
    lineHeight = parseFloat(fontSize) * 1.2;
  } else {
    lineHeight = parseFloat(lineHeightRaw);
    if (lineHeight < 10) {
      lineHeight = lineHeight * parseFloat(fontSize);
    }
  }

  const text = el.textContent || '';
  if (!text.trim()) return 0;

  const pretextMode = writingMode === 'vertical-rl' ? 'vertical-rl' : undefined;
  const prepared = prepare(text, font, pretextMode ? { writingMode: pretextMode } : undefined);

  const maxInline = writingMode === 'vertical-rl' ? containerHeight : containerWidth;
  const result = layout(prepared, maxInline, lineHeight);

  return result.height;
}

/**
 * Measure the block-axis size of an image element.
 */
function measureImage(el, writingMode) {
  return writingMode === 'vertical-rl' ? el.offsetWidth : el.offsetHeight;
}

/**
 * Get the block-axis margin of an element.
 */
function getBlockMargin(el, writingMode) {
  const style = getComputedStyle(el);
  if (writingMode === 'vertical-rl') {
    return parseFloat(style.marginLeft || '0') + parseFloat(style.marginRight || '0');
  }
  return parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0');
}

/**
 * Measure one block element's total block-axis size (content + margin).
 */
function measureBlock(el, containerWidth, containerHeight, writingMode) {
  const tag = el.tagName;
  const margin = getBlockMargin(el, writingMode);

  if (['H1', 'H2', 'H3', 'H4', 'P', 'LI', 'BLOCKQUOTE'].includes(tag)) {
    return measureTextBlock(el, containerWidth, containerHeight, writingMode) + margin;
  }

  if (tag === 'IMG') {
    return measureImage(el, writingMode) + margin;
  }

  if (tag === 'UL' || tag === 'OL') {
    let total = getBlockMargin(el, writingMode);
    for (const li of el.children) {
      total += measureBlock(li, containerWidth, containerHeight, writingMode);
    }
    return total;
  }

  if (tag === 'ARTICLE' || tag === 'DIV' || tag === 'SECTION') {
    let total = getBlockMargin(el, writingMode);
    for (const child of el.children) {
      total += measureBlock(child, containerWidth, containerHeight, writingMode);
    }
    return total;
  }

  if (tag === 'HR') {
    return 0;
  }

  return (writingMode === 'vertical-rl' ? el.offsetWidth : el.offsetHeight) + margin;
}

/**
 * Check if an element forces a page break before it.
 */
function forcesBreakBefore(el) {
  const tag = el.tagName;
  return tag === 'H1' || tag === 'H2';
}

/**
 * Paginate manuscript children into page groups.
 */
export function paginate(manuscript, containerWidth, containerHeight, writingMode) {
  const maxBlockSize = writingMode === 'vertical-rl' ? containerWidth : containerHeight;
  const pages = [[]];
  let currentBlockUsed = 0;

  let children;
  const firstChild = manuscript.firstElementChild;
  if (firstChild && firstChild.tagName === 'ARTICLE') {
    children = Array.from(firstChild.children);
  } else {
    children = Array.from(manuscript.children);
  }

  for (const el of children) {
    if (el.tagName === 'HR') {
      pages.push([]);
      currentBlockUsed = 0;
      continue;
    }

    if (forcesBreakBefore(el) && currentBlockUsed > 0) {
      pages.push([]);
      currentBlockUsed = 0;
    }

    const blockSize = measureBlock(el, containerWidth, containerHeight, writingMode);

    if (currentBlockUsed + blockSize > maxBlockSize && currentBlockUsed > 0) {
      pages.push([]);
      currentBlockUsed = 0;
    }

    pages[pages.length - 1].push(el);
    currentBlockUsed += blockSize;
  }

  return pages.filter(p => p.length > 0);
}

/**
 * Render paginated content into .manuscript as .slide-page divs.
 */
export function renderPages(manuscript, pages, writingMode) {
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

    pageElements.forEach(el => page.appendChild(el));
    manuscript.appendChild(page);
  });
}

/**
 * Show a specific page and hide all others.
 */
export function showPage(index) {
  const pages = document.querySelectorAll('.slide-page');
  pages.forEach((p, i) => {
    p.style.display = i === index ? '' : 'none';
  });
}
