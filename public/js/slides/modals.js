import { dom, modKey } from './state.js';
import { closeSidebar } from './display.js';
import { closeLightbox } from './lightbox.js';
import { closeRemoteModal } from './remote.js';
import { closeGotoModal } from './goto.js';

export function showHelpModal() {
  if (dom.helpModal) {
    dom.helpModal.classList.add('active');
    closeSidebar();
  }
}

export function closeHelpModal() {
  if (dom.helpModal) {
    dom.helpModal.classList.remove('active');
  }
}

export function closeAllModals() {
  // Priority: lightbox → remote → goto → help → sidebar
  if (dom.lightbox.classList.contains('active')) {
    closeLightbox();
  } else if (dom.remoteModal && dom.remoteModal.classList.contains('active')) {
    closeRemoteModal();
  } else if (dom.gotoModal && dom.gotoModal.classList.contains('active')) {
    closeGotoModal();
  } else if (dom.helpModal && dom.helpModal.classList.contains('active')) {
    closeHelpModal();
  } else if (dom.sidebar.classList.contains('open')) {
    closeSidebar();
  }
}

export function updateModKeyDisplay() {
  const modKeys = document.querySelectorAll('.mod-key');
  modKeys.forEach(el => {
    el.textContent = modKey;
  });
}

export function initHelpModal() {
  const helpModalClose = document.querySelector('.help-modal-close');
  if (helpModalClose) {
    helpModalClose.onclick = closeHelpModal;
  }
  if (dom.helpModal) {
    dom.helpModal.onclick = (e) => {
      if (e.target === dom.helpModal) closeHelpModal();
    };
  }
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) {
    helpBtn.onclick = showHelpModal;
  }
}
