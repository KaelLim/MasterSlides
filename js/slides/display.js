import { state, dom, FONT_SCALES, STORAGE_KEYS } from './state.js';
import { updatePageCount, goToPage } from './navigation.js';

// ===========================
// Font Size
// ===========================
export function setFontScale(scale, save = true) {
  state.fontScale = scale;
  document.documentElement.style.setProperty('--font-scale', scale);
  dom.fontSizeDisplayEl.textContent = Math.round(scale * 100) + '%';
  if (save) {
    localStorage.setItem(STORAGE_KEYS.fontSize, scale.toString());
  }
  setTimeout(() => {
    updatePageCount();
    goToPage(Math.min(state.currentPage, state.totalPages - 1));
  }, 50);
}

export function increaseFontSize() {
  const idx = FONT_SCALES.indexOf(state.fontScale);
  if (idx < FONT_SCALES.length - 1) {
    setFontScale(FONT_SCALES[idx + 1]);
  } else if (idx === -1) {
    const larger = FONT_SCALES.filter(s => s > state.fontScale);
    if (larger.length > 0) setFontScale(larger[0]);
  }
}

export function decreaseFontSize() {
  const idx = FONT_SCALES.indexOf(state.fontScale);
  if (idx > 0) {
    setFontScale(FONT_SCALES[idx - 1]);
  } else if (idx === -1) {
    const smaller = FONT_SCALES.filter(s => s < state.fontScale);
    if (smaller.length > 0) setFontScale(smaller[smaller.length - 1]);
  }
}

// ===========================
// Font Family
// ===========================
export function applyFont(fontFamily, save = true) {
  let fontValue;
  if (fontFamily === 'DFKai-SB') {
    fontValue = '"DFKai-SB", "BiauKai", "標楷體", serif';
  } else {
    fontValue = `"${fontFamily}", sans-serif`;
  }
  document.documentElement.style.setProperty('--font-family-body', fontValue);
  if (save) {
    localStorage.setItem(STORAGE_KEYS.fontFamily, fontFamily);
  }
}

// ===========================
// Orientation
// ===========================
export function setVerticalMode() {
  document.body.classList.remove('horizontal-mode');
  document.getElementById('verticalBtn').classList.add('active');
  document.getElementById('horizontalBtn').classList.remove('active');
  localStorage.setItem(STORAGE_KEYS.orientation, 'vertical');
  dom.manuscript.style.transform = '';
  state.currentPage = 0;
  setTimeout(() => {
    updatePageCount();
    goToPage(0);
  }, 50);
}

export function setHorizontalMode() {
  document.body.classList.add('horizontal-mode');
  document.getElementById('horizontalBtn').classList.add('active');
  document.getElementById('verticalBtn').classList.remove('active');
  localStorage.setItem(STORAGE_KEYS.orientation, 'horizontal');
  dom.manuscript.style.transform = '';
  state.currentPage = 0;
  setTimeout(() => {
    updatePageCount();
    goToPage(0);
  }, 50);
}

// ===========================
// Sidebar
// ===========================
export function openSidebar() {
  dom.sidebar.classList.add('open');
  dom.sidebarOverlay.classList.add('visible');
  dom.hamburgerBtn.classList.add('active');
}

export function closeSidebar() {
  dom.sidebar.classList.remove('open');
  dom.sidebarOverlay.classList.remove('visible');
  dom.hamburgerBtn.classList.remove('active');
}

export function toggleSidebar() {
  if (dom.sidebar.classList.contains('open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

// ===========================
// Fullscreen
// ===========================
export function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.log('無法進入全螢幕:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

export function updateFullscreenButton() {
  const btn = document.getElementById('fullscreenBtn');
  if (document.fullscreenElement) {
    btn.classList.add('active');
    btn.dataset.tooltip = '退出全螢幕';
  } else {
    btn.classList.remove('active');
    btn.dataset.tooltip = '全螢幕';
  }
}

// ===========================
// Navigation Bar Visibility
// ===========================
export function showNav() {
  if (state.navPermanentlyHidden) return;
  dom.slideNav.classList.remove('auto-hidden');
  resetNavHideTimer();
}

export function hideNav() {
  dom.slideNav.classList.add('auto-hidden');
}

export function resetNavHideTimer() {
  if (state.navHideTimeout) clearTimeout(state.navHideTimeout);
  state.navHideTimeout = setTimeout(hideNav, 3000);
}

export function toggleNavVisibility() {
  state.navPermanentlyHidden = !state.navPermanentlyHidden;
  const eyeOpen = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
  const eyeClosed = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';

  if (state.navPermanentlyHidden) {
    dom.slideNav.style.display = 'none';
    document.getElementById('toggleNavIcon').innerHTML = eyeClosed;
    document.getElementById('toggleNavBtn').dataset.tooltip = '顯示導航列';
    localStorage.setItem(STORAGE_KEYS.navHidden, 'true');
  } else {
    dom.slideNav.style.display = 'flex';
    document.getElementById('toggleNavIcon').innerHTML = eyeOpen;
    document.getElementById('toggleNavBtn').dataset.tooltip = '隱藏導航列';
    localStorage.setItem(STORAGE_KEYS.navHidden, 'false');
  }
}

// ===========================
// Load Settings from localStorage
// ===========================
export function loadSettings() {
  const savedScale = localStorage.getItem(STORAGE_KEYS.fontSize);
  if (savedScale) {
    const scale = parseFloat(savedScale);
    if (!isNaN(scale) && scale >= 0.5 && scale <= 2.0) {
      setFontScale(scale, false);
    }
  }

  const savedOrientation = localStorage.getItem(STORAGE_KEYS.orientation);
  if (savedOrientation === 'horizontal') {
    document.body.classList.add('horizontal-mode');
    document.getElementById('horizontalBtn').classList.add('active');
    document.getElementById('verticalBtn').classList.remove('active');
  }

  const savedFont = localStorage.getItem(STORAGE_KEYS.fontFamily);
  if (savedFont) {
    applyFont(savedFont, false);
    document.getElementById('fontSelect').value = savedFont;
  }

  const savedNavHidden = localStorage.getItem(STORAGE_KEYS.navHidden);
  if (savedNavHidden === 'true') {
    state.navPermanentlyHidden = true;
    dom.slideNav.style.display = 'none';
    document.getElementById('toggleNavIcon').innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
    document.getElementById('toggleNavBtn').dataset.tooltip = '顯示導航列';
  }
}
