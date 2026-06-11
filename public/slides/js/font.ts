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

export function applyFont(fontFamily: string, save: boolean = true): void {
  let fontValue: string;
  if (fontFamily === 'DFKai-SB') {
    fontValue = '"DFKai-SB", "BiauKai", "標楷體", serif';
  } else {
    fontValue = `"${fontFamily}", sans-serif`;
  }
  document.documentElement.style.setProperty('--font-family-body', fontValue);
  if (save) localStorage.setItem(STORAGE_KEYS.fontFamily, fontFamily);
  setTimeout(() => repaginate(), 50);
}
