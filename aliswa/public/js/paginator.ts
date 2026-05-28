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
