// /admin dashboard — docs list + actions.
import { renderPager, slice, totalPages } from "./pager.js";
import { confirmDestructive } from "./confirm-modal.js";

const contentEl = document.getElementById("content");
const docsCountEl = document.getElementById("docsCount");

function fmtDate(s) {
  // Drust stores "YYYY-MM-DD HH:MM:SS" UTC. Show local YYYY-MM-DD.
  if (!s) return "";
  const t = new Date(s.replace(" ", "T") + "Z");
  if (Number.isNaN(t.getTime())) return s;
  const yyyy = t.getFullYear();
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

let docs = [];
let page = 0;

async function refresh() {
  contentEl.innerHTML = `<div class="loading-state">載入中…</div>`;
  const res = await fetch("/api/admin/docs", { credentials: "same-origin" });
  if (!res.ok) {
    contentEl.innerHTML = `<div class="empty-state">
      <h3>載入失敗</h3>
      <p>HTTP ${res.status}</p>
    </div>`;
    return;
  }
  docs = (await res.json()).docs;
  page = 0;
  renderTable();
}

function renderTable() {
  docsCountEl.textContent = `${docs.length} 筆`;
  if (docs.length === 0) {
    contentEl.innerHTML = `<div class="empty-state">
      <h3>還沒有文件</h3>
      <p>點選右上「新增文件」貼入 Google Docs 網址，即可建立第一筆。</p>
    </div>`;
    return;
  }
  // Clamp page after a delete shrinks the list past the current page bounds.
  const pages = totalPages(docs.length);
  if (page >= pages) page = pages - 1;
  const visible = slice(docs, page);

  const rows = visible.map((d) => {
    const stateBadge = d.is_public
      ? `<span class="state-badge state-badge--public">公開</span>`
      : `<span class="state-badge state-badge--draft">草稿</span>`;
    // In-playlist count is a TODO — requires intersecting all playlists' doc_ids
    // with the docs list. Placeholder kept so the column reads as designed.
    const playlistCount = `<span class="state-meta">在 — 個 playlist</span>`;
    return `
    <tr data-doc-id="${escapeHTML(d.doc_id)}">
      <td class="col-title">
        <span class="link" data-action="view">${escapeHTML(d.title || d.doc_id)}</span>
      </td>
      <td class="col-state">${stateBadge} ${playlistCount}</td>
      <td class="col-date">${fmtDate(d.created_at)}</td>
      <td>
        <label class="toggle">
          <input type="checkbox" data-action="toggle" aria-label="切換公開狀態" ${d.is_public ? "checked" : ""}>
          <span class="track"></span>
        </label>
      </td>
      <td class="col-actions">
        <button class="icon-btn" data-action="view" title="預覽（新分頁）" aria-label="預覽（新分頁）">
          <span class="material-symbols-rounded">visibility</span>
        </button>
        <button class="icon-btn" data-action="edit" title="編輯" aria-label="編輯">
          <span class="material-symbols-rounded">edit</span>
        </button>
        <button class="icon-btn danger" data-action="delete" title="刪除" aria-label="刪除">
          <span class="material-symbols-rounded">delete</span>
        </button>
      </td>
    </tr>
  `;
  }).join("");

  contentEl.innerHTML = `
    <table class="docs-table">
      <thead>
        <tr>
          <th>標題</th>
          <th style="width:140px">狀態</th>
          <th style="width:130px">建立日期</th>
          <th style="width:90px">公開</th>
          <th style="width:180px"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="pager" id="pager"></div>
  `;

  contentEl.querySelector("tbody").addEventListener("click", onRowAction);
  contentEl.querySelector("tbody").addEventListener("change", onRowAction);
  renderPager({
    targetEl: contentEl.querySelector("#pager"),
    total: docs.length,
    page,
    onChange: (next) => { page = next; renderTable(); window.scrollTo({ top: 0, behavior: "smooth" }); },
  });
}

async function onRowAction(e) {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const tr = target.closest("tr");
  const docId = tr.dataset.docId;
  const action = target.dataset.action;

  if (action === "view") {
    window.open(`/slides/?src=${encodeURIComponent(docId)}`, "_blank");
    return;
  }
  if (action === "edit") {
    location.href = `/edit/?src=${encodeURIComponent(docId)}`;
    return;
  }
  if (action === "toggle") {
    const next = target.checked;
    // Friction on off→on only: making something public has a consequence;
    // un-publishing is the conservative direction and stays one click.
    if (next === true) {
      const ok = await confirmDestructive({
        title: "設為公開",
        body: "設為公開後，任何拿到網址的人都能看到這份簡報。確定要公開嗎？",
        dangerLabel: "設為公開",
        cancelLabel: "取消",
        tone: "caution",
      });
      if (!ok) {
        target.checked = false;
        return;
      }
    }
    const res = await fetch(`/api/admin/docs/${encodeURIComponent(docId)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_public: next }),
    });
    if (!res.ok) {
      alert(`切換公開狀態失敗（HTTP ${res.status}）`);
      target.checked = !next;
    } else {
      const d = docs.find((x) => x.doc_id === docId);
      if (d) d.is_public = next ? 1 : 0;
    }
    return;
  }
  if (action === "delete") {
    const d = docs.find((x) => x.doc_id === docId);
    const ok = await confirmDestructive({
      title: "刪除文件",
      body: `確定要刪除「${escapeHTML(d?.title || docId)}」嗎？此操作無法復原，且會同步從所有 Playlist 移除。`,
      dangerLabel: "刪除",
      cancelLabel: "取消",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/docs/${encodeURIComponent(docId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) {
      alert(`刪除失敗（HTTP ${res.status}）`);
      return;
    }
    docs = docs.filter((x) => x.doc_id !== docId);
    renderTable();
  }
}

// ── New-doc modal ───────────────────────────────────────────────
document.getElementById("newDocBtn").addEventListener("click", openNewDocModal);
function openNewDocModal() {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `
    <div class="modal">
      <h3>新增文件</h3>
      <p class="desc">貼入 Google Docs 分享網址。文件需設為「任何人都可檢視」。</p>
      <label>Google Docs 網址</label>
      <input id="newDocUrl" type="url" placeholder="https://docs.google.com/document/d/..." autofocus>
      <div class="error" id="newDocErr"></div>
      <div class="actions">
        <button class="secondary" id="newDocCancel">取消</button>
        <button class="primary" id="newDocSubmit">匯入</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  wrap.querySelector("#newDocCancel").addEventListener("click", close);
  wrap.querySelector("#newDocSubmit").addEventListener("click", async () => {
    const url = wrap.querySelector("#newDocUrl").value.trim();
    const errEl = wrap.querySelector("#newDocErr");
    const submitBtn = wrap.querySelector("#newDocSubmit");
    if (!/\/document\/d\/[a-zA-Z0-9_-]+/.test(url)) {
      errEl.textContent = "請貼入完整的 Google Docs 網址";
      return;
    }
    errEl.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "匯入中…";
    try {
      const res = await fetch("/api/fetch-doc", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        errEl.textContent = body.error || `匯入失敗（HTTP ${res.status}）`;
        submitBtn.disabled = false;
        submitBtn.textContent = "匯入";
        return;
      }
      close();
      // Force metadata entry — every newly imported doc passes through the edit
      // page before it appears on the slides surface. body.doc_id is the
      // canonical id (extracted server-side from the pasted URL).
      location.href = `/edit/?src=${encodeURIComponent(body.doc_id)}`;
    } catch (err) {
      errEl.textContent = `網路錯誤：${err.message}`;
      submitBtn.disabled = false;
      submitBtn.textContent = "匯入";
    }
  });
}

refresh();
