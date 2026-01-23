# MasterSlides Supabase Integration Design

## 設計目標

將 MasterSlides 從 Node.js 應用轉變為純靜態前端 + Supabase 全後端架構，移除 Express/Socket.io，使用 Supabase 統一處理認證、資料庫、檔案儲存、即時通訊與邊緣運算。

---

## 架構總覽

```
┌──────────────────────────────────────────────────────┐
│                   Kong (:8000)                        │
├──────────────────────────────────────────────────────┤
│  /studio/*        → Studio (管理介面)                 │
│  /auth/v1/*       → GoTrue (認證)                    │
│  /rest/v1/*       → PostgREST (資料庫 API)            │
│  /storage/v1/*    → Storage (檔案)                    │
│  /realtime/v1/*   → Realtime (Broadcast 遙控)         │
│  /functions/v1/*  → Edge Runtime (Google Docs 處理)   │
│  /*               → Nginx (靜態前端)                  │
└──────────────────────────────────────────────────────┘
```

### 技術棧

| 層級 | 技術 |
|------|------|
| 前端 | Vanilla JS + ES Modules + supabase-js (esm.sh CDN, 固定版本) |
| 靜態服務 | Nginx Alpine (~5MB) |
| 路由 | Kong API Gateway |
| 認證 | Supabase Auth (GoTrue) |
| 資料庫 | PostgreSQL + PostgREST + RLS |
| 檔案 | Supabase Storage |
| 即時 | Supabase Realtime Broadcast |
| 運算 | Supabase Edge Functions (Deno) |

### 移除項目（封存至 archive/express-server/）

- server.js（Express + Socket.io）
- package.json / package-lock.json / node_modules
- Dockerfile.dev（nodemon）
- build.js

---

## 前端檔案結構

```
/slides
├── index.html              # 入口（導向 login 或 dashboard）
├── login.html              # 登入頁
├── dashboard.html          # 管理後台（依角色顯示）
├── slides.html             # 簡報檢視器
├── remote.html             # 遙控器
├── config.json             # anonKey + 版本資訊
├── js/
│   ├── supabase-client.js  # createClient 初始化
│   ├── auth.js             # 登入/登出/權限守衛
│   ├── documents.js        # CRUD 操作
│   ├── playlists.js        # Playlist CRUD + RPC
│   ├── realtime.js         # Broadcast 遙控
│   └── upload.js           # 呼叫 Edge Function
├── css/
│   ├── common.css          # 共用樣式
│   └── dashboard.css       # Dashboard 專用
├── theme/
│   └── default/
│       ├── index.css       # 簡報主題
│       └── background.jpg
└── badge.js                # 版本標記
```

### 頁面流程

```
index.html → 檢查 session
  ├─ 未登入 → login.html
  └─ 已登入 → dashboard.html
                ├─ 點擊簡報 → slides.html?src=<docId>
                └─ 點擊 playlist → slides.html?playlist=<playlistId>
```

### 公開存取

`slides.html?playlist=<id>` — RLS 自動判斷：
- `is_public = true` → 無需登入直接顯示
- `is_public = false` → 401 → 導向 login.html

---

## Supabase Client 初始化

```javascript
// js/supabase-client.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

let _supabase = null

export async function getSupabase() {
  if (_supabase) return _supabase
  const res = await fetch('/config.json')
  const config = await res.json()
  _supabase = createClient(window.location.origin, config.anonKey)
  return _supabase
}
```

```json
// config.json
{
  "anonKey": "eyJhbGci...",
  "stage": "alpha",
  "version": "1.0.0",
  "showBadge": true
}
```

---

## Auth 流程

```javascript
// js/auth.js
import { getSupabase } from './supabase-client.js'

export async function login(email, password) {
  const supabase = await getSupabase()
  return await supabase.auth.signInWithPassword({ email, password })
}

export async function logout() {
  const supabase = await getSupabase()
  await supabase.auth.signOut()
  window.location.href = '/login.html'
}

export async function requireAuth() {
  const supabase = await getSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    window.location.href = `/login.html?redirect=${encodeURIComponent(location.href)}`
    return null
  }
  return session
}

export async function getUserRole() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles').select('role, display_name').eq('id', user.id).single()
  return profile
}
```

### 登入方式

- Email/Password（Phase 1）
- 未來可接 Keycloak（OAuth provider）

### 第一個 super_admin

透過 Studio 建立 auth user → SQL 更新 `profiles.role = 'super_admin'`

---

## Database Schema

```sql
-- 用戶角色
CREATE TYPE user_role AS ENUM ('viewer', 'uploader', 'admin', 'super_admin');

-- 用戶資料
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  role user_role DEFAULT 'viewer',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 簡報文件
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES auth.users NOT NULL,
  current_version INT DEFAULT 1,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 播放清單
CREATE TABLE playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  document_ids JSONB DEFAULT '[]',
  owner_id UUID REFERENCES auth.users NOT NULL,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger: 新用戶自動建立 profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'display_name', 'viewer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### RLS Policies

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Super admin can manage all profiles" ON profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Documents
CREATE POLICY "Logged in users can view all documents" ON documents
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Public documents viewable by all" ON documents
  FOR SELECT USING (is_public = true);
CREATE POLICY "Uploader+ can create documents" ON documents
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('uploader', 'admin', 'super_admin'))
  );
CREATE POLICY "Owner can update own documents" ON documents
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owner can delete own documents" ON documents
  FOR DELETE USING (auth.uid() = owner_id);

-- Playlists
CREATE POLICY "Logged in users can view all playlists" ON playlists
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Public playlists viewable by all" ON playlists
  FOR SELECT USING (is_public = true);
CREATE POLICY "Admin+ can create playlists" ON playlists
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );
CREATE POLICY "Owner can update own playlists" ON playlists
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owner can delete own playlists" ON playlists
  FOR DELETE USING (auth.uid() = owner_id);
```

### RPC Functions

保留 plan.md 中的四個 RPC functions：
- `playlist_add_document(p_playlist_id, p_doc_id)`
- `playlist_remove_document(p_playlist_id, p_doc_id)`
- `playlist_reorder_documents(p_playlist_id, p_doc_ids)`
- `playlist_get_with_documents(p_playlist_id)`

---

## Storage

### Bucket 結構

```
slides/
  └── <doc_id>/
      ├── 1.html              -- 版本 1
      ├── 2.html              -- 版本 2
      ├── 3.html              -- 版本 3（最新）
      └── images/
          ├── img_1.jpg
          └── img_2.png
```

`current_version` 欄位決定讀取哪個 `<version>.html`。

### Storage Policies

```sql
-- 公開 document 的檔案可被任何人讀取
CREATE POLICY "Public document files readable"
ON storage.objects FOR SELECT USING (
  bucket_id = 'slides' AND
  EXISTS (
    SELECT 1 FROM documents
    WHERE doc_id = split_part(name, '/', 1)
    AND is_public = true
  )
);

-- 登入用戶可讀取所有檔案
CREATE POLICY "Authenticated users can read all"
ON storage.objects FOR SELECT USING (
  bucket_id = 'slides' AND
  auth.role() = 'authenticated'
);

-- 寫入由 Edge Function (service_role) 處理，自動繞過 RLS
```

### 前端讀取

```javascript
const { data: doc } = await supabase
  .from('documents').select('current_version').eq('doc_id', docId).single()

const { data } = await supabase.storage
  .from('slides')
  .download(`${docId}/${doc.current_version}.html`)

const html = await data.text()
```

---

## Edge Function: fetch-google-doc

```typescript
// supabase/functions/fetch-google-doc/index.ts
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { marked } from 'https://esm.sh/marked@17.0.0'

interface RequestBody {
  url?: string          // 新建：Google Docs URL
  doc_id?: string       // 更新：已存在的 doc_id
  title?: string
  description?: string
}

serve(async (req) => {
  // 1. 驗證身份
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const { data: { user } } = await supabase.auth.getUser(token)

  // 2. 檢查角色 (uploader+)
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!['uploader', 'admin', 'super_admin'].includes(profile.role)) {
    return new Response(JSON.stringify({ error: '權限不足' }), { status: 403 })
  }

  // 3. 解析 doc_id
  const body: RequestBody = await req.json()
  const docId = body.doc_id || extractDocId(body.url)

  // 4. 下載 Markdown
  const mdResponse = await fetch(
    `https://docs.google.com/document/d/${docId}/export?format=md`
  )
  const markdown = await mdResponse.text()

  // 5. 提取 base64 圖片 → 上傳 Storage
  const processed = await extractAndUploadImages(markdown, docId, supabase)

  // 6. 轉換 HTML
  const html = marked.parse(processed)

  // 7. 決定版本號
  const { data: existing } = await supabase
    .from('documents').select('current_version').eq('doc_id', docId).single()
  const version = existing ? existing.current_version + 1 : 1

  // 8. 上傳 Storage
  await supabase.storage.from('slides')
    .upload(`${docId}/${version}.html`, html, {
      contentType: 'text/html',
      upsert: true
    })

  // 9. 更新 Database
  await supabase.from('documents').upsert({
    doc_id: docId,
    title: body.title || docId,
    description: body.description || '',
    owner_id: user.id,
    current_version: version
  }, { onConflict: 'doc_id' })

  return new Response(JSON.stringify({
    success: true, doc_id: docId, version
  }))
})
```

### 與現有 server.js 對應

| server.js | Edge Function |
|-----------|---------------|
| `child_process.exec('curl ...')` | `fetch()` |
| `fs.writeFileSync()` | `supabase.storage.upload()` |
| `marked.parse()` | `marked.parse()` |
| base64 正則提取 → 本地檔案 | base64 正則提取 → Storage upload |

---

## Realtime Broadcast 遙控

取代 Socket.io room-based 遙控：

```javascript
// js/realtime.js
import { getSupabase } from './supabase-client.js'

export async function createRoom(roomId) {
  const supabase = await getSupabase()
  const channel = supabase.channel(`room:${roomId}`)

  channel.on('broadcast', { event: 'command' }, ({ payload }) => {
    switch (payload.action) {
      case 'next': nextPage(); break
      case 'prev': prevPage(); break
      case 'goto': gotoPage(payload.page); break
    }
  })

  function syncState(state) {
    channel.send({
      type: 'broadcast',
      event: 'sync',
      payload: { currentPage: state.current, totalPages: state.total }
    })
  }

  await channel.subscribe()
  return { channel, syncState }
}

export async function joinRoom(roomId) {
  const supabase = await getSupabase()
  const channel = supabase.channel(`room:${roomId}`)

  channel.on('broadcast', { event: 'sync' }, ({ payload }) => {
    updateDisplay(payload.currentPage, payload.totalPages)
  })

  function sendCommand(action, data = {}) {
    channel.send({
      type: 'broadcast',
      event: 'command',
      payload: { action, ...data }
    })
  }

  await channel.subscribe()
  return { channel, sendCommand }
}
```

### 認證

Realtime Broadcast 使用 anon key 公開存取，不需登入。頻道是臨時的，離開即消失。

---

## Nginx 容器

```nginx
# nginx/app.conf
server {
    listen 3000;
    root /usr/share/nginx/html;
    index index.html;

    # HTML：每次檢查是否更新
    location ~* \.html$ {
        add_header Cache-Control "no-cache";
    }

    # CSS/JS/圖片：ETag 驗證快取
    location ~* \.(css|js|jpg|png|svg|woff2)$ {
        add_header Cache-Control "public, must-revalidate";
        etag on;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

```yaml
# docker-compose.yml
master-slides:
  container_name: master-slides
  image: nginx:alpine
  profiles: [app]
  volumes:
    - ../../../:/usr/share/nginx/html:ro
    - ./nginx/app.conf:/etc/nginx/conf.d/default.conf:ro
  healthcheck:
    test: ["CMD", "wget", "--spider", "http://localhost:3000/"]
    interval: 10s
    timeout: 5s
    retries: 3
```

---

## Dashboard 角色介面

```html
<!-- 依角色顯示/隱藏 -->
<section data-role="viewer,uploader,admin,super_admin">
  所有簡報列表
</section>

<section data-role="uploader,admin,super_admin">
  上傳簡報 / 我的簡報
</section>

<section data-role="admin,super_admin">
  播放清單管理（含拖拽排序）
</section>

<section data-role="super_admin">
  用戶管理
</section>
```

### 角色權限矩陣

| 角色 | 閱讀簡報 | 上傳文件 | 建立 playlist | 使用他人文件 | 管理人員 |
|------|----------|----------|---------------|--------------|----------|
| viewer | ✅ | - | - | - | - |
| uploader | ✅ | 自己的 | - | - | - |
| admin | ✅ | 自己的 | ✅ | ✅ | - |
| super_admin | ✅ | 自己的 | ✅ | ✅ | ✅ |

---

## 實作階段

### Phase 0：基礎準備
- 封存 server.js 等到 archive/express-server/
- 建立前端目錄結構（js/, css/）
- 建立 Nginx 容器配置
- 更新 docker-compose.yml（Nginx 取代 Express）
- 建立 config.json
- 驗證 Nginx 透過 Kong 正常提供靜態檔案

### Phase 1：Database + Auth
- 建立 Schema（profiles, documents, playlists）
- 設定 RLS Policies
- 建立 RPC Functions
- 建立 Storage Bucket + Policies
- 實作 js/supabase-client.js + js/auth.js
- 實作 login.html
- 建立第一個 super_admin 帳號
- 驗證：登入 → 取得 profile → 角色正確

### Phase 2：Edge Function
- 建立 fetch-google-doc（Deno）
- 實作 fetch 下載 + base64 圖片提取 + marked 轉換
- 上傳 `<doc_id>/<version>.html` 到 Storage
- 部署到 Edge Runtime
- 驗證：呼叫 function → Storage 有檔案 → DB 有記錄

### Phase 3：Dashboard
- 實作 dashboard.html + css
- 實作 js/documents.js + js/playlists.js + js/upload.js
- 角色分區顯示
- 拖拽排序（HTML5 Drag & Drop）
- super_admin 用戶管理
- 驗證：各角色操作正常

### Phase 4：Slides + Realtime
- 修改 slides.html（從 Storage 讀取）
- 實作 js/realtime.js（Broadcast）
- 修改 remote.html（Realtime 取代 Socket.io）
- Playlist 模式
- 公開/內部存取邏輯
- 驗證：觀看 + 遙控 + 公開連結

### Phase 5：收尾
- index.html 入口路由
- badge.js 更新
- 更新 CLAUDE.md + tech.md
- 清理不需要的檔案
- 完整流程測試

---

## 設計決策記錄

1. **方向 C（全遷移）**：移除 Express/Socket.io，全部使用 Supabase 服務
2. **Kong 單一入口**：不額外加 Nginx 反向代理層
3. **Nginx 作為靜態服務**：取代 Express，僅服務 HTML/CSS/JS
4. **ES Modules**：原生 import/export，無 build step
5. **esm.sh CDN 固定版本**：避免意外升級
6. **JSONB 陣列**：Playlist 的 document_ids 不用關聯表
7. **版本號 HTML**：`<version>.html` 取代 current.html + .md
8. **Realtime Broadcast 公開**：anon key 存取，不需登入
9. **RLS 控制公開存取**：前端不帶 `?public=true`，由 API 判斷
10. **ETag 快取策略**：修改後刷新即生效，無需手動清快取
11. **封存不刪除**：舊實作移到 archive/ 保留參考
