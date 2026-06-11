// Tweaks panel — floating, draggable settings popover anchored to the
// top-right of the admin shell. Lets the user pick theme (light/dark/system),
// list density, and accent color. State lives in dashboard.ts and is pushed
// in via setters; this module just renders + reports user intent.
//
// Ported from /tmp/anthropic-design/docs/project/app/app.jsx (TweaksPanel
// component plus the applyAccent/applyTheme helpers at the top of that file).

import type { Accent, Density, Theme } from './types.js';
import { h } from './h.js';
import { Icon } from './icons.js';

interface AccentDef {
  name: string;
  base: string;
  hover: string;
  sw: string;
}

export const ACCENTS: Record<Accent, AccentDef> = {
  blue:   { name: '慈濟藍', base: '#134a86', hover: '#0f3a6b', sw: '#1a5da6' },
  indigo: { name: '靛藍',   base: '#3b41a6', hover: '#2e3385', sw: '#4a50c0' },
  teal:   { name: '湖綠',   base: '#0f6f63', hover: '#0b574e', sw: '#15897a' },
};

export function applyAccent(key: Accent): void {
  const a = ACCENTS[key] ?? ACCENTS.blue;
  const r = document.documentElement.style;
  r.setProperty('--primary', a.base);
  r.setProperty('--primary-hover', a.hover);
  r.setProperty('--primary-weak', `color-mix(in srgb, ${a.base} 12%, var(--surface))`);
  r.setProperty('--primary-weak-border', `color-mix(in srgb, ${a.base} 26%, var(--surface))`);
  r.setProperty('--focus-ring', a.sw);
}

export function applyTheme(mode: Theme): void {
  const resolved: 'dark' | 'light' = mode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode;
  document.documentElement.setAttribute('data-theme', resolved);
}

export interface TweaksPanelOpts {
  theme: Theme;
  setTheme: (t: Theme) => void;
  density: Density;
  setDensity: (d: Density) => void;
  accent: Accent;
  setAccent: (a: Accent) => void;
  onClose: () => void;
}

const THEME_OPTS: Array<[Theme, string, string]> = [
  ['light',  'sun',     '淺色'],
  ['dark',   'moon',    '深色'],
  ['system', 'monitor', '系統'],
];

const DENSITY_OPTS: Array<[Density, string]> = [
  ['compact',     '緊湊'],
  ['comfortable', '標準'],
  ['spacious',   '寬鬆'],
];

export function showTweaksPanel(opts: TweaksPanelOpts): HTMLElement {
  // Drag state: offset from panel top-left to pointer at mousedown.
  let dragOffset: { dx: number; dy: number } | null = null;
  // Current absolute position (null until first drag — then CSS defaults rule).
  let pos: { left: number; top: number } | null = null;

  const headRow = h('div', { class: 'tweaks-head' },
    h('h3', null, '顯示設定'),
    h('button', {
      class: 'iconbtn',
      'aria-label': '關閉',
      onClick: (): void => opts.onClose(),
    }, Icon('x', { size: 16 })),
  );

  // Theme segment
  const themeSeg = h('div', { class: 'tw-seg' },
    ...THEME_OPTS.map(([v, ic, lbl]): HTMLElement => {
      const btn = h('button', {
        'aria-pressed': opts.theme === v ? 'true' : 'false',
        onClick: (): void => {
          opts.setTheme(v);
          // Reflect new pressed state immediately so the panel stays interactive
          // without forcing a full re-render from dashboard.ts.
          syncThemeButtons();
        },
      },
        Icon(ic, { size: 14, style: { verticalAlign: '-2px', marginRight: '4px' } }),
        lbl,
      );
      btn.dataset.themeValue = v;
      return btn;
    }),
  );

  function syncThemeButtons(): void {
    for (const btn of Array.from(themeSeg.querySelectorAll<HTMLButtonElement>('button'))) {
      const v = btn.dataset.themeValue as Theme | undefined;
      btn.setAttribute('aria-pressed', v && v === opts.theme ? 'true' : 'false');
    }
  }

  // Density segment
  const densitySeg = h('div', { class: 'tw-seg' },
    ...DENSITY_OPTS.map(([v, lbl]): HTMLElement => {
      const btn = h('button', {
        'aria-pressed': opts.density === v ? 'true' : 'false',
        onClick: (): void => {
          opts.setDensity(v);
          syncDensityButtons();
        },
      }, lbl);
      btn.dataset.densityValue = v;
      return btn;
    }),
  );

  function syncDensityButtons(): void {
    for (const btn of Array.from(densitySeg.querySelectorAll<HTMLButtonElement>('button'))) {
      const v = btn.dataset.densityValue as Density | undefined;
      btn.setAttribute('aria-pressed', v && v === opts.density ? 'true' : 'false');
    }
  }

  // Accent swatches
  const swatchRow = h('div', { class: 'tw-swatches' },
    ...(Object.entries(ACCENTS) as Array<[Accent, AccentDef]>).map(([k, a]): HTMLElement => {
      const btn = h('button', {
        class: 'tw-sw',
        'aria-pressed': opts.accent === k ? 'true' : 'false',
        title: a.name,
        style: { background: a.sw },
        onClick: (): void => {
          opts.setAccent(k);
          syncSwatches();
        },
      });
      btn.dataset.accentValue = k;
      return btn;
    }),
  );

  function syncSwatches(): void {
    for (const btn of Array.from(swatchRow.querySelectorAll<HTMLButtonElement>('button'))) {
      const k = btn.dataset.accentValue as Accent | undefined;
      btn.setAttribute('aria-pressed', k && k === opts.accent ? 'true' : 'false');
    }
  }

  const body = h('div', { class: 'tweaks-body' },
    h('div', { class: 'tw-group' },
      h('label', null, '外觀主題'),
      themeSeg,
    ),
    h('div', { class: 'tw-group' },
      h('label', null, '列表密度'),
      densitySeg,
    ),
    h('div', { class: 'tw-group' },
      h('label', null, '主題色'),
      swatchRow,
    ),
  );

  const panel = h('div', { class: 'tweaks' }, headRow, body);

  // ---- drag-to-move ----
  const onMove = (e: MouseEvent): void => {
    if (!dragOffset) return;
    pos = { left: e.clientX - dragOffset.dx, top: e.clientY - dragOffset.dy };
    panel.style.left = pos.left + 'px';
    panel.style.top = pos.top + 'px';
    // Clear the default `right: 16px` once the user drags so positioning is
    // anchored purely from top-left.
    panel.style.right = 'auto';
  };
  const onUp = (): void => {
    dragOffset = null;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  headRow.addEventListener('mousedown', (e: MouseEvent) => {
    const r = panel.getBoundingClientRect();
    dragOffset = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  return panel;
}
