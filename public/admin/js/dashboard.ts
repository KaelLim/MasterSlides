// Admin dashboard — App orchestration. Single-page entry that wires the
// design's React App component into vanilla TS modules.
//
// Responsibilities:
//   - Boot: load LS settings, apply theme/density/accent, fetch docs+playlists
//   - Render the top bar (brand, view switcher, primary CTA, help, tweaks)
//   - Mount the active ListView for the current view (docs | playlists)
//   - Bridge user actions to api.ts and refresh the in-memory model
//   - Open overlays (import / edit / composer / confirm / help / tweaks)
//   - Global hotkeys: / focus search, ? help, g switch view
//   - Persistent UI state per view (search query, selection, page, sort, scroll)
//
// The old multi-file admin (dashboard.ts pre-redesign, playlists.ts,
// playlist-edit.ts, pager.ts, confirm-modal.ts, help-modal.ts, notify.ts,
// theme.ts, hotkeys.ts) is replaced by this orchestrator + the seven new
// modules (types, h, icons, shared, listview, composer, modals, tweaks, api).

import { h, mount } from './h.js';
import { Icon } from './icons.js';
import { relTime, fullDate, Highlight, StateBadge, toast } from './shared.js';
import { ListView, type ListViewProps } from './listview.js';
import { PlaylistComposer } from './composer.js';
import { showConfirm, showImport, showEditDrawer, showKeyboardHelp } from './modals.js';
import { showTweaksPanel, applyTheme, applyAccent } from './tweaks.js';
import {
  listDocs,
  listPlaylists,
  importDoc,
  resyncDoc,
  patchDoc,
  deleteDoc,
  createPlaylist,
  patchPlaylist,
  deletePlaylist,
  getEditData,
  saveEditData,
  classifyError,
} from './api.js';
import type {
  Accent,
  Density,
  Doc,
  ListState,
  MenuItem,
  Playlist,
  PrimaryActions,
  PubState,
  Theme,
  View,
} from './types.js';

// ── localStorage keys + helpers ─────────────────────────────────────────
const LS = {
  theme: 'ms_theme',
  density: 'ms_density',
  accent: 'ms_accent',
  hint: 'ms_hint',
};
function lsGet<T>(k: string, dflt: T): T {
  try {
    const v = localStorage.getItem(k);
    return v == null ? dflt : (JSON.parse(v) as T);
  } catch {
    return dflt;
  }
}
function lsSet(k: string, v: unknown): void {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ }
}

// ── Module-global state ─────────────────────────────────────────────────
const VIEWER_BASE = window.location.origin; // current host serves /slides/ + /admin/
const viewerUrlForDoc = (id: string): string => `${VIEWER_BASE}/slides/?src=${encodeURIComponent(id)}`;
const viewerUrlForPlaylist = (id: string): string => `${VIEWER_BASE}/slides/?playlist=${encodeURIComponent(id)}`;

let docs: Doc[] = [];
let playlists: Playlist[] = [];
let view: View = 'docs';
let loading = true;
let hintDismissed: boolean = lsGet(LS.hint, false);

let theme: Theme = lsGet(LS.theme, 'dark');
let density: Density = lsGet(LS.density, 'comfortable');
let accent: Accent = lsGet(LS.accent, 'blue');
let tweaksOpen = false;
let tweaksHostEl: HTMLElement | null = null;

const isTouch = window.matchMedia('(pointer: coarse)').matches;

// Per-view persisted UI state — survives view switches (selection / query /
// page / sort / scroll). New Set/object identities each session.
function makeListState(): ListState {
  return {
    query: '',
    selection: new Set<string>(),
    page: 1,
    sort: { key: 'updated', dir: 'desc' },
    scrollTop: 0,
    perPage: 12,
  };
}
const listStates: Record<View, ListState> = {
  docs: makeListState(),
  playlists: makeListState(),
};

// Filter-focus closure registered by the active ListView. Re-set on every
// view switch via registerFilterFocus.
let focusFilter: (() => void) | null = null;

// ── Theme / density / accent setters with side effects ──────────────────
function setTheme(t: Theme): void {
  theme = t;
  applyTheme(t);
  lsSet(LS.theme, t);
}
function setDensity(d: Density): void {
  density = d;
  document.documentElement.setAttribute('data-density', d);
  lsSet(LS.density, d);
}
function setAccent(a: Accent): void {
  accent = a;
  applyAccent(a);
  lsSet(LS.accent, a);
}

// Apply initial settings before first render.
applyTheme(theme);
applyAccent(accent);
document.documentElement.setAttribute('data-density', density);
document.body.classList.toggle('touch', isTouch);

// Watch prefers-color-scheme so 'system' theme flips dynamically.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (theme === 'system') applyTheme('system');
});

// ── playlist_count denormalization ──────────────────────────────────────
function recomputePlaylistCounts(): void {
  const map = new Map<string, number>();
  for (const p of playlists) for (const m of p.members) map.set(m, (map.get(m) ?? 0) + 1);
  for (const d of docs) d.playlist_count = map.get(d.doc_id) ?? 0;
}

// ── Bulk progress helper ────────────────────────────────────────────────
async function runBulk<T extends { doc_id?: string; id?: string }>(
  items: T[],
  label: string,
  per: (it: T) => Promise<void>,
): Promise<void> {
  const total = items.length;
  const t = toast.notify({ tone: 'info', title: label, msg: `0 / ${total}`, progress: 0, ttl: 0, noClose: true });
  let done = 0;
  let failed = 0;
  for (const it of items) {
    try { await per(it); }
    catch { failed += 1; }
    done += 1;
    t.update({ msg: `處理中… ${done} / ${total}`, progress: done / total });
  }
  if (failed > 0) {
    t.update({ tone: 'caution', title: `${label}完成（${failed} 筆失敗）`, msg: `已處理 ${total} 筆，其中 ${failed} 筆失敗`, progress: 1, ttl: 3500, noClose: false });
  } else {
    t.update({ tone: 'success', title: `${label}完成`, msg: `已處理 ${total} 筆`, progress: 1, ttl: 3000, noClose: false });
  }
  setTimeout(t.close, 3500);
}

// ── Doc actions ─────────────────────────────────────────────────────────
function openDocViewer(d: Doc): void {
  window.open(viewerUrlForDoc(d.doc_id), '_blank');
}
async function doResync(d: Doc): Promise<void> {
  const t = toast.notify({ tone: 'info', title: '重新同步中', msg: d.title, progress: 0.15, ttl: 0, noClose: true });
  try {
    const next = await resyncDoc(d.doc_id);
    // Preserve client-side fields not returned by the server.
    const idx = docs.findIndex((x) => x.doc_id === d.doc_id);
    if (idx >= 0) docs[idx] = { ...d, ...next, updated_at: Date.now() };
    rerender();
    t.update({ tone: 'success', title: '已重新同步', msg: `「${d.title}」已從 Google Docs 更新`, progress: 1, ttl: 3000, noClose: false });
    setTimeout(t.close, 3000);
  } catch (err) {
    const { title, msg } = classifyError(err);
    t.update({ tone: 'error', title, msg, progress: 1, ttl: 5000, noClose: false });
    setTimeout(t.close, 5000);
  }
}
async function toggleDocPublish(d: Doc): Promise<void> {
  const next: PubState = d.state === 'public' ? 'draft' : 'public';
  try {
    await patchDoc(d.doc_id, { is_public: next === 'public' ? 1 : 0 });
    d.state = next;
    rerender();
    toast.notify({ tone: 'success', title: next === 'public' ? '已設為公開' : '已設為草稿', msg: d.title, ttl: 2400 });
  } catch (err) {
    const { title, msg } = classifyError(err);
    toast.notify({ tone: 'error', title, msg, ttl: 4000 });
  }
}
function copyLink(url: string): void {
  try { void navigator.clipboard?.writeText(url); } catch { /* fall through */ }
  toast.notify({ tone: 'success', title: '已複製分享連結', msg: url, ttl: 3000 });
}
function removeDocConfirm(d: Doc): void {
  showConfirm({
    title: '刪除文件',
    message: '刪除後無法復原。',
    danger: true,
    confirmLabel: '永久刪除',
    lossItems: [
      h('span', {}, '文件 ', h('b', {}, `「${d.title}」`)),
      d.playlist_count > 0
        ? h('span', {}, '將從 ', h('b', {}, String(d.playlist_count)), ' 個播放清單中移除')
        : '尚未加入任何播放清單',
    ],
    onCancel: () => { /* dismissal handled by modal */ },
    onConfirm: async () => {
      try {
        await deleteDoc(d.doc_id);
        docs = docs.filter((x) => x.doc_id !== d.doc_id);
        for (const p of playlists) p.members = p.members.filter((m) => m !== d.doc_id);
        recomputePlaylistCounts();
        rerender();
        toast.notify({ tone: 'success', title: '已刪除文件', msg: d.title, ttl: 3000 });
      } catch (err) {
        const { title, msg } = classifyError(err);
        toast.notify({ tone: 'error', title, msg, ttl: 4500 });
      }
    },
  });
}
function editDoc(d: Doc): void {
  showEditDrawer({
    doc: d,
    onClose: () => { /* drawer self-removes */ },
    onSave: async (nd: Doc) => {
      const payload = {
        title: nd.title,
        presentation_date: nd.presentation_date
          ? new Date(nd.presentation_date).toISOString().slice(0, 10)
          : '',
        unit_report: nd.reporters ?? [],
      };
      try {
        await saveEditData(d.doc_id, payload);
        const idx = docs.findIndex((x) => x.doc_id === d.doc_id);
        if (idx >= 0) docs[idx] = { ...d, ...nd, updated_at: Date.now() };
        rerender();
        toast.notify({ tone: 'success', title: '已儲存文件資訊', msg: nd.title, ttl: 2600 });
      } catch (err) {
        const { title, msg } = classifyError(err);
        toast.notify({ tone: 'error', title, msg, ttl: 4500 });
      }
    },
    onOpenExternal: (doc) => { window.open(`/edit/?src=${encodeURIComponent(doc.doc_id)}`, '_blank'); },
  });
  // EditDrawer expects doc.presentation_date / doc.reporters — hydrate on
  // open if we haven't fetched them yet (server returns them on /api/edit).
  if (d.presentation_date == null || d.reporters == null) {
    void (async () => {
      try {
        const ed = await getEditData(d.doc_id);
        d.presentation_date = ed.presentation_date ? Date.parse(ed.presentation_date) : null;
        d.reporters = ed.unit_report ?? [];
        // The drawer rendered with stale doc; user will see fresh values on
        // their next interaction. Cheap enough to skip re-rendering the open
        // drawer — the server values are also re-fetched on the next open.
      } catch { /* swallow */ }
    })();
  }
}

// ── Playlist actions ────────────────────────────────────────────────────
function openPlaylistViewer(p: Playlist): void {
  window.open(viewerUrlForPlaylist(p.id), '_blank');
}
async function togglePlaylistPublish(p: Playlist): Promise<void> {
  const next: PubState = p.state === 'public' ? 'draft' : 'public';
  try {
    await patchPlaylist(p.id, { is_public: next === 'public' ? 1 : 0 });
    p.state = next;
    rerender();
    toast.notify({ tone: 'success', title: next === 'public' ? '已設為公開' : '已設為草稿', msg: p.title, ttl: 2400 });
  } catch (err) {
    const { title, msg } = classifyError(err);
    toast.notify({ tone: 'error', title, msg, ttl: 4000 });
  }
}
function removePlaylistConfirm(p: Playlist): void {
  showConfirm({
    title: '刪除播放清單',
    message: '只會刪除這份清單，當中的文件不受影響。',
    danger: true,
    confirmLabel: '永久刪除',
    lossItems: [
      h('span', {}, '播放清單 ', h('b', {}, `「${p.title}」`)),
      h('span', {}, '包含 ', h('b', {}, String(p.members.length)), ' 份文件的排序'),
    ],
    onCancel: () => { /* */ },
    onConfirm: async () => {
      try {
        await deletePlaylist(p.id);
        playlists = playlists.filter((x) => x.id !== p.id);
        recomputePlaylistCounts();
        rerender();
        toast.notify({ tone: 'success', title: '已刪除播放清單', msg: p.title, ttl: 3000 });
      } catch (err) {
        const { title, msg } = classifyError(err);
        toast.notify({ tone: 'error', title, msg, ttl: 4500 });
      }
    },
  });
}
function openComposer(p: (Playlist & { _new?: boolean }) | null): void {
  const seed: Playlist & { _new?: boolean } = p ?? {
    id: 'pl_' + Date.now(),
    title: '',
    state: 'draft',
    updated_at: Date.now(),
    members: [],
    _new: true,
  };
  const host = PlaylistComposer({
    playlist: seed,
    allDocs: docs,
    onClose: () => { host.dispatchEvent(new Event('composer:dispose')); host.remove(); },
    onOpen: (pl) => openPlaylistViewer(pl),
    onSave: async (saved) => {
      try {
        if (seed._new) {
          const created = await createPlaylist({ title: saved.title, doc_ids: saved.members, is_public: saved.state === 'public' ? 1 : 0 });
          playlists = [created, ...playlists];
          toast.notify({ tone: 'success', title: '已建立播放清單', msg: created.title, ttl: 2600 });
        } else {
          await patchPlaylist(seed.id, { title: saved.title, doc_ids: saved.members, is_public: saved.state === 'public' ? 1 : 0 });
          const idx = playlists.findIndex((x) => x.id === seed.id);
          if (idx >= 0) playlists[idx] = { ...playlists[idx], ...saved, updated_at: Date.now() };
          toast.notify({ tone: 'success', title: '已儲存播放清單', msg: saved.title, ttl: 2600 });
        }
        recomputePlaylistCounts();
        host.dispatchEvent(new Event('composer:dispose'));
        host.remove();
        rerender();
      } catch (err) {
        const { title, msg } = classifyError(err);
        toast.notify({ tone: 'error', title, msg, ttl: 4500 });
      }
    },
  });
  document.body.appendChild(host);
}

// ── Bulk actions ────────────────────────────────────────────────────────
const docBulk = {
  setPublic: (items: Doc[]) => runBulk(items, '批次設為公開', async (d) => {
    await patchDoc(d.doc_id, { is_public: 1 });
    d.state = 'public';
    rerender();
  }),
  setDraft: (items: Doc[]) => runBulk(items, '批次設為草稿', async (d) => {
    await patchDoc(d.doc_id, { is_public: 0 });
    d.state = 'draft';
    rerender();
  }),
  remove: (items: Doc[]) => {
    const totalImpact = items.reduce((s, d) => s + d.playlist_count, 0);
    showConfirm({
      title: `刪除 ${items.length} 份文件`,
      message: '刪除後無法復原。',
      danger: true,
      confirmLabel: `刪除 ${items.length} 份`,
      lossItems: [
        h('span', {}, h('b', {}, String(items.length)), ' 份文件將被永久刪除'),
        totalImpact > 0
          ? h('span', {}, '並從相關播放清單中移除 ', h('b', {}, String(totalImpact)), ' 處引用')
          : '不影響任何播放清單',
      ],
      onCancel: () => { /* */ },
      onConfirm: () => {
        void runBulk(items, '批次刪除', async (d) => {
          await deleteDoc(d.doc_id);
          docs = docs.filter((x) => x.doc_id !== d.doc_id);
          for (const p of playlists) p.members = p.members.filter((m) => m !== d.doc_id);
        }).then(() => { recomputePlaylistCounts(); listStates.docs.selection.clear(); rerender(); });
      },
    });
  },
};
const playlistBulk = {
  setPublic: (items: Playlist[]) => runBulk(items, '批次設為公開', async (p) => {
    await patchPlaylist(p.id, { is_public: 1 });
    p.state = 'public';
    rerender();
  }),
  setDraft: (items: Playlist[]) => runBulk(items, '批次設為草稿', async (p) => {
    await patchPlaylist(p.id, { is_public: 0 });
    p.state = 'draft';
    rerender();
  }),
  remove: (items: Playlist[]) => {
    showConfirm({
      title: `刪除 ${items.length} 個播放清單`,
      message: '只會刪除清單本身，文件不受影響。',
      danger: true,
      confirmLabel: `刪除 ${items.length} 個`,
      lossItems: [h('span', {}, h('b', {}, String(items.length)), ' 個播放清單將被永久刪除')],
      onCancel: () => { /* */ },
      onConfirm: () => {
        void runBulk(items, '批次刪除', async (p) => {
          await deletePlaylist(p.id);
          playlists = playlists.filter((x) => x.id !== p.id);
        }).then(() => { recomputePlaylistCounts(); listStates.playlists.selection.clear(); rerender(); });
      },
    });
  },
};

// ── ListView column / cell defs ─────────────────────────────────────────
const docColumns: ListViewProps<Doc>['columns'] = [
  { key: 'title', label: '文件標題', sortable: true },
  { key: 'state', label: '狀態' },
  { key: 'playlist_count', label: '播放清單', sortable: true },
  { key: 'updated', label: '最後更新', sortable: true },
];
function renderDocCells(d: Doc, ctx: { query: string }): Node[] {
  const titleCell = h('td', {},
    h('div', { class: 'cell-title' },
      h('span', { class: 'doc-ic' }, Icon('file', { size: 18 })),
      h('div', { class: 't-main' },
        h('div', { class: 't-name' }, ...Highlight(d.title, ctx.query)),
        h('div', { class: 't-id' }, ...Highlight(d.doc_id, ctx.query)),
      ),
    ),
  );
  const stateCell = h('td', {}, StateBadge({ state: d.state, as: 'button', onClick: () => void toggleDocPublish(d) }));
  const plCell = h('td', {},
    h('span', { class: `pl-count ${d.playlist_count === 0 ? 'zero' : ''}` },
      Icon('list', { size: 15 }),
      String(d.playlist_count),
    ),
  );
  const updatedCell = h('td', {},
    h('span', { class: 'cell-meta', title: fullDate(d.updated_at) }, relTime(d.updated_at)),
  );
  return [titleCell, stateCell, plCell, updatedCell];
}
const docPrimary: PrimaryActions<Doc> = {
  inline: (d) => [
    h('button',
      { class: 'iconbtn', title: '在檢視器開啟', 'aria-label': '開啟',
        onClick: (e: Event) => { e.stopPropagation(); openDocViewer(d); } },
      Icon('external', { size: 17 }),
    ),
    h('button',
      { class: 'iconbtn opt-hide', title: '重新同步', 'aria-label': '重新同步',
        onClick: (e: Event) => { e.stopPropagation(); void doResync(d); } },
      Icon('refresh', { size: 17 }),
    ),
  ],
  edit: editDoc,
  resync: (d) => void doResync(d),
  togglePublish: (d) => void toggleDocPublish(d),
  copyUrl: (d) => copyLink(viewerUrlForDoc(d.doc_id)),
  remove: removeDocConfirm,
};
const docMenu = (d: Doc): MenuItem[] => [
  { icon: 'external', label: '在檢視器開啟', onClick: () => openDocViewer(d) },
  { icon: 'pencil', label: '編輯資訊', kbd: 'E', onClick: () => editDoc(d) },
  { icon: 'refresh', label: '重新同步', kbd: 'R', onClick: () => void doResync(d) },
  { icon: 'link', label: '複製分享連結', kbd: 'C', onClick: () => copyLink(viewerUrlForDoc(d.doc_id)) },
  { sep: true },
  d.state === 'public'
    ? { icon: 'eyeOff', label: '設為草稿', kbd: 'P', onClick: () => void toggleDocPublish(d) }
    : { icon: 'globe', label: '設為公開', kbd: 'P', onClick: () => void toggleDocPublish(d) },
  { sep: true },
  { icon: 'trash', label: '刪除文件', danger: true, onClick: () => removeDocConfirm(d) },
];

const playlistColumns: ListViewProps<Playlist>['columns'] = [
  { key: 'title', label: '播放清單', sortable: true },
  { key: 'state', label: '狀態' },
  { key: 'count', label: '文件數', sortable: true },
  { key: 'updated', label: '最後更新', sortable: true },
];
function renderPlaylistCells(p: Playlist, ctx: { query: string }): Node[] {
  const titleCell = h('td', {},
    h('div', { class: 'cell-title' },
      h('span', { class: 'doc-ic', style: { color: 'var(--primary)' } }, Icon('list', { size: 18 })),
      h('div', { class: 't-main' },
        h('div', { class: 't-name' }, ...Highlight(p.title, ctx.query)),
      ),
    ),
  );
  const stateCell = h('td', {}, StateBadge({ state: p.state, as: 'button', onClick: () => void togglePlaylistPublish(p) }));
  const countCell = h('td', {},
    h('span', { class: 'pl-count' }, Icon('file', { size: 15 }), String(p.members.length)),
  );
  const updatedCell = h('td', {},
    h('span', { class: 'cell-meta', title: fullDate(p.updated_at) }, relTime(p.updated_at)),
  );
  return [titleCell, stateCell, countCell, updatedCell];
}
const playlistPrimary: PrimaryActions<Playlist> = {
  inline: (p) => [
    h('button',
      { class: 'iconbtn', title: '播放', 'aria-label': '播放',
        onClick: (e: Event) => { e.stopPropagation(); openPlaylistViewer(p); } },
      Icon('play', { size: 17 }),
    ),
    h('button',
      { class: 'iconbtn opt-hide', title: '編輯', 'aria-label': '編輯',
        onClick: (e: Event) => { e.stopPropagation(); openComposer(p); } },
      Icon('pencil', { size: 16 }),
    ),
  ],
  edit: (p) => openComposer(p),
  togglePublish: (p) => void togglePlaylistPublish(p),
  copyUrl: (p) => copyLink(viewerUrlForPlaylist(p.id)),
  remove: removePlaylistConfirm,
};
const playlistMenu = (p: Playlist): MenuItem[] => [
  { icon: 'play', label: '在檢視器播放', onClick: () => openPlaylistViewer(p) },
  { icon: 'pencil', label: '編輯清單', kbd: 'E', onClick: () => openComposer(p) },
  { icon: 'link', label: '複製分享連結', kbd: 'C', onClick: () => copyLink(viewerUrlForPlaylist(p.id)) },
  { sep: true },
  p.state === 'public'
    ? { icon: 'eyeOff', label: '設為草稿', kbd: 'P', onClick: () => void togglePlaylistPublish(p) }
    : { icon: 'globe', label: '設為公開', kbd: 'P', onClick: () => void togglePlaylistPublish(p) },
  { sep: true },
  { icon: 'trash', label: '刪除清單', danger: true, onClick: () => removePlaylistConfirm(p) },
];

// ── Match + sort helpers ────────────────────────────────────────────────
const matchDoc = (d: Doc, q: string): boolean =>
  d.title.toLowerCase().includes(q) || d.doc_id.toLowerCase().includes(q);
const matchPlaylist = (p: Playlist, q: string): boolean => p.title.toLowerCase().includes(q);
const sortDoc: Record<string, (a: Doc, b: Doc) => number> = {
  title: (a, b) => a.title.localeCompare(b.title, 'zh-Hant'),
  updated: (a, b) => a.updated_at - b.updated_at,
  playlist_count: (a, b) => a.playlist_count - b.playlist_count,
};
const sortPlaylist: Record<string, (a: Playlist, b: Playlist) => number> = {
  title: (a, b) => a.title.localeCompare(b.title, 'zh-Hant'),
  updated: (a, b) => a.updated_at - b.updated_at,
  count: (a, b) => a.members.length - b.members.length,
};

// ── Empty-state factories ───────────────────────────────────────────────
function docEmpty(q: string): HTMLElement {
  if (q) {
    return h('div', { class: 'empty' },
      h('div', { class: 'empty-card' },
        h('div', { class: 'empty-ic' }, Icon('search', { size: 26 })),
        h('h3', {}, `找不到符合「${q}」的文件`),
        h('p', {}, '試試其他關鍵字，或清除搜尋條件再看看完整清單。'),
        h('button', { class: 'btn', onClick: () => { listStates.docs.query = ''; rerender(); } }, '清除搜尋'),
      ),
    );
  }
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-card' },
      h('div', { class: 'empty-ic' }, Icon('inbox', { size: 28 })),
      h('h3', {}, '還沒有任何文件'),
      h('p', {}, '文件來自 Google Docs。貼上一份文件的分享連結，系統會自動轉換成可播放的簡報。'),
      h('button',
        { class: 'btn primary', onClick: openImportFlow },
        Icon('plus', { size: 16 }), '匯入第一份文件',
      ),
    ),
  );
}
function playlistEmpty(q: string): HTMLElement {
  if (q) {
    return h('div', { class: 'empty' },
      h('div', { class: 'empty-card' },
        h('div', { class: 'empty-ic' }, Icon('search', { size: 26 })),
        h('h3', {}, `找不到符合「${q}」的播放清單`),
        h('p', {}, '試試其他關鍵字，或清除搜尋條件。'),
        h('button', { class: 'btn', onClick: () => { listStates.playlists.query = ''; rerender(); } }, '清除搜尋'),
      ),
    );
  }
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-card' },
      h('div', { class: 'empty-ic' }, Icon('layers', { size: 28 })),
      h('h3', {}, '還沒有播放清單'),
      h('p', {}, '把多份文件組成一個清單，檢視器就能依序連續播放。'),
      h('button',
        { class: 'btn primary', onClick: () => openComposer(null) },
        Icon('plus', { size: 16 }), '建立播放清單',
      ),
    ),
  );
}

// ── Import flow ─────────────────────────────────────────────────────────
function openImportFlow(): void {
  showImport({
    existingIds: docs.map((d) => d.doc_id),
    onClose: () => { /* */ },
    onImported: async () => {
      // Real importer ran inside showImport already; refresh the list so
      // the new doc lands with the canonical server-side fields.
      try {
        const fresh = await listDocs();
        docs = fresh;
        recomputePlaylistCounts();
        rerender();
      } catch (err) {
        const { title, msg } = classifyError(err);
        toast.notify({ tone: 'caution', title: '匯入成功但列表未更新', msg: `${title}：${msg}`, ttl: 4000 });
      }
    },
    importer: async (idOrUrl) => {
      const d = await importDoc(idOrUrl);
      return { doc_id: d.doc_id, title: d.title };
    },
    errorClassifier: classifyError,
  });
}

// ── Top bar + view switcher ─────────────────────────────────────────────
function renderTopBar(): HTMLElement {
  return h('header', { class: 'topbar' },
    h('div', { class: 'brand' },
      h('div', { class: 'brand-mark' }, Icon('layers', { size: 18, strokeWidth: 2 })),
      h('div', {},
        h('div', { class: 'brand-name' }, '慈濟簡報系統'),
        h('div', { class: 'brand-sub' }, 'MasterSlides'),
      ),
    ),
    h('div', { class: 'viewseg', role: 'tablist', style: { marginLeft: '8px' } },
      h('button',
        { role: 'tab', 'aria-selected': view === 'docs', onClick: () => switchView('docs') },
        Icon('file', { size: 16 }), '文件', h('span', { class: 'seg-count' }, String(docs.length)),
      ),
      h('button',
        { role: 'tab', 'aria-selected': view === 'playlists', onClick: () => switchView('playlists') },
        Icon('list', { size: 16 }), '播放清單', h('span', { class: 'seg-count' }, String(playlists.length)),
      ),
    ),
    h('div', { class: 'topbar-spacer' }),
    view === 'docs'
      ? h('button', { class: 'btn primary', onClick: openImportFlow }, Icon('plus', { size: 16 }), '匯入文件')
      : h('button', { class: 'btn primary', onClick: () => openComposer(null) }, Icon('plus', { size: 16 }), '新增清單'),
    h('button',
      { class: 'btn icon', title: '鍵盤快捷鍵 (?)', 'aria-label': '鍵盤快捷鍵',
        onClick: () => showKeyboardHelp({ onClose: () => { /* self-removes */ } }) },
      Icon('keyboard', { size: 18 }),
    ),
    h('button',
      { class: `btn icon ${tweaksOpen ? 'primary' : ''}`, title: '顯示設定', 'aria-label': '設定',
        onClick: toggleTweaks },
      Icon('sliders', { size: 18 }),
    ),
  );
}
function switchView(v: View): void {
  if (view === v) return;
  view = v;
  rerender();
}

// ── First-run hint ──────────────────────────────────────────────────────
function renderHint(): HTMLElement | null {
  if (hintDismissed || loading || view !== 'docs' || docs.length === 0) return null;
  return h('div', { class: 'hint' },
    h('span', { class: 'h-ic' }, Icon('info', { size: 18 })),
    h('div', { class: 'h-body' },
      h('b', {}, '文件從哪裡來？'),
      ' 每一份文件都是一份 Google 文件，匯入後轉換為直書（vertical-rl）簡報。更新原始 Google 文件後，點 ',
      Icon('refresh', { size: 13, style: { verticalAlign: '-2px' } }),
      ' 重新同步即可更新簡報內容。',
    ),
    h('button',
      { class: 'iconbtn h-close', 'aria-label': '不再顯示',
        onClick: () => { hintDismissed = true; lsSet(LS.hint, true); rerender(); } },
      Icon('x', { size: 16 }),
    ),
  );
}

// ── Tweaks panel ────────────────────────────────────────────────────────
function toggleTweaks(): void {
  if (tweaksOpen) closeTweaks(); else openTweaks();
}
function openTweaks(): void {
  if (tweaksHostEl) return;
  tweaksOpen = true;
  tweaksHostEl = showTweaksPanel({
    theme, setTheme: (t) => { setTheme(t); },
    density, setDensity: (d) => { setDensity(d); },
    accent, setAccent: (a) => { setAccent(a); },
    onClose: closeTweaks,
  });
  document.body.appendChild(tweaksHostEl);
  rerender();
}
function closeTweaks(): void {
  tweaksOpen = false;
  if (tweaksHostEl) { tweaksHostEl.remove(); tweaksHostEl = null; }
  rerender();
}

// ── Main render ─────────────────────────────────────────────────────────
const root = document.getElementById('root');
if (!root) throw new Error('admin: #root missing from index.html');

const appShell = h('div', { class: 'app-root' });
root.appendChild(appShell);

function rerender(): void {
  const topBar = renderTopBar();
  const main = h('main', { class: 'content' });

  const hint = renderHint();
  if (hint) main.appendChild(hint);

  if (view === 'docs') {
    const props: ListViewProps<Doc> = {
      kind: 'docs',
      items: docs,
      columns: docColumns,
      matchFn: matchDoc,
      sortFns: sortDoc,
      renderCells: renderDocCells,
      primaryActions: docPrimary,
      menuActions: docMenu,
      onActivate: openDocViewer,
      bulkActions: docBulk,
      state: listStates.docs,
      setState: (patchOrFn) => {
        const cur = listStates.docs;
        const next = typeof patchOrFn === 'function' ? patchOrFn(cur) : { ...cur, ...patchOrFn };
        listStates.docs = next;
      },
      perPage: listStates.docs.perPage,
      emptyState: docEmpty,
      filterPlaceholder: '依標題或文件 ID 篩選…',
      registerFilterFocus: (fn) => { focusFilter = fn; },
      isTouch,
      loading,
    };
    main.appendChild(ListView(props));
  } else {
    const props: ListViewProps<Playlist> = {
      kind: 'playlists',
      items: playlists,
      columns: playlistColumns,
      matchFn: matchPlaylist,
      sortFns: sortPlaylist,
      renderCells: renderPlaylistCells,
      primaryActions: playlistPrimary,
      menuActions: playlistMenu,
      onActivate: openPlaylistViewer,
      bulkActions: playlistBulk,
      state: listStates.playlists,
      setState: (patchOrFn) => {
        const cur = listStates.playlists;
        const next = typeof patchOrFn === 'function' ? patchOrFn(cur) : { ...cur, ...patchOrFn };
        listStates.playlists = next;
      },
      perPage: listStates.playlists.perPage,
      emptyState: playlistEmpty,
      filterPlaceholder: '依標題篩選…',
      registerFilterFocus: (fn) => { focusFilter = fn; },
      isTouch,
      loading,
    };
    main.appendChild(ListView(props));
  }

  mount(appShell, [topBar, main]);
}

// ── Global hotkeys: / focus search, ? help, g switch view ───────────────
window.addEventListener('keydown', (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase() ?? '';
  const typing = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable === true;
  // Don't intercept while a modal/drawer is open — those handle their own
  // Escape; for `/` / `?` / `g` we still want focus to land in the table.
  const anyOverlay = !!document.querySelector('.scrim, .drawer, .composer-host');
  if (typing) {
    if (e.key === 'Escape') (e.target as HTMLElement).blur();
    return;
  }
  if (e.key === '/') { e.preventDefault(); focusFilter?.(); }
  else if (e.key === '?') { e.preventDefault(); if (!anyOverlay) showKeyboardHelp({ onClose: () => { /* */ } }); }
  else if (e.key === 'g' && !anyOverlay) { e.preventDefault(); switchView(view === 'docs' ? 'playlists' : 'docs'); }
});

// ── Boot ────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  rerender(); // initial skeleton with loading=true
  try {
    const [d, p] = await Promise.all([listDocs(), listPlaylists()]);
    docs = d;
    playlists = p;
    recomputePlaylistCounts();
    loading = false;
    rerender();
  } catch (err) {
    loading = false;
    const { title, msg } = classifyError(err);
    toast.notify({ tone: 'error', title: '載入失敗', msg: `${title}：${msg}`, ttl: 0 });
    rerender();
  }
}

void boot();
