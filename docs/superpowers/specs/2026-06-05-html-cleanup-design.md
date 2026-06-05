# HTML Cleanup (a11y + Inline SVG Sprite) Design

**Date:** 2026-06-05
**Goal:** Give every icon-only button a proper screen-reader label and dynamic ARIA
state, and consolidate the ten-plus inline SVG icons currently scattered across
`slides/index.html` / `remote/index.html` into a single per-file
`<symbol>` sprite block.

**Approach:** Native HTML `<svg><symbol>` + `<use>` pattern, no new JS module. Per-HTML
sprite block (slides and remote keep their own — their icon sets don't overlap).
ARIA labels are static where possible; dynamic states (`aria-pressed` /
`aria-expanded` / `aria-label` swaps) are wired in the existing JS handlers that
already mutate the button's classes.

**Tech Stack:** No new dependencies. Pure HTML5 + the existing
`public/slides/js/{display,laser,event-listeners}.js` modules. Bun build still
bundles the same files; `dist/app.js` size is unchanged.

---

## 1. Why

### Accessibility gap (real users)

慈濟使用族群高齡比例高 → 螢幕閱讀器、放大鏡、語音控制需求真實存在。

目前 viewer 的工具列 9 個 icon-only 按鈕中只有 `#refreshBtn` 有 `aria-label`。
其他 8 個對 VoiceOver / TalkBack 使用者來說只會被讀成「按鈕」「按鈕」「按鈕」——
無法知道是聚光燈還是匯出 PDF。

### Source noise

`public/slides/index.html` 共 243 行，其中 **10 個 inline SVG** 約佔 50 行。每個按鈕的
語意（聚光燈、全螢幕等）被 10-行 SVG path 字串淹沒，未來要改 icon 樣式得逐個找。

### 為什麼不選 JS icon helper

考量過 `public/shared/icons.js` 加 `injectIcons()` runtime injection 的方式：

| 比較 | inline `<symbol>` sprite | JS icon helper |
|---|---|---|
| Icon 出現時機 | HTML 一載入就在 | JS 跑完才注入（最壞 100ms FOUC） |
| 共用 admin/ | 直接複製 sprite block | admin 沒 bundle pipeline，須額外處理 |
| 集中度 | 一個 sprite block | 一個 JS module，但 button HTML 端要記 data-icon 對應 |
| 跨檔同步 | 改 SVG 改一處 | 改 SVG 改一處 |

兩者「集中度」效益相當，但 sprite block 沒有 runtime 成本、admin/ 也能無痛複製，故選 sprite。

---

## 2. Scope

**In scope:**
- `public/slides/index.html` — 10 個 inline SVG → sprite block；9 個按鈕補 ARIA
- `public/remote/index.html` — 2 個 inline SVG → sprite block；2 個按鈕補 ARIA
- `public/slides/js/display.js` — 動態 aria-label 切換（全螢幕、隱藏 nav）+ aria-expanded（hamburger）
- `public/slides/js/laser.js` — `aria-pressed` 切換（聚光燈按鈕）
- `public/slides/js/event-listeners.js` — `aria-pressed` 切換（直書/橫書）

**Out of scope:**
- `public/admin/*.html` — 沒有 inline SVG，沒有 a11y blocker
- Icon **視覺設計** 更動（這次只搬位置不改外觀）
- Tooltip 視覺樣式調整（`data-tooltip` 的 hover 行為由 Step 2 commit `5939b90` 已處理：`@media (hover: none)` 抑制）
- 跨檔共用 sprite file（remote 跟 slides icon 不重疊，沒有共用需求）

---

## 3. Architecture

### 3.1 Sprite block 結構

每個 HTML 檔在 `<body>` 開頭塞一個隱藏 `<svg>` block：

```html
<body>
  <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
    <symbol id="icon-laser" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <line x1="12" y1="2" x2="12" y2="5"/>
      <!-- ... -->
    </symbol>
    <symbol id="icon-fullscreen" viewBox="0 0 24 24" ...>...</symbol>
    <!-- 其他 8 個 -->
  </svg>

  <!-- 後續真實內容 -->
  ...
</body>
```

Key points:
- `width="0" height="0"` + `position:absolute` 確保佔不到視覺空間，但 `<use>` 仍能引用
- `aria-hidden="true"` 告知 AT 這個容器是裝飾性，不要朗讀
- `focusable="false"` 防止 IE 舊版的 tab 順序問題（雖然我們不支援 IE，保險起見）
- 每個 `<symbol>` 必須有自己的 `viewBox`；共用屬性（`stroke="currentColor"` 等）建議放 symbol 層級避免 button 端重複

### 3.2 按鈕內 SVG reference

每個原本內含 inline SVG 的按鈕：

```html
<!-- before -->
<button class="icon-btn" id="laserBtn" data-tooltip="聚光燈">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="3"/>
    <line x1="12" y1="2" x2="12" y2="5"/>
    <!-- 4 more lines -->
  </svg>
</button>

<!-- after -->
<button class="icon-btn" id="laserBtn"
        data-tooltip="聚光燈"
        aria-label="聚光燈"
        aria-pressed="false">
  <svg width="20" height="20" aria-hidden="true" focusable="false">
    <use href="#icon-laser"/>
  </svg>
</button>
```

按鈕內 `<svg>` 標記 `aria-hidden="true"`：avoid duplicate announcement
（button 的 `aria-label` 才是真實 label，內層 svg 是裝飾）。

### 3.3 ARIA dynamic state

| 按鈕 | 屬性 | 觸發 JS |
|---|---|---|
| `#laserBtn` | `aria-pressed` | `laser.js:toggleLaser()` 既有 `classList.add/remove('active')` 旁邊加一行 |
| `#verticalBtn` / `#horizontalBtn` | `aria-pressed` | `event-listeners.js` 兩個 onclick handler |
| `#hamburgerBtn` | `aria-expanded` | `display.js:openSidebar / closeSidebar` |
| `#fullscreenBtn` | `aria-label`（"全螢幕" ↔ "退出全螢幕"） | `display.js:updateFullscreenButton` 已存在 |
| `#toggleNavBtn` | `aria-label`（"隱藏導航列" ↔ "顯示導航列"） | `display.js:toggleNavVisibility` 已存在 |

所有 5 處都是「在既有 class 操作旁邊加一行」型修改，沒有新事件、沒有新狀態。

---

## 4. Components

### 4.1 `slides/index.html` sprite icons（**13 個**）

現況：10 個 inline SVG + 2 個 unicode glyph（`⛶`、`?`），全部統一為 sprite。
按出現順序：

| sprite id | 用於 | 來源 |
|---|---|---|
| `icon-search` | `.search-icon`（搜尋列裝飾） | 抽自 inline SVG |
| `icon-vertical` | `#verticalBtn` | 抽自 inline SVG |
| `icon-horizontal` | `#horizontalBtn` | 抽自 inline SVG |
| `icon-fullscreen` | `#fullscreenBtn` | **glyph `⛶` → SVG（新建，§7.1 已 lock）** |
| `icon-eye-open` | `#toggleNavBtn`（nav 顯示中） | 抽自 inline SVG |
| `icon-eye-closed` | `#toggleNavBtn`（nav 已隱藏） | **目前埋在 `display.js:toggleNavVisibility` 字串裡，搬出來** |
| `icon-remote` | `#remoteBtn` | 抽自 inline SVG |
| `icon-laser` | `#laserBtn` | 抽自 inline SVG |
| `icon-pdf` | `#exportPdfBtn` | 抽自 inline SVG |
| `icon-help` | `#helpBtn` | **glyph `?` → SVG（新建，§7.1 已 lock）** |
| `icon-refresh` | `#refreshBtn` | 抽自 inline SVG |
| `icon-prev` | `#prevBtn` | 抽自 inline SVG |
| `icon-next` | `#nextBtn` | 抽自 inline SVG |

`icon-fullscreen` 跟 `icon-help` 設計成 24×24 viewBox、`stroke-width:2`、`fill:none`、
`stroke:currentColor`，跟其他 icon 視覺一致。Feather Icons 套件有現成對應路徑可參考
（`maximize-2` / `help-circle`）。

### 4.2 `slides/index.html` 靜態 ARIA labels

```html
<button id="hamburgerBtn" aria-label="開啟選單" aria-expanded="false">...
<button id="prevBtn" aria-label="上一頁">...
<button id="nextBtn" aria-label="下一頁">...
<button id="fullscreenBtn" aria-label="全螢幕">...
<button id="toggleNavBtn" aria-label="隱藏導航列">...
<button id="remoteBtn" aria-label="遙控器">...
<button id="laserBtn" aria-label="聚光燈" aria-pressed="false">...
<button id="exportPdfBtn" aria-label="匯出 PDF">...
<button id="helpBtn" aria-label="快捷鍵說明">...
<button id="verticalBtn" aria-pressed="true">...
<button id="horizontalBtn" aria-pressed="false">...
```

（`verticalBtn` / `horizontalBtn` 本來就有可見文字「直書」「橫書」，不需 `aria-label`，
只補 `aria-pressed`。）

### 4.3 `remote/index.html` sprite icons（2 個）

| sprite id | 用於 button | 視覺 |
|---|---|---|
| `icon-search` | `#toolSearch` | 放大鏡 |
| `icon-chevron-right` | `#toolGoto` | 右箭頭（跳頁） |

### 4.4 `remote/index.html` 靜態 ARIA labels

`#prevBtn` / `#nextBtn` 是 `‹` / `›` glyph，雖然視覺可懂，但對螢幕閱讀器較佳：

```html
<button id="prevBtn" aria-label="上一頁">‹</button>
<button id="nextBtn" aria-label="下一頁">›</button>
```

`#toolSearch` / `#toolGoto` 旁邊已有文字「搜尋」/「跳頁」，不需 aria-label。
`#remoteSearchPrev` (▲) / `#remoteSearchNext` (▼) 加：

```html
<button id="remoteSearchPrev" aria-label="上一個結果">▲</button>
<button id="remoteSearchNext" aria-label="下一個結果">▼</button>
<button id="remoteSearchClose" aria-label="關閉搜尋">✕</button>
```

縮放按鈕：

```html
<button id="zoomInBtn" aria-label="放大">+</button>
<button id="zoomOutBtn" aria-label="縮小">−</button>
<button id="zoomResetBtn" aria-label="重設縮放">⟲</button>
```

### 4.5 JS changes（5 處微調）

**`laser.js`** — `toggleLaser()` 內：

```js
document.getElementById('laserBtn')?.classList.add('active');
document.getElementById('laserBtn')?.setAttribute('aria-pressed', 'true');
// 對應 deactivate 路徑改 'false'
```

**`event-listeners.js`** — `verticalBtn` / `horizontalBtn` onclick handler：

```js
document.getElementById('verticalBtn').classList.add('active');
document.getElementById('verticalBtn').setAttribute('aria-pressed', 'true');
document.getElementById('horizontalBtn').classList.remove('active');
document.getElementById('horizontalBtn').setAttribute('aria-pressed', 'false');
```

**`display.js`** — `openSidebar` / `closeSidebar`：

```js
dom.hamburgerBtn.classList.add('active');
dom.hamburgerBtn.setAttribute('aria-expanded', 'true');
// close 路徑改 'false'
```

**`display.js`** — `updateFullscreenButton`：

```js
btn.dataset.tooltip = '退出全螢幕';
btn.setAttribute('aria-label', '退出全螢幕');
// 非全螢幕路徑改回 '全螢幕'
```

**`display.js`** — `toggleNavVisibility`：

```js
document.getElementById('toggleNavBtn').dataset.tooltip = '顯示導航列';
document.getElementById('toggleNavBtn').setAttribute('aria-label', '顯示導航列');
// 非隱藏路徑改回 '隱藏導航列'
```

### 4.6 `toggleNavVisibility` 的眼睛 icon 切換

目前實作是用 `innerHTML` 把 SVG path 字串整個塞進 `#toggleNavIcon`。改成 sprite 後，
最乾淨的做法是把 button 內結構改成兩個 `<use>`，靠 CSS 控制顯隱：

```html
<button id="toggleNavBtn" aria-label="隱藏導航列">
  <svg width="20" height="20" aria-hidden="true" focusable="false">
    <use id="toggleNavIcon" href="#icon-eye-open"/>
  </svg>
</button>
```

JS 改成切換 `href`：

```js
const useEl = document.querySelector('#toggleNavIcon');
useEl.setAttribute('href', state.navPermanentlyHidden ? '#icon-eye-closed' : '#icon-eye-open');
```

比現行 `innerHTML` 字串拼接乾淨許多。

---

## 5. Testing

### 5.1 Manual — VoiceOver（Mac Safari，主要驗收）

1. 打開 viewer (`/slides/?src=...`)
2. `Cmd+F5` 啟動 VoiceOver
3. `Ctrl+Opt+→` 逐個 tab 過工具列每個按鈕
4. 預期：每個按鈕都被讀出對應中文名稱（「聚光燈，按鈕」「全螢幕，按鈕」等）
5. 點 hamburger 開 sidebar → 預期讀「展開」
6. 點聚光燈 → 預期讀「已按下」
7. 進入全螢幕 → 預期 label 變「退出全螢幕」

### 5.2 Manual — iPad VoiceOver

設定 → 輔助使用 → VoiceOver 開啟。同上流程在 iPad 跑一次。

### 5.3 Visual regression

1. 打開 viewer，逐個 icon 看畫面正常（位置、大小、顏色不變）
2. 切直書/橫書，icon 不變
3. 進/出全螢幕，fullscreen icon 不變
4. 點聚光燈、再點關掉，laser icon active 狀態切換正常

### 5.4 自動化

不新增測試。理由：
- HTML 結構改變難以 unit-test 而不脆化
- VoiceOver flow 沒有可靠的 headless equivalent
- 既有 `paginator.test.ts` 應持續通過（與本變更無交集）

---

## 6. Migration plan

單一 PR，1 commit：`feat(slides): consolidate inline SVG into sprite + ARIA labels`

順序：

1. **編輯 `slides/index.html`**
   - 在 `<body>` 開頭插入 sprite block（**13 個 symbol**）
   - 把 10 個 inline SVG（含 `.search-icon` 跟所有按鈕）換成 `<svg><use href="#icon-..."/></svg>`
   - 把 2 個 `<span>` glyph（`⛶`、`?`）改成 `<svg><use href="#icon-fullscreen"/>` / `#icon-help"/></svg>`
   - 補 9 個 `aria-label` / `aria-pressed` / `aria-expanded` 屬性
2. **編輯 `remote/index.html`** — 同樣模式（2 symbols + 多個 aria-label）
3. **編輯 `slides/js/display.js`** — 加 4 處 ARIA dynamic state
   - `openSidebar` / `closeSidebar`：`aria-expanded` on hamburger
   - `updateFullscreenButton`：`aria-label` 動態
   - `toggleNavVisibility`：`aria-label` 動態 + **改寫 icon 切換**（從 `innerHTML` 換成 `useEl.setAttribute('href', ...)`，見 §4.6）
4. **編輯 `slides/js/laser.js`** — `toggleLaser` 加 `aria-pressed` 切換
5. **編輯 `slides/js/event-listeners.js`** — verticalBtn / horizontalBtn handler 加 `aria-pressed` 切換
6. **`bun run build`** — 重 bundle
7. **手動 VoiceOver 驗收一輪**（Mac Safari + iPad）
8. **Commit + push + deploy**

風險：低。SVG 行為不變，ARIA 是 additive，JS 改動都是「在既有 class 操作旁邊加一行」。
失敗 rollback 是單 commit `git revert`。

---

## 7. Open decisions

### 7.1 `⛶` 跟 `?` 兩個 `<span>` 要不要 SVG 化？

目前 `#fullscreenBtn` 內是 `<span id="fullscreenIcon">⛶</span>`，
`#helpBtn` 是 `<span style="font-size:18px">?</span>`。

兩種選擇：

| 選項 | 利弊 |
|---|---|
| 保持 `<span>` glyph | 跟其他 SVG 不一致但簡單；字型相容性是個問題（`⛶` 在某些字型缺，會回 fallback） |
| **改成 SVG**（採用） | 視覺一致；可控；HTML 結構統一 |

**結論 — lock：改成 SVG。** 兩個 sprite 都會建立（`icon-fullscreen` / `icon-help`）。
參考 Feather Icons 的 `maximize-2` / `help-circle` 路徑，沿用 `viewBox="0 0 24 24"` 跟其他 icon 一致。

### 7.2 sprite 放在 HTML 還是外部檔？

考慮過：

```html
<svg><use href="/shared/icons.svg#icon-laser"/></svg>
```

優點：跨 HTML 共享
缺點：每次 `<use>` 觸發一次 fetch（瀏覽器會 cache 但首次有延遲），且 `currentColor`
在跨檔案 `<use>` 上有 quirks

**結論**：inline 為主。未來真的需要共用（例如 admin 也要圖示）再外部化。

### 7.3 `data-tooltip` 屬性留不留？

`data-tooltip` 是 visual tooltip（hover 顯示文字），跟 `aria-label`（螢幕閱讀器讀的）
不是同件事。

兩個屬性可以共存：滑鼠 hover 看到 visual tooltip，螢幕閱讀器讀到 aria-label。**留**。

未來若有重複維護成本（例如同一文字改一次要改兩處），可考慮 JS 從 `aria-label`
自動同步給 `data-tooltip`。**不在本 spec 範圍**。
