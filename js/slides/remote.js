import { state, dom, getRealtimeModule } from './state.js';
import { goToPage, prevPage, nextPage, isVerticalMode } from './navigation.js';
import { toggleFullscreen, setVerticalMode, setHorizontalMode, closeSidebar } from './display.js';
import { openLightbox, closeLightbox } from './lightbox.js';

export function getCurrentPageImages() {
  const containerWidth = dom.manuscriptContainer.clientWidth;
  const containerHeight = dom.manuscriptContainer.clientHeight;
  const images = dom.manuscript.querySelectorAll('img');
  const visibleImages = [];

  images.forEach(img => {
    const rect = img.getBoundingClientRect();
    const containerRect = dom.manuscriptContainer.getBoundingClientRect();

    const imgLeft = rect.left - containerRect.left;
    const imgTop = rect.top - containerRect.top;
    const imgRight = imgLeft + rect.width;
    const imgBottom = imgTop + rect.height;

    const visibleWidth = Math.min(imgRight, containerWidth) - Math.max(imgLeft, 0);
    const visibleHeight = Math.min(imgBottom, containerHeight) - Math.max(imgTop, 0);

    if (visibleWidth > rect.width * 0.5 && visibleHeight > rect.height * 0.5) {
      // Skip data URLs (table-converted images) — too large for broadcast
      if (img.src && !img.src.startsWith('data:')) {
        visibleImages.push({
          src: img.src,
          alt: img.alt || ''
        });
      }
    }
  });

  return visibleImages;
}

export async function syncRemoteState() {
  if (!state.roomId) return;
  const images = getCurrentPageImages();
  const rt = await getRealtimeModule();
  rt.syncState({
    currentPage: state.currentPage + 1,
    totalPages: state.totalPages,
    images
  });
}

export function openRemoteModal() {
  const modal = dom.remoteModal;
  const qrcodeEl = document.getElementById('qrcode');
  const urlEl = document.getElementById('remoteUrl');

  qrcodeEl.innerHTML = '';

  const host = window.location.hostname;
  const port = window.location.port;
  const remoteUrl = `http://${host}${port ? ':' + port : ''}/remote.html?id=${state.roomId}`;

  new QRCode(qrcodeEl, {
    text: remoteUrl,
    width: 200,
    height: 200
  });

  urlEl.textContent = remoteUrl;
  modal.classList.add('active');
  closeSidebar();
}

export function closeRemoteModal() {
  dom.remoteModal.classList.remove('active');
}

export async function initRemote() {
  state.roomId = Math.random().toString(36).substring(2, 8);

  const rt = await getRealtimeModule();
  await rt.createRoom(state.roomId, {
    onCommand: (payload) => {
      const action = payload.action;
      console.log('收到遙控指令:', action);

      switch (action) {
        case 'prev': prevPage(); break;
        case 'next': nextPage(); break;
        case 'first': goToPage(0); break;
        case 'last': goToPage(state.totalPages - 1); break;
        case 'fullscreen': toggleFullscreen(); break;
        case 'toggleMode':
          if (isVerticalMode()) { setHorizontalMode(); }
          else { setVerticalMode(); }
          break;
        case 'toggleLightbox':
          if (payload.src) {
            const caption = payload.alt || '';
            if (dom.lightbox.classList.contains('active')) {
              const currentSrc = dom.lightboxImg.src;
              const isSame = currentSrc && new URL(currentSrc, location.href).pathname === new URL(payload.src, location.href).pathname;
              if (isSame) { closeLightbox(); }
              else { openLightbox(payload.src, caption); }
            } else {
              openLightbox(payload.src, caption);
            }
          }
          break;
      }
      syncRemoteState();
    },
    onRemoteJoined: () => {
      document.getElementById('remoteStatus').textContent = '遙控器已連線！';
      document.getElementById('remoteStatus').classList.add('connected');
      syncRemoteState();
      setTimeout(() => { closeRemoteModal(); }, 2000);
    }
  });

  document.getElementById('remoteBtn').onclick = openRemoteModal;
  document.getElementById('remoteModalClose').onclick = closeRemoteModal;
  dom.remoteModal.onclick = (e) => {
    if (e.target === dom.remoteModal) closeRemoteModal();
  };
}
