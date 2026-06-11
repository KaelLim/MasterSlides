import { dom, modKey } from './state.js';
import { closeLightbox } from './lightbox.js';
import { closeGotoModal } from './goto.js';
import { closeSidebar } from './display.js';

export function updateModKeyDisplay(): void {
  document.querySelectorAll('.mod-key').forEach(el => { el.textContent = modKey; });
}

export function showHelpModal(): void {
  if (dom.helpModal) { dom.helpModal.classList.add('active'); closeSidebar(); }
}

export function closeHelpModal(): void {
  if (dom.helpModal) dom.helpModal.classList.remove('active');
}

// closeRemoteModal lives in remote-control.js (the modal is owned by the
// remote subsystem). modals.js holds the dispatch logic only.
let _closeRemoteModal: () => void = () => {};
export function registerRemoteModalCloser(fn: () => void): void { _closeRemoteModal = fn; }

export function closeAllModals(): void {
  if (dom.lightbox.classList.contains('active')) closeLightbox();
  else if (dom.remoteModal?.classList.contains('active')) _closeRemoteModal();
  else if (dom.gotoModal?.classList.contains('active')) closeGotoModal();
  else if (dom.helpModal?.classList.contains('active')) closeHelpModal();
  else if (dom.sidebar.classList.contains('open')) closeSidebar();
}

export function initHelpModal(): void {
  const closeBtn = document.querySelector<HTMLElement>('.help-modal-close');
  if (closeBtn) closeBtn.onclick = closeHelpModal;
  if (dom.helpModal) {
    dom.helpModal.onclick = (e: MouseEvent) => { if (e.target === dom.helpModal) closeHelpModal(); };
  }
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) helpBtn.onclick = showHelpModal;
}
