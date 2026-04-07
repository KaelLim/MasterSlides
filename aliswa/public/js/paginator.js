import { prepare, layout, prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

// ── Measurement helpers ─────────────────────────────────────────

function getFont(el) {
  const style = getComputedStyle(el);
  return `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

function getLineHeight(el) {
  const style = getComputedStyle(el);
  const raw = style.lineHeight;
  if (raw === 'normal') return parseFloat(style.fontSize) * 1.2;
  const val = parseFloat(raw);
  return val < 10 ? val * parseFloat(style.fontSize) : val;
}

function getBlockMargin(el, writingMode) {
  const style = getComputedStyle(el);
  if (writingMode === 'vertical-rl') {
    return parseFloat(style.marginLeft || '0') + parseFloat(style.marginRight || '0');
  }
  return parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0');
}

function getInlineSize(containerWidth, containerHeight, writingMode) {
  return writingMode === 'vertical-rl' ? containerHeight : containerWidth;
}

function getPretextOpts(writingMode) {
  return writingMode === 'vertical-rl' ? { writingMode: 'vertical-rl' } : undefined;
}

// ── Text measurement ────────────────────────────────────────────

function getLetterSpacingFactor(el) {
  const style = getComputedStyle(el);
  const ls = parseFloat(style.letterSpacing || '0');
  const fs = parseFloat(style.fontSize);
  // letter-spacing widens each character, reducing effective inline space
  // Approximate: each char is ~1em wide, so ls/fs is the fractional overhead
  return ls > 0 && fs > 0 ? ls / fs : 0;
}

function measureTextBlock(el, containerWidth, containerHeight, writingMode) {
  const text = el.textContent || '';
  if (!text.trim()) return 0;

  const font = getFont(el);
  const lineHeight = getLineHeight(el);
  let maxInline = getInlineSize(containerWidth, containerHeight, writingMode);

  // Reduce effective inline size to account for CSS letter-spacing
  // (pretext doesn't know about letter-spacing, so text wraps earlier in CSS)
  const lsFactor = getLetterSpacingFactor(el);
  if (lsFactor > 0) {
    maxInline = maxInline / (1 + lsFactor);
  }

  const prepared = prepare(text, font, getPretextOpts(writingMode));
  return layout(prepared, maxInline, lineHeight).height;
}

/**
 * Split a text element into two parts at a given line count.
 * Returns [firstHalf, secondHalf] as new DOM elements.
 * Uses pretext layoutWithLines for precise line-level splitting.
 */
function splitTextElement(el, linesForCurrentPage, containerWidth, containerHeight, writingMode) {
  const text = el.textContent || '';
  const font = getFont(el);
  const lineHeight = getLineHeight(el);
  let maxInline = getInlineSize(containerWidth, containerHeight, writingMode);
  const lsFactor = getLetterSpacingFactor(el);
  if (lsFactor > 0) maxInline = maxInline / (1 + lsFactor);

  const prepared = prepareWithSegments(text, font, getPretextOpts(writingMode));
  const { lines } = layoutWithLines(prepared, maxInline, lineHeight);

  if (linesForCurrentPage <= 0 || linesForCurrentPage >= lines.length) return null;

  const firstText = lines.slice(0, linesForCurrentPage).map(l => l.text).join('');
  const secondText = lines.slice(linesForCurrentPage).map(l => l.text).join('');

  if (!firstText.trim() || !secondText.trim()) return null;

  const first = el.cloneNode(false);
  first.textContent = firstText;
  const second = el.cloneNode(false);
  second.textContent = secondText;

  return [first, second];
}

/**
 * Get line count for a text element.
 */
function getLineCount(el, containerWidth, containerHeight, writingMode) {
  const text = el.textContent || '';
  if (!text.trim()) return 0;

  const font = getFont(el);
  const lineHeight = getLineHeight(el);
  let maxInline = getInlineSize(containerWidth, containerHeight, writingMode);
  const lsFactor = getLetterSpacingFactor(el);
  if (lsFactor > 0) maxInline = maxInline / (1 + lsFactor);
  const prepared = prepare(text, font, getPretextOpts(writingMode));
  return layout(prepared, maxInline, lineHeight).lineCount;
}

// ── Image measurement + scaling ─────────────────────────────────

function measureImage(el, writingMode) {
  return writingMode === 'vertical-rl' ? el.offsetWidth : el.offsetHeight;
}

/**
 * Scale an image down if it exceeds the page's block-axis size.
 */
function scaleImageToFit(el, maxBlockSize, writingMode) {
  const blockSize = measureImage(el, writingMode);
  if (blockSize > maxBlockSize && blockSize > 0) {
    const ratio = maxBlockSize / blockSize;
    el.style.maxWidth = writingMode === 'vertical-rl'
      ? `${el.offsetWidth * ratio}px`
      : `${el.offsetWidth * ratio}px`;
    el.style.maxHeight = writingMode === 'vertical-rl'
      ? `${el.offsetHeight * ratio}px`
      : `${Math.floor(maxBlockSize)}px`;
    el.style.objectFit = 'contain';
  }
}

// ── Block measurement ───────────────────────────────────────────

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

  if (tag === 'HR') return 0;

  return (writingMode === 'vertical-rl' ? el.offsetWidth : el.offsetHeight) + margin;
}

function forcesBreakBefore(el) {
  return el.tagName === 'H1' || el.tagName === 'H2';
}

function isTextElement(el) {
  return ['H1', 'H2', 'H3', 'H4', 'P', 'LI', 'BLOCKQUOTE'].includes(el.tagName);
}

// ── Pagination ──────────────────────────────────────────────────

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

    // Scale oversized images to fit page
    if (el.tagName === 'IMG') {
      scaleImageToFit(el, maxBlockSize, writingMode);
    }

    const margin = getBlockMargin(el, writingMode);
    const blockSize = measureBlock(el, containerWidth, containerHeight, writingMode);

    // Fits on current page
    if (currentBlockUsed + blockSize <= maxBlockSize) {
      pages[pages.length - 1].push(el);
      currentBlockUsed += blockSize;
      continue;
    }

    // Doesn't fit — try to split text elements across pages
    if (isTextElement(el) && currentBlockUsed > 0) {
      const lineHeight = getLineHeight(el);
      const remainingSpace = maxBlockSize - currentBlockUsed - margin;
      const linesAvailable = Math.floor(remainingSpace / lineHeight);

      if (linesAvailable >= 2) {
        const totalLines = getLineCount(el, containerWidth, containerHeight, writingMode);
        if (totalLines > linesAvailable) {
          const parts = splitTextElement(el, linesAvailable, containerWidth, containerHeight, writingMode);
          if (parts) {
            const [firstHalf, secondHalf] = parts;
            // Put first half on current page
            pages[pages.length - 1].push(firstHalf);
            // Start new page with second half
            pages.push([secondHalf]);
            const secondSize = measureBlock(secondHalf, containerWidth, containerHeight, writingMode);
            currentBlockUsed = secondSize;
            continue;
          }
        }
      }
    }

    // Can't split or not text — start new page with this element
    if (currentBlockUsed > 0) {
      pages.push([]);
      currentBlockUsed = 0;
    }
    pages[pages.length - 1].push(el);
    currentBlockUsed += blockSize;
  }

  return pages.filter(p => p.length > 0);
}

// ── Rendering ───────────────────────────────────────────────────

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

export function showPage(index) {
  const pages = document.querySelectorAll('.slide-page');
  pages.forEach((p, i) => {
    p.style.display = i === index ? '' : 'none';
  });
}
