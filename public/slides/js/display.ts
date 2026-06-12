import { state, dom, FONT_SCALE_MIN, FONT_SCALE_MAX, STORAGE_KEYS } from './state.js';
import { setWritingMode } from './pagination.js';
import { isKaiti, KAITI_STACK } from './font.js';

// Font size / family helpers live in font.js (the active slide-page model:
// each setter schedules a repaginate()). The viewer's font UI — keyboard
// shortcuts and the sidebar A-/A+/select — wire to those. display.js only
// RESTORES persisted values on load, inline in loadSettings() below, so it
// has no font setters of its own anymore. The old duplicates here drove the
// legacy navigation.js scroll model and were the source of the refresh race.

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
  // Restore persisted display settings into state + CSS variables ONLY. We do
  // NOT trigger re-pagination here: every caller (loader.js, playlist.js) runs
  // repaginate() immediately after loadSettings, and that single call owns
  // laying the content into .slide-page divs via the active paginator. Setting
  // --font-scale synchronously means that repaginate measures overflow at the
  // correct scale. (Previously this went through a setFontScale() whose
  // setTimeout drove the legacy navigation.js scroll model — a manuscript
  // translateY/X transform — which raced repaginate on refresh, pushing the
  // rendered slide off-screen and corrupting the page count.)
  const savedScale = localStorage.getItem(STORAGE_KEYS.fontSize);
  if (savedScale) {
    let scale = parseFloat(savedScale);
    if (!isNaN(scale) && scale >= FONT_SCALE_MIN) {
      // Clamp any pre-cap stored value (e.g. 1.8) to the new max.
      if (scale > FONT_SCALE_MAX) scale = FONT_SCALE_MAX;
      state.fontScale = scale;
      document.documentElement.style.setProperty('--font-scale', scale.toString());
      dom.fontSizeDisplayEl.textContent = Math.round(scale * 100) + '%';
    }
  }

  const savedOrientation = localStorage.getItem(STORAGE_KEYS.orientation);
  if (savedOrientation === 'horizontal') {
    // setWritingMode() sets the body class + toggle buttons' .active + aria-pressed.
    setWritingMode('horizontal-tb');
  }

  const savedFont = localStorage.getItem(STORAGE_KEYS.fontFamily);
  if (savedFont) {
    const isKai = isKaiti(savedFont);
    const fontValue = isKai ? KAITI_STACK : `"${savedFont}", sans-serif`;
    document.documentElement.style.setProperty('--font-family-body', fontValue);
    // Legacy 'DFKai-SB' has no matching <option> anymore — map it to '標楷體'.
    (document.getElementById('fontSelect') as HTMLSelectElement | null)!.value =
      isKai ? '標楷體' : savedFont;
  }

  const savedNavHidden = localStorage.getItem(STORAGE_KEYS.navHidden);
  if (savedNavHidden === 'true') {
    state.navPermanentlyHidden = true;
    dom.slideNav.style.display = 'none';
  }
}
