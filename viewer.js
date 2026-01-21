/**
 * Tzu Chi Slides Viewer
 * 慈濟簡報閱讀器 - Fetch-based Paged.js 渲染
 */

// ===========================
// 設定相關變數與常數
// ===========================
const FONT_SCALES = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3];
const STORAGE_KEYS = {
  fontSize: 'slides-font-size',
  orientation: 'slides-orientation',
  fontFamily: 'slides-font-family',
  navHidden: 'slides-nav-hidden'
};

let contentUrl = '';
let currentSlide = 0;
let totalSlides = 0;
let pages = [];
let navHideTimeout = null;
let touchStartX = 0;
let touchEndX = 0;
let navPermanentlyHidden = false;
let isReflowing = false;

// ===========================
// 初始化
// ===========================
async function init() {
  // 從 URL 參數取得內容來源
  const params = new URLSearchParams(window.location.search);
  contentUrl = params.get('src');

  if (!contentUrl) {
    document.getElementById('content-container').innerHTML = '<p style="color: white; padding: 20px;">請提供 src 參數，例如: viewer.html?src=content.html</p>';
    return;
  }

  // 載入已儲存的設定
  applyStoredSettings();

  // 首次渲染
  await renderContent();
}

// ===========================
// 套用已儲存的設定
// ===========================
function applyStoredSettings() {
  const savedScale = localStorage.getItem(STORAGE_KEYS.fontSize);
  if (savedScale) {
    document.documentElement.style.setProperty('--font-scale', parseFloat(savedScale));
  }

  const savedOrientation = localStorage.getItem(STORAGE_KEYS.orientation);
  if (savedOrientation === 'horizontal') {
    document.body.classList.add('horizontal-mode');
  }

  const savedFont = localStorage.getItem(STORAGE_KEYS.fontFamily);
  if (savedFont) {
    document.body.style.fontFamily = '"' + savedFont + '", sans-serif';
  }
}

// ===========================
// 渲染內容（核心函數）
// ===========================
async function renderContent() {
  if (isReflowing) return;
  isReflowing = true;

  console.log('開始渲染...');

  try {
    // 1. 清理現有內容
    cleanupDOM();

    // 2. Fetch 純淨內容
    const response = await fetch(contentUrl);
    if (!response.ok) {
      throw new Error(`無法載入內容: ${response.status}`);
    }
    const htmlContent = await response.text();

    // 3. 插入內容到容器
    const container = document.getElementById('content-container');
    container.innerHTML = htmlContent;

    // 4. 套用目前設定
    applyStoredSettings();

    // 5. 執行 Paged.js 渲染
    const paged = new Paged.Previewer();
    await paged.preview();

    // 6. 初始化 Slider
    await initSlider();

    console.log('渲染完成');
  } catch (error) {
    console.error('渲染失敗:', error);
    document.getElementById('content-container').innerHTML =
      `<p style="color: white; padding: 20px;">載入失敗: ${error.message}</p>`;
  }

  isReflowing = false;
}

// ===========================
// 清理 DOM
// ===========================
function cleanupDOM() {
  // 移除 Paged.js 產生的內容
  const pagedPages = document.querySelector('.pagedjs_pages');
  if (pagedPages) {
    pagedPages.remove();
  }

  // 移除 UI 元素
  const nav = document.querySelector('.slide-nav');
  const hamburger = document.getElementById('hamburgerBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (nav) nav.remove();
  if (hamburger) hamburger.remove();
  if (sidebar) sidebar.remove();
  if (overlay) overlay.remove();

  // 移除 slider-mode
  document.body.classList.remove('slider-mode');

  // 確保內容容器存在
  let container = document.getElementById('content-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'content-container';
    document.body.appendChild(container);
  } else {
    container.innerHTML = '';
  }
}

// ===========================
// 重新渲染（設定變更時呼叫）
// ===========================
async function reflowPages() {
  await renderContent();
}

// ===========================
// 表格轉圖片
// ===========================
async function convertTablesToImages() {
  const tables = document.querySelectorAll('table');

  if (tables.length === 0) {
    console.log('沒有找到表格');
    return;
  }

  console.log(`找到 ${tables.length} 個表格，開始轉換...`);

  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];

    try {
      const canvas = await html2canvas(table, {
        backgroundColor: null,
        scale: 2,
        logging: false
      });

      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      img.alt = '表格圖片';
      img.className = 'table-image';
      img.style.maxWidth = '90%';
      img.style.height = 'auto';

      table.parentNode.replaceChild(img, table);

      console.log(`表格 ${i + 1} 轉換完成`);
    } catch (err) {
      console.error(`表格 ${i + 1} 轉換失敗:`, err);
    }
  }

  console.log('所有表格轉換完成');
}

// ===========================
// Slider 功能
// ===========================
async function initSlider() {
  // 先轉換表格為圖片
  await convertTablesToImages();

  pages = document.querySelectorAll('.pagedjs_page');
  totalSlides = pages.length;

  if (totalSlides === 0) {
    console.error('找不到任何頁面');
    return;
  }

  console.log('初始化 Slider，共 ' + totalSlides + ' 頁');

  // 啟用 slider 模式
  document.body.classList.add('slider-mode');

  // 建立導航列
  const nav = document.createElement('div');
  nav.className = 'slide-nav';
  nav.innerHTML = `
    <button id="prevBtn">\u25C0 上一頁</button>
    <span class="page-info"><span id="currentPage">1</span> / ${totalSlides}</span>
    <button id="nextBtn">下一頁 \u25B6</button>
  `;
  document.body.appendChild(nav);

  // 檢查導航列隱藏狀態
  const savedNavHidden = localStorage.getItem(STORAGE_KEYS.navHidden);
  if (savedNavHidden === 'true') {
    navPermanentlyHidden = true;
    nav.style.display = 'none';
  }

  // 顯示第一頁
  showSlide(0);

  // 綁定導航事件
  document.getElementById('prevBtn').onclick = prevSlide;
  document.getElementById('nextBtn').onclick = nextSlide;

  // 鍵盤控制
  document.removeEventListener('keydown', handleKeydown);
  document.addEventListener('keydown', handleKeydown);

  // 觸控滑動
  document.removeEventListener('touchstart', handleTouchStart);
  document.removeEventListener('touchend', handleTouchEnd);
  document.addEventListener('touchstart', handleTouchStart, { passive: true });
  document.addEventListener('touchend', handleTouchEnd, { passive: true });

  // 滑鼠移動顯示導航列
  document.removeEventListener('mousemove', showNav);
  document.addEventListener('mousemove', showNav);

  // 啟動自動隱藏計時器
  resetNavHideTimer();

  // 初始化設定面板
  initSettings();
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
      closeSidebar();
      return;
    }
  }

  showNav();

  switch(e.key) {
    case 'ArrowRight':
    case ' ':
    case 'PageDown':
      e.preventDefault();
      nextSlide();
      break;
    case 'ArrowLeft':
    case 'PageUp':
      e.preventDefault();
      prevSlide();
      break;
    case 'Home':
      e.preventDefault();
      showSlide(0);
      break;
    case 'End':
      e.preventDefault();
      showSlide(totalSlides - 1);
      break;
  }
}

function showSlide(index) {
  if (index < 0 || index >= totalSlides) return;

  pages.forEach((page, i) => {
    page.classList.toggle('active', i === index);
  });

  currentSlide = index;
  const currentPageEl = document.getElementById('currentPage');
  if (currentPageEl) {
    currentPageEl.textContent = index + 1;
  }
}

function nextSlide() {
  if (currentSlide < totalSlides - 1) {
    showSlide(currentSlide + 1);
  }
}

function prevSlide() {
  if (currentSlide > 0) {
    showSlide(currentSlide - 1);
  }
}

// ===========================
// 觸控滑動
// ===========================
function handleTouchStart(e) {
  touchStartX = e.changedTouches[0].screenX;
}

function handleTouchEnd(e) {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipe();
}

function handleSwipe() {
  const threshold = 50;
  const diff = touchStartX - touchEndX;

  if (Math.abs(diff) > threshold) {
    if (diff > 0) {
      nextSlide();
    } else {
      prevSlide();
    }
  }
}

// ===========================
// 導航列控制
// ===========================
function showNav() {
  if (navPermanentlyHidden) return;
  const nav = document.querySelector('.slide-nav');
  if (nav) {
    nav.classList.remove('auto-hidden');
    resetNavHideTimer();
  }
}

function hideNav() {
  const nav = document.querySelector('.slide-nav');
  if (nav) {
    nav.classList.add('auto-hidden');
  }
}

function resetNavHideTimer() {
  if (navHideTimeout) {
    clearTimeout(navHideTimeout);
  }
  navHideTimeout = setTimeout(hideNav, 3000);
}

// ===========================
// Sidebar 控制
// ===========================
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('visible');
  document.getElementById('hamburgerBtn').classList.add('active');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
  document.getElementById('hamburgerBtn').classList.remove('active');
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar.classList.contains('open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

// ===========================
// 全螢幕控制
// ===========================
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.log('無法進入全螢幕:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

function updateFullscreenButton() {
  const icon = document.getElementById('fullscreenIcon');
  const text = document.getElementById('fullscreenText');
  if (document.fullscreenElement) {
    if (icon) icon.textContent = '\u26F6';
    if (text) text.textContent = '離開全螢幕';
  } else {
    if (icon) icon.textContent = '\u26F6';
    if (text) text.textContent = '全螢幕';
  }
}

// ===========================
// 字體設定
// ===========================
function getCurrentFontScale() {
  const scale = getComputedStyle(document.documentElement).getPropertyValue('--font-scale');
  return parseFloat(scale) || 1;
}

function setFontScale(scale) {
  document.documentElement.style.setProperty('--font-scale', scale);
  localStorage.setItem(STORAGE_KEYS.fontSize, scale.toString());
  updateFontSizeDisplay(scale);
  // 重新渲染
  reflowPages();
}

function updateFontSizeDisplay(scale) {
  const display = document.getElementById('fontSizeDisplay');
  if (display) {
    display.textContent = Math.round(scale * 100) + '%';
  }
}

function applyFont(fontFamily) {
  document.body.style.fontFamily = '"' + fontFamily + '", sans-serif';
  localStorage.setItem(STORAGE_KEYS.fontFamily, fontFamily);
}

// ===========================
// 初始化設定面板
// ===========================
function initSettings() {
  // 如果已存在則不重複創建
  if (document.getElementById('hamburgerBtn')) return;

  // 創建漢堡按鈕
  const hamburgerBtn = document.createElement('button');
  hamburgerBtn.className = 'hamburger-btn';
  hamburgerBtn.id = 'hamburgerBtn';
  hamburgerBtn.setAttribute('aria-label', '開啟設定選單');
  hamburgerBtn.innerHTML = '<span></span><span></span><span></span>';
  document.body.appendChild(hamburgerBtn);

  // 創建 Overlay
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.id = 'sidebarOverlay';
  document.body.appendChild(overlay);

  // 創建 Sidebar
  const sidebar = document.createElement('div');
  sidebar.className = 'sidebar';
  sidebar.id = 'sidebar';

  const currentScale = getCurrentFontScale();
  const isHorizontal = document.body.classList.contains('horizontal-mode');
  const savedFont = localStorage.getItem(STORAGE_KEYS.fontFamily) || 'Noto Sans TC';

  sidebar.innerHTML = `
    <div class="settings-section">
      <h3>字體大小</h3>
      <div class="font-size-control">
        <button id="fontDecrease">A-</button>
        <span class="size-display" id="fontSizeDisplay">${Math.round(currentScale * 100)}%</span>
        <button id="fontIncrease">A+</button>
      </div>
    </div>
    <div class="settings-section">
      <h3>文字方向</h3>
      <div class="toggle-group">
        <button id="verticalBtn" class="${!isHorizontal ? 'active' : ''}">直書</button>
        <button id="horizontalBtn" class="${isHorizontal ? 'active' : ''}">橫書</button>
      </div>
    </div>
    <div class="settings-section">
      <h3>字體選擇</h3>
      <div class="font-select">
        <button data-font="Noto Sans TC" class="${savedFont === 'Noto Sans TC' ? 'active' : ''}" style="font-family: 'Noto Sans TC', sans-serif;">Noto Sans TC</button>
        <button data-font="Noto Serif TC" class="${savedFont === 'Noto Serif TC' ? 'active' : ''}" style="font-family: 'Noto Serif TC', serif;">Noto Serif TC</button>
        <button data-font="LXGW WenKai TC" class="${savedFont === 'LXGW WenKai TC' ? 'active' : ''}" style="font-family: 'LXGW WenKai TC', cursive;">LXGW WenKai TC</button>
      </div>
    </div>
    <div class="settings-section">
      <button class="fullscreen-btn" id="fullscreenBtn">
        <span id="fullscreenIcon">\u26F6</span>
        <span id="fullscreenText">全螢幕</span>
      </button>
    </div>
    <div class="settings-section">
      <button class="fullscreen-btn" id="toggleNavBtn">
        <span id="toggleNavIcon">${navPermanentlyHidden ? '\u{1F441}\u200D\u{1F5E8}' : '\u{1F441}'}</span>
        <span id="toggleNavText">${navPermanentlyHidden ? '顯示導航列' : '隱藏導航列'}</span>
      </button>
    </div>
  `;
  document.body.appendChild(sidebar);

  // 綁定事件
  hamburgerBtn.addEventListener('click', toggleSidebar);
  overlay.addEventListener('click', closeSidebar);

  // 字體大小控制
  document.getElementById('fontDecrease').addEventListener('click', function() {
    const current = getCurrentFontScale();
    const currentIndex = FONT_SCALES.indexOf(current);
    if (currentIndex > 0) {
      setFontScale(FONT_SCALES[currentIndex - 1]);
    } else if (currentIndex === -1) {
      const smaller = FONT_SCALES.filter(s => s < current);
      if (smaller.length > 0) {
        setFontScale(smaller[smaller.length - 1]);
      }
    }
  });

  document.getElementById('fontIncrease').addEventListener('click', function() {
    const current = getCurrentFontScale();
    const currentIndex = FONT_SCALES.indexOf(current);
    if (currentIndex < FONT_SCALES.length - 1 && currentIndex !== -1) {
      setFontScale(FONT_SCALES[currentIndex + 1]);
    } else if (currentIndex === -1) {
      const larger = FONT_SCALES.filter(s => s > current);
      if (larger.length > 0) {
        setFontScale(larger[0]);
      }
    }
  });

  // 文字方向切換
  const verticalBtn = document.getElementById('verticalBtn');
  const horizontalBtn = document.getElementById('horizontalBtn');

  verticalBtn.addEventListener('click', function() {
    document.body.classList.remove('horizontal-mode');
    this.classList.add('active');
    horizontalBtn.classList.remove('active');
    localStorage.setItem(STORAGE_KEYS.orientation, 'vertical');
    reflowPages();
  });

  horizontalBtn.addEventListener('click', function() {
    document.body.classList.add('horizontal-mode');
    this.classList.add('active');
    verticalBtn.classList.remove('active');
    localStorage.setItem(STORAGE_KEYS.orientation, 'horizontal');
    reflowPages();
  });

  // 字體選擇
  document.querySelectorAll('.font-select button').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.font-select button').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      applyFont(this.dataset.font);
    });
  });

  // 全螢幕按鈕
  document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', updateFullscreenButton);

  // 導航列顯示/隱藏按鈕
  document.getElementById('toggleNavBtn').addEventListener('click', toggleNavVisibility);
}

function toggleNavVisibility() {
  navPermanentlyHidden = !navPermanentlyHidden;
  const nav = document.querySelector('.slide-nav');
  const icon = document.getElementById('toggleNavIcon');
  const text = document.getElementById('toggleNavText');

  if (navPermanentlyHidden) {
    if (nav) nav.style.display = 'none';
    if (icon) icon.textContent = '\u{1F441}\u200D\u{1F5E8}';
    if (text) text.textContent = '顯示導航列';
    localStorage.setItem(STORAGE_KEYS.navHidden, 'true');
  } else {
    if (nav) nav.style.display = 'flex';
    if (icon) icon.textContent = '\u{1F441}';
    if (text) text.textContent = '隱藏導航列';
    localStorage.setItem(STORAGE_KEYS.navHidden, 'false');
  }
}

// ===========================
// 啟動
// ===========================
document.addEventListener('DOMContentLoaded', init);
