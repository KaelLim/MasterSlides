// /admin dashboard — docs list + actions.
import { renderPager, slice, totalPages } from "./pager.js";
import { confirmDestructive } from "./confirm-modal.js";
import { notify, classifyHttpError } from "./notify.js";
import { bindHotkey } from "./hotkeys.js";
import "./help-modal.js";

const contentEl = document.getElementById("content");
const docsCountEl = document.getElementById("docsCount");
const filterEl = document.getElementById("docsFilter");
const selectionBarEl = document.getElementById("selectionBar");
const selectionCountEl = document.getElementById("selectionCount");

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
let filterQ = "";
// docId → number of playlists that reference it. Populated in refresh() so
// renderTable() can show the 在 N 個 playlist badge without re-fetching.
let playlistCountByDocId = new Map();

// Multi-select state.
const selectedDocIds = new Set();
let highlightedIndex = -1;     // index within the currently visible page slice
let lastShiftAnchorIndex = -1; // for shift-click range selection

async function fetchPlaylistCounts() {
  // Best-effort: a failure here just leaves the counts empty so the column
  // falls back to 未使用 rather than blocking the whole dashboard.
  try {
    const res = await fetch("/api/admin/playlists", { credentials: "same-origin" });
    if (!res.ok) { playlistCountByDocId = new Map(); return; }
    const { playlists } = await res.json();
    const map = new Map();
    for (const p of (playlists || [])) {
      for (const id of (p.doc_ids || [])) {
        map.set(id, (map.get(id) || 0) + 1);
      }
    }
    playlistCountByDocId = map;
  } catch {
    playlistCountByDocId = new Map();
  }
}

async function refresh() {
  contentEl.innerHTML = `<div class="loading-state">載入中…</div>`;
  const res = await fetch("/api/admin/docs", { credentials: "same-origin" });
  if (!res.ok) {
    const { message } = classifyHttpError(res.status);
    contentEl.innerHTML = `<div class="empty-state">
      <h3>載入失敗</h3>
      <p>${message}</p>
      <p><button class="primary" id="reloadDocs">重新載入</button></p>
    </div>`;
    const btn = contentEl.querySelector("#reloadDocs");
    if (btn) btn.addEventListener("click", refresh);
    return;
  }
  docs = (await res.json()).docs;
  // Run after docs so a slow playlist fetch doesn't delay the first paint of
  // the table; we re-render once counts arrive.
  await fetchPlaylistCounts();
  page = 0;
  renderTable();
}

function filteredDocs() {
  const q = filterQ.trim().toLowerCase();
  if (!q) return docs;
  return docs.filter((d) =>
    (d.title || "").toLowerCase().includes(q) ||
    (d.doc_id || "").toLowerCase().includes(q)
  );
}

// First-run welcome banner. Shows once, only while the docs list is empty.
// Dismissal is persisted via localStorage so the banner stays gone after a
// reload — even if the user later deletes every doc and returns to a zero
// state.
const FIRST_RUN_KEY = "admin_seen_v1";
function hasSeenFirstRun() {
  try { return localStorage.getItem(FIRST_RUN_KEY) === "1"; }
  catch { return true; /* if storage is blocked, suppress the banner */ }
}
function markFirstRunSeen() {
  try { localStorage.setItem(FIRST_RUN_KEY, "1"); } catch { /* noop */ }
}
function renderFirstRunBanner() {
  if (hasSeenFirstRun()) return "";
  return `
    <div class="ds-first-run" id="firstRunBanner" role="status">
      <span class="material-symbols-rounded ds-first-run__icon">waving_hand</span>
      <div class="ds-first-run__body">
        <strong>歡迎使用簡報後台</strong>
        <p>點右上「<span class="material-symbols-rounded inline">add</span> 新增文件」貼入 Google Docs 網址即可開始。需要 Google Docs 怎麼分享嗎？按 <kbd>?</kbd> 看教學。</p>
      </div>
      <button class="ds-first-run__dismiss" id="firstRunDismiss" aria-label="關閉歡迎訊息">
        <span class="material-symbols-rounded">close</span>
      </button>
    </div>
  `;
}
function wireFirstRunBanner() {
  const btn = contentEl.querySelector("#firstRunDismiss");
  if (!btn) return;
  btn.addEventListener("click", () => {
    markFirstRunSeen();
    const banner = contentEl.querySelector("#firstRunBanner");
    if (banner) banner.remove();
  });
}

function renderTable() {
  const list = filteredDocs();
  docsCountEl.textContent = filterQ
    ? `${list.length} / ${docs.length} 筆`
    : `${docs.length} 筆`;
  if (docs.length === 0) {
    contentEl.innerHTML = `${renderFirstRunBanner()}<div class="empty-state">
      <h3>還沒有文件</h3>
      <p>點選右上「新增文件」貼入 Google Docs 網址，即可建立第一筆。</p>
      <p class="empty-state__hint">需要教學？按 <kbd>?</kbd>，或<a href="#" data-action="open-help" data-scroll-to=".help-share-guide">查看 Google Docs 分享教學</a>。</p>
    </div>`;
    wireFirstRunBanner();
    updateSelectionBar();
    return;
  }
  if (list.length === 0) {
    contentEl.innerHTML = `<div class="empty-state">
      <h3>找不到符合條件的文件</h3>
      <p>調整搜尋條件，或清空 filter 看全部。</p>
    </div>`;
    updateSelectionBar();
    return;
  }
  // Clamp page after a delete shrinks the list past the current page bounds.
  const pages = totalPages(list.length);
  if (page >= pages) page = pages - 1;
  const visible = slice(list, page);
  if (highlightedIndex >= visible.length) highlightedIndex = visible.length - 1;

  const rows = visible.map((d, i) => {
    const stateLabel = d.is_public
      ? `<span class="state state--public">公開</span>`
      : `<span class="state state--draft">草稿</span>`;
    const n = playlistCountByDocId.get(d.doc_id) || 0;
    const stateMeta = n > 0
      ? `<span class="state-sep">·</span><span class="state-meta">在 ${n} 個 playlist</span>`
      : `<span class="state-sep">·</span><span class="state-meta state-meta--unused">未使用</span>`;
    const isSel = selectedDocIds.has(d.doc_id);
    const isHi = i === highlightedIndex;
    return `
    <tr data-doc-id="${escapeHTML(d.doc_id)}" data-row-index="${i}"
        class="${isSel ? "is-selected" : ""} ${isHi ? "is-highlighted" : ""}"
        ${isHi ? 'aria-selected="true"' : ""}>
      <td class="col-select">
        <input type="checkbox" class="row-check" data-action="select"
               aria-label="選取此列" ${isSel ? "checked" : ""}>
      </td>
      <td class="col-title">
        <span class="link" data-action="view">${escapeHTML(d.title || d.doc_id)}</span>
      </td>
      <td class="col-state">${stateLabel}${stateMeta}</td>
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

  const allVisibleSelected = visible.length > 0 &&
    visible.every((d) => selectedDocIds.has(d.doc_id));

  contentEl.innerHTML = `
    <table class="docs-table">
      <thead>
        <tr>
          <th class="col-select">
            <input type="checkbox" id="selectAllVisible" aria-label="選取本頁全部"
                   ${allVisibleSelected ? "checked" : ""}>
          </th>
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
  const headerCheck = contentEl.querySelector("#selectAllVisible");
  if (headerCheck) {
    headerCheck.addEventListener("change", () => {
      const v = headerCheck.checked;
      for (const d of visible) {
        if (v) selectedDocIds.add(d.doc_id);
        else selectedDocIds.delete(d.doc_id);
      }
      renderTable();
    });
  }
  renderPager({
    targetEl: contentEl.querySelector("#pager"),
    total: list.length,
    page,
    onChange: (next) => {
      page = next;
      highlightedIndex = -1;
      renderTable();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });
  updateSelectionBar();
}

function updateSelectionBar() {
  const n = selectedDocIds.size;
  if (n === 0) {
    selectionBarEl.hidden = true;
    return;
  }
  selectionBarEl.hidden = false;
  selectionCountEl.textContent = `已選 ${n} 份`;
}

function currentVisible() {
  return slice(filteredDocs(), page);
}

function highlightRow(nextIndex) {
  const visible = currentVisible();
  if (visible.length === 0) return;
  const clamped = Math.max(0, Math.min(visible.length - 1, nextIndex));
  highlightedIndex = clamped;
  // Re-render rows' highlight state by targeted class swap (cheaper than full
  // renderTable, and avoids stealing focus from filter input).
  const trs = contentEl.querySelectorAll("tbody tr");
  trs.forEach((tr, i) => {
    if (i === clamped) {
      tr.classList.add("is-highlighted");
      tr.setAttribute("aria-selected", "true");
      tr.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else {
      tr.classList.remove("is-highlighted");
      tr.removeAttribute("aria-selected");
    }
  });
}

async function onRowAction(e) {
  // Multi-select checkbox: handle separately so click doesn't bubble into the
  // generic row-action path.
  const checkTarget = e.target.closest("input.row-check");
  if (checkTarget && e.type === "change") {
    const tr = checkTarget.closest("tr");
    const docId = tr.dataset.docId;
    const rowIndex = Number(tr.dataset.rowIndex);
    if (e.shiftKey || (e instanceof MouseEvent && e.shiftKey)) {
      // shiftKey not normally present on `change`; the click path handles range.
    }
    if (checkTarget.checked) selectedDocIds.add(docId);
    else selectedDocIds.delete(docId);
    tr.classList.toggle("is-selected", checkTarget.checked);
    lastShiftAnchorIndex = rowIndex;
    updateSelectionBar();
    // Update header select-all reflection.
    const visible = currentVisible();
    const headerCheck = contentEl.querySelector("#selectAllVisible");
    if (headerCheck) {
      headerCheck.checked = visible.every((d) => selectedDocIds.has(d.doc_id));
    }
    return;
  }
  // Shift-click range extension fires on click (the change comes after).
  if (e.type === "click" && checkTarget && e.shiftKey && lastShiftAnchorIndex >= 0) {
    const tr = checkTarget.closest("tr");
    const rowIndex = Number(tr.dataset.rowIndex);
    const visible = currentVisible();
    const [lo, hi] = rowIndex < lastShiftAnchorIndex
      ? [rowIndex, lastShiftAnchorIndex]
      : [lastShiftAnchorIndex, rowIndex];
    // Defer to after the native toggle resolves the clicked row's checked state.
    queueMicrotask(() => {
      const targetState = checkTarget.checked;
      for (let i = lo; i <= hi; i++) {
        const d = visible[i];
        if (!d) continue;
        if (targetState) selectedDocIds.add(d.doc_id);
        else selectedDocIds.delete(d.doc_id);
      }
      renderTable();
    });
    return;
  }

  const target = e.target.closest("[data-action]");
  if (!target) return;
  // Skip the select checkbox here — it has its own handler above.
  if (target.dataset.action === "select") return;
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
    const toggleLabel = target.closest(".toggle");
    const togglePublic = async () => {
      if (toggleLabel) toggleLabel.classList.add("is-toggling");
      try {
        const res = await fetch(`/api/admin/docs/${encodeURIComponent(docId)}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_public: next }),
        });
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status}`);
          err.status = res.status;
          throw err;
        }
        const d = docs.find((x) => x.doc_id === docId);
        if (d) d.is_public = next ? 1 : 0;
        target.checked = next;
      } finally {
        if (toggleLabel) toggleLabel.classList.remove("is-toggling");
      }
    };
    try {
      await togglePublic();
      const d = docs.find((x) => x.doc_id === docId);
      const title = d?.title || docId;
      notify({
        tone: "success",
        body: next ? `「${title}」已公開` : `「${title}」已改為草稿`,
      });
    } catch (err) {
      target.checked = !next;
      const { message } = classifyHttpError(err.status || 0);
      notify({
        tone: "error",
        title: "公開狀態切換失敗",
        body: message,
        retry: togglePublic,
      });
    }
    return;
  }
  if (action === "delete") {
    await deleteDoc(docId);
    return;
  }
}

async function deleteDoc(docId) {
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
    const { message } = classifyHttpError(res.status);
    notify({ tone: "error", title: "刪除失敗", body: message });
    return;
  }
  const deletedTitle = d?.title || docId;
  docs = docs.filter((x) => x.doc_id !== docId);
  selectedDocIds.delete(docId);
  renderTable();
  notify({ tone: "success", body: `「${deletedTitle}」已刪除`, durationMs: 3000 });
  fetchPlaylistCounts().then(() => renderTable());
}

// ── Bulk operations ──────────────────────────────────────────────
selectionBarEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-bulk]");
  if (!btn) return;
  const op = btn.dataset.bulk;
  if (op === "clear") {
    selectedDocIds.clear();
    renderTable();
    return;
  }
  if (op === "delete") {
    await bulkDelete();
    return;
  }
  if (op === "set-public") {
    await bulkSetPublic(true);
    return;
  }
  if (op === "set-draft") {
    await bulkSetPublic(false);
    return;
  }
});

// Sticky progress toast helper. notify() returns a dismiss thunk and we
// poke its message <p> directly to avoid spamming the stack on each tick.
function makeProgressToast(initialBody) {
  const dismiss = notify({ tone: "caution", body: initialBody, durationMs: 0 });
  // The most recent toast is the last child of .ds-toast-stack.
  const stack = document.querySelector(".ds-toast-stack");
  const li = stack ? stack.lastElementChild : null;
  const messageEl = li ? li.querySelector(".ds-toast__message") : null;
  return {
    update(body) { if (messageEl) messageEl.textContent = body; },
    dismiss,
  };
}

async function bulkDelete() {
  const ids = Array.from(selectedDocIds);
  if (ids.length === 0) return;
  const ok = await confirmDestructive({
    title: `刪除 ${ids.length} 份文件`,
    body: `確定要刪除已選的 ${ids.length} 份文件嗎？此操作無法復原，且會同步從所有 Playlist 移除。`,
    dangerLabel: "全部刪除",
    cancelLabel: "取消",
  });
  if (!ok) return;
  const progress = makeProgressToast(`刪除中… 0/${ids.length}`);
  let done = 0;
  let failed = 0;
  await Promise.all(ids.map(async (id) => {
    try {
      const res = await fetch(`/api/admin/docs/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      docs = docs.filter((x) => x.doc_id !== id);
      selectedDocIds.delete(id);
    } catch {
      failed += 1;
    } finally {
      done += 1;
      progress.update(`刪除中… ${done}/${ids.length}`);
    }
  }));
  progress.dismiss();
  renderTable();
  if (failed > 0) {
    notify({
      tone: "error",
      title: "部分刪除失敗",
      body: `共 ${ids.length} 份，成功 ${ids.length - failed}、失敗 ${failed}。`,
    });
  } else {
    notify({ tone: "success", body: `已刪除 ${ids.length} 份文件` });
  }
  fetchPlaylistCounts().then(() => renderTable());
}

async function bulkSetPublic(makePublic) {
  const ids = Array.from(selectedDocIds);
  if (ids.length === 0) return;
  if (makePublic) {
    const ok = await confirmDestructive({
      title: `設為公開：${ids.length} 份`,
      body: `這 ${ids.length} 份文件都會變成「任何拿到網址的人都能看到」。確定嗎？`,
      dangerLabel: "全部設為公開",
      cancelLabel: "取消",
      tone: "caution",
    });
    if (!ok) return;
  }
  const verb = makePublic ? "設為公開" : "設為草稿";
  const progress = makeProgressToast(`${verb}… 0/${ids.length}`);
  let done = 0;
  let failed = 0;
  await Promise.all(ids.map(async (id) => {
    try {
      const res = await fetch(`/api/admin/docs/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: makePublic }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = docs.find((x) => x.doc_id === id);
      if (d) d.is_public = makePublic ? 1 : 0;
    } catch {
      failed += 1;
    } finally {
      done += 1;
      progress.update(`${verb}… ${done}/${ids.length}`);
    }
  }));
  progress.dismiss();
  renderTable();
  if (failed > 0) {
    notify({
      tone: "error",
      title: `部分${verb}失敗`,
      body: `共 ${ids.length} 份，成功 ${ids.length - failed}、失敗 ${failed}。`,
    });
  } else {
    notify({ tone: "success", body: `已將 ${ids.length} 份文件${verb}` });
  }
}

// ── Filter input ─────────────────────────────────────────────────
filterEl.addEventListener("input", () => {
  filterQ = filterEl.value;
  page = 0;
  highlightedIndex = -1;
  renderTable();
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
  key: "j", label: "下一列", scope: "瀏覽",
  handler: () => highlightRow(highlightedIndex < 0 ? 0 : highlightedIndex + 1),
});
bindHotkey({
  key: "ArrowDown", label: "下一列", scope: "瀏覽",
  handler: () => highlightRow(highlightedIndex < 0 ? 0 : highlightedIndex + 1),
});
bindHotkey({
  key: "k", label: "上一列", scope: "瀏覽",
  handler: () => highlightRow(highlightedIndex < 0 ? 0 : highlightedIndex - 1),
});
bindHotkey({
  key: "ArrowUp", label: "上一列", scope: "瀏覽",
  handler: () => highlightRow(highlightedIndex < 0 ? 0 : highlightedIndex - 1),
});
bindHotkey({
  key: "Enter", label: "預覽選取的文件", scope: "瀏覽",
  handler: () => {
    const visible = currentVisible();
    const d = visible[highlightedIndex];
    if (d) window.open(`/slides/?src=${encodeURIComponent(d.doc_id)}`, "_blank");
  },
});
bindHotkey({
  key: "e", label: "編輯選取的文件", scope: "瀏覽",
  handler: () => {
    const visible = currentVisible();
    const d = visible[highlightedIndex];
    if (d) location.href = `/edit/?src=${encodeURIComponent(d.doc_id)}`;
  },
});
bindHotkey({
  key: "Backspace", label: "刪除選取的文件", scope: "瀏覽",
  handler: () => {
    const visible = currentVisible();
    const d = visible[highlightedIndex];
    if (d) deleteDoc(d.doc_id);
  },
});
bindHotkey({
  key: "Delete", label: "刪除選取的文件", scope: "瀏覽",
  handler: () => {
    const visible = currentVisible();
    const d = visible[highlightedIndex];
    if (d) deleteDoc(d.doc_id);
  },
});
bindHotkey({
  key: "a", mod: "cmd", label: "選取本頁全部", scope: "選取",
  handler: () => {
    const visible = currentVisible();
    for (const d of visible) selectedDocIds.add(d.doc_id);
    renderTable();
  },
});
bindHotkey({
  key: "Escape", label: "清除選取 / 收起搜尋", scope: "全域",
  handler: () => {
    if (document.activeElement === filterEl) { filterEl.blur(); return; }
    if (selectedDocIds.size > 0) { selectedDocIds.clear(); renderTable(); }
  },
});

// ── New-doc modal ───────────────────────────────────────────────
document.getElementById("newDocBtn").addEventListener("click", openNewDocModal);
function openNewDocModal() {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `
    <div class="modal">
      <h3>新增文件</h3>
      <p class="desc">貼入 Google Docs 分享網址。文件需設為「任何人都可檢視」。<a href="#" id="share-guide-link">不知道怎麼設？查看教學</a></p>
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
  wrap.querySelector("#share-guide-link").addEventListener("click", (e) => {
    e.preventDefault();
    close();
    // Defer dispatch so the new-doc modal is fully removed before the help
    // modal mounts — keeps focus management and Escape-handler chains sane.
    queueMicrotask(() => {
      window.dispatchEvent(new CustomEvent("admin:open-help", {
        detail: { scrollTo: ".help-share-guide" },
      }));
    });
  });
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
      const importedTitle = body.title;
      notify({ tone: "success", body: `「${importedTitle ?? '文件'}」已匯入` });
      setTimeout(() => {
        location.href = `/edit/?src=${encodeURIComponent(body.doc_id)}`;
      }, 800);
    } catch (err) {
      errEl.textContent = `網路錯誤：${err.message}`;
      submitBtn.disabled = false;
      submitBtn.textContent = "匯入";
    }
  });
}

refresh();
