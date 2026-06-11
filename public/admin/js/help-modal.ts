// Shared help modal — keyboard shortcuts (from hotkeys.js getBindings()),
// inline "如何分享 Google Docs" guide, and FAQ. Listens for the global
// CustomEvent("admin:open-help") so any page (dashboard, playlists,
// playlist-edit) and any hotkey/help link can open it.
import { getBindings, formatBinding, type HotkeyBinding } from "./hotkeys.js";

interface OpenHelpOptions {
  scrollTo?: string;
}

const prefersReducedMotion = (): boolean =>
  !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function escapeHTML(s: unknown): string {
  const map: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  };
  return String(s ?? "").replace(/[&<>"']/g, (c) => map[c] ?? c);
}

// Render a single <dt> showing one or more <kbd> tokens for a binding.
// Combos like Cmd+S are rendered as <kbd>⌘</kbd> + <kbd>S</kbd> with a
// "+" separator so each modifier shows in its own pill.
function renderKbd(b: HotkeyBinding): string {
  const formatted = formatBinding(b); // e.g. "⌘+S" or "Shift+?" or "j"
  const parts = formatted.split("+");
  return parts
    .map((p) => `<kbd>${escapeHTML(p)}</kbd>`)
    .join('<span class="help-kbd-plus" aria-hidden="true">+</span>');
}

// Group bindings by scope and de-duplicate identical labels within a scope
// (e.g. j and ArrowDown both labelled "下一列" — show as "j / ↓").
function groupBindings(): Array<[string, Map<string, string[]>]> {
  const bindings = getBindings();
  // Map<scope, Map<label, kbd-html[]>>
  const byScope: Map<string, Map<string, string[]>> = new Map();
  const arrowMap: Record<string, string> = {
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  };
  for (const b of bindings) {
    if (!b.label) continue;
    const scope = b.scope || "其他";
    if (!byScope.has(scope)) byScope.set(scope, new Map());
    const labelMap = byScope.get(scope)!;
    // Render with arrow-friendly shorthand for ArrowUp/Down etc.
    const display = arrowMap[b.key]
      ? `<kbd>${arrowMap[b.key]}</kbd>`
      : renderKbd(b);
    if (!labelMap.has(b.label)) labelMap.set(b.label, []);
    labelMap.get(b.label)!.push(display);
  }
  // Preserve a sensible scope order: 全域 → 瀏覽 → 選取 → 編輯 → 其他.
  const order = ["全域", "瀏覽", "選取", "編輯", "其他"];
  const sorted = [...byScope.entries()].sort(
    ([a], [b]) => order.indexOf(a) - order.indexOf(b)
  );
  return sorted;
}

function buildHotkeyList(): string {
  const groups = groupBindings();
  if (groups.length === 0) {
    return `<p class="help-note">這個頁面尚未註冊任何快速鍵。</p>`;
  }
  return groups.map(([scope, labelMap]) => {
    const rows = [...labelMap.entries()].map(([label, kbds]) => {
      const dt = kbds.join('<span class="help-kbd-sep"> / </span>');
      return `<dt>${dt}</dt><dd>${escapeHTML(label)}</dd>`;
    }).join("");
    return `
      <div class="help-kbd-group">
        <h5>${escapeHTML(scope)}</h5>
        <dl class="help-kbd-list">${rows}</dl>
      </div>
    `;
  }).join("");
}

let currentWrap: HTMLDivElement | null = null;

export function openHelp({ scrollTo }: OpenHelpOptions = {}): void {
  // Idempotent — re-opening just re-focuses the existing modal.
  if (currentWrap) {
    if (scrollTo) {
      const el = currentWrap.querySelector(scrollTo);
      if (el) {
        el.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "start",
        });
      }
    }
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `
    <div class="modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <h3 id="help-title">使用說明</h3>

      <section class="help-section">
        <h4>鍵盤快捷鍵</h4>
        ${buildHotkeyList()}
      </section>

      <section class="help-section">
        <h4>如何分享 Google Docs</h4>
        <ol class="help-share-guide">
          <li>在 Google Docs 中點選右上「共用」按鈕</li>
          <li>在「一般存取權」改為「知道連結的任何人」</li>
          <li>權限保持「檢視者」即可</li>
          <li>複製文件網址</li>
          <li>回到本系統「+ 新增文件」貼入</li>
        </ol>
        <p class="help-note">文件設為「任何人都可檢視」後，需要約 10–30 秒才能被本系統存取。</p>
      </section>

      <section class="help-section">
        <h4>常見問題</h4>
        <details>
          <summary>為什麼 Playlist 編輯時看不到我的文件？</summary>
          <p>編輯器只列出「公開」狀態的文件。請先回「文件」頁把要納入的文件切換到公開。</p>
        </details>
        <details>
          <summary>刪除文件後 Playlist 會怎樣？</summary>
          <p>系統會自動從所有 Playlist 中移除被刪掉的文件。刪除動作無法復原。</p>
        </details>
        <details>
          <summary>如何在播放時遠端控制？</summary>
          <p>進入播放頁面後按 <kbd>R</kbd> 出現 QR Code，手機掃描連線即可遠端操作。</p>
        </details>
      </section>

      <div class="actions">
        <button class="secondary" id="helpClose">關閉</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  currentWrap = wrap;

  const cleanup = (): void => {
    document.removeEventListener("keydown", onKey);
    wrap.remove();
    if (currentWrap === wrap) currentWrap = null;
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") { e.preventDefault(); cleanup(); }
  };
  document.addEventListener("keydown", onKey);

  wrap.addEventListener("click", (e: MouseEvent) => {
    if (e.target === wrap) { cleanup(); return; }
    const target = e.target as Element | null;
    const closeBtn = target?.closest("#helpClose");
    if (closeBtn) cleanup();
  });

  queueMicrotask(() => {
    if (scrollTo) {
      const el = wrap.querySelector(scrollTo);
      if (el) {
        el.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "start",
        });
      }
    }
    (wrap.querySelector("#helpClose") as HTMLElement | null)?.focus();
  });
}

// CustomEvent gateway — any page or any binding can dispatch
// `admin:open-help` and the modal opens. event.detail.scrollTo may
// contain a CSS selector to scroll into view (e.g. ".help-share-guide").
window.addEventListener("admin:open-help", (e: Event) => {
  const detail = (e as CustomEvent<OpenHelpOptions>).detail || {};
  openHelp(detail);
});

// Delegated handler for any element marked data-action="open-help".
// Lets empty states and other links open the modal without re-wiring
// the listener on every render. Optional data-scroll-to attribute is
// passed through.
document.addEventListener("click", (e: MouseEvent) => {
  const target = e.target as Element | null;
  const el = target?.closest('[data-action="open-help"]') as HTMLElement | null;
  if (!el) return;
  e.preventDefault();
  const scrollTo = el.dataset.scrollTo || undefined;
  openHelp({ scrollTo });
});
