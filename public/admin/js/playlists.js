// /admin/playlists — list playlists + actions.
import "./theme.js";
import { renderPager, slice, totalPages } from "./pager.js";
import { confirmDestructive } from "./confirm-modal.js";
import { notify, classifyHttpError } from "./notify.js";
import { bindHotkey } from "./hotkeys.js";
import "./help-modal.js";

const contentEl = document.getElementById("content");
const countEl = document.getElementById("count");
const filterEl = document.getElementById("playlistsFilter");
const selectionBarEl = document.getElementById("selectionBar");
const selectionCountEl = document.getElementById("selectionCount");

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
let filterQ = "";

// Multi-select state.
const selectedIds = new Set();
let highlightedIndex = -1;
let lastShiftAnchorIndex = -1;

async function refresh() {
  contentEl.innerHTML = `<div class="loading-state">載入中…</div>`;
  const res = await fetch("/api/admin/playlists", { credentials: "same-origin" });
  if (!res.ok) {
    const { message } = classifyHttpError(res.status);
    contentEl.innerHTML = `<div class="empty-state">
      <h3>載入失敗</h3>
      <p>${message}</p>
      <p><button class="primary" id="reloadPlaylists">重新載入</button></p>
    </div>`;
    const btn = contentEl.querySelector("#reloadPlaylists");
    if (btn) btn.addEventListener("click", refresh);
    return;
  }
  playlists = (await res.json()).playlists;
  page = 0;
  render();
}

function filteredPlaylists() {
  const q = filterQ.trim().toLowerCase();
  if (!q) return playlists;
  return playlists.filter((p) =>
    (p.title || "").toLowerCase().includes(q) ||
    String(p.id).includes(q)
  );
}

function currentVisible() {
  return slice(filteredPlaylists(), page);
}

function render() {
  const list = filteredPlaylists();
  countEl.textContent = filterQ
    ? `${list.length} / ${playlists.length} 筆`
    : `${playlists.length} 筆`;
  if (playlists.length === 0) {
    contentEl.innerHTML = `<div class="empty-state">
      <h3>還沒有 Playlist</h3>
      <p>點選右上「新增 Playlist」建立第一筆。</p>
      <p class="empty-state__hint">需要教學？按 <kbd>?</kbd>。</p>
    </div>`;
    updateSelectionBar();
    return;
  }
  if (list.length === 0) {
    contentEl.innerHTML = `<div class="empty-state">
      <h3>找不到符合條件的 Playlist</h3>
      <p>調整搜尋條件，或清空 filter 看全部。</p>
    </div>`;
    updateSelectionBar();
    return;
  }
  const pages = totalPages(list.length);
  if (page >= pages) page = pages - 1;
  const visible = slice(list, page);
  if (highlightedIndex >= visible.length) highlightedIndex = visible.length - 1;

  const rows = visible.map((p, i) => {
    const isSel = selectedIds.has(p.id);
    const isHi = i === highlightedIndex;
    return `
    <tr data-id="${p.id}" data-row-index="${i}"
        class="${isSel ? "is-selected" : ""} ${isHi ? "is-highlighted" : ""}"
        ${isHi ? 'aria-selected="true"' : ""}>
      <td class="col-select">
        <input type="checkbox" class="row-check" data-action="select"
               aria-label="選取此列" ${isSel ? "checked" : ""}>
      </td>
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
  `;
  }).join("");

  const allVisibleSelected = visible.length > 0 &&
    visible.every((p) => selectedIds.has(p.id));

  contentEl.innerHTML = `
    <table class="docs-table">
      <thead>
        <tr>
          <th class="col-select">
            <input type="checkbox" id="selectAllVisible" aria-label="選取本頁全部"
                   ${allVisibleSelected ? "checked" : ""}>
          </th>
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
  const headerCheck = contentEl.querySelector("#selectAllVisible");
  if (headerCheck) {
    headerCheck.addEventListener("change", () => {
      const v = headerCheck.checked;
      for (const p of visible) {
        if (v) selectedIds.add(p.id);
        else selectedIds.delete(p.id);
      }
      render();
    });
  }
  renderPager({
    targetEl: contentEl.querySelector("#pager"),
    total: list.length,
    page,
    onChange: (next) => {
      page = next;
      highlightedIndex = -1;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });
  updateSelectionBar();
}

function updateSelectionBar() {
  const n = selectedIds.size;
  if (n === 0) { selectionBarEl.hidden = true; return; }
  selectionBarEl.hidden = false;
  selectionCountEl.textContent = `已選 ${n} 個`;
}

function highlightRow(nextIndex) {
  const visible = currentVisible();
  if (visible.length === 0) return;
  const clamped = Math.max(0, Math.min(visible.length - 1, nextIndex));
  highlightedIndex = clamped;
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

async function onAction(e) {
  // Row select checkbox
  const checkTarget = e.target.closest("input.row-check");
  if (checkTarget && e.type === "change") {
    const tr = checkTarget.closest("tr");
    const id = Number(tr.dataset.id);
    const rowIndex = Number(tr.dataset.rowIndex);
    if (checkTarget.checked) selectedIds.add(id);
    else selectedIds.delete(id);
    tr.classList.toggle("is-selected", checkTarget.checked);
    lastShiftAnchorIndex = rowIndex;
    updateSelectionBar();
    const visible = currentVisible();
    const headerCheck = contentEl.querySelector("#selectAllVisible");
    if (headerCheck) {
      headerCheck.checked = visible.every((p) => selectedIds.has(p.id));
    }
    return;
  }
  if (e.type === "click" && checkTarget && e.shiftKey && lastShiftAnchorIndex >= 0) {
    const tr = checkTarget.closest("tr");
    const rowIndex = Number(tr.dataset.rowIndex);
    const visible = currentVisible();
    const [lo, hi] = rowIndex < lastShiftAnchorIndex
      ? [rowIndex, lastShiftAnchorIndex]
      : [lastShiftAnchorIndex, rowIndex];
    queueMicrotask(() => {
      const targetState = checkTarget.checked;
      for (let i = lo; i <= hi; i++) {
        const p = visible[i];
        if (!p) continue;
        if (targetState) selectedIds.add(p.id);
        else selectedIds.delete(p.id);
      }
      render();
    });
    return;
  }

  const t = e.target.closest("[data-action]");
  if (!t) return;
  if (t.dataset.action === "select") return;
  const tr = t.closest("tr");
  const id = Number(tr.dataset.id);
  const p = playlists.find((x) => x.id === id);
  const action = t.dataset.action;

  if (action === "play") {
    if (p && p.doc_ids.length > 0) {
      window.open(`/slides/?playlist=${id}`, "_blank");
    } else {
      notify({
        tone: "caution",
        title: "尚未加入任何文件",
        body: "請先編輯這個 Playlist 並加入至少一份文件。",
      });
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
    const toggleLabel = t.closest(".toggle");
    const togglePublic = async () => {
      if (toggleLabel) toggleLabel.classList.add("is-toggling");
      try {
        const res = await fetch(`/api/admin/playlists/${id}`, {
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
        if (p) p.is_public = next ? 1 : 0;
        t.checked = next;
      } finally {
        if (toggleLabel) toggleLabel.classList.remove("is-toggling");
      }
    };
    try {
      await togglePublic();
      const title = p?.title || `Playlist ${id}`;
      notify({
        tone: "success",
        body: next ? `「${title}」已公開` : `「${title}」已改為草稿`,
      });
    } catch (err) {
      t.checked = !next;
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
    await deletePlaylist(id);
    return;
  }
}

async function deletePlaylist(id) {
  const p = playlists.find((x) => x.id === id);
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
  if (!res.ok) {
    const { message } = classifyHttpError(res.status);
    notify({ tone: "error", title: "刪除失敗", body: message });
    return;
  }
  const deletedTitle = p?.title || `Playlist ${id}`;
  playlists = playlists.filter((x) => x.id !== id);
  selectedIds.delete(id);
  render();
  notify({ tone: "success", body: `「${deletedTitle}」已刪除`, durationMs: 3000 });
}

// ── Progress toast helper ────────────────────────────────────────
function makeProgressToast(initialBody) {
  const dismiss = notify({ tone: "caution", body: initialBody, durationMs: 0 });
  const stack = document.querySelector(".ds-toast-stack");
  const li = stack ? stack.lastElementChild : null;
  const messageEl = li ? li.querySelector(".ds-toast__message") : null;
  return {
    update(body) { if (messageEl) messageEl.textContent = body; },
    dismiss,
  };
}

// ── Bulk operations ──────────────────────────────────────────────
selectionBarEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-bulk]");
  if (!btn) return;
  const op = btn.dataset.bulk;
  if (op === "clear") { selectedIds.clear(); render(); return; }
  if (op === "delete") { await bulkDelete(); return; }
  if (op === "set-public") { await bulkSetPublic(true); return; }
  if (op === "set-draft") { await bulkSetPublic(false); return; }
});

async function bulkDelete() {
  const ids = Array.from(selectedIds);
  if (ids.length === 0) return;
  const ok = await confirmDestructive({
    title: `刪除 ${ids.length} 個 Playlist`,
    body: `確定要刪除已選的 ${ids.length} 個 Playlist 嗎？此操作無法復原。`,
    dangerLabel: "全部刪除",
    cancelLabel: "取消",
  });
  if (!ok) return;
  const progress = makeProgressToast(`刪除中… 0/${ids.length}`);
  let done = 0;
  let failed = 0;
  await Promise.all(ids.map(async (id) => {
    try {
      const res = await fetch(`/api/admin/playlists/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      playlists = playlists.filter((x) => x.id !== id);
      selectedIds.delete(id);
    } catch {
      failed += 1;
    } finally {
      done += 1;
      progress.update(`刪除中… ${done}/${ids.length}`);
    }
  }));
  progress.dismiss();
  render();
  if (failed > 0) {
    notify({
      tone: "error",
      title: "部分刪除失敗",
      body: `共 ${ids.length} 個，成功 ${ids.length - failed}、失敗 ${failed}。`,
    });
  } else {
    notify({ tone: "success", body: `已刪除 ${ids.length} 個 Playlist` });
  }
}

async function bulkSetPublic(makePublic) {
  const ids = Array.from(selectedIds);
  if (ids.length === 0) return;
  if (makePublic) {
    const ok = await confirmDestructive({
      title: `設為公開：${ids.length} 個`,
      body: `這 ${ids.length} 個 Playlist 都會變成「任何拿到網址的人都能看到」。確定嗎？`,
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
      const res = await fetch(`/api/admin/playlists/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: makePublic }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const p = playlists.find((x) => x.id === id);
      if (p) p.is_public = makePublic ? 1 : 0;
    } catch {
      failed += 1;
    } finally {
      done += 1;
      progress.update(`${verb}… ${done}/${ids.length}`);
    }
  }));
  progress.dismiss();
  render();
  if (failed > 0) {
    notify({
      tone: "error",
      title: `部分${verb}失敗`,
      body: `共 ${ids.length} 個，成功 ${ids.length - failed}、失敗 ${failed}。`,
    });
  } else {
    notify({ tone: "success", body: `已將 ${ids.length} 個 Playlist ${verb}` });
  }
}

// ── Filter ───────────────────────────────────────────────────────
filterEl.addEventListener("input", () => {
  filterQ = filterEl.value;
  page = 0;
  highlightedIndex = -1;
  render();
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
  key: "Enter", label: "播放選取的 Playlist", scope: "瀏覽",
  handler: () => {
    const p = currentVisible()[highlightedIndex];
    if (p && p.doc_ids.length > 0) window.open(`/slides/?playlist=${p.id}`, "_blank");
  },
});
bindHotkey({
  key: "e", label: "編輯選取的 Playlist", scope: "瀏覽",
  handler: () => {
    const p = currentVisible()[highlightedIndex];
    if (p) location.href = `/admin/playlist-edit?id=${p.id}`;
  },
});
bindHotkey({
  key: "Backspace", label: "刪除選取的 Playlist", scope: "瀏覽",
  handler: () => {
    const p = currentVisible()[highlightedIndex];
    if (p) deletePlaylist(p.id);
  },
});
bindHotkey({
  key: "Delete", label: "刪除選取的 Playlist", scope: "瀏覽",
  handler: () => {
    const p = currentVisible()[highlightedIndex];
    if (p) deletePlaylist(p.id);
  },
});
bindHotkey({
  key: "a", mod: "cmd", label: "選取本頁全部", scope: "選取",
  handler: () => {
    const visible = currentVisible();
    for (const p of visible) selectedIds.add(p.id);
    render();
  },
});
bindHotkey({
  key: "Escape", label: "清除選取 / 收起搜尋", scope: "全域",
  handler: () => {
    if (document.activeElement === filterEl) { filterEl.blur(); return; }
    if (selectedIds.size > 0) { selectedIds.clear(); render(); }
  },
});

refresh();
