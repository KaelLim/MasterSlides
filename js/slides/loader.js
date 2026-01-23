import { state, dom, getSupabaseClient } from './state.js';
import { updatePageCount, navigation } from './navigation.js';
import { loadSettings, resetNavHideTimer, updateFullscreenButton, showNav } from './display.js';
import { updateModKeyDisplay } from './modals.js';
import { initLightbox } from './lightbox.js';
import { initRemote, syncRemoteState } from './remote.js';
import { initGotoModal } from './goto.js';
import { initHelpModal } from './modals.js';
import { initSearch } from './search.js';
import { exportPDF } from './print.js';
import { handleKeydown } from './keyboard.js';
import { goToPage, prevPage, nextPage } from './navigation.js';
import { toggleSidebar, closeSidebar, decreaseFontSize, increaseFontSize, setVerticalMode, setHorizontalMode, applyFont, toggleFullscreen, toggleNavVisibility } from './display.js';

let eventsInitialized = false;

async function convertTablesToImages() {
  const tables = dom.manuscript.querySelectorAll('table');
  if (tables.length === 0) return;

  console.log(`發現 ${tables.length} 個表格，開始轉換...`);
  const containerWidth = dom.manuscriptContainer.clientWidth * 0.95;

  for (const table of tables) {
    try {
      table.style.cssText = `
        writing-mode: horizontal-tb;
        width: ${containerWidth}px;
        background: rgba(0, 0, 0, 0.3);
        color: white;
        border-collapse: collapse;
        font-size: 18px;
      `;

      table.querySelectorAll('td').forEach(td => {
        td.style.cssText = `
          writing-mode: horizontal-tb;
          border: 1px solid rgba(255, 255, 255, 0.3);
          padding: 10px 14px;
          color: white;
          vertical-align: middle;
          text-align: left;
        `;
      });

      table.querySelectorAll('th').forEach(th => {
        th.style.cssText = `
          writing-mode: horizontal-tb;
          border: 1px solid rgba(255, 255, 255, 0.3);
          padding: 10px 14px;
          color: white;
          vertical-align: middle;
          text-align: center;
          background: #1a365d;
          font-weight: bold;
        `;
      });

      const canvas = await html2canvas(table, {
        backgroundColor: 'transparent',
        scale: 2,
        logging: false
      });

      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      img.className = 'table-image';
      img.style.cssText = `
        width: 95%;
        max-width: 95%;
        height: auto;
        display: block;
        margin: 20px auto;
        border-radius: 8px;
      `;

      table.parentNode.replaceChild(img, table);
      console.log('表格轉換完成');
    } catch (error) {
      console.error('表格轉換失敗:', error);
    }
  }
}

export async function loadDocument(docId) {
  try {
    const supabase = await getSupabaseClient();
    const { data: doc, error: docError } = await supabase
      .from('documents').select('*').eq('doc_id', docId).single();

    if (docError || !doc) throw new Error(`找不到文件: ${docId}`);

    const version = doc.current_version;
    const storagePath = `${docId}/${version}.html`;
    const { data: blob, error: storageError } = await supabase.storage
      .from('slides').download(storagePath);

    if (storageError) throw new Error(`載入失敗: ${storageError.message}`);

    const htmlContent = await blob.text();
    dom.manuscript.innerHTML = htmlContent;

    if (doc.title) {
      document.title = doc.title;
    }
  } catch (error) {
    dom.manuscript.innerHTML = `<p style="color: #ff6b6b; font-size: 24px;">載入失敗: ${error.message}<br><br>文件 ID: ${docId}</p>`;
    return;
  }

  loadSettings();
  updateModKeyDisplay();
  await convertTablesToImages();

  requestAnimationFrame(() => {
    updatePageCount();
    if (!eventsInitialized) {
      initEventListeners();
      initRemote().catch(err => console.error('initRemote failed:', err));
      eventsInitialized = true;
    }
    resetNavHideTimer();
  });
}

export async function loadPlaylistDoc(index) {
  const doc = state.playlistDocs[index];
  if (!doc) return;
  await loadDocument(doc.doc_id);
  requestAnimationFrame(() => {
    goToPage(0);
    syncRemoteState();
  });
}

function initEventListeners() {
  // Navigation buttons
  document.getElementById('prevBtn').onclick = prevPage;
  document.getElementById('nextBtn').onclick = nextPage;

  // Hamburger menu
  dom.hamburgerBtn.onclick = toggleSidebar;
  dom.sidebarOverlay.onclick = closeSidebar;

  // Font size
  document.getElementById('fontDecrease').onclick = decreaseFontSize;
  document.getElementById('fontIncrease').onclick = increaseFontSize;

  // Orientation
  document.getElementById('verticalBtn').onclick = setVerticalMode;
  document.getElementById('horizontalBtn').onclick = setHorizontalMode;

  // Font family
  document.getElementById('fontSelect').onchange = function () {
    applyFont(this.value);
  };

  // Fullscreen
  document.getElementById('fullscreenBtn').onclick = toggleFullscreen;
  document.addEventListener('fullscreenchange', updateFullscreenButton);

  // Nav visibility toggle
  document.getElementById('toggleNavBtn').onclick = toggleNavVisibility;

  // Export PDF
  document.getElementById('exportPdfBtn').onclick = exportPDF;

  // Modals
  initHelpModal();
  initGotoModal();
  initSearch();

  // Keyboard
  document.addEventListener('keydown', handleKeydown);

  // Mouse movement shows nav
  document.addEventListener('mousemove', showNav);

  // Window resize
  window.addEventListener('resize', () => {
    updatePageCount();
    goToPage(state.currentPage);
  });

  // Touch swipe
  let touchStartX = 0;
  document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const diffX = touchStartX - touchEndX;
    if (Math.abs(diffX) > 50) {
      if (diffX > 0) prevPage();
      else nextPage();
    }
  }, { passive: true });

  // Lightbox
  initLightbox();
}

export async function init() {
  const params = new URLSearchParams(window.location.search);
  const src = params.get('src');
  const playlistId = params.get('playlist');

  if (!src && !playlistId) {
    dom.manuscript.innerHTML = '<p style="color: #ff6b6b; font-size: 24px;">請提供 src 或 playlist 參數</p>';
    return;
  }

  let docId = src;

  if (playlistId) {
    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.rpc('playlist_get_with_documents', { p_id: playlistId });
      if (error) throw error;
      if (data && data.length > 0) {
        state.playlistDocs = data.sort((a, b) => a.sort_order - b.sort_order);
        state.playlistIndex = 0;
        docId = state.playlistDocs[0].doc_id;
      }
    } catch (error) {
      dom.manuscript.innerHTML = `<p style="color: #ff6b6b; font-size: 24px;">播放清單載入失敗: ${error.message}</p>`;
      return;
    }
  }

  // Wire up navigation callbacks
  navigation.onPageChange = syncRemoteState;
  navigation.onLoadPlaylistDoc = loadPlaylistDoc;

  await loadDocument(docId);
}
