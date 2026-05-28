import { prepare, layout, prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

// ── DOM-based measurement (100% accurate) ───────────────────────

function getBlockSize(el, writingMode) {
  return writingMode === 'vertical-rl' ? el.offsetWidth : el.offsetHeight;
}

function getBlockMargin(el, writingMode) {
  const style = getComputedStyle(el);
  if (writingMode === 'vertical-rl') {
    return parseFloat(style.marginLeft || '0') + parseFloat(style.marginRight || '0');
  }
  return parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0');
}

function measureBlock(el, writingMode) {
  return getBlockSize(el, writingMode) + getBlockMargin(el, writingMode);
}

// ── Pretext-based text splitting (for cross-page paragraph breaks) ──

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

function getEffectiveInlineSize(el, containerWidth, containerHeight, writingMode) {
  const style = getComputedStyle(el);
  const ls = parseFloat(style.letterSpacing || '0');
  const fs = parseFloat(style.fontSize);
  let maxInline = writingMode === 'vertical-rl' ? containerHeight : containerWidth;
  // Compensate for letter-spacing (pretext doesn't account for it)
  if (ls > 0 && fs > 0) maxInline = maxInline / (1 + ls / fs);
  return maxInline;
}

function getPretextOpts(writingMode) {
  return writingMode === 'vertical-rl' ? { writingMode: 'vertical-rl' } : undefined;
}

/**
 * Split a text element into two parts at a line boundary.
 * Returns [firstHalf, secondHalf] or null if can't split.
 */
function splitTextElement(el, linesForCurrentPage, containerWidth, containerHeight, writingMode) {
  const text = el.textContent || '';
  if (!text.trim()) return null;

  const font = getFont(el);
  const lineHeight = getLineHeight(el);
  const maxInline = getEffectiveInlineSize(el, containerWidth, containerHeight, writingMode);

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
 * Estimate how many lines fit in remaining space using pretext.
 */
function estimateLinesFitting(el, remainingSpace, containerWidth, containerHeight, writingMode) {
  const lineHeight = getLineHeight(el);
  const linesAvailable = Math.floor(remainingSpace / lineHeight);
  if (linesAvailable < 2) return 0;

  const text = el.textContent || '';
  if (!text.trim()) return 0;

  const font = getFont(el);
  const maxInline = getEffectiveInlineSize(el, containerWidth, containerHeight, writingMode);
  const prepared = prepare(text, font, getPretextOpts(writingMode));
  const totalLines = layout(prepared, maxInline, lineHeight).lineCount;

  return totalLines > linesAvailable ? linesAvailable : 0;
}

// ── Image scaling ───────────────────────────────────────────────

function scaleImageToFit(el, maxBlockSize, writingMode) {
  const blockSize = getBlockSize(el, writingMode);
  if (blockSize > maxBlockSize && blockSize > 0) {
    const ratio = maxBlockSize / blockSize;
    el.style.maxWidth = `${el.offsetWidth * ratio}px`;
    el.style.maxHeight = `${el.offsetHeight * ratio}px`;
    el.style.objectFit = 'contain';
  }
}

// ── Pagination ──────────────────────────────────────────────────

function forcesBreakBefore(el) {
  return el.tagName === 'H1' || el.tagName === 'H2';
}

function isTextElement(el) {
  return ['H1', 'H2', 'H3', 'H4', 'P', 'LI', 'BLOCKQUOTE'].includes(el.tagName);
}

function isHeading(el) {
  return ['H1', 'H2', 'H3', 'H4'].includes(el.tagName);
}

/**
 * Paginate manuscript children into page groups.
 * Uses DOM measurement for block sizes (100% accurate).
 * Uses pretext only for splitting text blocks across pages.
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

    // Doesn't fit — try to split text elements across pages
    if (isTextElement(el)) {
      // Step 1: if current page has room for >= 2 lines, split here and
      // carry the rest to the next page.
      if (currentBlockUsed > 0) {
        const remainingSpace = maxBlockSize - currentBlockUsed - getBlockMargin(el, writingMode);
        const linesAvailable = estimateLinesFitting(el, remainingSpace, containerWidth, containerHeight, writingMode);

        if (linesAvailable >= 2) {
          const parts = splitTextElement(el, linesAvailable, containerWidth, containerHeight, writingMode);
          if (parts) {
            const [firstHalf, secondHalf] = parts;
            pages[pages.length - 1].push(firstHalf);
            children.splice(i + 1, 0, secondHalf);
            manuscript.appendChild(secondHalf);
            pages.push([]);
            currentBlockUsed = 0;
            continue;
          }
        }
      }

      // Step 2: the element alone exceeds a whole page (`blockSize > maxBlockSize`).
      // Break to a new page first (carrying any orphaned headings), then chop the
      // element to one page's worth of lines and re-queue the remainder. The
      // remainder will re-enter this loop and may need another chop.
      if (blockSize > maxBlockSize) {
        if (currentBlockUsed > 0) {
          const currentPage = pages[pages.length - 1];
          const carried = [];
          while (currentPage.length > 0 && isHeading(currentPage[currentPage.length - 1])) {
            carried.unshift(currentPage.pop());
          }
          pages.push([]);
          currentBlockUsed = 0;
          for (const h of carried) {
            pages[pages.length - 1].push(h);
            currentBlockUsed += measureBlock(h, writingMode);
          }
        }

        const linesPerFullPage = Math.floor(
          (maxBlockSize - currentBlockUsed - getBlockMargin(el, writingMode)) / getLineHeight(el)
        );
        if (linesPerFullPage >= 1) {
          const parts = splitTextElement(el, linesPerFullPage, containerWidth, containerHeight, writingMode);
          if (parts) {
            const [firstHalf, secondHalf] = parts;
            pages[pages.length - 1].push(firstHalf);
            children.splice(i + 1, 0, secondHalf);
            manuscript.appendChild(secondHalf);
            pages.push([]);
            currentBlockUsed = 0;
            continue;
          }
        }
      }
    }

    // Can't split — start new page.
    // Keep-with-next: pop trailing headings off the current page so they
    // travel with the next content instead of being orphaned (e.g. an
    // <h3> followed by a <ul> that doesn't fit shouldn't strand the h3).
    if (currentBlockUsed > 0) {
      const currentPage = pages[pages.length - 1];
      const carriedHeadings = [];
      while (currentPage.length > 0 && isHeading(currentPage[currentPage.length - 1])) {
        carriedHeadings.unshift(currentPage.pop());
      }

      pages.push([]);
      currentBlockUsed = 0;

      for (const h of carriedHeadings) {
        pages[pages.length - 1].push(h);
        currentBlockUsed += measureBlock(h, writingMode);
      }
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
