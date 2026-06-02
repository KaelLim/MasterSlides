import { dom } from './state.js';

// Bilinear-resample a canvas to fit within maxW × maxH while preserving
// aspect ratio.
export function downscaleCanvas(src, maxW, maxH) {
  const ratio = Math.min(maxW / src.width, maxH / src.height, 1);
  if (ratio === 1) return src;
  const dst = document.createElement('canvas');
  dst.width = Math.max(1, Math.floor(src.width * ratio));
  dst.height = Math.max(1, Math.floor(src.height * ratio));
  const ctx = dst.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, dst.width, dst.height);
  }
  return dst;
}

export async function convertTablesToImages() {
  const tables = dom.manuscript.querySelectorAll('table');
  if (tables.length === 0) return;
  const containerWidth = dom.manuscriptContainer.clientWidth * 0.95;
  for (const table of tables) {
    try {
      table.style.cssText = `writing-mode:horizontal-tb;width:${containerWidth}px;background:rgba(0,0,0,0.3);color:white;border-collapse:collapse;font-size:24px`;
      table.querySelectorAll('td').forEach(td => {
        td.style.cssText = 'writing-mode:horizontal-tb;border:1px solid rgba(255,255,255,0.3);padding:10px 14px;color:white;vertical-align:middle;text-align:left';
      });
      table.querySelectorAll('th').forEach(th => {
        th.style.cssText = 'writing-mode:horizontal-tb;border:1px solid rgba(255,255,255,0.3);padding:10px 14px;color:white;vertical-align:middle;text-align:center;background:#1a365d;font-weight:bold';
      });
      table.querySelectorAll('img').forEach(img => {
        img.style.display = 'block';
        img.style.margin = '0 auto';
      });
      table.querySelectorAll('tr').forEach(tr => {
        const cells = Array.from(tr.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
        if (cells.length === 0) return;
        const heights = cells.map(c => c.offsetHeight);
        const maxH = Math.max(...heights);
        cells.forEach((c, i) => {
          const diff = maxH - heights[i];
          if (diff <= 0) return;
          const extra = Math.round(diff / 2);
          c.style.padding = `${10 + extra}px 14px`;
        });
      });
      const canvas = await html2canvas(table, { backgroundColor: 'transparent', scale: 2, logging: false });
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      img.className = 'table-image';
      const thumb = downscaleCanvas(canvas, 600, 450);
      img.dataset.thumbSrc = thumb.toDataURL('image/jpeg', 0.7);
      table.parentNode.replaceChild(img, table);
    } catch (err) {
      console.error('table conversion failed:', err);
    }
  }
}
