# Dashboard Redesign - Lit Web Components

## 決策摘要

| 項目 | 決定 |
|------|------|
| 框架 | Lit Web Components (ESM CDN, ~5KB) |
| 導航 | 左側 sidebar，SVG inline icon + label |
| 主題 | 深色（與 slides.html 一致）|
| 篩選 | 標題文字搜尋 |
| 即時同步 | 不需要（操作後 refresh） |
| 裝置 | 桌面為主 |
| Doc-list 複用 | `mode="full"` / `mode="select"` 雙模式 |
| 狀態管理 | EventTarget-based store，分頻道事件通知 |
| 回饋 | `<master-toast>` 統一通知 |
| 排序 | 原生 draggable |

---

## 檔案結構

```
js/
  store.js                     ← 新增：reactive store
  components/
    master-sidebar.js          ← 新增
    master-upload.js           ← 新增
    master-doc-list.js         ← 新增
    master-playlist-list.js    ← 新增
    master-playlist-editor.js  ← 新增
    master-user-manager.js     ← 新增
    master-toast.js            ← 新增
  auth.js                      ← 現有
  documents.js                 ← 現有
  playlists.js                 ← 現有
  upload.js                    ← 現有
  supabase-client.js           ← 現有
  realtime.js                  ← 現有
css/
  dashboard.css                ← 重寫
  common.css                   ← 保留
dashboard.html                 ← 重寫
deployment/supabase-official/docker/init.sql  ← 修正 RPC
```

不動的檔案：`slides.html`、`remote.html`、`login.html`、`index.html`、`badge.js`

---

## 外部依賴

| 依賴 | 來源 | 用途 |
|------|------|------|
| Lit 3.x | `https://esm.sh/lit@3` | Web Components |
| Supabase JS | `https://esm.sh/@supabase/supabase-js@2` | 現有 |

無 build step。

---

## Store（`js/store.js`）

```javascript
class AppStore extends EventTarget {
  #state = { documents: [], playlists: [], user: null, profile: null }

  get documents() { return this.#state.documents }
  get playlists() { return this.#state.playlists }
  get user() { return this.#state.user }
  get profile() { return this.#state.profile }

  async refreshDocuments() {
    this.#state.documents = await documentsApi.listDocuments()
    this.dispatchEvent(new CustomEvent('documents-updated'))
  }

  async refreshPlaylists() {
    this.#state.playlists = await playlistsApi.listPlaylists()
    this.dispatchEvent(new CustomEvent('playlists-updated'))
  }

  setUser(user, profile) {
    this.#state.user = user
    this.#state.profile = profile
    this.dispatchEvent(new CustomEvent('user-updated'))
  }
}

export const store = new AppStore()
```

---

## Components

### `<master-sidebar>`

- **Props:** `role`, `active`, `email`
- **事件:** `nav-change` (detail: `{ page }`)
- 寬度固定 220px，深色 `#16213e`
- Active item 左邊框 teal 高亮
- 底部：email + 登出按鈕
- Nav items 依角色過濾：

| Key | 標籤 | 最低權限 |
|-----|------|----------|
| `upload` | 上傳簡報 | uploader |
| `documents` | 簡報列表 | viewer |
| `playlists` | 播放清單 | admin |
| `users` | 用戶管理 | super_admin |

---

### `<master-upload>`

- 輸入 Google Docs URL，自動 extract doc_id 預覽
- 可選填 title
- 送出呼叫 Edge Function `/functions/v1/fetch-google-doc`
- 成功後 `store.refreshDocuments()` + toast

---

### `<master-doc-list>`

- **Props:** `mode` (`"full"` | `"select"`), `selected` (Array), `filter` (String)
- **事件:** `selection-change` (detail: `{ selected: [...docIds] }`)
- Filter bar：標題搜尋 input
- `mode="full"`：卡片 grid + 操作按鈕（檢視、公開/私人、刪除）
- `mode="select"`：checkbox + 標題，用於播放清單 modal

---

### `<master-playlist-list>`

- 播放清單卡片 grid
- 操作：播放、編輯、公開/私人、刪除
- 「新增播放清單」按鈕
- 內嵌 `<master-playlist-editor>` modal

---

### `<master-playlist-editor>` (Modal)

- **Props:** `open` (Boolean), `playlist` (Object | null)
- null = 新增模式，有值 = 編輯模式
- 欄位：名稱、描述
- 已加入文件列表：拖曳排序 + 移除按鈕
- 「加入文件」按鈕展開 `<master-doc-list mode="select">`
- 儲存流程：
  - 新增：`createPlaylist()` → 逐一 `addDocument()`
  - 編輯：`updatePlaylist()` → `reorderDocuments()`
  - dispatch `playlist-saved` → `store.refreshPlaylists()`

---

### `<master-user-manager>`

- 僅 super_admin 可見
- 表格列出所有 profiles
- 角色下拉選單即時更新

---

### `<master-toast>`

- 全域單例，右下角堆疊
- API：`toast.show(message, type, duration)`
- type：success（teal）、error（紅）、info（白）
- 3 秒自動消失

---

## Dashboard 主頁整合

```html
<body>
  <master-sidebar></master-sidebar>
  <main id="content"></main>
  <master-toast></master-toast>
</body>
```

- 頁面切換：sidebar `nav-change` 事件 → `createElement(tag)` 插入 #content
- 預設頁面：viewer → documents，uploader+ → upload
- Auth 檢查：無 session 導向 login.html

---

## CSS 主題變數

```css
:root {
  --color-bg: #0f0f23;
  --color-surface: #16213e;
  --color-surface-hover: #1a2a4a;
  --color-primary: #5FCFC3;
  --color-accent: #FFD700;
  --color-text: #e0e0e0;
  --color-text-muted: #888;
  --color-danger: #e74c3c;
  --color-success: #5FCFC3;
  --sidebar-width: 220px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --radius: 8px;
  --radius-lg: 12px;
}
```

佈局：flex，sidebar fixed 左側，#content 佔滿剩餘空間。

---

## Bug 修正：playlist_get_with_documents

問題：`RETURNS TABLE` 的 `sort_order INT` 與 `WITH ORDINALITY` 產生的 `BIGINT` 不匹配。

修正：
```sql
CREATE OR REPLACE FUNCTION playlist_get_with_documents(p_playlist_id UUID)
RETURNS TABLE (
  playlist_id UUID,
  playlist_name TEXT,
  doc_id TEXT,
  doc_title TEXT,
  current_version INT,
  sort_order BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS playlist_id,
    p.name AS playlist_name,
    d.doc_id,
    d.title AS doc_title,
    d.current_version,
    idx.ordinality AS sort_order
  FROM playlists p,
    jsonb_array_elements_text(p.document_ids) WITH ORDINALITY AS idx(val, ordinality)
    LEFT JOIN documents d ON d.doc_id = idx.val
  WHERE p.id = p_playlist_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
