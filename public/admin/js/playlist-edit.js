// /admin/playlist-edit — create or edit a playlist.
// URL: ?id=<n> → edit; no id → new.
import { renderPager, slice, totalPages } from "./pager.js";

const params = new URLSearchParams(location.search);
const playlistId = params.get("id") ? Number(params.get("id")) : null;

const titleEl = document.getElementById("title");
const isPublicEl = document.getElementById("isPublic");
const availableEl = document.getElementById("available");
const selectedEl = document.getElementById("selected");
const availablePagerEl = document.getElementById("availablePager");
const filterEl = document.getElementById("filter");
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
    statusEl.textContent = `載入失敗 (${res.status})`;
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
        ? "沒有公開文件可選。<br>先到「文件」頁把要納入的文件設為公開。"
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
      <button class="icon-btn-sm primary" data-action="add" title="加入清單">
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

function renderSelected() {
  const has = selected.length > 0;
  selectedCountEl.style.display = has ? "" : "none";
  selectedCountEl.textContent = has ? `${selected.length} 份` : "";
  if (!has) {
    selectedEl.innerHTML = `<div class="empty">
      <span class="material-symbols-rounded">add_circle</span>
      點左側文件加入清單
    </div>`;
    return;
  }
  selectedEl.innerHTML = selected.map((d, i) => `
    <div class="item" data-doc-id="${escapeHTML(d.doc_id)}" data-index="${i}">
      <span class="index">${i + 1}</span>
      <div class="title">
        <span class="title-text">${escapeHTML(d.title || d.doc_id)}${d.missing ? ' <span style="color:#c54a35;font-size:11px">(已設為私有，請改回公開或移除)</span>' : ""}</span>
        <div class="doc-meta">
          <span class="doc-id">${escapeHTML(d.doc_id.slice(0, 22))}…</span>
          ${d.created_at ? `<span class="doc-date">${fmtDate(d.created_at)}</span>` : ""}
        </div>
      </div>
      <button class="icon-btn-sm" data-action="up" title="上移" ${i === 0 ? "disabled" : ""}>
        <span class="material-symbols-rounded">arrow_upward</span>
      </button>
      <button class="icon-btn-sm" data-action="down" title="下移" ${i === selected.length - 1 ? "disabled" : ""}>
        <span class="material-symbols-rounded">arrow_downward</span>
      </button>
      <button class="icon-btn-sm danger" data-action="remove" title="移除">
        <span class="material-symbols-rounded">close</span>
      </button>
    </div>
  `).join("");
}

availableEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action='add']");
  if (!btn) return;
  const docId = btn.closest(".item").dataset.docId;
  const d = publicDocs.find((x) => x.doc_id === docId);
  if (!d) return;
  selected.push(d);
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
  } else if (action === "up" && i > 0) {
    [selected[i - 1], selected[i]] = [selected[i], selected[i - 1]];
  } else if (action === "down" && i < selected.length - 1) {
    [selected[i + 1], selected[i]] = [selected[i], selected[i + 1]];
  }
  renderAvailable();
  renderSelected();
});

filterEl.addEventListener("input", () => { availablePage = 0; renderAvailable(); });

saveBtn.addEventListener("click", async () => {
  const title = titleEl.value.trim();
  if (!title) { statusEl.textContent = "請填入標題"; titleEl.focus(); return; }
  if (selected.length === 0 && !confirm("尚未加入任何文件，仍要儲存嗎？")) return;

  saveBtn.disabled = true;
  saveBtn.textContent = "儲存中…";
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
    statusEl.textContent = `儲存失敗：${e.error || res.status}`;
    saveBtn.disabled = false;
    saveBtn.textContent = "儲存";
    return;
  }
  window.location.href = "/admin/playlists";
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
