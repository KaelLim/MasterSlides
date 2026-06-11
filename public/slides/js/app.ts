// Slides viewer entry. Reads URL params, dispatches to loader or playlist,
// then wires DOM events + remote control once the first document is in.
import { initDOM, state, dom } from './state.js';
import { loadDocument } from './loader.js';
import { loadPlaylist } from './playlist.js';
import { initEventListeners } from './event-listeners.js';
import { initRemote } from './remote-control.js';

document.addEventListener('DOMContentLoaded', async (): Promise<void> => {
  initDOM();
  const params = new URLSearchParams(window.location.search);
  const src = params.get('src');
  const playlistId = params.get('playlist');

  if (playlistId) {
    await loadPlaylist(playlistId);
  } else if (src) {
    state.currentSrc = src;
    await loadDocument(src);
  } else {
    dom.manuscript.innerHTML = '<p style="color:#ff6b6b;font-size:24px;">請提供 src 或 playlist 參數</p>';
    return;
  }
  initEventListeners();
  initRemote();
});
