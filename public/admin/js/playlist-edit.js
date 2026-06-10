// /admin/playlist-edit — create or edit a playlist.
// URL: ?id=<n> → edit; no id → new.
import "./theme.js";
import { renderPager, slice, totalPages } from "./pager.js";
import { confirmDestructive } from "./confirm-modal.js";
import { notify, classifyHttpError } from "./notify.js";
import { bindHotkey } from "./hotkeys.js";
import "./help-modal.js";

const params = new URLSearchParams(location.search);
const playlistId = params.get("id") ? Number(params.get("id")) : null;

const titleEl = document.getElementById("title");
const isPublicEl = document.getElementById("isPublic");
const availableEl = document.getElementById("available");
const selectedEl = document.getElementById("selected");
const availablePagerEl = document.getElementById("availablePager");
const filterEl = document.getElementById("filter");
const selectedFilterEl = document.getElementById("selectedFilter");
const selectedCountEl = document.getElementById("selectedCount");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");
const pageTitleEl = document.getElementById("pageTitle");

if (playlistId) pageTitleEl.textContent = "編輯 Playlist";

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function fmtDate(s) {
  if (!s) return "";
  const t = new Date(s.replace(" ", "T") + "Z");
  if (Number.isNaN(t.getTime())) return s;
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

// Authoritative model: arrays of doc objects.
let publicDocs = [];              // [{doc_id, title, created_at, ...}, ...] — all is_public=1, sorted by created_at desc
let selected = [];                 // [{doc_id, title}, ...] in display order
let availablePage = 0;
let isDirty = false;
let pendingJustAdded = null;       // doc_id to highlight after next renderSelected()
const markDirty = () => { isDirty = true; };
const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

async function loadDocs() {
  const res = await fetch("/api/admin/docs", { credentials: "same-origin" });
  if (!res.ok) throw new Error(`/api/admin/docs → ${res.status}`);
  const all = (await res.json()).docs;
  // Server already returns created_at desc; keeping the sort explicit here
  // so the picker is robust if the server contract changes.
  publicDocs = all
    .filter((d) => d.is_public)
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

async function loadPlaylistIfEdit() {
  if (!playlistId) return;
  const res = await fetch(`/api/admin/playlists/${playlistId}`, { credentials: "same-origin" });
  if (!res.ok) {
    const { message } = classifyHttpError(res.status);
    statusEl.textContent = `載入失敗：${message}`;
    // Status text sits beneath the form fields; on long screens it lands
    // below the fold. Mirror the failure as a toast so the user doesn't
    // miss it after a fresh page load.
    notify({ tone: "error", title: "Playlist 載入失敗", body: message });
    return;
  }
  const p = (await res.json()).playlist;
  titleEl.value = p.title;
  isPublicEl.checked = !!p.is_public;
  // Build selected[] in original order. Docs not currently public are kept
  // by their doc_id so editing doesn't silently drop them; their title
  // falls back to the doc_id.
  const byId = new Map(publicDocs.map((d) => [d.doc_id, d]));
  selected = p.doc_ids.map((id) => byId.get(id) || { doc_id: id, title: id, missing: true });
}

function filteredAvailable() {
  const q = filterEl.value.trim().toLowerCase();
  const inSelected = new Set(selected.map((d) => d.doc_id));
  return publicDocs.filter((d) => {
    if (inSelected.has(d.doc_id)) return false;
    if (!q) return true;
    return (d.title || "").toLowerCase().includes(q) ||
           d.doc_id.toLowerCase().includes(q);
  });
}

function renderAvailable() {
  const list = filteredAvailable();
  if (list.length === 0) {
    availableEl.innerHTML = `<div class="empty">
      <span class="material-symbols-rounded">${publicDocs.length === 0 ? "lock" : "search_off"}</span>
      ${publicDocs.length === 0
        ? `沒有公開文件可選。<br>先到「文件」頁把要納入的文件設為公開。<br><a href="#" data-action="open-help" data-scroll-to=".help-share-guide">需要分享教學？</a>`
        : "找不到符合條件的文件"}
    </div>`;
    availablePagerEl.innerHTML = "";
    return;
  }
  const pages = totalPages(list.length);
  if (availablePage >= pages) availablePage = pages - 1;
  const visible = slice(list, availablePage);
  availableEl.innerHTML = visible.map((d) => `
    <div class="item" data-doc-id="${escapeHTML(d.doc_id)}">
      <div class="title">
        <span class="title-text">${escapeHTML(d.title || d.doc_id)}</span>
        <div class="doc-meta">
          <span class="doc-id">${escapeHTML(d.doc_id.slice(0, 22))}…</span>
          <span class="doc-date">${fmtDate(d.created_at)}</span>
        </div>
      </div>
      <button class="icon-btn-sm primary" data-action="add" title="加入清單" aria-label="加入清單">
        <span class="material-symbols-rounded">add</span>
      </button>
    </div>
  `).join("");
  renderPager({
    targetEl: availablePagerEl,
    total: list.length,
    page: availablePage,
    onChange: (next) => { availablePage = next; renderAvailable(); availableEl.scrollTop = 0; },
  });
}

function selectedFilterQuery() {
  return selectedFilterEl ? selectedFilterEl.value.trim().toLowerCase() : "";
}

function matchesSelectedFilter(d, q) {
  if (!q) return true;
  return (d.title || "").toLowerCase().includes(q) ||
         d.doc_id.toLowerCase().includes(q);
}

function renderSelected() {
  const total = selected.length;
  const q = selectedFilterQuery();
  const visibleCount = q
    ? selected.reduce((n, d) => (matchesSelectedFilter(d, q) ? n + 1 : n), 0)
    : total;

  const has = total > 0;
  selectedCountEl.style.display = has ? "" : "none";
  if (has) {
    selectedCountEl.textContent = (q && visibleCount < total)
      ? `已加入 ${total} 份 (顯示 ${visibleCount})`
      : `${total} 份`;
  } else {
    selectedCountEl.textContent = "";
  }

  if (!has) {
    selectedEl.innerHTML = `<div class="empty">
      <span class="material-symbols-rounded">add_circle</span>
      點左側文件加入清單
    </div>`;
    return;
  }
  // Panel-level warning banner — fires once when any selected items are missing
  // (i.e. set to private at the doc level). Lifts what used to be an 11px inline
  // red span on each missing row up to a single recognition signal at the top
  // of the panel body. Individual rows keep a small lock icon next to the index
  // badge so the user can still spot which entries are affected.
  const missingCount = selected.reduce((n, d) => (d.missing ? n + 1 : n), 0);
  const banner = missingCount > 0
    ? `<div class="ds-panel-banner ds-panel-banner--warning" role="status">
         <span class="material-symbols-rounded">warning</span>
         <div>
           <strong>${missingCount} 份文件已設為私有</strong>
           <p>它們不會在播放時顯示。請改回公開、或從清單移除。</p>
         </div>
       </div>`
    : "";
  if (q && visibleCount === 0) {
    selectedEl.innerHTML = `${banner}<div class="empty">
      <span class="material-symbols-rounded">search_off</span>
      目前 filter 沒有 match
    </div>`;
    return;
  }
  selectedEl.innerHTML = banner + selected.map((d, i) => {
    const hidden = q && !matchesSelectedFilter(d, q);
    const missingIcon = d.missing
      ? '<span class="ds-row-missing-icon material-symbols-rounded" aria-label="已私有" title="已設為私有">lock</span>'
      : "";
    return `
    <div class="item" data-doc-id="${escapeHTML(d.doc_id)}" data-index="${i}" draggable="true"${hidden ? ' style="display:none"' : ""}>
      ${missingIcon}<span class="index">${i + 1}</span>
      <div class="title">
        <span class="title-text">${escapeHTML(d.title || d.doc_id)}</span>
        <div class="doc-meta">
          <span class="doc-id">${escapeHTML(d.doc_id.slice(0, 22))}…</span>
          ${d.created_at ? `<span class="doc-date">${fmtDate(d.created_at)}</span>` : ""}
        </div>
      </div>
      <button class="icon-btn-sm" data-action="up" title="上移" aria-label="上移" ${i === 0 ? "disabled" : ""}>
        <span class="material-symbols-rounded">arrow_upward</span>
      </button>
      <button class="icon-btn-sm" data-action="down" title="下移" aria-label="下移" ${i === selected.length - 1 ? "disabled" : ""}>
        <span class="material-symbols-rounded">arrow_downward</span>
      </button>
      <button class="icon-btn-sm danger" data-action="remove" title="移除" aria-label="移除">
        <span class="material-symbols-rounded">close</span>
      </button>
    </div>
  `;
  }).join("");

  // Apply the recent-add pulse + scroll into view if there's a pending one.
  if (pendingJustAdded) {
    const newEl = selectedEl.querySelector(`.item[data-doc-id="${CSS.escape(pendingJustAdded)}"]`);
    const docId = pendingJustAdded;
    pendingJustAdded = null;
    if (newEl) {
      newEl.classList.add("just-added");
      const reduce = prefersReducedMotion();
      try {
        newEl.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      } catch {
        newEl.scrollIntoView();
      }
      setTimeout(() => {
        // Element may have been re-rendered; query fresh.
        const fresh = selectedEl.querySelector(`.item[data-doc-id="${CSS.escape(docId)}"]`);
        if (fresh) fresh.classList.remove("just-added");
      }, 1500);
    }
  }
}

availableEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action='add']");
  if (!btn) return;
  const docId = btn.closest(".item").dataset.docId;
  const d = publicDocs.find((x) => x.doc_id === docId);
  if (!d) return;
  selected.push(d);
  pendingJustAdded = d.doc_id;
  markDirty();
  renderAvailable();
  renderSelected();
});

selectedEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const item = btn.closest(".item");
  const i = Number(item.dataset.index);
  const action = btn.dataset.action;
  if (action === "remove") {
    selected.splice(i, 1);
    markDirty();
  } else if (action === "up" && i > 0) {
    [selected[i - 1], selected[i]] = [selected[i], selected[i - 1]];
    markDirty();
  } else if (action === "down" && i < selected.length - 1) {
    [selected[i + 1], selected[i]] = [selected[i], selected[i + 1]];
    markDirty();
  }
  renderAvailable();
  renderSelected();
});

filterEl.addEventListener("input", () => { availablePage = 0; renderAvailable(); });
if (selectedFilterEl) {
  selectedFilterEl.addEventListener("input", () => { renderSelected(); });
}
titleEl.addEventListener("input", markDirty);
isPublicEl.addEventListener("change", markDirty);

// ── Drag-and-drop reorder for the selected list ──────────────────
// Uses native HTML5 drag-and-drop. ↑/↓ buttons stay for keyboard users.
// Listeners are delegated on selectedEl so re-renders don't leak handlers.
let dragSrcIndex = null;

selectedEl.addEventListener("dragstart", (e) => {
  const item = e.target.closest(".item");
  if (!item || !selectedEl.contains(item)) return;
  dragSrcIndex = Number(item.dataset.index);
  item.classList.add("dragging");
  try {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dragSrcIndex));
  } catch {
    /* some browsers reject setData in certain contexts — fine, we use dragSrcIndex */
  }
});

selectedEl.addEventListener("dragover", (e) => {
  if (dragSrcIndex === null) return;
  e.preventDefault();
  try { e.dataTransfer.dropEffect = "move"; } catch { /* noop */ }
});

selectedEl.addEventListener("drop", (e) => {
  if (dragSrcIndex === null) return;
  e.preventDefault();
  // Find the target row based on cursor position.
  const items = Array.from(selectedEl.querySelectorAll(".item"))
    .filter((el) => el.style.display !== "none");
  let targetIndex = selected.length - 1;
  for (const el of items) {
    const rect = el.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      targetIndex = Number(el.dataset.index);
      break;
    }
    targetIndex = Number(el.dataset.index);
  }
  if (targetIndex === dragSrcIndex) { dragSrcIndex = null; return; }
  const [moved] = selected.splice(dragSrcIndex, 1);
  // splice removed src first; if target was after src in the pre-splice
  // array, its destination index shifts down by one.
  const adjusted = targetIndex > dragSrcIndex ? targetIndex - 1 : targetIndex;
  selected.splice(adjusted, 0, moved);
  dragSrcIndex = null;
  markDirty();
  renderAvailable();
  renderSelected();
});

selectedEl.addEventListener("dragend", (e) => {
  const item = e.target.closest(".item");
  if (item) item.classList.remove("dragging");
  // Clean up any stragglers in case dragend fires on a different node.
  selectedEl.querySelectorAll(".item.dragging").forEach((el) => el.classList.remove("dragging"));
  dragSrcIndex = null;
});

// Native browser guard for tab close / hard reload / address-bar navigation.
window.addEventListener("beforeunload", (e) => {
  if (isDirty) e.preventDefault();
});

// Soft guard for the "取消" link — same-page modal, no native dialog.
const cancelLink = document.querySelector(".footer-bar a.secondary");
if (cancelLink) {
  cancelLink.addEventListener("click", async (e) => {
    if (!isDirty) return;
    e.preventDefault();
    const ok = await confirmDestructive({
      title: "捨棄變更",
      body: "尚未儲存的變更會遺失，確定要離開嗎？",
      dangerLabel: "離開",
      cancelLabel: "繼續編輯",
      tone: "caution",
    });
    if (ok) {
      isDirty = false;
      window.location.href = cancelLink.getAttribute("href");
    }
  });
}

saveBtn.addEventListener("click", async () => {
  const title = titleEl.value.trim();
  if (!title) { statusEl.textContent = "請填入標題"; titleEl.focus(); return; }
  if (selected.length === 0) {
    const ok = await confirmDestructive({
      title: "尚未加入任何文件",
      body: "這個 Playlist 還沒有任何文件，仍要儲存嗎？",
      dangerLabel: "仍要儲存",
      cancelLabel: "繼續編輯",
      tone: "caution",
    });
    if (!ok) return;
  }

  saveBtn.disabled = true;
  saveBtn.classList.add("is-loading");
  const saveLabel = saveBtn.querySelector(".save-btn-label");
  if (saveLabel) saveLabel.textContent = "儲存中…";
  else saveBtn.textContent = "儲存中…";
  statusEl.textContent = "";

  const body = {
    title,
    doc_ids: selected.map((d) => d.doc_id),
    is_public: isPublicEl.checked,
  };
  const url = playlistId
    ? `/api/admin/playlists/${playlistId}`
    : `/api/admin/playlists`;
  const method = playlistId ? "PATCH" : "POST";

  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    const { message } = classifyHttpError(res.status);
    const detail = e.error || message;
    statusEl.textContent = `儲存失敗：${detail}`;
    // Reinforce the inline status (next to the save button) with a toast
    // — the inline copy is for the user already looking there, the toast
    // is for the user whose focus has drifted up the page.
    notify({ tone: "error", title: "儲存失敗", body: detail });
    saveBtn.disabled = false;
    saveBtn.classList.remove("is-loading");
    if (saveLabel) saveLabel.textContent = "儲存";
    else saveBtn.textContent = "儲存";
    return;
  }
  isDirty = false;
  notify({ tone: "success", body: `「${title}」已儲存` });
  // Delay navigation 800ms so the success toast renders visibly before the
  // page unloads to /admin/playlists.
  setTimeout(() => {
    window.location.href = "/admin/playlists";
  }, 800);
});

// Tab-refocus reminder: when the user comes back to a dirty playlist
// editor, surface a caution toast. The 法會 setup workflow often involves
// stepping away to double-check a Google Doc, then forgetting that the
// editor is mid-edit.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && isDirty) {
    notify({ tone: "caution", body: "你還有未儲存的變更。", durationMs: 4000 });
  }
});

// ── Hotkeys ──────────────────────────────────────────────────────
bindHotkey({
  key: "?", label: "顯示快速鍵說明", scope: "全域",
  handler: () => window.dispatchEvent(new CustomEvent("admin:open-help")),
});
bindHotkey({
  key: "/", label: "聚焦搜尋", scope: "全域",
  handler: () => { filterEl.focus(); filterEl.select(); },
});
bindHotkey({
  key: "s", mod: "cmd", label: "儲存", scope: "編輯",
  handler: () => { if (!saveBtn.disabled) saveBtn.click(); },
});
bindHotkey({
  key: "Escape", label: "取消（回到 Playlist 列表）", scope: "編輯",
  handler: () => {
    // If a filter is focused, clear focus first; otherwise fall through
    // to the cancel link (with the dirty guard built into its handler).
    if (document.activeElement === filterEl || document.activeElement === selectedFilterEl) {
      document.activeElement.blur();
      return;
    }
    // Use the link's existing click handler (with its dirty-guard) when set;
    // for a clean state fall back to direct navigation.
    if (cancelLink) {
      if (isDirty) cancelLink.click();
      else window.location.href = cancelLink.getAttribute("href");
    }
  },
});

// ── boot ─────────────────────────────────────────────────────────
try {
  await loadDocs();
  await loadPlaylistIfEdit();
  renderAvailable();
  renderSelected();
} catch (err) {
  statusEl.textContent = `載入失敗：${err.message}`;
}
