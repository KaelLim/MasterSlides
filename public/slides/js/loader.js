import { state, dom } from './state.js';
import { loadSettings, resetNavHideTimer } from './display.js';
import { repaginate } from './pagination.js';
import { convertTablesToImages } from './table-canvas.js';
import { syncRemoteState } from './remote-control.js';
import { updateModKeyDisplay } from './modals.js';

export function extractDocId(url) {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export async function syncFromGoogle(googleUrl) {
  const res = await fetch('/api/fetch-doc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: googleUrl }),
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
  return result;
}

export async function refresh() {
  if (!state.currentSrc) return;
  const btn = document.getElementById('refreshBtn');
  if (btn?.classList.contains('refreshing')) return;
  btn?.classList.add('refreshing');
  try {
    await loadDocument(state.currentSrc, { forceSync: true });
  } finally {
    btn?.classList.remove('refreshing');
  }
}

export async function loadDocument(src, { forceSync = false } = {}) {
  try {
    const googleDocId = extractDocId(src);
    const isDocId = !googleDocId && /^[a-zA-Z0-9_-]+$/.test(src);
    let docId = null;

    if (googleDocId) {
      dom.manuscript.innerHTML = '<p class="loading-message">轉換中，請稍候...</p>';
      const result = await syncFromGoogle(src);
      docId = result.doc_id;
    } else if (isDocId) {
      docId = src;
      if (forceSync) {
        dom.manuscript.innerHTML = '<p class="loading-message">同步中，請稍候...</p>';
        await syncFromGoogle(`https://docs.google.com/document/d/${docId}/edit`);
      }
    }

    if (docId) {
      let res = await fetch(`/api/docs/${docId}`);
      if (!res.ok && !forceSync) {
        dom.manuscript.innerHTML = '<p class="loading-message">首次載入，同步中...</p>';
        await syncFromGoogle(`https://docs.google.com/document/d/${docId}/edit`);
        res = await fetch(`/api/docs/${docId}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      dom.manuscript.innerHTML = await res.text();
    } else {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      dom.manuscript.innerHTML = await res.text();
    }
  } catch (err) {
    dom.manuscript.innerHTML = `<p style="color:#ff6b6b;font-size:24px;">載入失敗: ${err.message}</p>`;
    return;
  }

  loadSettings();
  updateModKeyDisplay();
  await document.fonts.ready;

  const images = dom.manuscript.querySelectorAll('img');
  if (images.length > 0) {
    await Promise.all(Array.from(images).map(img =>
      img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
    ));
  }
  await convertTablesToImages();

  const content = dom.manuscript.firstElementChild;
  if (content && content.tagName === 'ARTICLE') {
    state.allPageElements = Array.from(content.children);
  } else {
    state.allPageElements = Array.from(dom.manuscript.children);
  }

  repaginate();
  // NB: initEventListeners() and initRemote() moved to app.js entry.
  // syncRemoteState here is safe — it no-ops if room is unset.
  syncRemoteState();
  resetNavHideTimer();
}
