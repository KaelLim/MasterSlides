import { state, dom } from './state.js';
import { loadDocument } from './loader.js';
import { goToPage, pagination } from './pagination.js';

export async function loadPlaylist(id) {
  try {
    const res = await fetch(`/api/playlists/${encodeURIComponent(id)}`);
    if (!res.ok) {
      dom.manuscript.innerHTML = `<p style="color:#ff6b6b;font-size:24px;">找不到 playlist (${res.status})</p>`;
      return;
    }
    const { playlist } = await res.json();
    if (!playlist.doc_ids || playlist.doc_ids.length === 0) {
      dom.manuscript.innerHTML = `<p style="color:#ff6b6b;font-size:24px;">「${playlist.title}」沒有文件</p>`;
      return;
    }
    state.playlistState = { id: playlist.id, title: playlist.title, doc_ids: playlist.doc_ids, index: 0 };
    updatePlaylistBadge();
    state.currentSrc = state.playlistState.doc_ids[0];
    await loadDocument(state.currentSrc);
  } catch (err) {
    dom.manuscript.innerHTML = `<p style="color:#ff6b6b;font-size:24px;">Playlist 載入失敗: ${err.message}</p>`;
  }
}

function updatePlaylistBadge() {
  if (!state.playlistState) return;
  let badge = document.getElementById('playlistBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'playlistBadge';
    badge.style.cssText =
      'position:fixed;top:14px;left:50%;transform:translateX(-50%);' +
      'background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);color:white;' +
      'padding:6px 14px;border-radius:16px;font-size:13px;z-index:50;' +
      'pointer-events:none;font-family:-apple-system,sans-serif;';
    document.body.appendChild(badge);
  }
  badge.textContent = `${state.playlistState.title} · ${state.playlistState.index + 1} / ${state.playlistState.doc_ids.length}`;
}

async function jumpToPlaylistDoc(delta) {
  const pl = state.playlistState;
  if (!pl) return false;
  const next = pl.index + delta;
  if (next < 0 || next >= pl.doc_ids.length) return false;
  pl.index = next;
  state.currentSrc = pl.doc_ids[next];
  updatePlaylistBadge();
  const landOnLast = delta < 0;
  await loadDocument(state.currentSrc);
  if (landOnLast) goToPage(state.totalPages - 1);
  return true;
}

// Wire boundary callbacks so pagination.prevPage/nextPage cross between docs
// without pagination needing to know about playlists.
pagination._onLeftBoundary = () => jumpToPlaylistDoc(-1);
pagination._onRightBoundary = () => jumpToPlaylistDoc(+1);
