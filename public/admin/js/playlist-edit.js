// /admin/playlist-edit — create or edit a playlist.
// URL: ?id=<n> → edit; no id → new.
const params = new URLSearchParams(location.search);
const playlistId = params.get("id") ? Number(params.get("id")) : null;

const titleEl = document.getElementById("title");
const isPublicEl = document.getElementById("isPublic");
const availableEl = document.getElementById("available");
const selectedEl = document.getElementById("selected");
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

// Authoritative model: arrays of doc objects.
let publicDocs = [];              // [{doc_id, title, ...}, ...] — all is_public=1
let selected = [];                 // [{doc_id, title}, ...] in display order

async function loadDocs() {
  const res = await fetch("/api/admin/docs", { credentials: "same-origin" });
  if (!res.ok) throw new Error(`/api/admin/docs → ${res.status}`);
  const all = (await res.json()).docs;
  publicDocs = all.filter((d) => d.is_public);
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

function renderAvailable() {
  const q = filterEl.value.trim().toLowerCase();
  const inSelected = new Set(selected.map((d) => d.doc_id));
  const visible = publicDocs.filter((d) => {
    if (inSelected.has(d.doc_id)) return false;
    if (!q) return true;
    return (d.title || "").toLowerCase().includes(q) ||
           d.doc_id.toLowerCase().includes(q);
  });
  if (visible.length === 0) {
    availableEl.innerHTML = `<div class="empty">${
      publicDocs.length === 0
        ? "沒有公開文件可選。<br>先到「文件」頁把要納入的文件設為公開。"
        : "找不到符合條件的文件"
    }</div>`;
    return;
  }
  availableEl.innerHTML = visible.map((d) => `
    <div class="item" data-doc-id="${escapeHTML(d.doc_id)}">
      <div class="title">${escapeHTML(d.title || d.doc_id)}
        <div class="doc-id">${escapeHTML(d.doc_id.slice(0, 28))}…</div>
      </div>
      <button class="small-btn" data-action="add">加入 →</button>
    </div>
  `).join("");
}

function renderSelected() {
  selectedCountEl.textContent = selected.length ? `${selected.length} 份` : "";
  if (selected.length === 0) {
    selectedEl.innerHTML = `<div class="empty">點左側文件加入清單</div>`;
    return;
  }
  selectedEl.innerHTML = selected.map((d, i) => `
    <div class="item" data-doc-id="${escapeHTML(d.doc_id)}" data-index="${i}">
      <span class="index">${i + 1}</span>
      <div class="title">${escapeHTML(d.title || d.doc_id)}${d.missing ? ' <span style="color:#ef4444;font-size:11px">(找不到，可能已刪除或變私有)</span>' : ""}
        <div class="doc-id">${escapeHTML(d.doc_id.slice(0, 28))}…</div>
      </div>
      <button class="small-btn" data-action="up"   ${i === 0 ? "disabled" : ""}>↑</button>
      <button class="small-btn" data-action="down" ${i === selected.length - 1 ? "disabled" : ""}>↓</button>
      <button class="small-btn" data-action="remove">移除</button>
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

filterEl.addEventListener("input", renderAvailable);

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
