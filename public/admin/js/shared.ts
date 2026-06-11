// Shared atoms and the toast system, ported from the design prototype's
// shared.jsx. No framework — components are functions returning DOM
// elements, and the toast system is a singleton factory that lazily mounts
// a <div class="toast-stack"> on the first call.

import { h } from './h.js';
import { Icon } from './icons.js';
import type { MenuItem, PubState, ToastHandle, ToastOpts, ToastTone } from './types.js';

/* ============================================================
   Time helpers (Traditional Chinese relative time)
   ============================================================ */

export function relTime(ts: number): string {
  const now = Date.now();
  const diff = Math.floor((now - ts) / 1000);
  if (diff < 60) return '剛剛';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
  if (diff < 86400 * 2) return '昨天';
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function fullDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ============================================================
   Highlight — returns mixed Text/<mark> nodes for a search match
   ============================================================ */

export function Highlight(text: string, q: string): Node[] {
  if (!q) return [document.createTextNode(text)];
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return [document.createTextNode(text)];
  const before = text.slice(0, i);
  const match = text.slice(i, i + q.length);
  const after = text.slice(i + q.length);
  const out: Node[] = [];
  if (before) out.push(document.createTextNode(before));
  const mark = document.createElement('mark');
  mark.textContent = match;
  out.push(mark);
  if (after) out.push(document.createTextNode(after));
  return out;
}

/* ============================================================
   StateBadge — public/draft pill, optionally a button
   ============================================================ */

export interface StateBadgeOpts {
  state: PubState;
  as?: 'span' | 'button';
  onClick?: () => void;
}

export function StateBadge(opts: StateBadgeOpts): HTMLElement {
  const pub = opts.state === 'public';
  const cls = `badge ${pub ? 'pub' : 'draft'}`;
  const label = pub ? '公開' : '草稿';
  const dot = h('span', { class: 'dot' });
  if (opts.as === 'button') {
    return h(
      'button',
      {
        class: cls,
        title: '切換發佈狀態',
        onClick: (e: MouseEvent) => {
          e.stopPropagation();
          opts.onClick?.();
        },
      },
      dot,
      label,
    );
  }
  return h('span', { class: cls }, dot, label);
}

/* ============================================================
   Checkbox — supports indeterminate state, stops click propagation
   ============================================================ */

export interface CheckboxOpts {
  checked?: boolean;
  indeterminate?: boolean;
  onChange: (e: Event) => void;
  label?: string;
}

export function Checkbox(opts: CheckboxOpts): HTMLInputElement {
  const input = h('input', {
    type: 'checkbox',
    class: `cb ${opts.indeterminate ? 'indeterminate' : ''}`,
    onChange: opts.onChange,
    onClick: (e: MouseEvent) => e.stopPropagation(),
  }) as HTMLInputElement;
  // type/role aren't property-assigned by h(), so the createElement default
  // 'checkbox' from the type attribute applies. Set checked/indeterminate
  // as live properties so they reflect immediately.
  input.checked = !!opts.checked;
  input.indeterminate = !!opts.indeterminate;
  if (opts.label !== undefined) input.setAttribute('aria-label', opts.label);
  return input;
}

/* ============================================================
   Menu — popover positioned near an anchor; auto-flips above
   ============================================================ */

export interface MenuOpts {
  anchor: HTMLElement;
  onClose: () => void;
  items: MenuItem[];
}

export function Menu(opts: MenuOpts): HTMLElement {
  const { anchor, onClose, items } = opts;

  const root = h('div', {
    class: 'menu',
    role: 'menu',
    style: { left: '-9999px', top: '-9999px', position: 'fixed' },
  });

  // Single close path: tear down global listeners, remove from DOM, then
  // invoke the caller's onClose.
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('keydown', onKeyDown);
    if (root.parentNode) root.parentNode.removeChild(root);
    onClose();
  };

  for (const it of items) {
    if (it.sep) {
      root.appendChild(h('div', { class: 'mi-sep' }));
      continue;
    }
    const children: Node[] = [];
    if (it.icon) {
      children.push(h('span', { class: 'mi-ic' }, Icon(it.icon, { size: 16 })));
    }
    if (it.label !== undefined) {
      children.push(document.createTextNode(it.label));
    }
    if (it.kbd) {
      children.push(h('span', { class: 'mi-kbd' }, it.kbd));
    }
    const handler = it.onClick;
    const btn = h(
      'button',
      {
        class: `mi ${it.danger ? 'danger' : ''}`,
        role: 'menuitem',
        onClick: () => {
          close();
          handler?.();
        },
      },
      ...children,
    );
    root.appendChild(btn);
  }

  // Append to body so we can measure size before final position.
  document.body.appendChild(root);

  // Position after layout — measure menu, anchor against viewport bounds.
  const r = anchor.getBoundingClientRect();
  const m = root.getBoundingClientRect();
  let left = r.right - m.width;
  let top = r.bottom + 6;
  if (top + m.height > window.innerHeight - 8) top = r.top - m.height - 6;
  if (left < 8) left = 8;
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;

  // Outside-click + Escape dismissal.
  const onMouseDown = (e: MouseEvent): void => {
    if (!root.contains(e.target as Node)) close();
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  // Attach in next microtask so the originating click that opened this
  // menu doesn't immediately dismiss it.
  queueMicrotask(() => {
    if (closed) return;
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
  });

  return root;
}

/* ============================================================
   Toast system — singleton, lazy stack mount
   ============================================================ */

interface LiveToast {
  id: number;
  el: HTMLElement;
  opts: ToastOpts;
  ttlTimer: number | null;
  leaving: boolean;
}

interface ToastSystem {
  notify(opts: ToastOpts): ToastHandle;
}

function createToastSystem(): ToastSystem {
  let stack: HTMLElement | null = null;
  let nextId = 0;
  const live = new Map<number, LiveToast>();

  function ensureStack(): HTMLElement {
    if (stack && stack.isConnected) return stack;
    stack = h('div', { class: 'toast-stack' });
    document.body.appendChild(stack);
    return stack;
  }

  function buildToast(t: LiveToast): HTMLElement {
    const tone: ToastTone = t.opts.tone ?? 'info';
    const iconName: Record<ToastTone, string> = {
      success: 'checkCircle',
      error: 'xCircle',
      caution: 'alert',
      info: 'info',
    };

    const bodyChildren: Node[] = [];
    if (t.opts.title) bodyChildren.push(h('div', { class: 'tt-title' }, t.opts.title));
    if (t.opts.msg) bodyChildren.push(h('div', { class: 'tt-msg' }, t.opts.msg));
    if (typeof t.opts.progress === 'number') {
      const bar = h('i', {
        style: { width: `${Math.round(t.opts.progress * 100)}%` },
      });
      bodyChildren.push(
        h('div', { class: 'tt-prog' }, h('div', { class: 'toast-bar' }, bar)),
      );
    }
    if (t.opts.retry) {
      const retryFn = t.opts.retry;
      bodyChildren.push(
        h(
          'div',
          { class: 'tt-actions' },
          h(
            'button',
            {
              class: 'tt-retry',
              onClick: () => {
                retryFn();
                closeId(t.id);
              },
            },
            '重試',
          ),
        ),
      );
    }

    const cls = `toast ${tone}${t.leaving ? ' leaving' : ''}`;
    const children: Node[] = [
      h('span', { class: 'tt-ic' }, Icon(iconName[tone], { size: 20 })),
      h('div', { class: 'tt-body' }, ...bodyChildren),
    ];
    if (!t.opts.noClose) {
      children.push(
        h(
          'button',
          {
            class: 'iconbtn tt-close',
            'aria-label': '關閉',
            onClick: () => closeId(t.id),
          },
          Icon('x', { size: 16 }),
        ),
      );
    }
    return h('div', { class: cls, role: 'status' }, ...children);
  }

  function rerenderToast(t: LiveToast): void {
    const next = buildToast(t);
    if (t.el.parentNode) {
      t.el.parentNode.replaceChild(next, t.el);
    }
    t.el = next;
  }

  function closeId(id: number): void {
    const t = live.get(id);
    if (!t || t.leaving) return;
    t.leaving = true;
    if (t.ttlTimer != null) {
      clearTimeout(t.ttlTimer);
      t.ttlTimer = null;
    }
    rerenderToast(t);
    window.setTimeout(() => {
      if (t.el.parentNode) t.el.parentNode.removeChild(t.el);
      live.delete(id);
    }, 180);
  }

  function notify(opts: ToastOpts): ToastHandle {
    const id = ++nextId;
    const merged: ToastOpts = { tone: 'info', ttl: 4200, ...opts };
    const t: LiveToast = {
      id,
      el: document.createElement('div'),
      opts: merged,
      ttlTimer: null,
      leaving: false,
    };
    t.el = buildToast(t);
    live.set(id, t);
    ensureStack().appendChild(t.el);

    if (merged.ttl && merged.ttl > 0) {
      t.ttlTimer = window.setTimeout(() => closeId(id), merged.ttl);
    }

    return {
      id,
      update: (patch: Partial<ToastOpts>): void => {
        const cur = live.get(id);
        if (!cur || cur.leaving) return;
        cur.opts = { ...cur.opts, ...patch };
        rerenderToast(cur);
      },
      close: (): void => closeId(id),
    };
  }

  return { notify };
}

export const toast: ToastSystem = createToastSystem();
