// Natural-overflow paginator. Pages are constructed directly inside the final
// manuscript container; `scrollWidth`/`scrollHeight` is the only overflow signal.
// No hidden wrapper, no precomputed page arrays, no separate render step.

export type WritingMode = 'vertical-rl' | 'horizontal-tb';

// ── Overflow detection ────────────────────────────────────────

// `+1` slack absorbs sub-pixel rounding without misfiring on real overflows.
//
// scrollWidth/scrollHeight are unreliable in writing-mode: vertical-rl —
// leftward (block-end) overflow is treated as "negative scroll" by Chrome
// and Safari and doesn't fold into page.scrollWidth. A child <p> whose
// block size is auto-sized to its own content can be physically wider than
// the page yet still report scrollWidth === clientWidth on itself, because
// from the child's own perspective nothing internally overflows.
//
// The robust signal is the physical bounding rect — getBoundingClientRect()
// reports pixel coordinates in viewport space regardless of writing-mode. If
// any child's box edges extend past the page's box edges, that's overflow.
export function overflows(page: HTMLElement): boolean {
  if (page.scrollWidth  > page.clientWidth  + 1) return true;
  if (page.scrollHeight > page.clientHeight + 1) return true;
  const pr = page.getBoundingClientRect();
  for (const child of Array.from(page.children) as HTMLElement[]) {
    const cr = child.getBoundingClientRect();
    if (cr.left   < pr.left   - 1) return true;
    if (cr.right  > pr.right  + 1) return true;
    if (cr.top    < pr.top    - 1) return true;
    if (cr.bottom > pr.bottom + 1) return true;
    // Also catch the case where the child fits the page bounds but its
    // own content overflows it (clipped by inner overflow:hidden, etc.).
    if (child.scrollWidth  > child.clientWidth  + 1) return true;
    if (child.scrollHeight > child.clientHeight + 1) return true;
  }
  return false;
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
  // Already fits — caller shouldn't have asked.
  if (!overflows(page)) return null;

  // Mixed content (<br>, <img>, <strong>, <em>, ...): the textContent-based
  // binary search below would collapse the subtree into one text node and
  // destroy those children — including embedded images. Fall back to
  // node-boundary split instead, which preserves every child but at coarser
  // granularity (whole text/element nodes, not character positions).
  for (const node of el.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      return splitByNodeBoundary(el, page);
    }
  }

  const text = el.textContent ?? '';
  if (text.length < 2) return null;

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
 * `el` overflows `page` and has element children (text + <br> + <img> + ...).
 * Pull trailing childNodes off the end one at a time until `el` fits, pack the
 * removed nodes (in original order) into a leftover clone of `el` and return
 * it. Granularity is per-node, so a single very long text node alongside an
 * embedded image will yield {<p>image</p>, <p>longText</p>} (or vice versa)
 * — never a half-text-half-element ghost.
 *
 * Returns null when no progress is possible (single child that still overflows,
 * or the leftover ends up empty).
 */
function splitByNodeBoundary(el: HTMLElement, page: HTMLElement): HTMLElement | null {
  if (el.childNodes.length < 2) return null;

  const removed: Node[] = [];
  while (overflows(page) && el.childNodes.length > 1) {
    const last = el.lastChild!;
    el.removeChild(last);
    removed.unshift(last);
  }

  if (overflows(page) || removed.length === 0) {
    // Couldn't make it fit even down to a single child, or nothing was
    // pulled (already fit somehow — overflows() flapped). Restore and bail.
    for (const n of removed) el.appendChild(n);
    return null;
  }

  const leftover = el.cloneNode(false) as HTMLElement;
  for (const n of removed) leftover.appendChild(n);
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

// H1 / H2 page-claiming behavior is inlined in the main loop now (H1 is
// skipped outright; H2 is given its own page via break-before + break-after).
// No predicate needed here.

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
  // Defense-in-depth: clear any leftover inline transform from the legacy
  // scroll-model path. navigation.js's goToPage applies translateY/X to
  // dom.manuscript when no slide-pages exist yet; search.js and goto.js still
  // route through it. (The old loadSettings → setFontScale refresh race that
  // first motivated this guard is gone — loadSettings no longer paginates.)
  // Left in place so a stray transform can never persist and push the entire
  // slide-page model off-screen.
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

    // H1 is the doc's outermost title — its visual is already on the
    // synthesized first-slide, and the body H1 is CSS-hidden. Skip it
    // outright so it doesn't claim an otherwise-empty page index.
    if (el.tagName === 'H1') continue;

    if (el.tagName === 'HR') {
      // Guard against back-to-back breaks (e.g. H2's break-after followed by
      // an HR): only emit a fresh page when there's something to leave.
      if (current.children.length > 0) {
        current = createSlidePage(manuscript, writingMode);
      }
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

    // H2 = section divider: claims its own slide-page entirely (break
    // before AND after), so any content that follows starts on a fresh
    // page. Together with the `.slide-page:has(> h2:only-child)` CSS rule
    // this centers the H2 in the middle of its standalone page.
    if (el.tagName === 'H2') {
      if (current.children.length > 0) {
        current = createSlidePage(manuscript, writingMode);
      }
      current.appendChild(el);
      pendingBreakAfter = true;
      continue;
    }

    // H3 = sub-section header: break BEFORE only. The content following
    // (paragraphs, lists, etc.) stays on the same page as the H3, so the
    // heading travels with what it labels — unlike H2 which is a divider.
    if (el.tagName === 'H3' && current.children.length > 0) {
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

/**
 * Show the slide page at `index` and hide the rest. Operates on the
 * `.slide-page` children of `#manuscript` in document order; no-op when
 * `index` is out of range (every page is hidden).
 */
export function showPage(index: number): void {
  const pages = document.querySelectorAll<HTMLElement>('#manuscript > .slide-page');
  pages.forEach((p, i) => {
    p.style.display = i === index ? '' : 'none';
  });
}
