// First-slide reporter list overflow handler.
//
// The first slide composes one <div> per reporter inside
// .first-slide-reporters. In vertical-rl writing mode each child becomes
// its own column going right-to-left, so a long list of reporters
// quickly runs out of horizontal room and spills off the slide.
//
// This module measures the rendered list after pagination, and if the
// child count exceeds a threshold (or the rendered group overflows its
// container), it truncates the visible group to the first N entries +
// a "+M 位" affordance that opens a modal listing every reporter.
//
// applyReporterOverflow() is idempotent: it caches the canonical list on
// the .first-slide-reporters element and re-truncates from the canonical
// list each call (so re-pagination / font-scale changes recompute
// correctly).

import { dom } from './state.js';

const ALL_KEY = '__msAllReporters';
const VISIBLE_COUNT_HARD_CAP = 5; // keep first 5; if > 5 total, last slot becomes "+ N 位"

interface ReportersHostEl extends HTMLElement {
  [ALL_KEY]?: string[];
}

export function applyReporterOverflow(): void {
  const host = dom.manuscript.querySelector<ReportersHostEl>('.first-slide-reporters');
  if (!host) return;

  // First call: snapshot the canonical reporter list off the DOM children.
  if (!host[ALL_KEY]) {
    const initial: string[] = [];
    for (const child of Array.from(host.children) as HTMLElement[]) {
      const txt = (child.textContent ?? '').trim();
      if (txt) initial.push(txt);
    }
    host[ALL_KEY] = initial;
  }
  const all = host[ALL_KEY];
  if (!all || all.length === 0) {
    host.innerHTML = '';
    return;
  }

  // Decide how many to show inline.
  const total = all.length;
  const fits = total <= VISIBLE_COUNT_HARD_CAP;
  const visible = fits ? total : VISIBLE_COUNT_HARD_CAP - 1; // reserve last slot for "+N 位"

  // Re-render: replace children with the truncated set + optional more-button.
  host.innerHTML = '';
  for (let i = 0; i < visible; i++) {
    const div = document.createElement('div');
    div.textContent = all[i] ?? '';
    host.appendChild(div);
  }
  if (!fits) {
    const remaining = total - visible;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'first-slide-reporters-more';
    btn.textContent = `+${remaining} 位`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showReportersModal(all);
    });
    host.appendChild(btn);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Modal
// ──────────────────────────────────────────────────────────────────────

let activeModal: HTMLElement | null = null;
let activeEscHandler: ((e: KeyboardEvent) => void) | null = null;

function showReportersModal(all: string[]): void {
  closeReportersModal();

  const scrim = document.createElement('div');
  scrim.className = 'first-slide-reporters-modal';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');

  const card = document.createElement('div');
  card.className = 'first-slide-reporters-card';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'first-slide-reporters-close';
  close.setAttribute('aria-label', '關閉');
  close.textContent = '×';
  close.addEventListener('click', closeReportersModal);

  const heading = document.createElement('h2');
  heading.className = 'first-slide-reporters-heading';
  heading.textContent = `所有報告人（共 ${all.length} 位）`;

  const list = document.createElement('ol');
  list.className = 'first-slide-reporters-list';
  for (const name of all) {
    const li = document.createElement('li');
    li.textContent = name;
    list.appendChild(li);
  }

  card.appendChild(close);
  card.appendChild(heading);
  card.appendChild(list);
  scrim.appendChild(card);
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) closeReportersModal();
  });

  document.body.appendChild(scrim);
  activeModal = scrim;
  activeEscHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') closeReportersModal();
  };
  document.addEventListener('keydown', activeEscHandler);
}

function closeReportersModal(): void {
  if (activeEscHandler) {
    document.removeEventListener('keydown', activeEscHandler);
    activeEscHandler = null;
  }
  if (activeModal) {
    activeModal.remove();
    activeModal = null;
  }
}
