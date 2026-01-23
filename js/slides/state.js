// Shared state and constants for slides viewer

export const FONT_SCALES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0];

export const STORAGE_KEYS = {
  fontSize: 'slides-font-size',
  orientation: 'slides-orientation',
  fontFamily: 'slides-font-family',
  navHidden: 'slides-nav-hidden'
};

export const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
export const modKey = isMac ? 'Cmd' : 'Ctrl';

// Mutable state
export const state = {
  currentPage: 0,
  totalPages: 1,
  fontScale: 1,
  navHideTimeout: null,
  navPermanentlyHidden: false,
  // Playlist
  playlistDocs: [],
  playlistIndex: 0,
  // Remote
  roomId: null,
  // Lightbox
  lbZoom: 1,
  lbPosX: 0,
  lbPosY: 0,
  lbIsDragging: false,
  lbStartX: 0,
  lbStartY: 0,
  lbPinchStartDist: 0,
  lbPinchStartZoom: 1,
  lbLastTap: 0
};

// Cached DOM elements (populated by initDOM)
export const dom = {};

export function initDOM() {
  dom.contentArea = document.getElementById('contentArea');
  dom.manuscriptContainer = document.getElementById('manuscriptContainer');
  dom.manuscript = document.getElementById('manuscript');
  dom.currentPageEl = document.getElementById('currentPage');
  dom.totalPagesEl = document.getElementById('totalPages');
  dom.fontSizeDisplayEl = document.getElementById('fontSizeDisplay');
  dom.slideNav = document.getElementById('slideNav');
  dom.lightbox = document.getElementById('lightbox');
  dom.lightboxImg = document.getElementById('lightboxImg');
  dom.lightboxCaption = document.getElementById('lightboxCaption');
  dom.lightboxZoomInfo = document.getElementById('lightboxZoomInfo');
  dom.sidebar = document.getElementById('sidebar');
  dom.sidebarOverlay = document.getElementById('sidebarOverlay');
  dom.hamburgerBtn = document.getElementById('hamburgerBtn');
  dom.helpModal = document.getElementById('helpModal');
  dom.gotoModal = document.getElementById('gotoModal');
  dom.gotoPageInput = document.getElementById('gotoPageInput');
  dom.remoteModal = document.getElementById('remoteModal');
}

// Supabase modules (lazy-loaded)
let supabaseClient = null;
let realtimeModule = null;

export async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const mod = await import('/js/supabase-client.js');
  supabaseClient = await mod.getSupabase();
  return supabaseClient;
}

export async function getRealtimeModule() {
  if (realtimeModule) return realtimeModule;
  realtimeModule = await import('/js/realtime.js');
  return realtimeModule;
}
