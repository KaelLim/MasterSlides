# 遙控器功能優化設計

## 概述

優化簡報遙控器（remote.html），新增裝置自適應 UI、擴展功能、行為修正與搖桿體驗改善。

---

## 1. 裝置偵測與 UI 分層

頁面載入時以 `window.innerWidth` 判斷裝置類型（不監聽 resize）：

| 裝置 | 判斷條件 | 功能範圍 |
|------|----------|----------|
| 手機 | < 768px | 翻頁 + 圖片控制（現有功能） |
| 平板/桌面 | >= 768px | 翻頁 + 圖片控制 + 工具列（聚光燈、全螢幕、搜尋） |

CSS media query 控制工具列區塊顯示/隱藏。

---

## 2. Lightbox 開啟時的 prev/next 行為修正

**影響範圍**：本機鍵盤（keyboard.js）+ 遙控器（remote.js onCommand）

**規則**：所有導航指令（prev / next / first / last）執行前檢查 lightbox 是否 active：
- 若 active → `closeLightbox()` + `syncRemoteState()` 並 return
- 若非 active → 正常翻頁

**體驗流程**：
1. 點圖片 → lightbox 開啟
2. 按導航鍵 → lightbox 關閉，停在當前頁
3. 再按導航鍵 → 正常翻頁

不影響縮放、搖桿、圖片切換等操作。

---

## 3. 平板/桌面版擴展功能

### 工具列

翻頁按鈕下方新增水平按鈕列（frosted glass 風格）：

| 按鈕 | 圖示 | 指令 | 狀態同步 |
|------|------|------|----------|
| 聚光燈 | 十字準星 SVG | `toggleSpotlight` | syncState 新增 `spotlightActive` |
| 全螢幕 | 對角箭頭 SVG | `fullscreen` | 不需同步 |
| 搜尋 | 放大鏡 SVG | 本地展開面板 | — |

聚光燈按鈕根據 `spotlightActive` 切換樣式（active 時金色邊框）。

### 搜尋面板

點擊搜尋按鈕後展開：
- 輸入框 + Enter 觸發
- 結果顯示：「第 N / M 筆」
- 上/下箭頭按鈕
- 關閉按鈕收起面板

**資料流**：
1. 遙控器送 `search` 指令，payload: `{ keyword: '...' }`
2. 簡報端呼叫 `openSearch()` + 設定輸入值 + 觸發搜尋
3. `syncState` 新增 `searchQuery`、`searchCount`、`searchIndex`
4. 遙控器收到 sync → 更新結果計數
5. 遙控器送 `searchPrev` / `searchNext` → 簡報端跳到對應結果

---

## 4. 搖桿靈敏度與慣性優化

### 加速度（非線性）

推越遠速度越快：
```
speed = PAN_BASE + PAN_ACCEL * Math.pow(normalized, 2)
```
- 輕推 30% → ~3px/tick
- 推滿 100% → ~12px/tick

### 慣性衰減

釋放後滑行：
- 記錄最後速度向量 `(lastDx, lastDy)`
- 每 tick 乘以 `FRICTION` 衰減
- 速度 < `MIN_SPEED` 時停止

### 參數

```
PAN_BASE = 2
PAN_ACCEL = 10
FRICTION = 0.85
MIN_SPEED = 0.5
送出間隔 = 100ms
```

---

## 修改檔案

| 檔案 | 修改內容 |
|------|----------|
| `remote.html` | 工具列 HTML/CSS/JS、搜尋面板、搖桿慣性、裝置偵測 |
| `js/slides/keyboard.js` | 導航 action 加 lightbox 檢查 |
| `js/slides/remote.js` | 新指令處理（toggleSpotlight, fullscreen, search, searchPrev, searchNext）、syncState 擴展、onCommand 導航加 lightbox 檢查 |
| `js/slides/laser.js` | 新增 `isLaserActive()` 狀態查詢函式 |

---

## 新增 Realtime 指令

| 指令 | Payload | 說明 |
|------|---------|------|
| `toggleSpotlight` | — | 開關聚光燈 |
| `fullscreen` | — | 切換全螢幕 |
| `search` | `{ keyword }` | 開始搜尋 |
| `searchPrev` | — | 上一個搜尋結果 |
| `searchNext` | — | 下一個搜尋結果 |
| `searchClose` | — | 關閉搜尋 |

## syncState 新增欄位

| 欄位 | 類型 | 說明 |
|------|------|------|
| `spotlightActive` | boolean | 聚光燈是否啟用 |
| `searchQuery` | string | 當前搜尋關鍵字 |
| `searchCount` | number | 匹配總數 |
| `searchIndex` | number | 當前第幾筆 |
