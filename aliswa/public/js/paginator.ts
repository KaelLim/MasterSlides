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

/**
 * `el` (a UL or OL) is already a child of `page` and overflows. Retract LIs
 * from the end until it fits; pack the retracted LIs into a cloned list
 * returned to the caller. If the list is down to a single LI and still
 * overflows, descend into that LI's text via `splitTextInPlace`.
 *
 * Returns the leftover list (or null if the list is fundamentally unsplittable).
 */
function splitListInPlace(
  el: HTMLElement,
  page: HTMLElement
): HTMLElement | null {
  const initialItems = Array.from(el.children).filter(c => c.tagName === 'LI') as HTMLElement[];
  if (initialItems.length === 0) return null;

  // Retract LIs from the end until the list fits or only 1 remains.
  const retracted: HTMLElement[] = [];
  while (overflows(page) && el.children.length > 1) {
    const last = el.lastElementChild as HTMLElement | null;
    if (!last || last.tagName !== 'LI') break;
    el.removeChild(last);
    retracted.unshift(last);
  }

  if (!overflows(page) && retracted.length > 0) {
    const leftover = el.cloneNode(false) as HTMLElement;
    for (const li of retracted) leftover.appendChild(li);
    return leftover;
  }

  // Single LI still overflows. Move any retracted tail out of the picture so
  // they end up after the LI-text split in the leftover list.
  const li = el.firstElementChild as HTMLElement | null;
  if (!li || li.tagName !== 'LI') {
    for (const r of retracted) el.appendChild(r);
    return null;
  }

  const liLeftover = splitTextInPlace(li, page);
  if (!liLeftover) {
    // Put retracted items back so render reflects the real state.
    for (const r of retracted) el.appendChild(r);
    return null;
  }

  const leftover = el.cloneNode(false) as HTMLElement;
  leftover.appendChild(liLeftover);
  for (const r of retracted) leftover.appendChild(r);
  return leftover;
}
