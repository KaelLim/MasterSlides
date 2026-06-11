import { state, dom } from './state.js';

// Callback to notify remote of lightbox state changes
export const lightboxCallbacks: { onStateChange: (() => void) | null } = { onStateChange: null };

function getPinchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function updateLightboxTransform(): void {
  dom.lightboxImg.style.transform = `translate(${state.lbPosX}px, ${state.lbPosY}px) scale(${state.lbZoom})`;
}

function showZoomInfo(): void {
  dom.lightboxZoomInfo.textContent = Math.round(state.lbZoom * 100) + '%';
  dom.lightboxZoomInfo.classList.add('show');
  setTimeout(() => dom.lightboxZoomInfo.classList.remove('show'), 1000);
}

export function setLightboxZoom(zoom: number): void {
  state.lbZoom = Math.max(0.5, Math.min(5, zoom));
  if (state.lbZoom <= 1) {
    state.lbPosX = 0;
    state.lbPosY = 0;
  }
  updateLightboxTransform();
  showZoomInfo();
  lightboxCallbacks.onStateChange?.();
}

export function resetLightboxZoom(): void {
  state.lbZoom = 1;
  state.lbPosX = 0;
  state.lbPosY = 0;
  updateLightboxTransform();
  showZoomInfo();
}

export function panLightbox(dx: number, dy: number): void {
  if (state.lbZoom <= 1) return;
  state.lbPosX += dx;
  state.lbPosY += dy;
  updateLightboxTransform();
}

export function openLightbox(src: string, caption: string): void {
  resetLightboxZoom();
  dom.lightboxImg.src = src;
  dom.lightboxCaption.textContent = caption || '';
  dom.lightbox.classList.add('active');
  lightboxCallbacks.onStateChange?.();
}

export function closeLightbox(): void {
  dom.lightbox.classList.remove('active');
  resetLightboxZoom();
  lightboxCallbacks.onStateChange?.();
}

export function initLightbox(): void {
  // Click image to open lightbox
  dom.manuscript.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement;
      openLightbox(img.src, img.alt);
    }
  });

  // Close button
  dom.lightboxClose.onclick = closeLightbox;

  // Click backdrop to close
  dom.lightbox.onclick = (e: MouseEvent) => {
    if (e.target === dom.lightbox) closeLightbox();
  };

  // Zoom buttons
  dom.zoomInBtn.onclick = () => setLightboxZoom(state.lbZoom + 0.25);
  dom.zoomOutBtn.onclick = () => setLightboxZoom(state.lbZoom - 0.25);
  dom.zoomResetBtn.onclick = resetLightboxZoom;

  // Mouse wheel zoom
  dom.lightboxImg.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setLightboxZoom(state.lbZoom + delta);
  });

  // Prevent default image drag
  dom.lightboxImg.addEventListener('dragstart', (e: DragEvent) => e.preventDefault());

  // Mouse drag
  dom.lightboxImg.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    if (state.lbZoom > 1) {
      state.lbIsDragging = true;
      state.lbStartX = e.clientX - state.lbPosX;
      state.lbStartY = e.clientY - state.lbPosY;
      dom.lightboxImg.style.cursor = 'grabbing';
    }
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (state.lbIsDragging) {
      e.preventDefault();
      state.lbPosX = e.clientX - state.lbStartX;
      state.lbPosY = e.clientY - state.lbStartY;
      updateLightboxTransform();
    }
  });

  document.addEventListener('mouseup', () => {
    if (state.lbIsDragging) {
      state.lbIsDragging = false;
      dom.lightboxImg.style.cursor = state.lbZoom > 1 ? 'grab' : 'default';
    }
  });

  // Touch: double-tap to zoom
  dom.lightboxImg.addEventListener('touchend', (e: TouchEvent) => {
    const now = Date.now();
    if (now - state.lbLastTap < 300 && e.touches.length === 0) {
      e.preventDefault();
      if (state.lbZoom > 1) {
        resetLightboxZoom();
      } else {
        setLightboxZoom(2);
      }
    }
    state.lbLastTap = now;
  });

  // Touch: pinch zoom & drag
  dom.lightboxImg.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length === 2) {
      state.lbPinchStartDist = getPinchDistance(e.touches);
      state.lbPinchStartZoom = state.lbZoom;
    } else if (e.touches.length === 1 && state.lbZoom > 1) {
      state.lbIsDragging = true;
      state.lbStartX = e.touches[0].clientX - state.lbPosX;
      state.lbStartY = e.touches[0].clientY - state.lbPosY;
    }
  });

  dom.lightboxImg.addEventListener('touchmove', (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getPinchDistance(e.touches);
      const scale = dist / state.lbPinchStartDist;
      setLightboxZoom(state.lbPinchStartZoom * scale);
    } else if (e.touches.length === 1 && state.lbIsDragging) {
      e.preventDefault();
      state.lbPosX = e.touches[0].clientX - state.lbStartX;
      state.lbPosY = e.touches[0].clientY - state.lbStartY;
      updateLightboxTransform();
    }
  });

  dom.lightboxImg.addEventListener('touchend', () => {
    state.lbIsDragging = false;
  });
}
