import { state, dom, FONT_SCALES, FONT_SCALE_MIN, FONT_SCALE_MAX, STORAGE_KEYS } from './state.js';
import { updatePageCount, goToPage } from './navigation.js';
import { setWritingMode } from './pagination.js';

// ===========================
// Font Size
// ===========================
export function setFontScale(scale: number, save: boolean = true): void {
  state.fontScale = scale;
  document.documentElement.style.setProperty('--font-scale', scale.toString());
  dom.fontSizeDisplayEl.textContent = Math.round(scale * 100) + '%';
  if (save) {
    localStorage.setItem(STORAGE_KEYS.fontSize, scale.toString());
  }
  setTimeout(() => {
    updatePageCount();
    goToPage(Math.min(state.currentPage, state.totalPages - 1));
  }, 50);
}

export function increaseFontSize(): void {
  const idx = FONT_SCALES.indexOf(state.fontScale as typeof FONT_SCALES[number]);
  if (idx < FONT_SCALES.length - 1) {
    setFontScale(FONT_SCALES[idx + 1]);
  } else if (idx === -1) {
    const larger = FONT_SCALES.filter(s => s > state.fontScale);
    if (larger.length > 0) setFontScale(larger[0]);
  }
}

export function decreaseFontSize(): void {
  const idx = FONT_SCALES.indexOf(state.fontScale as typeof FONT_SCALES[number]);
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
export function applyFont(fontFamily: string, save: boolean = true): void {
  let fontValue: string;
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
// Sidebar
// ===========================
export function openSidebar(): void {
  dom.sidebar.classList.add('open');
  dom.sidebarOverlay.classList.add('visible');
  dom.hamburgerBtn.classList.add('active');
  dom.hamburgerBtn.setAttribute('aria-expanded', 'true');
}

export function closeSidebar(): void {
  dom.sidebar.classList.remove('open');
  dom.sidebarOverlay.classList.remove('visible');
  dom.hamburgerBtn.classList.remove('active');
  dom.hamburgerBtn.setAttribute('aria-expanded', 'false');
}

export function toggleSidebar(): void {
  if (dom.sidebar.classList.contains('open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

// ===========================
// Fullscreen
// ===========================
export function toggleFullscreen(): void {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.log('無法進入全螢幕:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

export function updateFullscreenButton(): void {
  const btn = document.getElementById('fullscreenBtn')!;
  if (document.fullscreenElement) {
    btn.classList.add('active');
    btn.dataset.tooltip = '退出全螢幕';
    btn.setAttribute('aria-label', '退出全螢幕');
  } else {
    btn.classList.remove('active');
    btn.dataset.tooltip = '全螢幕';
    btn.setAttribute('aria-label', '全螢幕');
  }
}

// ===========================
// Navigation Bar Visibility
// ===========================
export function showNav(): void {
  if (state.navPermanentlyHidden) return;
  dom.slideNav.classList.remove('auto-hidden');
  resetNavHideTimer();
}

export function hideNav(): void {
  dom.slideNav.classList.add('auto-hidden');
}

export function resetNavHideTimer(): void {
  if (state.navHideTimeout) clearTimeout(state.navHideTimeout);
  state.navHideTimeout = setTimeout(hideNav, 3000);
}

// Kept for the `N` keyboard shortcut. The on-screen icon button was removed
// (it lived in the sidebar's icon-btn-row); when slide-nav moved into the
// left-panel it stopped occluding content, so a UI control is no longer
// warranted — but the keypress + persistence still work.
export function toggleNavVisibility(): void {
  state.navPermanentlyHidden = !state.navPermanentlyHidden;
  if (state.navPermanentlyHidden) {
    dom.slideNav.style.display = 'none';
    localStorage.setItem(STORAGE_KEYS.navHidden, 'true');
  } else {
    dom.slideNav.style.display = 'flex';
    localStorage.setItem(STORAGE_KEYS.navHidden, 'false');
  }
}

// ===========================
// Load Settings from localStorage
// ===========================
export function loadSettings(): void {
  const savedScale = localStorage.getItem(STORAGE_KEYS.fontSize);
  if (savedScale) {
    let scale = parseFloat(savedScale);
    if (!isNaN(scale) && scale >= FONT_SCALE_MIN) {
      // Clamp any pre-cap stored value (e.g. 1.8) to the new max.
      if (scale > FONT_SCALE_MAX) scale = FONT_SCALE_MAX;
      setFontScale(scale, false);
    }
  }

  const savedOrientation = localStorage.getItem(STORAGE_KEYS.orientation);
  if (savedOrientation === 'horizontal') {
    // setWritingMode() sets the body class + toggle buttons' .active + aria-pressed.
    setWritingMode('horizontal-tb');
  }

  const savedFont = localStorage.getItem(STORAGE_KEYS.fontFamily);
  if (savedFont) {
    applyFont(savedFont, false);
    (document.getElementById('fontSelect') as HTMLSelectElement | null)!.value = savedFont;
  }

  const savedNavHidden = localStorage.getItem(STORAGE_KEYS.navHidden);
  if (savedNavHidden === 'true') {
    state.navPermanentlyHidden = true;
    dom.slideNav.style.display = 'none';
  }
}
