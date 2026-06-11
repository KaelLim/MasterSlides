// Shared types for the admin single-page app.

export type PubState = 'public' | 'draft';
export type View = 'docs' | 'playlists';
export type Theme = 'light' | 'dark' | 'system';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type Accent = 'blue' | 'indigo' | 'teal';
export type ToastTone = 'success' | 'caution' | 'error' | 'info';

// Domain — Doc shape is reconciled from /api/admin/docs (which returns
// is_public 0|1 + created_at) plus client-side derivation:
//   - state: derived from is_public
//   - updated_at: server doesn't yet return one — falls back to created_at
//   - playlist_count: computed by joining with /api/playlists
//   - presentation_date + reporters: fetched on demand from /api/edit/:doc_id
export interface Doc {
  doc_id: string;
  title: string;
  state: PubState;
  updated_at: number; // ms epoch
  created_at: number; // ms epoch
  playlist_count: number;
  presentation_date?: number | null;
  reporters?: string[];
}

export interface Playlist {
  id: string; // playlist row id (server-side numeric, stringified)
  title: string;
  state: PubState;
  updated_at: number;
  members: string[]; // ordered doc_id list
}

// ListView state — preserved across view switches so the user's last
// search/selection/scroll position survives.
export interface ListState {
  query: string;
  selection: Set<string>; // ids (doc_id or playlist id)
  page: number;
  sort: { key: string; dir: 'asc' | 'desc' } | null;
  scrollTop: number;
  perPage: number;
}

export interface ToastOpts {
  tone?: ToastTone;
  title?: string;
  msg?: string;
  retry?: () => void;
  ttl?: number; // ms; 0 = sticky
  noClose?: boolean;
  progress?: number; // 0..1
}

export interface ToastHandle {
  id: number;
  update: (patch: Partial<ToastOpts>) => void;
  close: () => void;
}

export interface MenuItem {
  icon?: string;
  label?: string;
  kbd?: string;
  danger?: boolean;
  sep?: boolean;
  onClick?: () => void;
}

export interface ConfirmOpts {
  title: string;
  message?: string;
  lossItems?: Array<string | Node>;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface PrimaryActions<T> {
  inline: (it: T) => Node | Node[];
  edit?: (it: T) => void;
  resync?: (it: T) => void;
  togglePublish: (it: T) => void;
  copyUrl: (it: T) => void;
  remove: (it: T) => void;
}
