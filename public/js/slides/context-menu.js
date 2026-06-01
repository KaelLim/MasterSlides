import { toggleFullscreen } from './display.js';
import { isVerticalMode } from './navigation.js';
import { setVerticalMode, setHorizontalMode } from './display.js';
import { openRemoteModal } from './remote.js';
import { openSearch } from './search.js';
import { exportPDF } from './print.js';
import { toggleLaser } from './laser.js';
import { showHelpModal } from './modals.js';

const ICONS = {
  spotlight: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><line x1="12" y1="2" x2="12" y2="5"></line><line x1="12" y1="19" x2="12" y2="22"></line><line x1="2" y1="12" x2="5" y2="12"></line><line x1="19" y1="12" x2="22" y2="12"></line></svg>',
  search: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  pdf: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><polyline points="9 15 12 18 15 15"></polyline></svg>',
  remote: '<svg width="28" height="28" viewBox="0 -960 960 960" fill="currentColor"><path d="M320-40q-33 0-56.5-23.5T240-120v-720q0-33 23.5-56.5T320-920h320q33 0 56.5 23.5T720-840v720q0 33-23.5 56.5T640-40H320Zm0-80h320v-720H320v720Zm160-440q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0-80q-17 0-28.5-11.5T440-680q0-17 11.5-28.5T480-720q17 0 28.5 11.5T520-680q0 17-11.5 28.5T480-640Zm-80 240q17 0 28.5-11.5T440-440q0-17-11.5-28.5T400-480q-17 0-28.5 11.5T360-440q0 17 11.5 28.5T400-400Zm160 0q17 0 28.5-11.5T600-440q0-17-11.5-28.5T560-480q-17 0-28.5 11.5T520-440q0 17 11.5 28.5T560-400ZM400-280q17 0 28.5-11.5T440-320q0-17-11.5-28.5T400-360q-17 0-28.5 11.5T360-320q0 17 11.5 28.5T400-280Zm160 0q17 0 28.5-11.5T600-320q0-17-11.5-28.5T560-360q-17 0-28.5 11.5T520-320q0 17 11.5 28.5T560-280ZM400-160q17 0 28.5-11.5T440-200q0-17-11.5-28.5T400-240q-17 0-28.5 11.5T360-200q0 17 11.5 28.5T400-160Zm160 0q17 0 28.5-11.5T600-200q0-17-11.5-28.5T560-240q-17 0-28.5 11.5T520-200q0 17 11.5 28.5T560-160Zm-240 40v-720 720Z"/></svg>',
  orientation: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><polyline points="7 8 3 12 7 16"></polyline><polyline points="17 8 21 12 17 16"></polyline></svg>',
  fullscreen: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>',
  help: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
};

const MENU_ITEMS = [
  { id: 'ctx-spotlight', icon: ICONS.spotlight, label: '聚光燈', action: () => toggleLaser() },
  { id: 'ctx-search', icon: ICONS.search, label: '文字搜尋', action: () => openSearch() },
  { id: 'ctx-pdf', icon: ICONS.pdf, label: '匯出 PDF', action: () => exportPDF() },
  { id: 'ctx-remote', icon: ICONS.remote, label: '遙控器', action: () => openRemoteModal() },
  { divider: true },
  { id: 'ctx-orientation', icon: ICONS.orientation, label: '', action: () => {
    if (isVerticalMode()) setHorizontalMode();
    else setVerticalMode();
  }},
  { id: 'ctx-fullscreen', icon: ICONS.fullscreen, label: '全螢幕', action: () => toggleFullscreen() },
  { divider: true },
  { id: 'ctx-help', icon: ICONS.help, label: '快捷鍵說明', action: () => showHelpModal() }
];

let menu = null;
let longPressTimer = null;
const LONG_PRESS_DURATION = 600; // ms

function getOrientationLabel() {
  return isVerticalMode() ? '切換為橫書' : '切換為直書';
}

function buildMenu() {
  menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.id = 'contextMenu';

  MENU_ITEMS.forEach(item => {
    if (item.divider) {
      const div = document.createElement('div');
      div.className = 'context-menu-divider';
      menu.appendChild(div);
      return;
    }

    const btn = document.createElement('button');
    btn.className = 'context-menu-item';
    btn.id = item.id;
    btn.innerHTML = `<span class="context-menu-icon">${item.icon}</span><span class="context-menu-label">${item.label}</span>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideMenu();
      item.action();
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
}

function showMenu(x, y) {
  if (!menu) buildMenu();

  // Update dynamic labels
  const orientationBtn = menu.querySelector('#ctx-orientation .context-menu-label');
  if (orientationBtn) orientationBtn.textContent = getOrientationLabel();

  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('active');

  // Adjust if menu overflows viewport
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = (x - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = (y - rect.height) + 'px';
    }
  });
}

function hideMenu() {
  if (menu) menu.classList.remove('active');
}

export function initContextMenu() {
  buildMenu();

  // Right-click
  document.addEventListener('contextmenu', (e) => {
    // Only intercept on content area / manuscript
    const target = e.target;
    if (target.closest('.sidebar') || target.closest('.help-modal') ||
        target.closest('.remote-modal') || target.closest('.goto-modal') ||
        target.closest('.search-bar')) {
      return; // Allow default context menu in UI panels
    }

    e.preventDefault();
    showMenu(e.clientX, e.clientY);
  });

  // Click elsewhere to close
  document.addEventListener('click', (e) => {
    if (menu && menu.classList.contains('active') && !menu.contains(e.target)) {
      hideMenu();
    }
  });

  // Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu && menu.classList.contains('active')) {
      hideMenu();
      e.stopPropagation();
    }
  }, true);

  // Long-press for touch devices
  document.addEventListener('touchstart', (e) => {
    const target = e.target;
    if (target.closest('.sidebar') || target.closest('.help-modal') ||
        target.closest('.remote-modal') || target.closest('.goto-modal') ||
        target.closest('.search-bar') || target.closest('.context-menu') ||
        target.closest('.slide-nav') || target.closest('.left-panel')) {
      return;
    }

    const touch = e.touches[0];
    const tx = touch.clientX;
    const ty = touch.clientY;

    longPressTimer = setTimeout(() => {
      showMenu(tx, ty);
    }, LONG_PRESS_DURATION);
  }, { passive: true });

  document.addEventListener('touchmove', () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }, { passive: true });
}
