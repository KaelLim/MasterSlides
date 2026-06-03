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

// ── Element classification ─────────────────────────────────────

function forcesBreakBefore(el: HTMLElement): boolean {
  return el.tagName === 'H1' || el.tagName === 'H2';
}

// Iframe embeds (YouTube / Google Drive) — emitted by convert.ts as
// `<div class="video-embed">…<iframe>…</iframe>…</div>`. Treated as a
// page-claiming block: break before, fill the page, break after.
function isVideoEmbed(el: HTMLElement): boolean {
  return el.tagName === 'DIV' && el.classList.contains('video-embed');
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

// ── Image scaling ──────────────────────────────────────────────

/**
 * Cap an oversized image to the page's block dimension so it doesn't single-
 * handedly overflow. Called BEFORE the image is appended to the page so the
 * cap is in place by the time the browser lays out.
 */
function scaleImageToFit(
  el: HTMLElement,
  page: HTMLElement,
  writingMode: WritingMode
): void {
  const maxBlock = writingMode === 'vertical-rl' ? page.clientWidth : page.clientHeight;
  const naturalBlock = writingMode === 'vertical-rl' ? el.offsetWidth : el.offsetHeight;
  if (naturalBlock > maxBlock && naturalBlock > 0) {
    const ratio = maxBlock / naturalBlock;
    el.style.maxWidth = `${el.offsetWidth * ratio}px`;
    el.style.maxHeight = `${el.offsetHeight * ratio}px`;
    el.style.objectFit = 'contain';
  }
}

// ── Page lifecycle ─────────────────────────────────────────────

function createSlidePage(manuscript: HTMLElement, writingMode: WritingMode): HTMLElement {
  const page = document.createElement('div');
  page.className = 'slide-page';
  page.dataset.page = String(manuscript.querySelectorAll(':scope > .slide-page').length);
  if (writingMode === 'vertical-rl') {
    page.style.writingMode = 'vertical-rl';
    page.style.textOrientation = 'mixed';
  } else {
    page.style.writingMode = 'horizontal-tb';
  }
  manuscript.appendChild(page);
  return page;
}

// ── Main pagination ───────────────────────────────────────────

/**
 * Lay out `article`'s children into one or more `.slide-page` divs inside
 * `manuscript`. Pages are appended live; the returned array is in
 * page-index order.
 */
export function paginate(
  article: HTMLElement,
  manuscript: HTMLElement,
  writingMode: WritingMode
): HTMLElement[] {
  // Snapshot the children up front so we can mutate the queue (push leftovers).
  // Detach them from `article` so the original parent isn't accidentally
  // measured. After paginate, `article` is empty; `manuscript` holds the pages.
  const queue: HTMLElement[] = Array.from(article.children) as HTMLElement[];
  for (const el of queue) article.removeChild(el);

  manuscript.innerHTML = '';
  // Clear any leftover inline transform from the shared scroll-model code path
  // (js/slides/navigation.js's goToPage applies translateY/X to dom.manuscript
  // when no slide-pages exist yet, e.g. when loadSettings → setFontScale fires
  // its setTimeout during a refresh, before paginate has run). That transform
  // would otherwise persist and push the entire slide-page model off-screen.
  manuscript.style.transform = '';
  let current = createSlidePage(manuscript, writingMode);
  // When set, the *next* element starts on a fresh page. Avoids dangling
  // empty pages when the page-claiming element is the very last in the
  // queue (e.g. a video at the end of the document).
  let pendingBreakAfter = false;

  while (queue.length > 0) {
    const el = queue.shift()!;

    if (pendingBreakAfter) {
      current = createSlidePage(manuscript, writingMode);
      pendingBreakAfter = false;
    }

    if (el.tagName === 'HR') {
      current = createSlidePage(manuscript, writingMode);
      continue;
    }

    if (isVideoEmbed(el)) {
      // Break before if current page already has content.
      if (current.children.length > 0) {
        current = createSlidePage(manuscript, writingMode);
      }
      // Override writing-mode to horizontal regardless of viewer setting —
      // iframe content must not be rotated. Page-level CSS (.video-page)
      // then flex-centers the embed.
      current.classList.add('video-page');
      current.style.writingMode = 'horizontal-tb';
      current.style.textOrientation = '';
      current.appendChild(el);
      pendingBreakAfter = true;
      continue;
    }

    if (forcesBreakBefore(el) && current.children.length > 0) {
      current = createSlidePage(manuscript, writingMode);
    }

    if (el.tagName === 'IMG') {
      // Temporarily attach so we can read natural offset dimensions for cap math.
      current.appendChild(el);
      scaleImageToFit(el, current, writingMode);
      // Leave it in place; the overflow check below decides whether to keep it.
    } else {
      current.appendChild(el);
    }

    if (!overflows(current)) continue;

    // Strategy 1: if `el` is splittable AND current has prior content
    // (e.g. a heading + earlier siblings), try splitting in place so the
    // first chunk stays attached to that prior content. This is the
    // common case for a list/paragraph that follows a heading: without
    // this fast path, the heading gets orphaned on its own page while
    // the entire list moves to a fresh page.
    if ((isListElement(el) || isTextElement(el)) && current.children.length > 1) {
      let leftover: HTMLElement | null = null;
      if (isListElement(el)) {
        leftover = splitListInPlace(el, current);
      } else {
        leftover = splitTextInPlace(el, current);
      }
      if (leftover) {
        queue.unshift(leftover);
        continue;
      }
      // Split couldn't produce a fitting first chunk (el unsplittable or
      // the minimum unit is still too big alongside current's content).
      // Fall through to Strategy 2.
    }

    // Strategy 2: retract `el` and allocate a fresh page. Carry trailing
    // headings backward so they travel with their content.
    current.removeChild(el);

    if (current.children.length > 0) {
      const fresh = createSlidePage(manuscript, writingMode);

      // Move el onto fresh first so size-checks include it.
      fresh.appendChild(el);

      // Walk backwards through `current`'s trailing headings.
      while (current.lastElementChild && isHeading(current.lastElementChild as HTMLElement)) {
        const heading = current.lastElementChild as HTMLElement;
        current.removeChild(heading);
        fresh.insertBefore(heading, fresh.firstChild);
        if (overflows(fresh)) {
          // Heading + el together overflows the fresh page → revert this one heading.
          fresh.removeChild(heading);
          current.appendChild(heading);
          break;
        }
      }

      current = fresh;

      if (!overflows(current)) continue;
      // Even on a fresh page (possibly with carried headings) `el` overflows → must split.
    } else {
      // current was empty; el alone overflows.
      current.appendChild(el);
    }

    // Final fallback: split `el` on the fresh page (alone, or with carried headings).
    let leftover: HTMLElement | null = null;
    if (isListElement(el)) {
      leftover = splitListInPlace(el, current);
    } else if (isTextElement(el)) {
      leftover = splitTextInPlace(el, current);
    }

    if (leftover) {
      // Process leftover next (pushes back to the front of the queue).
      queue.unshift(leftover);
    }
    // If split returned null (unsplittable, e.g. image alone too big after scale),
    // leave `el` in place and accept the overflow.
  }

  // showPage default: show first, hide rest.
  const pages = Array.from(manuscript.querySelectorAll<HTMLElement>(':scope > .slide-page'));
  pages.forEach((p, i) => { p.style.display = i === 0 ? '' : 'none'; });
  return pages;
}

// ── Page navigation ───────────────────────────────────────────

export function showPage(index: number): void {
  const pages = document.querySelectorAll<HTMLElement>('#manuscript > .slide-page');
  pages.forEach((p, i) => {
    p.style.display = i === index ? '' : 'none';
  });
}
