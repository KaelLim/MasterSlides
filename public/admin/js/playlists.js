// /admin/playlists — list playlists + actions.
import { renderPager, slice, totalPages } from "./pager.js";
import { confirmDestructive } from "./confirm-modal.js";

const contentEl = document.getElementById("content");
const countEl = document.getElementById("count");

function fmtDate(s) {
  if (!s) return "";
  const t = new Date(s.replace(" ", "T") + "Z");
  if (Number.isNaN(t.getTime())) return s;
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

let playlists = [];
let page = 0;

async function refresh() {
  contentEl.innerHTML = `<div class="loading-state">載入中…</div>`;
  const res = await fetch("/api/admin/playlists", { credentials: "same-origin" });
  if (!res.ok) {
    contentEl.innerHTML = `<div class="empty-state"><h3>載入失敗</h3><p>HTTP ${res.status}</p></div>`;
    return;
  }
  playlists = (await res.json()).playlists;
  page = 0;
  render();
}

function render() {
  countEl.textContent = `${playlists.length} 筆`;
  if (playlists.length === 0) {
    contentEl.innerHTML = `<div class="empty-state">
      <h3>還沒有 Playlist</h3>
      <p>點選右上「新增 Playlist」建立第一筆。</p>
    </div>`;
    return;
  }
  const pages = totalPages(playlists.length);
  if (page >= pages) page = pages - 1;
  const visible = slice(playlists, page);

  const rows = visible.map((p) => `
    <tr data-id="${p.id}">
      <td class="col-title"><a class="link" href="/admin/playlist-edit?id=${p.id}">${escapeHTML(p.title)}</a></td>
      <td>${p.doc_ids.length} 份</td>
      <td class="col-date">${fmtDate(p.created_at)}</td>
      <td>
        <label class="toggle">
          <input type="checkbox" data-action="toggle" aria-label="切換公開狀態" ${p.is_public ? "checked" : ""}>
          <span class="track"></span>
        </label>
      </td>
      <td class="col-actions">
        <button class="icon-btn" data-action="play" title="開始播放" aria-label="開始播放">
          <span class="material-symbols-rounded">play_arrow</span>
        </button>
        <button class="icon-btn" data-action="edit" title="編輯" aria-label="編輯">
          <span class="material-symbols-rounded">edit</span>
        </button>
        <button class="icon-btn danger" data-action="delete" title="刪除" aria-label="刪除">
          <span class="material-symbols-rounded">delete</span>
        </button>
      </td>
    </tr>
  `).join("");

  contentEl.innerHTML = `
    <table class="docs-table">
      <thead>
        <tr>
          <th>標題</th>
          <th style="width:100px">文件數</th>
          <th style="width:130px">建立日期</th>
          <th style="width:90px">公開</th>
          <th style="width:180px"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="pager" id="pager"></div>
  `;
  contentEl.querySelector("tbody").addEventListener("click", onAction);
  contentEl.querySelector("tbody").addEventListener("change", onAction);
  renderPager({
    targetEl: contentEl.querySelector("#pager"),
    total: playlists.length,
    page,
    onChange: (next) => { page = next; render(); window.scrollTo({ top: 0, behavior: "smooth" }); },
  });
}

async function onAction(e) {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const tr = t.closest("tr");
  const id = Number(tr.dataset.id);
  const p = playlists.find((x) => x.id === id);
  const action = t.dataset.action;

  if (action === "play") {
    if (p && p.doc_ids.length > 0) {
      window.open(`/slides/?playlist=${id}`, "_blank");
    } else {
      alert("這個 Playlist 還沒有加入任何文件。");
    }
    return;
  }
  if (action === "edit") {
    window.location.href = `/admin/playlist-edit?id=${id}`;
    return;
  }
  if (action === "toggle") {
    const next = t.checked;
    if (next === true) {
      const ok = await confirmDestructive({
        title: "設為公開",
        body: "設為公開後，任何拿到網址的人都能看到這份簡報。確定要公開嗎？",
        dangerLabel: "設為公開",
        cancelLabel: "取消",
        tone: "caution",
      });
      if (!ok) {
        t.checked = false;
        return;
      }
    }
    const res = await fetch(`/api/admin/playlists/${id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_public: next }),
    });
    if (!res.ok) {
      alert(`切換失敗（${res.status}）`);
      t.checked = !next;
    } else if (p) {
      p.is_public = next ? 1 : 0;
    }
    return;
  }
  if (action === "delete") {
    const ok = await confirmDestructive({
      title: "刪除 Playlist",
      body: `確定要刪除「${escapeHTML(p?.title)}」嗎？此操作無法復原。`,
      dangerLabel: "刪除",
      cancelLabel: "取消",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/playlists/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) { alert(`刪除失敗（${res.status}）`); return; }
    playlists = playlists.filter((x) => x.id !== id);
    render();
  }
}

refresh();
