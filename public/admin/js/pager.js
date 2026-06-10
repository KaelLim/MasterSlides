// Tiny client-side pagination used by docs/playlists/playlist-edit picker.
// Render writes into `targetEl`; clicks fire `onChange(nextPage)` with a
// 0-indexed page number.

export const PAGE_SIZE = 20;

export function totalPages(total, pageSize = PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function slice(items, page, pageSize = PAGE_SIZE) {
  const start = page * pageSize;
  return items.slice(start, start + pageSize);
}

// Returns an array of page indices + 'gap' markers for the pager strip.
// Always shows first, last, current, and 1 neighbour on each side; gaps
// elsewhere become '…'.
function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const set = new Set([0, total - 1, current, current - 1, current + 1]);
  const sorted = [...set].filter((p) => p >= 0 && p < total).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("gap");
    out.push(sorted[i]);
  }
  return out;
}

export function renderPager({ targetEl, total, page, onChange, pageSize = PAGE_SIZE, summaryLabel = "筆" }) {
  const pages = totalPages(total, pageSize);
  if (pages <= 1) {
    targetEl.innerHTML = "";
    return;
  }
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);
  const win = pageWindow(page, pages);
  const buttons = win.map((p) => {
    if (p === "gap") return `<span class="ellipsis">…</span>`;
    return `<button data-page="${p}" class="${p === page ? "is-current" : ""}">${p + 1}</button>`;
  }).join("");
  targetEl.innerHTML = `
    <span class="summary">第 ${from}–${to} 筆，共 ${total} ${summaryLabel}</span>
    <button data-page="${page - 1}" ${page === 0 ? "disabled" : ""} title="上一頁">
      <span class="material-symbols-rounded">chevron_left</span>
    </button>
    ${buttons}
    <button data-page="${page + 1}" ${page === pages - 1 ? "disabled" : ""} title="下一頁">
      <span class="material-symbols-rounded">chevron_right</span>
    </button>
  `;
  targetEl.onclick = (e) => {
    const btn = e.target.closest("button[data-page]");
    if (!btn || btn.disabled) return;
    const next = Number(btn.dataset.page);
    if (Number.isFinite(next)) onChange(next);
  };
}
