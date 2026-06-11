// 24x24 stroke-based icons, identical to the design prototype's ICONS map.
// Icon() returns an inline <svg> with currentColor stroke so it inherits
// from the parent's `color` CSS property.
import { svg } from './h.js';

export const ICONS: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-3.2-3.2',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17.5 19.5 7',
  chevDown: 'M6 9l6 6 6-6',
  chevUp: 'M6 15l6-6 6 6',
  chevLeft: 'M15 6l-6 6 6 6',
  chevRight: 'M9 6l6 6-6 6',
  chevFirst: 'M17 6l-6 6 6 6M7 6v12',
  chevLast: 'M7 6l6 6-6 6M17 6v12',
  more: 'M12 6.5h.01M12 12h.01M12 17.5h.01',
  external: 'M14 5h5v5M19 5l-8 8M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  refresh: 'M20 11a8 8 0 1 0-.6 3M20 5v6h-6',
  pencil: 'M16.5 4.5l3 3L8 19l-4 1 1-4L16.5 4.5Z',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6',
  link: 'M9 15l6-6M10.5 6.5l1.8-1.8a3.5 3.5 0 0 1 5 5L15.5 11M13.5 17.5l-1.8 1.8a3.5 3.5 0 0 1-5-5L8.5 13',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  eyeOff: 'M3 3l18 18M10.6 6.2A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.3 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4-0.9M9.5 9.5a3 3 0 0 0 4.2 4.2',
  play: 'M7 5l12 7-12 7V5Z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  layers: 'M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5M3 18l9 5 9-5',
  file: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4ZM14 3v4h4M9 13h6M9 17h4',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v5M12 7.5h.01',
  alert: 'M12 4l9 16H3l9-16ZM12 10v4M12 17.5h.01',
  checkCircle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM8 12l3 3 5-6',
  xCircle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9 9l6 6M15 9l-6 6',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  keyboard: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM7 10h.01M11 10h.01M15 10h.01M8 14h8',
  sun: 'M12 5V3M12 21v-2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M17.7 6.3l1.4-1.4M4.9 19.1l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  moon: 'M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z',
  monitor: 'M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM9 20h6M12 16v4',
  sliders: 'M4 8h10M18 8h2M4 16h2M10 16h10M14 6v4M8 14v4',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3.5 2',
  setPublic: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM8 12l3 3 5-6',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18',
  inbox: 'M3 12h5l1.5 3h5L21 12M3 12l3-7h12l3 7M3 12v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6',
  filter: 'M4 5h16l-6 7v6l-4 2v-8L4 5Z',
};

export interface IconOpts {
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: Partial<CSSStyleDeclaration>;
}

export function Icon(name: string, opts: IconOpts = {}): SVGElement {
  const d = ICONS[name];
  if (!d) {
    // Render a tiny placeholder rect so the layout doesn't break if we ask
    // for a missing icon, and the gap is visually obvious in dev.
    return svg('svg', { width: opts.size ?? 18, height: opts.size ?? 18, viewBox: '0 0 24 24', 'aria-hidden': 'true' },
      svg('rect', { x: 4, y: 4, width: 16, height: 16, fill: 'currentColor', opacity: 0.2 }));
  }
  const root = svg('svg', {
    width: opts.size ?? 18,
    height: opts.size ?? 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': opts.strokeWidth ?? 1.8,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    class: opts.className ?? '',
    'aria-hidden': 'true',
  });
  if (opts.style) Object.assign((root as unknown as SVGElement & { style: CSSStyleDeclaration }).style, opts.style);
  // Split multiple subpaths so each has its own <path>, matching prototype output.
  const parts = d.split('M').filter(Boolean);
  for (const seg of parts) {
    root.appendChild(svg('path', { d: 'M' + seg }));
  }
  return root;
}
