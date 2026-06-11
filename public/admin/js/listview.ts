// ListView — generic selectable, keyboard-driven, paginated grid.
// Ported from /tmp/anthropic-design/docs/project/app/listview.jsx (vanilla TS, no React).
// Persisted bits (query, selection, page, sort, scrollTop) live in `state`
// owned by the host (dashboard.ts) — one per view — so switching views
// preserves them.

import { h, mount } from './h.js';
import { Icon } from './icons.js';
import type { ListState, MenuItem, PrimaryActions } from './types.js';

export interface ListColumn {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
}

export interface ListBulkActions<T> {
  setPublic: (items: T[]) => void;
  setDraft: (items: T[]) => void;
  remove: (items: T[]) => void;
}

export interface ListViewProps<T> {
  kind: 'docs' | 'playlists';
  items: T[];
  columns: ListColumn[];
  matchFn: (it: T, q: string) => boolean;
  sortFns: Record<string, (a: T, b: T) => number>;
  renderCells: (it: T, ctx: { query: string }) => Node[];
  primaryActions: PrimaryActions<T>;
  menuActions: (it: T) => MenuItem[];
  onActivate: (it: T) => void;
  bulkActions: ListBulkActions<T>;
  state: ListState;
  setState: (patch: Partial<ListState> | ((s: ListState) => ListState)) => void;
  perPage?: number;
  emptyState: (q: string) => HTMLElement;
  filterPlaceholder: string;
  registerFilterFocus?: (fn: () => void) => void;
  isTouch: boolean;
  loading: boolean;
}

// id helper — items may carry .doc_id (Doc) or .id (Playlist).
function idOf<T>(it: T): string {
  const o = it as unknown as { id?: string; doc_id?: string };
  return (o.id ?? o.doc_id) as string;
}

export function ListView<T>(props: ListViewProps<T>): HTMLElement {
  const perPage = props.perPage ?? 12;
  const host = h('div', { class: 'lv-host' });

  // Local (non-persisted) UI state.
  let kbdIdx = -1;
  let anchorIdx: number | null = null; // shift-range anchor
  let menuEl: HTMLElement | null = null;
  let menuMouseDown: ((e: MouseEvent) => void) | null = null;
  let menuKeydown: ((e: KeyboardEvent) => void) | null = null;

  // Refs into the current render — refreshed each render().
  let scrollEl: HTMLElement | null = null;
  let filterInput: HTMLInputElement | null = null;

  // For window keydown teardown
  let attached = false;
  let mo: MutationObserver | null = null;

  // ----- state-patch helpers -----
  const patch = (p: Partial<ListState>): void => props.setState((s) => ({ ...s, ...p }));

  // Range computations rebuilt each render — keep helpers local to render().
  // ---------------------------------------------------------------

  function computeView(): {
    filtered: T[];
    visible: T[];
    visibleIds: string[];
    start: number;
    curPage: number;
    totalPages: number;
  } {
    const { query = '', sort } = props.state;
    const q = query.trim().toLowerCase();
    let arr: T[] = q ? props.items.filter((it) => props.matchFn(it, q)) : props.items.slice();
    if (sort && props.sortFns[sort.key]) {
      arr.sort(props.sortFns[sort.key]);
      if (sort.dir === 'desc') arr.reverse();
    }
    const filtered = arr;
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    const curPage = Math.min(props.state.page || 1, totalPages);
    const start = (curPage - 1) * perPage;
    const visible = filtered.slice(start, start + perPage);
    const visibleIds = visible.map(idOf);
    return { filtered, visible, visibleIds, start, curPage, totalPages };
  }

  function closeMenu(): void {
    if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
    menuEl = null;
    if (menuMouseDown) document.removeEventListener('mousedown', menuMouseDown);
    if (menuKeydown) document.removeEventListener('keydown', menuKeydown);
    menuMouseDown = null;
    menuKeydown = null;
  }

  function openMenu(anchorEl: HTMLElement, item: T): void {
    closeMenu();
    const items = props.menuActions(item);
    const el = h('div', { class: 'menu', role: 'menu', style: { left: '-9999px', top: '-9999px' } as Partial<CSSStyleDeclaration> });
    items.forEach((it) => {
      if (it.sep) {
        el.appendChild(h('div', { class: 'mi-sep' }));
        return;
      }
      const btn = h(
        'button',
        {
          class: `mi ${it.danger ? 'danger' : ''}`,
          role: 'menuitem',
          onClick: () => {
            closeMenu();
            it.onClick && it.onClick();
          },
        },
        h('span', { class: 'mi-ic' }, it.icon ? Icon(it.icon, { size: 16 }) : null),
        it.label ?? '',
        it.kbd ? h('span', { class: 'mi-kbd' }, it.kbd) : null,
      );
      el.appendChild(btn);
    });
    document.body.appendChild(el);
    menuEl = el;
    // Position: align right edge to anchor's right, drop below.
    const r = anchorEl.getBoundingClientRect();
    const m = el.getBoundingClientRect();
    let left = r.right - m.width;
    let top = r.bottom + 6;
    if (top + m.height > window.innerHeight - 8) top = r.top - m.height - 6;
    if (left < 8) left = 8;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;

    menuMouseDown = (e: MouseEvent): void => {
      if (menuEl && !menuEl.contains(e.target as Node)) closeMenu();
    };
    menuKeydown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', menuMouseDown);
    document.addEventListener('keydown', menuKeydown);
  }

  // selection helpers ---------------------------------------------------
  function setSel(next: Set<string>): void {
    patch({ selection: next });
  }
  function toggleOne(id: string): void {
    const sel = props.state.selection;
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSel(n);
  }
  function clearSel(): void {
    setSel(new Set());
  }

  // sort ----------------------------------------------------------------
  function setSort(key: string): void {
    props.setState((s) => {
      const cur = s.sort;
      if (cur && cur.key === key) {
        return { ...s, sort: { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } };
      }
      return { ...s, sort: { key, dir: 'asc' } };
    });
  }

  // pageNums — up to 7 buttons, with "…" placeholders.
  function pageNums(cur: number, total: number): Array<number | '…'> {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const out: Array<number | '…'> = [1];
    if (cur > 3) out.push('…');
    for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) out.push(p);
    if (cur < total - 2) out.push('…');
    out.push(total);
    return out;
  }

  // keyboard nav --------------------------------------------------------
  function focusRow(i: number, visible: T[]): void {
    kbdIdx = i;
    if (!scrollEl) {
      render();
      return;
    }
    const el = scrollEl.querySelector(`tr[data-ri="${i}"]`) as HTMLElement | null;
    if (el) {
      const box = scrollEl.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.bottom > box.bottom - 8) scrollEl.scrollTop += r.bottom - box.bottom + 16;
      else if (r.top < box.top + 38) scrollEl.scrollTop -= box.top + 38 - r.top;
    }
    // Re-render so the .kbd-focus class is applied. Note this happens AFTER
    // we computed scroll offsets above (querySelector for current row).
    void visible;
    render();
  }

  function onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    const tag = (target?.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || (target?.isContentEditable ?? false);
    const sel = props.state.selection;

    const { visible, visibleIds } = computeView();

    if (e.metaKey || e.ctrlKey) {
      if ((e.key === 'a' || e.key === 'A') && !typing) {
        e.preventDefault();
        const n = new Set(sel);
        visibleIds.forEach((id) => n.add(id));
        setSel(n);
      }
      return;
    }
    if (typing) return;
    const k = e.key;
    if (k === 'j' || k === 'ArrowDown') {
      e.preventDefault();
      focusRow(Math.min((kbdIdx < 0 ? -1 : kbdIdx) + 1, visible.length - 1), visible);
    } else if (k === 'k' || k === 'ArrowUp') {
      e.preventDefault();
      focusRow(Math.max((kbdIdx < 0 ? visible.length : kbdIdx) - 1, 0), visible);
    } else if (k === 'Enter' && kbdIdx >= 0) {
      e.preventDefault();
      props.onActivate(visible[kbdIdx]);
    } else if (k === 'x' && kbdIdx >= 0) {
      e.preventDefault();
      toggleOne(idOf(visible[kbdIdx]));
      anchorIdx = kbdIdx;
    } else if (k === 'Escape') {
      if (sel.size) {
        e.preventDefault();
        clearSel();
      }
    } else if (kbdIdx >= 0) {
      const it = visible[kbdIdx];
      if (k === 'r') {
        e.preventDefault();
        props.primaryActions.resync && props.primaryActions.resync(it);
      } else if (k === 'e') {
        e.preventDefault();
        props.primaryActions.edit && props.primaryActions.edit(it);
      } else if (k === 'p') {
        e.preventDefault();
        props.primaryActions.togglePublish(it);
      } else if (k === 'c') {
        e.preventDefault();
        props.primaryActions.copyUrl(it);
      } else if (k === 'Backspace' || k === 'Delete') {
        e.preventDefault();
        props.primaryActions.remove(it);
      }
    }
  }

  // ----- attach / detach lifecycle for window keydown ------------------
  function attach(): void {
    if (attached) return;
    attached = true;
    window.addEventListener('keydown', onKeyDown);
  }
  function detach(): void {
    if (!attached) return;
    attached = false;
    window.removeEventListener('keydown', onKeyDown);
    closeMenu();
  }
  // Watch for host detach from the document — drop window listener so
  // dashboards can switch views without leaking handlers.
  mo = new MutationObserver(() => {
    if (!document.body.contains(host)) detach();
    else attach();
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // Register filter focus once (the closure reads filterInput off the
  // latest render, which is refreshed each render() pass).
  if (props.registerFilterFocus) {
    props.registerFilterFocus(() => {
      if (filterInput) filterInput.focus();
    });
  }

  // ===================================================================
  // RENDER
  // ===================================================================
  function render(): void {
    const { filtered, visible, visibleIds, start, curPage, totalPages } = computeView();
    const { query = '', sort, selection: sel } = props.state;

    // clamp current page if needed
    if ((props.state.page || 1) !== curPage) {
      // schedule patch — but still render now with the clamped value.
      patch({ page: curPage });
    }
    // clamp kbd focus when page changes
    if (kbdIdx >= visible.length) kbdIdx = visible.length - 1;

    const selectedVisible = visibleIds.filter((id) => sel.has(id));
    const allVisibleSel = visible.length > 0 && selectedVisible.length === visible.length;
    const someVisibleSel = selectedVisible.length > 0 && !allVisibleSel;

    const toggleAllVisible = (): void => {
      const n = new Set(sel);
      if (allVisibleSel) visibleIds.forEach((id) => n.delete(id));
      else visibleIds.forEach((id) => n.add(id));
      setSel(n);
    };

    // --- Toolbar ---
    const filterInputEl = h('input', {
      value: query,
      placeholder: props.filterPlaceholder,
      onInput: (e: Event) => {
        const v = (e.target as HTMLInputElement).value;
        patch({ query: v, page: 1 });
      },
    });
    filterInput = filterInputEl;

    const filterClearBtn = query
      ? h(
          'button',
          {
            class: 'fb-clear',
            'aria-label': '清除',
            onClick: () => patch({ query: '', page: 1 }),
          },
          Icon('x', { size: 14 }),
        )
      : null;

    const toolbar = h(
      'div',
      { class: 'toolbar' },
      h(
        'h1',
        null,
        props.kind === 'docs' ? '文件' : '播放清單',
        ' ',
        h(
          'span',
          { class: 'count' },
          `${filtered.length}${query ? ` / ${props.items.length}` : ''}`,
        ),
      ),
      h('div', { class: 'toolbar-spacer' }),
      h(
        'div',
        { class: 'filterbox' },
        h('span', { class: 'fb-icon' }, Icon('search', { size: 15 })),
        filterInputEl,
        filterClearBtn,
      ),
    );

    // --- Body (loading / empty / table) ---
    let body: HTMLElement;
    if (props.loading) {
      const rows: HTMLElement[] = [];
      for (let i = 0; i < 8; i++) {
        rows.push(
          h(
            'tr',
            null,
            h(
              'td',
              { colSpan: props.columns.length + 2 },
              h('div', {
                class: 'skel',
                style: { height: '18px', width: `${40 + ((i * 53) % 50)}%`, margin: '6px 0' } as Partial<CSSStyleDeclaration>,
              }),
            ),
          ),
        );
      }
      body = h('div', { class: 'tablewrap' }, h('table', { class: 'grid' }, h('tbody', null, ...rows)));
      scrollEl = null;
    } else if (filtered.length === 0) {
      body = props.emptyState(query);
      scrollEl = null;
    } else {
      // ---- header ----
      const headerCells: HTMLElement[] = [];
      headerCells.push(
        h(
          'th',
          { class: 'col-check' },
          checkbox({ checked: allVisibleSel, indeterminate: someVisibleSel, label: '全選本頁', onChange: toggleAllVisible }),
        ),
      );
      for (const c of props.columns) {
        const cls = `${c.className || ''} ${c.sortable ? 'sortable' : ''}`.trim();
        const showSort = c.sortable && sort && sort.key === c.key;
        headerCells.push(
          h(
            'th',
            {
              class: cls,
              onClick: c.sortable ? () => setSort(c.key) : undefined,
            },
            h(
              'span',
              { class: 'th-in' },
              c.label,
              showSort && sort ? Icon(sort.dir === 'asc' ? 'chevUp' : 'chevDown', { size: 13 }) : null,
            ),
          ),
        );
      }
      headerCells.push(h('th', { class: 'col-actions' }));

      // ---- rows ----
      const rowEls: HTMLElement[] = visible.map((it, i) => {
        const id = idOf(it);
        const isSel = sel.has(id);
        const cls = `${isSel ? 'selected' : ''} ${kbdIdx === i ? 'kbd-focus' : ''}`.trim();

        const checkTd = h(
          'td',
          {
            class: 'col-check',
            onClick: (e: MouseEvent) => {
              e.stopPropagation();
              // shift-range over visible rows
              if (e.shiftKey && anchorIdx != null) {
                const [a, b] = [anchorIdx, i].sort((x, y) => x - y);
                const n = new Set(sel);
                for (let j = a; j <= b; j++) n.add(idOf(visible[j]));
                setSel(n);
              } else {
                toggleOne(id);
                anchorIdx = i;
              }
            },
          },
          checkbox({ checked: isSel, label: '選取', onChange: () => undefined }),
        );

        const cellNodes = props.renderCells(it, { query });

        const inline = props.primaryActions.inline(it);
        const inlineNodes: Node[] = Array.isArray(inline) ? inline : [inline];

        const moreBtn = h(
          'button',
          {
            class: 'iconbtn opt-hide',
            'aria-label': '更多',
            title: '更多操作',
            onClick: (e: MouseEvent) => {
              e.stopPropagation();
              openMenu(e.currentTarget as HTMLElement, it);
            },
          },
          Icon('more', { size: 18 }),
        );

        const actionsTd = h(
          'td',
          { class: 'col-actions' },
          h('div', { class: 'rowacts' }, ...inlineNodes, moreBtn),
        );

        return h(
          'tr',
          {
            class: cls,
            'data-ri': String(i),
            onMouseEnter: () => {
              if (kbdIdx !== i) {
                kbdIdx = i;
                render();
              }
            },
            onClick: (e: MouseEvent) => {
              const t = e.target as HTMLElement | null;
              if (t && t.closest('button,input,a')) return;
              props.onActivate(it);
            },
          },
          checkTd,
          ...cellNodes,
          actionsTd,
        );
      });

      const wrap = h(
        'div',
        {
          class: 'tablewrap',
          onScroll: () => {
            if (scrollEl) {
              props.setState((s) => ({ ...s, scrollTop: scrollEl!.scrollTop }));
            }
          },
        },
        h(
          'table',
          { class: 'grid' },
          h('thead', null, h('tr', null, ...headerCells)),
          h('tbody', null, ...rowEls),
        ),
      );
      scrollEl = wrap;
      body = wrap;
    }

    // --- Pager ---
    let pager: HTMLElement | null = null;
    if (!props.loading && filtered.length > 0) {
      const pgNumBtns = pageNums(curPage, totalPages).map((p) => {
        if (p === '…') {
          return h('span', { style: { color: 'var(--text-3)', padding: '0 2px' } as Partial<CSSStyleDeclaration> }, '…');
        }
        const isCur = p === curPage;
        return h(
          'button',
          {
            class: 'pgbtn',
            'aria-current': isCur ? 'true' : 'false',
            onClick: () => patch({ page: p }),
          },
          String(p),
        );
      });

      pager = h(
        'div',
        { class: 'pager' },
        h(
          'span',
          { class: 'pg-info' },
          '第 ',
          h('b', null, String(start + 1)),
          '–',
          h('b', null, String(Math.min(start + perPage, filtered.length))),
          ' 筆，共 ',
          h('b', null, String(filtered.length)),
          ' 筆',
        ),
        h('div', { class: 'pager-spacer' }),
        // Hidden per-page select (kept for parity; display:none in JSX).
        h('select', {
          class: 'pgsel',
          value: String(perPage),
          'aria-label': '每頁筆數',
          style: { display: 'none' } as Partial<CSSStyleDeclaration>,
          onChange: (e: Event) => {
            const v = +(e.target as HTMLSelectElement).value;
            patch({ perPage: v });
          },
        }),
        h(
          'button',
          {
            class: 'pgbtn',
            disabled: curPage === 1,
            'aria-label': '第一頁',
            onClick: () => patch({ page: 1 }),
          },
          Icon('chevFirst', { size: 15 }),
        ),
        h(
          'button',
          {
            class: 'pgbtn',
            disabled: curPage === 1,
            'aria-label': '上一頁',
            onClick: () => patch({ page: curPage - 1 }),
          },
          Icon('chevLeft', { size: 15 }),
        ),
        ...pgNumBtns,
        h(
          'button',
          {
            class: 'pgbtn',
            disabled: curPage === totalPages,
            'aria-label': '下一頁',
            onClick: () => patch({ page: curPage + 1 }),
          },
          Icon('chevRight', { size: 15 }),
        ),
        h(
          'button',
          {
            class: 'pgbtn',
            disabled: curPage === totalPages,
            'aria-label': '最後一頁',
            onClick: () => patch({ page: totalPages }),
          },
          Icon('chevLast', { size: 15 }),
        ),
      );
    }

    // --- Bulk bar ---
    let bulkBar: HTMLElement | null = null;
    if (sel.size > 0) {
      const bulkItems = (): T[] => filtered.filter((it) => sel.has(idOf(it)));
      bulkBar = h(
        'div',
        { class: 'bulkbar' },
        h('span', { class: 'bk-count' }, h('span', { class: 'n' }, String(sel.size)), ' 已選取'),
        h('div', { class: 'bk-sep' }),
        h(
          'button',
          { class: 'bk-btn', onClick: () => props.bulkActions.setPublic(bulkItems()) },
          Icon('globe', { size: 16 }),
          '設為公開',
        ),
        h(
          'button',
          { class: 'bk-btn', onClick: () => props.bulkActions.setDraft(bulkItems()) },
          Icon('eyeOff', { size: 16 }),
          '設為草稿',
        ),
        h(
          'button',
          { class: 'bk-btn danger', onClick: () => props.bulkActions.remove(bulkItems()) },
          Icon('trash', { size: 16 }),
          '刪除',
        ),
        h('div', { class: 'bk-sep' }),
        h(
          'button',
          { class: 'iconbtn bk-close', 'aria-label': '清除選取', onClick: () => clearSel() },
          Icon('x', { size: 17 }),
        ),
      );
    }

    // Compose
    const children: Node[] = [toolbar, body];
    if (pager) children.push(pager);
    if (bulkBar) children.push(bulkBar);
    mount(host, children);

    // Restore scroll position from state (initial render and after re-renders).
    if (scrollEl && props.state.scrollTop) {
      scrollEl.scrollTop = props.state.scrollTop;
    }
  }

  render();
  attach();
  return host;
}

// --- local Checkbox helper (ported from shared.jsx Checkbox) ----------
function checkbox(opts: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: () => void;
}): HTMLInputElement {
  const input = h('input', {
    type: 'checkbox',
    class: `cb ${opts.indeterminate ? 'indeterminate' : ''}`.trim(),
    checked: opts.checked,
    'aria-label': opts.label,
    onChange: opts.onChange,
    onClick: (e: MouseEvent) => e.stopPropagation(),
  }) as HTMLInputElement;
  input.indeterminate = !!opts.indeterminate;
  return input;
}
