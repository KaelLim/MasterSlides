import { state, dom, FONT_SCALES, STORAGE_KEYS } from './state.js';
import { repaginate } from './pagination.js';

export function setFontScale(scale: number, save: boolean = true): void {
  state.fontScale = scale;
  document.documentElement.style.setProperty('--font-scale', scale.toString());
  dom.fontSizeDisplayEl.textContent = Math.round(scale * 100) + '%';
  if (save) localStorage.setItem(STORAGE_KEYS.fontSize, scale.toString());
  setTimeout(() => repaginate(), 50);
}

export function increaseFontSize(): void {
  const idx = FONT_SCALES.indexOf(state.fontScale as typeof FONT_SCALES[number]);
  if (idx < FONT_SCALES.length - 1) setFontScale(FONT_SCALES[idx + 1]!);
  else if (idx === -1) {
    const larger = FONT_SCALES.filter(s => s > state.fontScale);
    if (larger.length > 0) setFontScale(larger[0]!);
  }
}

export function decreaseFontSize(): void {
  const idx = FONT_SCALES.indexOf(state.fontScale as typeof FONT_SCALES[number]);
  if (idx > 0) setFontScale(FONT_SCALES[idx - 1]!);
  else if (idx === -1) {
    const smaller = FONT_SCALES.filter(s => s < state.fontScale);
    if (smaller.length > 0) setFontScale(smaller[smaller.length - 1]!);
  }
}

// The default brush-kai stack. 標楷體 leads (resolves to BiauKai on macOS,
// DFKai-SB on Windows) so we never name "DFKai-SB" literally. Kept in sync
// with --font-family-body in public/slides/css/base.css.
export const KAITI_STACK = '"標楷體", "BiauKai", "MOEStandardKaiti", "Kaiti TC", "楷體-繁", "STKaiti", serif';

// The kai option's stored value. '標楷體' is current; 'DFKai-SB' is the
// pre-2026 value still sitting in some users' localStorage — both map here.
export function isKaiti(fontFamily: string): boolean {
  return fontFamily === '標楷體' || fontFamily === 'DFKai-SB';
}

export function applyFont(fontFamily: string, save: boolean = true): void {
  const fontValue = isKaiti(fontFamily) ? KAITI_STACK : `"${fontFamily}", sans-serif`;
  document.documentElement.style.setProperty('--font-family-body', fontValue);
  if (save) localStorage.setItem(STORAGE_KEYS.fontFamily, fontFamily);
  setTimeout(() => repaginate(), 50);
}
