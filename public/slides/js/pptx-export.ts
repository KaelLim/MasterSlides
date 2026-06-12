// Export the rendered deck to an EDITABLE .pptx with native East-Asian vertical
// text (OOXML `vert="eaVert"`). Rather than invent a layout, this reads the
// viewer's ACTUAL rendered geometry — each leaf block's getBoundingClientRect
// plus its computed font-size / colour / weight — and drops a matching PPT box
// at the same relative position. So position, size, colour and bold follow what
// the viewer shows; PowerPoint only reflows column breaks by its own metrics.
//
// PptxGenJS writes fontFace into the run's <a:ea> (East Asian) slot, so CJK
// glyphs pick up 標楷體 — provided the NAME resolves on the presenter's machine.
// 標楷體 (the localized name) resolves to BiauKai on macOS and DFKai-SB on
// Windows; the Windows-only "DFKai-SB" name does not exist on macOS and gets
// silently substituted with a Ming face, which is what the first attempt hit.
import { dom } from './state.js';

const SLIDE_FONT = '標楷體';

interface Run {
  text: string;
  options: Record<string, unknown>;
}

// computed "rgb(r, g, b)" / "rgba(...)" → PptxGenJS hex (6 chars, no '#').
function rgbToHex(rgb: string): string {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(rgb);
  if (!m) return 'FFFFFF';
  const h = (n: string): string => Number(n).toString(16).padStart(2, '0');
  return (h(m[1]!) + h(m[2]!) + h(m[3]!)).toUpperCase();
}

// One rich-text run per text node (bold + colour read from the LIVE computed
// style, so it captures <strong>, inline styles and CSS classes alike). <br>
// becomes a column break. No trailing break — each leaf is its own box.
function leafRuns(el: HTMLElement): Run[] {
  const runs: Run[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ');
      if (!text.trim()) return;
      const cs = getComputedStyle(node.parentElement ?? el);
      runs.push({
        text,
        options: {
          bold: Number(cs.fontWeight) >= 600 || cs.fontWeight === 'bold',
          color: rgbToHex(cs.color),
        },
      });
    } else if (node.nodeName === 'BR') {
      runs.push({ text: '', options: { breakLine: true } });
    } else {
      node.childNodes.forEach(walk);
    }
  };
  walk(el);
  return runs;
}

// A child that participates in block flow — recurse into it; otherwise the
// element is a leaf and becomes one text box. Images are always their own box.
function isBlockish(el: Element): boolean {
  if (el.tagName === 'IMG') return true;
  const d = getComputedStyle(el).display;
  return d === 'block' || d === 'list-item' || d === 'flex' || d === 'grid' || d.startsWith('table');
}

// Fetch a same-origin asset in PptxGenJS's form ("image/jpeg;base64,…").
async function urlToPptxData(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = (): void => resolve(fr.result as string);
      fr.onerror = (): void => reject(new Error('read failed'));
      fr.readAsDataURL(blob);
    });
    return dataUrl.replace(/^data:/, '');
  } catch {
    return null;
  }
}

interface SlideCtx {
  slide: PptxSlide;
  pageRect: DOMRect;
  W: number;
  H: number;
}

function addImageBox(im: HTMLImageElement, ctx: SlideCtx): void {
  const r = im.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return;
  const sx = ctx.W / ctx.pageRect.width;
  const sy = ctx.H / ctx.pageRect.height;
  const placement = {
    x: (r.left - ctx.pageRect.left) * sx,
    y: (r.top - ctx.pageRect.top) * sy,
    w: r.width * sx,
    h: r.height * sy,
  };
  if (im.src.startsWith('data:')) ctx.slide.addImage({ data: im.src.slice(5), ...placement });
  else ctx.slide.addImage({ path: im.src, ...placement });
}

function addTextBox(el: HTMLElement, ctx: SlideCtx): void {
  const runs = leafRuns(el);
  if (!runs.some((r) => r.text)) return; // only breaks / empty
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return;
  const sx = ctx.W / ctx.pageRect.width;
  const sy = ctx.H / ctx.pageRect.height;
  const cs = getComputedStyle(el);
  const fontPx = parseFloat(cs.fontSize) || 24;
  // px → pt: the page is pageRect.height px tall and H inches (H*72 pt) tall.
  const fontPt = Math.round((fontPx * ctx.H * 72) / ctx.pageRect.height);
  const align = cs.textAlign === 'center' ? 'center' : cs.textAlign === 'right' ? 'right' : 'left';
  ctx.slide.addText(runs, {
    x: (r.left - ctx.pageRect.left) * sx,
    y: (r.top - ctx.pageRect.top) * sy,
    w: r.width * sx,
    h: r.height * sy,
    vert: 'eaVert',
    rtlMode: true,
    lang: 'zh-TW',
    fontFace: SLIDE_FONT,
    fontSize: fontPt,
    color: rgbToHex(cs.color),
    align,
    valign: 'top',
    margin: 0,
    wrap: true,
    fit: 'shrink',
  });
}

function emit(el: HTMLElement, ctx: SlideCtx): void {
  if (el.tagName === 'IMG') {
    addImageBox(el as HTMLImageElement, ctx);
    return;
  }
  const blockKids = (Array.from(el.children) as HTMLElement[]).filter(isBlockish);
  if (blockKids.length) blockKids.forEach((k) => emit(k, ctx));
  else addTextBox(el, ctx);
}

export async function exportPPTX(): Promise<void> {
  const btn = document.getElementById('exportPptxBtn');
  if (btn?.classList.contains('exporting')) return;
  btn?.classList.add('exporting');

  const pages = Array.from(document.querySelectorAll<HTMLElement>('#manuscript > .slide-page'));
  const prevDisplay = pages.map((p) => p.style.display);

  try {
    const pptx = new PptxGenJS();

    const cw = dom.manuscriptContainer.clientWidth || 1280;
    const ch = dom.manuscriptContainer.clientHeight || 720;
    const H = 7.5;
    const W = Math.round((H * cw / ch) * 100) / 100;
    pptx.defineLayout({ name: 'TZU', width: W, height: H });
    pptx.layout = 'TZU';

    const bgData = await urlToPptxData(`${location.origin}/theme/default/background.jpg`);

    // Measure ONE page at a time — only the page under measurement is visible,
    // so every child's getBoundingClientRect is read in the true render context.
    // The whole loop is synchronous (no await), so the browser never repaints
    // mid-loop: the user sees no flashing.
    pages.forEach((p) => { p.style.display = 'none'; });
    for (const page of pages) {
      page.style.display = '';
      void page.offsetHeight; // force layout
      const slide = pptx.addSlide();
      slide.background = bgData ? { data: bgData } : { color: '141C28' };
      const ctx: SlideCtx = { slide, pageRect: page.getBoundingClientRect(), W, H };
      for (const child of Array.from(page.children) as HTMLElement[]) emit(child, ctx);
      page.style.display = 'none';
    }

    await pptx.writeFile({ fileName: `慈濟簡報_${Date.now()}.pptx` });
  } finally {
    pages.forEach((p, i) => { p.style.display = prevDisplay[i]!; });
    btn?.classList.remove('exporting');
  }
}
