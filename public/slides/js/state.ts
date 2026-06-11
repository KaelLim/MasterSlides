// Shared state and constants for slides viewer.

// Capped at 1.5 — above that the pretext-based paginator can't keep up with
// long headings + adjacent paragraphs without visible overflow.
export const FONT_SCALES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5] as const;
export const FONT_SCALE_MIN = 0.5;
export const FONT_SCALE_MAX = 1.5;

export const STORAGE_KEYS = {
  fontSize: 'slides-font-size',
  orientation: 'slides-orientation',
  fontFamily: 'slides-font-family',
  navHidden: 'slides-nav-hidden',
  tocDetailed: 'slides-toc-detailed',
} as const;

export const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
export const modKey: 'Cmd' | 'Ctrl' = isMac ? 'Cmd' : 'Ctrl';

export type WritingMode = 'vertical-rl' | 'horizontal-tb';

// Drust /records/playlists shape (subset the viewer actually reads).
export interface PlaylistState {
  id: string;
  title: string;
  doc_ids: string[];
}

// Mutable runtime state. Mutated in-place across modules; we never replace
// this object reference.
export interface State {
  currentPage: number;
  totalPages: number;
  fontScale: number;
  navHideTimeout: ReturnType<typeof setTimeout> | null;
  navPermanentlyHidden: boolean;
  // Playlist
  playlistDocs: string[];
  playlistIndex: number;
  // Remote
  roomId: string | null;
  // Lightbox
  lbZoom: number;
  lbPosX: number;
  lbPosY: number;
  lbIsDragging: boolean;
  lbStartX: number;
  lbStartY: number;
  lbPinchStartDist: number;
  lbPinchStartZoom: number;
  lbLastTap: number;
  currentWritingMode: WritingMode;
  allPageElements: Element[];
  currentSrc: string | null;
  playlistState: PlaylistState | null;
}

export const state: State = {
  currentPage: 0,
  totalPages: 1,
  fontScale: 1,
  navHideTimeout: null,
  navPermanentlyHidden: false,
  playlistDocs: [],
  playlistIndex: 0,
  roomId: null,
  lbZoom: 1,
  lbPosX: 0,
  lbPosY: 0,
  lbIsDragging: false,
  lbStartX: 0,
  lbStartY: 0,
  lbPinchStartDist: 0,
  lbPinchStartZoom: 1,
  lbLastTap: 0,
  currentWritingMode: 'vertical-rl',
  allPageElements: [],
  currentSrc: null,
  playlistState: null,
};

// Cached DOM element references. Lazy-filled by initDOM() at app start.
// Consumers run AFTER initDOM (the entry app.ts orchestrates the order), so
// we type as non-null and assert at fill time — any access before initDOM
// surfaces as a clear "Cannot read properties of undefined" instead of an
// implicit null deref pattern repeating in every consumer.
export interface DomCache {
  contentArea: HTMLElement;
  manuscriptContainer: HTMLElement;
  manuscript: HTMLElement;
  currentPageEl: HTMLElement;
  totalPagesEl: HTMLElement;
  fontSizeDisplayEl: HTMLElement;
  slideNav: HTMLElement;
  lightbox: HTMLElement;
  lightboxImg: HTMLImageElement;
  lightboxCaption: HTMLElement;
  lightboxZoomInfo: HTMLElement;
  lightboxClose: HTMLElement;
  zoomInBtn: HTMLButtonElement;
  zoomOutBtn: HTMLButtonElement;
  zoomResetBtn: HTMLButtonElement;
  sidebar: HTMLElement;
  sidebarOverlay: HTMLElement;
  hamburgerBtn: HTMLButtonElement;
  helpModal: HTMLElement;
  gotoModal: HTMLElement;
  gotoPageInput: HTMLInputElement;
  remoteModal: HTMLElement;
}

export const dom: DomCache = {} as DomCache;

// Strict getElementById helper: throws (instead of returning null) if the ID
// is missing. Kept private to state.ts; all caching happens here so consumer
// modules can treat dom.X as guaranteed-present.
function require$<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`initDOM: required element #${id} missing from page`);
  return el as T;
}

export function initDOM(): void {
  dom.contentArea = require$('contentArea');
  dom.manuscriptContainer = require$('manuscriptContainer');
  dom.manuscript = require$('manuscript');
  dom.currentPageEl = require$('currentPage');
  dom.totalPagesEl = require$('totalPages');
  dom.fontSizeDisplayEl = require$('fontSizeDisplay');
  dom.slideNav = require$('slideNav');
  dom.lightbox = require$('lightbox');
  dom.lightboxImg = require$<HTMLImageElement>('lightboxImg');
  dom.lightboxCaption = require$('lightboxCaption');
  dom.lightboxZoomInfo = require$('lightboxZoomInfo');
  dom.lightboxClose = require$('lightboxClose');
  dom.zoomInBtn = require$<HTMLButtonElement>('zoomInBtn');
  dom.zoomOutBtn = require$<HTMLButtonElement>('zoomOutBtn');
  dom.zoomResetBtn = require$<HTMLButtonElement>('zoomResetBtn');
  dom.sidebar = require$('sidebar');
  dom.sidebarOverlay = require$('sidebarOverlay');
  dom.hamburgerBtn = require$<HTMLButtonElement>('hamburgerBtn');
  dom.helpModal = require$('helpModal');
  dom.gotoModal = require$('gotoModal');
  dom.gotoPageInput = require$<HTMLInputElement>('gotoPageInput');
  dom.remoteModal = require$('remoteModal');
}
