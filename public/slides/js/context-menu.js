import { showHelpModal } from './modals.js';
import { openSearch } from './search.js';
import { toggleLaser } from './laser.js';
import { exportPDF } from './pdf-export.js';
import { openRemoteModal } from './remote-control.js';
import { toggleFullscreen } from './display.js';
import { isVerticalMode, setWritingMode, repaginate } from './pagination.js';
import { state } from './state.js';

const CTX_ICONS = {
  spotlight: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>',
  search: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  pdf: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>',
  remote: '<svg width="28" height="28" viewBox="0 -960 960 960" fill="currentColor"><path d="M320-40q-33 0-56.5-23.5T240-120v-720q0-33 23.5-56.5T320-920h320q33 0 56.5 23.5T720-840v720q0 33-23.5 56.5T640-40H320Zm0-80h320v-720H320v720Zm160-440q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Z"/></svg>',
  orientation: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/></svg>',
  fullscreen: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  help: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

function toggleOrientation() {
  // setWritingMode() now syncs the toggle buttons' .active + aria-pressed,
  // so callers only need to flip the mode and repaginate.
  setWritingMode(isVerticalMode() ? 'horizontal-tb' : 'vertical-rl');
  state.currentPage = 0;
  repaginate();
}

const CTX_ITEMS = [
  { id: 'ctx-spotlight', icon: CTX_ICONS.spotlight, label: '聚光燈', action: toggleLaser },
  { id: 'ctx-search', icon: CTX_ICONS.search, label: '文字搜尋', action: openSearch },
  { id: 'ctx-pdf', icon: CTX_ICONS.pdf, label: '匯出 PDF', action: exportPDF },
  { id: 'ctx-remote', icon: CTX_ICONS.remote, label: '遙控器', action: openRemoteModal },
  { divider: true },
  { id: 'ctx-orientation', icon: CTX_ICONS.orientation, label: '', action: toggleOrientation },
  { id: 'ctx-fullscreen', icon: CTX_ICONS.fullscreen, label: '全螢幕', action: toggleFullscreen },
  { divider: true },
  { id: 'ctx-help', icon: CTX_ICONS.help, label: '快捷鍵說明', action: showHelpModal },
];

let ctxMenu = null;
let longPressTimer = null;

function getOrientationLabel() {
  return isVerticalMode() ? '切換為橫書' : '切換為直書';
}

function buildMenu() {
  ctxMenu = document.createElement('div');
  ctxMenu.className = 'context-menu';
  ctxMenu.id = 'contextMenu';
  CTX_ITEMS.forEach(item => {
    if (item.divider) {
      const d = document.createElement('div');
      d.className = 'context-menu-divider';
      ctxMenu.appendChild(d);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'context-menu-item';
    btn.id = item.id;
    btn.innerHTML = `<span class="context-menu-icon">${item.icon}</span><span class="context-menu-label">${item.label}</span>`;
    btn.addEventListener('click', (e) => { e.stopPropagation(); hideMenu(); item.action(); });
    ctxMenu.appendChild(btn);
  });
  document.body.appendChild(ctxMenu);
}

function showMenu(x, y) {
  if (!ctxMenu) buildMenu();
  const ol = ctxMenu.querySelector('#ctx-orientation .context-menu-label');
  if (ol) ol.textContent = getOrientationLabel();
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top = y + 'px';
  ctxMenu.classList.add('active');
  requestAnimationFrame(() => {
    const r = ctxMenu.getBoundingClientRect();
    if (r.right > window.innerWidth) ctxMenu.style.left = (x - r.width) + 'px';
    if (r.bottom > window.innerHeight) ctxMenu.style.top = (y - r.height) + 'px';
  });
}

function hideMenu() {
  if (ctxMenu) ctxMenu.classList.remove('active');
}

export function initContextMenu() {
  buildMenu();
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.sidebar,.help-modal,.remote-modal,.goto-modal,.search-bar')) return;
    e.preventDefault();
    showMenu(e.clientX, e.clientY);
  });
  document.addEventListener('click', (e) => {
    if (ctxMenu?.classList.contains('active') && !ctxMenu.contains(e.target)) hideMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ctxMenu?.classList.contains('active')) { hideMenu(); e.stopPropagation(); }
  }, true);
  document.addEventListener('touchstart', (e) => {
    if (e.target.closest('.sidebar,.help-modal,.remote-modal,.goto-modal,.search-bar,.context-menu,.slide-nav,.left-panel')) return;
    const t = e.touches[0];
    longPressTimer = setTimeout(() => showMenu(t.clientX, t.clientY), 600);
  }, { passive: true });
  document.addEventListener('touchmove', () => { clearTimeout(longPressTimer); }, { passive: true });
  document.addEventListener('touchend', () => { clearTimeout(longPressTimer); }, { passive: true });
}
