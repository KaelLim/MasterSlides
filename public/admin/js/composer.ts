// PlaylistComposer — two-pane drawer for editing a playlist.
//
// Ported from /tmp/anthropic-design/docs/project/app/composer.jsx. Matches
// that file's behavior exactly: same DOM classes, same key handlers, same
// drag-drop semantics, same Alt+↑↓ keyboard reorder fallback.
//
// The component is self-contained: it owns title/state/members/poolQ/
// kbdActiveId in module-local mutable state and rebuilds the drawer body
// on each render(). It bubbles results out via the onSave/onClose/onOpen
// callbacks supplied by dashboard.ts.

import { h, mount } from './h.js';
import { Icon } from './icons.js';
import type { Doc, Playlist, PubState } from './types.js';

export interface ComposerProps {
  playlist: Playlist & { _new?: boolean };
  allDocs: Doc[];
  onClose: () => void;
  onSave: (p: Playlist & { _new: false }) => void;
  onOpen: (p: Playlist) => void;
}

/* ------------------------------------------------------------------ */
/* Small inline atoms (mirrors of shared.jsx's StateBadge + Highlight) */
/* ------------------------------------------------------------------ */

function StateBadgeSpan(state: PubState): HTMLSpanElement {
  const pub = state === 'public';
  return h(
    'span',
    { class: `badge ${pub ? 'pub' : 'draft'}` },
    h('span', { class: 'dot' }),
    pub ? '公開' : '草稿',
  );
}

function StateBadgeButton(state: PubState, onClick: (e: MouseEvent) => void): HTMLButtonElement {
  const pub = state === 'public';
  return h(
    'button',
    {
      class: `badge ${pub ? 'pub' : 'draft'}`,
      title: '切換發佈狀態',
      type: 'button',
      onClick,
    },
    h('span', { class: 'dot' }),
    pub ? '公開' : '草稿',
  );
}

// Match shared.jsx's <Highlight text q/> — case-insensitive, single substring.
function Highlight(text: string, q: string): (Node | string)[] {
  if (!q) return [text];
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return [text];
  return [
    text.slice(0, i),
    h('mark', null, text.slice(i, i + q.length)),
    text.slice(i + q.length),
  ];
}

/* ------------------------------------------------------------------ */
/* PlaylistComposer                                                    */
/* ------------------------------------------------------------------ */

export function PlaylistComposer(props: ComposerProps): HTMLElement {
  const isNew = !!props.playlist._new;

  // Internal mutable state
  let title: string = props.playlist.title || '';
  let state: PubState = props.playlist.state || 'draft';
  let members: string[] = [...(props.playlist.members || [])];
  let poolQ: string = '';
  let kbdActiveId: string | null = null;
  let dragIdx: number | null = null;
  let overIdx: number | null = null;

  // Outer host element — drawer-scrim + drawer wide
  const host = h('div', { class: 'composer-host' });

  // Backdrop (clicking closes)
  const scrim = h('div', { class: 'drawer-scrim', onClick: () => props.onClose() });
  // Drawer container — rebuilt on each render()
  const drawer = h('div', {
    class: 'drawer wide',
    role: 'dialog',
    'aria-modal': 'true',
  });
  host.appendChild(scrim);
  host.appendChild(drawer);

  // Escape closes — mirror useEsc behavior, with self-cleaning listener.
  const onEsc = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      props.onClose();
    }
  };
  document.addEventListener('keydown', onEsc);
  // dashboard.ts is expected to remove host from DOM; the listener removes
  // itself when host disconnects via a MutationObserver on the parent.
  const cleanup = (): void => document.removeEventListener('keydown', onEsc);
  // Best-effort cleanup hook — dashboard.ts may also call host.dispatchEvent
  // a 'composer:dispose' event before removing host. Either path is safe.
  host.addEventListener('composer:dispose', cleanup);
  // Disconnect detection as a fallback.
  const obs = new MutationObserver(() => {
    if (!host.isConnected) {
      cleanup();
      obs.disconnect();
    }
  });
  // Defer observer attachment to next tick so host can be appended first.
  queueMicrotask(() => {
    if (host.parentNode) obs.observe(host.parentNode, { childList: true });
  });

  /* ---- Helpers (mutate state then render) ---- */

  function add(id: string): void {
    if (!members.includes(id)) {
      members = [...members, id];
      render();
    }
  }

  function remove(id: string): void {
    members = members.filter((x) => x !== id);
    if (kbdActiveId === id) kbdActiveId = null;
    render();
  }

  function move(from: number, to: number): void {
    if (to < 0 || to >= members.length) return;
    const c = [...members];
    const [x] = c.splice(from, 1);
    c.splice(to, 0, x);
    members = c;
    render();
  }

  function toggleState(): void {
    state = state === 'public' ? 'draft' : 'public';
    render();
  }

  function save(): void {
    const next: Playlist & { _new: false } = {
      ...props.playlist,
      title: title.trim() || '未命名播放清單',
      state,
      members,
      _new: false,
    };
    props.onSave(next);
  }

  /* ---- Render ---- */

  function render(): void {
    // Build allDocs lookup + member set fresh on each render so pool
    // visualization stays in sync with the live members array.
    const docMap = new Map<string, Doc>();
    for (const d of props.allDocs) docMap.set(d.doc_id, d);
    const memberSet = new Set(members);
    const q = poolQ.trim().toLowerCase();
    const pool = props.allDocs.filter(
      (d) => !q || d.title.toLowerCase().includes(q) || d.doc_id.toLowerCase().includes(q),
    );

    /* ----- Header ----- */
    const titleInput = h('input', {
      class: 'input',
      value: title,
      placeholder: '播放清單標題',
      style: { fontSize: '16px', fontWeight: '700' },
      onInput: (e: Event) => {
        title = (e.target as HTMLInputElement).value;
      },
    }) as HTMLInputElement;

    const headChildren: Node[] = [
      h(
        'div',
        {
          class: 'dh-title',
          style: { display: 'flex', alignItems: 'center', gap: '12px' },
        },
        Icon('list', { size: 20, style: { color: 'var(--primary)', flex: '0 0 auto' } }),
        titleInput,
      ),
      StateBadgeButton(state, () => toggleState()),
    ];
    if (!isNew) {
      headChildren.push(
        h(
          'button',
          {
            class: 'btn sm ghost',
            title: '在檢視器播放',
            type: 'button',
            onClick: () => props.onOpen(props.playlist),
          },
          Icon('play', { size: 15 }),
          '播放',
        ),
      );
    }
    headChildren.push(
      h(
        'button',
        {
          class: 'iconbtn',
          'aria-label': '關閉',
          type: 'button',
          onClick: () => props.onClose(),
        },
        Icon('x', { size: 18 }),
      ),
    );

    const head = h('div', { class: 'drawer-head' }, ...headChildren);

    /* ----- Pool pane ----- */
    const poolChildren: Node[] = [];
    if (pool.length === 0) {
      poolChildren.push(h('div', { class: 'comp-empty' }, '找不到符合的文件。'));
    }
    for (const d of pool) {
      const added = memberSet.has(d.doc_id);
      poolChildren.push(
        h(
          'div',
          { class: `pool-item ${added ? 'added' : ''}` },
          Icon('file', { size: 16, style: { color: 'var(--text-3)', flex: '0 0 auto' } }),
          h(
            'div',
            { class: 'pi-body' },
            h('div', { class: 'pi-name' }, ...Highlight(d.title, poolQ)),
            h(
              'div',
              { class: 'pi-meta' },
              StateBadgeSpan(d.state),
              h(
                'span',
                { class: 'mono', style: { fontFamily: 'var(--font-mono)' } },
                d.doc_id,
              ),
            ),
          ),
          h(
            'button',
            {
              class: `addbtn ${added ? 'in' : ''}`,
              title: added ? '已在清單中' : '加入清單',
              'aria-label': added ? '已加入' : '加入',
              type: 'button',
              onClick: () => {
                if (!added) add(d.doc_id);
              },
            },
            Icon(added ? 'check' : 'plus', { size: 16 }),
          ),
        ),
      );
    }

    const poolSearchClear = poolQ
      ? h(
          'button',
          {
            class: 'fb-clear',
            type: 'button',
            onClick: () => {
              poolQ = '';
              render();
            },
          },
          Icon('x', { size: 14 }),
        )
      : null;

    const poolPane = h(
      'div',
      { class: 'comp-pane pool' },
      h(
        'div',
        { class: 'comp-head' },
        h(
          'div',
          { class: 'ch-title' },
          '文件庫 ',
          h('span', { class: 'n' }, String(pool.length)),
        ),
        h(
          'div',
          { class: 'filterbox', style: { width: '100%' } },
          h('span', { class: 'fb-icon' }, Icon('search', { size: 15 })),
          h('input', {
            placeholder: '搜尋文件加入清單…',
            value: poolQ,
            onInput: (e: Event) => {
              poolQ = (e.target as HTMLInputElement).value;
              render();
            },
          }),
          poolSearchClear,
        ),
      ),
      h('div', { class: 'comp-list' }, ...poolChildren),
    );

    /* ----- Members pane ----- */
    const memberChildren: Node[] = [];
    if (members.length === 0) {
      memberChildren.push(
        h(
          'div',
          { class: 'comp-empty' },
          Icon('layers', {
            size: 28,
            style: { color: 'var(--text-3)', marginBottom: '8px' },
          }),
          h('br'),
          '清單還是空的。',
          h('br'),
          '從左側文件庫加入文件。',
        ),
      );
    }
    members.forEach((id, i) => {
      const d = docMap.get(id);
      if (!d) return;

      const classes = [
        'member-item',
        overIdx === i ? 'dragover' : '',
        dragIdx === i ? 'dragging' : '',
        kbdActiveId === id ? 'kbd-active' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const row = h(
        'div',
        {
          class: classes,
          draggable: 'true',
          tabIndex: 0,
          onDragstart: (e: DragEvent) => {
            dragIdx = i;
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
          },
          onDragover: (e: DragEvent) => {
            e.preventDefault();
            if (overIdx !== i) {
              overIdx = i;
              render();
            }
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            const from = dragIdx;
            dragIdx = null;
            overIdx = null;
            if (from !== null && from !== i) {
              move(from, i);
            } else {
              render();
            }
          },
          onDragend: () => {
            dragIdx = null;
            overIdx = null;
            render();
          },
          onKeydown: (e: KeyboardEvent) => {
            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
              e.preventDefault();
              kbdActiveId = id;
              move(i, i + (e.key === 'ArrowUp' ? -1 : 1));
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
              e.preventDefault();
              remove(id);
            }
          },
          onFocus: () => {
            if (kbdActiveId !== id) {
              kbdActiveId = id;
              render();
            }
          },
          onBlur: () => {
            if (kbdActiveId === id) {
              kbdActiveId = null;
              render();
            }
          },
        },
        h(
          'span',
          { class: 'mi-handle', title: '拖曳排序' },
          Icon('grip', { size: 16 }),
        ),
        h('span', { class: 'mi-idx' }, String(i + 1)),
        h(
          'div',
          { class: 'mi-body' },
          h('div', { class: 'mi-name' }, d.title),
          h('div', { class: 'mi-meta' }, StateBadgeSpan(d.state)),
        ),
        h(
          'div',
          { style: { display: 'flex', gap: '2px' } },
          h(
            'button',
            {
              class: 'iconbtn',
              'aria-label': '上移',
              title: '上移',
              type: 'button',
              disabled: i === 0,
              onClick: () => move(i, i - 1),
            },
            Icon('arrowUp', { size: 15 }),
          ),
          h(
            'button',
            {
              class: 'iconbtn',
              'aria-label': '下移',
              title: '下移',
              type: 'button',
              disabled: i === members.length - 1,
              onClick: () => move(i, i + 1),
            },
            Icon('arrowDown', { size: 15 }),
          ),
          h(
            'button',
            {
              class: 'iconbtn danger',
              'aria-label': '移除',
              title: '移出清單',
              type: 'button',
              onClick: () => remove(id),
            },
            Icon('x', { size: 15 }),
          ),
        ),
      );
      memberChildren.push(row);
    });

    const membersPane = h(
      'div',
      { class: 'comp-pane' },
      h(
        'div',
        { class: 'comp-head' },
        h(
          'div',
          { class: 'ch-title' },
          '播放順序 ',
          h('span', { class: 'n' }, `${members.length} 份`),
        ),
        h(
          'div',
          {
            class: 'hintline',
            style: { fontSize: '12px', color: 'var(--text-3)' },
          },
          '拖曳排序，或聚焦後按 ',
          h('kbd', { style: { padding: '1px 5px' } }, 'Alt'),
          '+',
          h('kbd', { style: { padding: '1px 5px' } }, '↑↓'),
          ' 移動。',
        ),
      ),
      h('div', { class: 'comp-list' }, ...memberChildren),
    );

    /* ----- Composer grid ----- */
    const body = h('div', { class: 'composer' }, poolPane, membersPane);

    /* ----- Footer ----- */
    const foot = h(
      'div',
      { class: 'drawer-foot' },
      h(
        'div',
        {
          class: 'grow',
          style: {
            fontSize: '13px',
            color: 'var(--text-2)',
            display: 'flex',
            alignItems: 'center',
          },
        },
        `共 ${members.length} 份文件`,
      ),
      h(
        'button',
        { class: 'btn', type: 'button', onClick: () => props.onClose() },
        '取消',
      ),
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onClick: () => save(),
        },
        Icon('check', { size: 16 }),
        isNew ? '建立清單' : '儲存變更',
      ),
    );

    mount(drawer, [head, body, foot]);
  }

  render();
  return host;
}
