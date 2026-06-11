import { state, dom } from './state.js';
import { connectRoom } from './drust-broadcast.js';
import { goToPage, prevPage, nextPage, isVerticalMode, setWritingMode, repaginate } from './pagination.js';
import { closeLightbox, openLightbox, setLightboxZoom, resetLightboxZoom, panLightbox } from './lightbox.js';
import { searchFor, nextMatch, prevMatch, closeSearch, getSearchState } from './search.js';
import { toggleLaser, isLaserActive } from './laser.js';
import { toggleFullscreen, closeSidebar } from './display.js';
import { navigation } from './navigation.js';
import { registerRemoteModalCloser } from './modals.js';

interface RoomHandle {
  publish: (payload: unknown) => void | Promise<void>;
  stop: () => void;
}

interface RemoteImage {
  src: string;
  alt: string;
}

interface RemoteCommandPayload {
  type?: string;
  action?: string;
  src?: string;
  alt?: string;
  dx?: number;
  dy?: number;
  keyword?: string;
  page?: number;
}

let room: RoomHandle | null = null;
let roomChannel: string | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

function getCurrentPageImages(): RemoteImage[] {
  const containerWidth = dom.manuscriptContainer.clientWidth;
  const containerHeight = dom.manuscriptContainer.clientHeight;
  const images = dom.manuscript.querySelectorAll('img');
  const visible: RemoteImage[] = [];
  images.forEach((img: HTMLImageElement) => {
    const rect = img.getBoundingClientRect();
    const cRect = dom.manuscriptContainer.getBoundingClientRect();
    const iL = rect.left - cRect.left, iT = rect.top - cRect.top;
    const vW = Math.min(iL + rect.width, containerWidth) - Math.max(iL, 0);
    const vH = Math.min(iT + rect.height, containerHeight) - Math.max(iT, 0);
    if (!(vW > rect.width * 0.5 && vH > rect.height * 0.5 && img.src)) return;
    if (img.classList.contains('table-image')) {
      if (img.dataset.thumbSrc) visible.push({ src: img.dataset.thumbSrc, alt: img.alt || '' });
      return;
    }
    visible.push({ src: img.src, alt: img.alt || '' });
  });
  return visible;
}

function buildSyncPayload(): Record<string, unknown> {
  const searchState = getSearchState();
  return {
    type: 'sync',
    currentPage: state.currentPage + 1,
    totalPages: state.totalPages,
    images: getCurrentPageImages(),
    lightboxActive: dom.lightbox.classList.contains('active'),
    lightboxZoom: state.lbZoom,
    spotlightActive: isLaserActive(),
    ...searchState,
  };
}

function publishSync(): void {
  if (!room) return;
  room.publish(buildSyncPayload());
}

export function syncRemoteState(): void {
  if (syncTimer != null) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    publishSync();
  }, 50);
}

function handleRemoteCommand(payload: RemoteCommandPayload): void {
  const { action } = payload;
  const lightboxActive = dom.lightbox.classList.contains('active');
  switch (action) {
    case 'prev': lightboxActive ? closeLightbox() : prevPage(); break;
    case 'next': lightboxActive ? closeLightbox() : nextPage(); break;
    case 'first': lightboxActive ? closeLightbox() : goToPage(0); break;
    case 'last': lightboxActive ? closeLightbox() : goToPage(state.totalPages - 1); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'toggleMode':
      setWritingMode(isVerticalMode() ? 'horizontal-tb' : 'vertical-rl');
      state.currentPage = 0;
      repaginate();
      break;
    case 'toggleLightbox':
      if (payload.src) {
        if (lightboxActive) {
          const cur = dom.lightboxImg.src;
          const same = cur && new URL(cur, location.href).pathname === new URL(payload.src, location.href).pathname;
          same ? closeLightbox() : openLightbox(payload.src, payload.alt || '');
        } else openLightbox(payload.src, payload.alt || '');
      }
      break;
    case 'zoomIn': setLightboxZoom(state.lbZoom + 0.25); break;
    case 'zoomOut': setLightboxZoom(state.lbZoom - 0.25); break;
    case 'zoomReset': resetLightboxZoom(); break;
    case 'pan': panLightbox(payload.dx || 0, payload.dy || 0); break;
    case 'toggleSpotlight': toggleLaser(); break;
    case 'search': if (payload.keyword) searchFor(payload.keyword); break;
    case 'searchPrev': prevMatch(); break;
    case 'searchNext': nextMatch(); break;
    case 'searchClose': closeSearch(); break;
    case 'goto':
      if (payload.page !== undefined && payload.page >= 1 && payload.page <= state.totalPages) {
        if (lightboxActive) closeLightbox();
        goToPage(payload.page - 1);
      }
      break;
  }
  syncRemoteState();
}

function markRemoteConnected(): void {
  const status = document.getElementById('remoteStatus');
  if (status) {
    status.textContent = '遙控器已連線！';
    status.classList.add('connected');
  }
  setTimeout(closeRemoteModal, 2000);
}

function drustRoomFor(roomId: string): string {
  return `slides-${roomId}`;
}

export async function initRemote(): Promise<void> {
  if (!state.roomId) {
    state.roomId = Math.random().toString(36).substring(2, 8);
    navigation.onPageChange = syncRemoteState;
    document.getElementById('remoteBtn')!.onclick = openRemoteModal;
    document.getElementById('remoteModalClose')!.onclick = closeRemoteModal;
    document.getElementById('remoteCopyBtn')!.onclick = copyRemoteUrl;
    dom.remoteModal.onclick = (e: MouseEvent) => { if (e.target === dom.remoteModal) closeRemoteModal(); };
  }

  const channel = drustRoomFor(state.roomId);
  if (room != null) {
    if (roomChannel === channel) return;
    room.stop();
    room = null;
    roomChannel = null;
  }
  roomChannel = channel;
  room = await connectRoom(channel, {
    onMessage: (msg: unknown) => {
      if (!msg || typeof msg !== 'object') return;
      const m = msg as RemoteCommandPayload;
      switch (m.type) {
        case 'command': handleRemoteCommand(m); break;
        case 'phone-join':
          markRemoteConnected();
          publishSync();
          break;
      }
    },
  });
}

export function openRemoteModal(): void {
  const qrcodeEl = document.getElementById('qrcode')!;
  const copyBtn = document.getElementById('remoteCopyBtn') as HTMLElement;
  qrcodeEl.innerHTML = '';
  const host = window.location.hostname;
  const port = window.location.port;
  // NB: path is /remote/ (not /remote.html) after the Phase-6 reshuffle.
  const remoteUrl = `${location.protocol}//${host}${port ? ':' + port : ''}/remote/?id=${state.roomId}`;
  new QRCode(qrcodeEl, { text: remoteUrl, width: 200, height: 200 });
  copyBtn.dataset.url = remoteUrl;
  // Reset to default state in case the modal is reopened after a copy.
  resetCopyBtn(copyBtn);
  dom.remoteModal.classList.add('active');
  closeSidebar();
}

function resetCopyBtn(btn: HTMLElement): void {
  btn.classList.remove('copied');
  const label = btn.querySelector('.remote-copy-label');
  const icon = btn.querySelector('.remote-copy-icon use');
  if (label) label.textContent = '複製連結';
  if (icon) icon.setAttribute('href', '#icon-copy');
}

async function copyRemoteUrl(): Promise<void> {
  const btn = document.getElementById('remoteCopyBtn') as HTMLElement;
  const url = btn.dataset.url;
  if (!url) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      // Fallback for non-secure contexts (e.g. http LAN) — clipboard API is gated to HTTPS/localhost.
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    btn.classList.add('copied');
    btn.querySelector('.remote-copy-label')!.textContent = '已複製';
    btn.querySelector('.remote-copy-icon use')!.setAttribute('href', '#icon-check');
    setTimeout(() => resetCopyBtn(btn), 1500);
  } catch (err) {
    console.error('Failed to copy remote URL', err);
  }
}

export function closeRemoteModal(): void {
  dom.remoteModal.classList.remove('active');
}

// Register the modal closer with modals.js so closeAllModals can dispatch.
registerRemoteModalCloser(closeRemoteModal);
