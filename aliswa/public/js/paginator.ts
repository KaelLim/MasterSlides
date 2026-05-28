// Natural-overflow paginator. Pages are constructed directly inside the final
// manuscript container; `scrollWidth`/`scrollHeight` is the only overflow signal.
// No hidden wrapper, no precomputed page arrays, no separate render step.

export type WritingMode = 'vertical-rl' | 'horizontal-tb';

// ── Overflow detection ────────────────────────────────────────

// `+1` slack absorbs sub-pixel rounding without misfiring on real overflows.
export function overflows(page: HTMLElement): boolean {
  return (
    page.scrollWidth  > page.clientWidth  + 1 ||
    page.scrollHeight > page.clientHeight + 1
  );
}

// ── In-page split helpers ──────────────────────────────────────

/**
 * Binary-search the largest prefix of `el`'s text that doesn't overflow `page`.
 * `el` must already be a child of `page`. On success, mutates `el.textContent`
 * to the fitting prefix and returns a new element (clone of `el`) holding the
 * remainder. Returns null when no split makes sense (empty / nothing fits /
 * already fits as a whole).
 */
export function splitTextInPlace(
  el: HTMLElement,
  page: HTMLElement
): HTMLElement | null {
  const text = el.textContent ?? '';
  if (text.length < 2) return null;

  // Already fits — caller shouldn't have asked.
  if (!overflows(page)) return null;

  let lo = 1, hi = text.length, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    el.textContent = text.slice(0, mid);
    if (overflows(page)) { hi = mid - 1; } else { best = mid; lo = mid + 1; }
  }

  if (best === 0) {
    el.textContent = text;            // restore; caller decides next step
    return null;
  }

  el.textContent = text.slice(0, best);
  const leftover = el.cloneNode(false) as HTMLElement;
  leftover.textContent = text.slice(best);
  return leftover;
}
