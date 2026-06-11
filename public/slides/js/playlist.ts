import { state, dom } from './state.js';
import { syncFromGoogle } from './loader.js';
import { repaginate } from './pagination.js';
import { convertTablesToImages } from './table-canvas.js';
import { syncRemoteState } from './remote-control.js';
import { loadSettings, resetNavHideTimer } from './display.js';
import { updateModKeyDisplay } from './modals.js';

const ARTICLE_OPEN = '<article class="slide-content">';
const ARTICLE_CLOSE = '</article>';

interface PlaylistResponse {
  playlist: {
    id: string;
    title: string;
    doc_ids: string[];
  };
}

async function fetchDocBody(docId: string): Promise<string> {
  let res = await fetch(`/api/docs/${docId}`);
  if (!res.ok) {
    // First-time load — sync from Google, then retry.
    await syncFromGoogle(`https://docs.google.com/document/d/${docId}/edit`);
    res = await fetch(`/api/docs/${docId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${docId}`);
  }
  const html = await res.text();
  const start = html.indexOf(ARTICLE_OPEN);
  const end = html.lastIndexOf(ARTICLE_CLOSE);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`unexpected doc shape for ${docId}`);
  }
  return html.slice(start + ARTICLE_OPEN.length, end);
}

export async function loadPlaylist(id: string): Promise<void> {
  try {
    const res = await fetch(`/api/playlists/${encodeURIComponent(id)}`);
    if (!res.ok) {
      dom.manuscript.innerHTML = `<p style="color:#ff6b6b;font-size:24px;">找不到 playlist (${res.status})</p>`;
      return;
    }
    const { playlist } = (await res.json()) as PlaylistResponse;
    if (!playlist.doc_ids || playlist.doc_ids.length === 0) {
      dom.manuscript.innerHTML = `<p style="color:#ff6b6b;font-size:24px;">「${playlist.title}」沒有文件</p>`;
      return;
    }
    state.playlistState = { id: playlist.id, title: playlist.title, doc_ids: playlist.doc_ids };
    updatePlaylistBadge();

    dom.manuscript.innerHTML = '<p class="loading-message">載入 playlist 中…</p>';

    const bodies = await Promise.all(playlist.doc_ids.map(fetchDocBody));
    // <hr> between consecutive docs so each doc's first-slide starts on a
    // fresh page. The paginator splits top-level <hr> children of <article>.
    const merged = ARTICLE_OPEN + bodies.join('<hr>') + ARTICLE_CLOSE;
    dom.manuscript.innerHTML = merged;

    loadSettings();
    updateModKeyDisplay();
    await document.fonts.ready;

    const images = dom.manuscript.querySelectorAll('img');
    if (images.length > 0) {
      await Promise.all(Array.from(images).map(img =>
        img.complete ? Promise.resolve() : new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); })
      ));
    }
    await convertTablesToImages();

    const content = dom.manuscript.firstElementChild;
    state.allPageElements = (content && content.tagName === 'ARTICLE')
      ? Array.from(content.children)
      : Array.from(dom.manuscript.children);

    repaginate();
    syncRemoteState();
    resetNavHideTimer();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    dom.manuscript.innerHTML = `<p style="color:#ff6b6b;font-size:24px;">Playlist 載入失敗: ${message}</p>`;
  }
}

function updatePlaylistBadge(): void {
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
  badge.textContent = `${state.playlistState.title} · ${state.playlistState.doc_ids.length} 份簡報`;
}
