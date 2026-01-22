# MasterSlides Dashboard 優化計劃

## 目標

將 upload 功能擴展為完整的 Dashboard 管理系統，使用 Supabase 作為後端。

## 架構總覽

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
│  login.html → dashboard.html → slides.html                      │
└───────┬─────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Supabase                                 │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────────┐   │
│  │   Auth   │  │   Database   │  │   Storage (Bucket)      │   │
│  │          │  │  - documents │  │   slides/               │   │
│  │  Login   │  │  - playlists │  │     <docId>/1.md        │   │
│  │  Users   │  │  - playlist_ │  │     <docId>/2.md        │   │
│  │          │  │      items   │  │                         │   │
│  └──────────┘  └──────────────┘  └─────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │   Edge Function: fetch-google-doc                         │   │
│  │   - 接收 Google Docs URL                                  │   │
│  │   - 下載 Markdown                                         │   │
│  │   - 存入 Storage bucket                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      server.js (Node.js)                         │
│  - 靜態檔案服務                                                  │
│  - Socket.io 遙控功能                                            │
└─────────────────────────────────────────────────────────────────┘
```

## 角色權限

| 角色 | 閱讀 slides | 上傳文件 | 建立 playlist | 使用他人文件 | 管理人員 |
|------|-------------|----------|---------------|--------------|----------|
| viewer | 內部 | - | - | - | - |
| uploader | 內部 | 自己的 | - | - | - |
| admin | 內部 | 自己的 | 可建立 | 可使用 | - |
| super_admin | 內部 | 自己的 | 可建立 | 可使用 | 可管理 |

**公開分享**：Playlist 可設為 public，無需登入即可觀看。

## Database Schema

```sql
-- 用戶角色
CREATE TYPE user_role AS ENUM ('viewer', 'uploader', 'admin', 'super_admin');

-- 用戶資料（擴展 auth.users）
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
  doc_id TEXT UNIQUE NOT NULL,          -- Google Doc ID
  title TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES auth.users NOT NULL,
  current_version INT DEFAULT 1,
  is_public BOOLEAN DEFAULT false,      -- 公開分享
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 播放清單（組合多個簡報）
CREATE TABLE playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  document_ids JSONB DEFAULT '[]',      -- ['doc_id_1', 'doc_id_7', 'doc_id_9']
  owner_id UUID REFERENCES auth.users NOT NULL,
  is_public BOOLEAN DEFAULT false,      -- 公開分享
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;

-- Profile policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Super admin can manage all profiles" ON profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Document policies
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

-- Playlist policies
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

-- ============================================
-- RPC Functions for Playlist Operations
-- ============================================

-- 新增 document 到 playlist
CREATE OR REPLACE FUNCTION playlist_add_document(
  p_playlist_id UUID,
  p_doc_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_playlist playlists%ROWTYPE;
  v_user_role user_role;
BEGIN
  -- 檢查用戶角色
  SELECT role INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '權限不足');
  END IF;

  -- 取得 playlist
  SELECT * INTO v_playlist FROM playlists WHERE id = p_playlist_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Playlist 不存在');
  END IF;

  -- 檢查是否已存在
  IF v_playlist.document_ids ? p_doc_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Document 已在清單中');
  END IF;

  -- 新增到陣列末端
  UPDATE playlists
  SET document_ids = document_ids || jsonb_build_array(p_doc_id),
      updated_at = now()
  WHERE id = p_playlist_id;

  RETURN jsonb_build_object('success', true, 'document_ids', v_playlist.document_ids || jsonb_build_array(p_doc_id));
END;
$$;

-- 從 playlist 移除 document
CREATE OR REPLACE FUNCTION playlist_remove_document(
  p_playlist_id UUID,
  p_doc_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_playlist playlists%ROWTYPE;
  v_user_role user_role;
  v_new_ids JSONB;
BEGIN
  -- 檢查用戶角色
  SELECT role INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '權限不足');
  END IF;

  -- 取得 playlist
  SELECT * INTO v_playlist FROM playlists WHERE id = p_playlist_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Playlist 不存在');
  END IF;

  -- 移除指定 document
  SELECT jsonb_agg(elem) INTO v_new_ids
  FROM jsonb_array_elements(v_playlist.document_ids) AS elem
  WHERE elem #>> '{}' != p_doc_id;

  UPDATE playlists
  SET document_ids = COALESCE(v_new_ids, '[]'::jsonb),
      updated_at = now()
  WHERE id = p_playlist_id;

  RETURN jsonb_build_object('success', true, 'document_ids', COALESCE(v_new_ids, '[]'::jsonb));
END;
$$;

-- 重新排序 playlist 的 documents
CREATE OR REPLACE FUNCTION playlist_reorder_documents(
  p_playlist_id UUID,
  p_doc_ids JSONB  -- 新的順序陣列 ['doc_9', 'doc_1', 'doc_7']
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role user_role;
BEGIN
  -- 檢查用戶角色
  SELECT role INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '權限不足');
  END IF;

  -- 檢查 playlist 是否存在
  IF NOT EXISTS (SELECT 1 FROM playlists WHERE id = p_playlist_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Playlist 不存在');
  END IF;

  -- 直接更新為新順序
  UPDATE playlists
  SET document_ids = p_doc_ids,
      updated_at = now()
  WHERE id = p_playlist_id;

  RETURN jsonb_build_object('success', true, 'document_ids', p_doc_ids);
END;
$$;

-- 取得 playlist 完整資訊（含 documents 詳情）
CREATE OR REPLACE FUNCTION playlist_get_with_documents(p_playlist_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_playlist playlists%ROWTYPE;
  v_documents JSONB;
BEGIN
  -- 取得 playlist
  SELECT * INTO v_playlist FROM playlists WHERE id = p_playlist_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Playlist 不存在');
  END IF;

  -- 檢查權限（公開或已登入）
  IF NOT v_playlist.is_public AND auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '需要登入');
  END IF;

  -- 取得 documents 詳情（保持順序）
  SELECT jsonb_agg(
    jsonb_build_object(
      'doc_id', d.doc_id,
      'title', d.title,
      'description', d.description,
      'current_version', d.current_version
    ) ORDER BY ord.idx
  ) INTO v_documents
  FROM jsonb_array_elements_text(v_playlist.document_ids) WITH ORDINALITY AS ord(doc_id, idx)
  LEFT JOIN documents d ON d.doc_id = ord.doc_id;

  RETURN jsonb_build_object(
    'success', true,
    'playlist', jsonb_build_object(
      'id', v_playlist.id,
      'name', v_playlist.name,
      'description', v_playlist.description,
      'is_public', v_playlist.is_public,
      'owner_id', v_playlist.owner_id
    ),
    'documents', COALESCE(v_documents, '[]'::jsonb)
  );
END;
$$;
```

## Storage Bucket 結構

```
slides/                          -- Bucket 名稱
  └── <user_id>/
      └── <doc_id>/
          ├── 1.md               -- 版本 1
          ├── 2.md               -- 版本 2
          └── current.html       -- 目前版本的 HTML（供 slides.html 讀取）
```

## 實作項目

### Phase 1: Supabase 設定

- [ ] 建立 Supabase 專案
- [ ] 建立 Database Schema (profiles, documents, playlists)
- [ ] 建立 user_role ENUM type
- [ ] 設定 RLS Policies（依角色權限）
- [ ] 建立 RPC Functions (playlist_add_document, playlist_remove_document, playlist_reorder_documents, playlist_get_with_documents)
- [ ] 建立 Storage Bucket `slides`
- [ ] 設定 Bucket 存取權限（authenticated users）
- [ ] 建立第一個 super_admin 帳號

### Phase 2: Edge Function

- [ ] 建立 `fetch-google-doc` Edge Function
  ```typescript
  // supabase/functions/fetch-google-doc/index.ts
  // 功能：
  // 1. 驗證用戶身份 + 角色檢查 (uploader+)
  // 2. 從 Google Docs URL 提取 doc_id
  // 3. 下載 Markdown (export?format=md)
  // 4. 處理 base64 圖片，存入 Storage
  // 5. 存入 Storage: <doc_id>/<version>.md
  // 6. 轉換為 HTML 存入: <doc_id>/current.html
  // 7. 新增/更新 documents 表（含 title, description）
  ```

### Phase 3: 前端頁面

- [ ] **login.html** - 登入頁面
  - Email/Password 登入（未來接 Keycloak）
  - 登入後依角色導向 dashboard

- [ ] **dashboard.html** - 管理後台（依角色顯示功能）

  **所有登入用戶 (viewer+)**：
  - 查看所有簡報列表
  - 點擊進入 slides.html 觀看

  **uploader+**：
  - 上傳區塊：輸入 title, description, Google Docs URL
  - 我的簡報：查看自己上傳的文件
  - 更新版本：重新抓取 Google Docs（version +1）
  - 刪除自己的簡報

  **admin+**：
  - Playlist 管理區塊
  - 建立新 playlist（name, description, is_public）
  - 從所有 documents 中選取加入 playlist
  - 拖拽排序 playlist items
  - 設定 playlist 公開/內部

  **super_admin**：
  - 用戶管理區塊
  - 查看所有用戶列表
  - 修改用戶角色

### Phase 4: 修改 slides.html

- [ ] 支援從 Supabase Storage 讀取內容
  - `slides.html?src=<doc_id>` - 單一簡報
  - `slides.html?playlist=<playlist_id>` - Playlist 模式（依序載入）
- [ ] 公開 playlist 無需登入即可觀看
- [ ] 內部 playlist 需登入驗證

### Phase 5: 整合與測試

- [ ] 更新 server.js（移除 /api/fetch-doc，保留 Socket.io）
- [ ] 環境變數設定 (SUPABASE_URL, SUPABASE_ANON_KEY)
- [ ] 測試各角色權限
- [ ] 測試公開/內部分享
- [ ] 更新 CLAUDE.md

## 檔案結構（預期）

```
/
├── server.js                    # Express + Socket.io（保留遙控功能）
├── slides.html                  # 簡報檢視器（修改讀取來源）
├── login.html                   # 新增：登入頁面
├── dashboard.html               # 新增：管理後台
├── remote.html                  # 遙控器（不變）
├── js/
│   └── supabase-client.js       # Supabase 初始化
├── supabase/
│   └── functions/
│       └── fetch-google-doc/
│           └── index.ts         # Edge Function
├── theme/                       # 不變
└── .env                         # 環境變數
```

## API 端點

| 端點 | 方法 | 說明 |
|------|------|------|
| Supabase Auth | - | 登入/登出/註冊 |
| `/functions/v1/fetch-google-doc` | POST | 下載 Google Docs 並存入 Storage |
| Supabase Storage | GET | 讀取 .md / .html 檔案 |
| Supabase Database | CRUD | profiles, documents, playlists |

### RPC Functions

| Function | 參數 | 說明 |
|----------|------|------|
| `playlist_add_document` | `p_playlist_id`, `p_doc_id` | 新增 document 到 playlist |
| `playlist_remove_document` | `p_playlist_id`, `p_doc_id` | 從 playlist 移除 document |
| `playlist_reorder_documents` | `p_playlist_id`, `p_doc_ids` | 重新排序 playlist |
| `playlist_get_with_documents` | `p_playlist_id` | 取得 playlist 完整內容 |

## CRUD 操作詳細說明

### Profiles（用戶資料）

| 操作 | 權限 | 說明 | Supabase Client |
|------|------|------|-----------------|
| **Create** | 系統 | 註冊時 trigger 自動建立，預設 role=viewer | 自動 |
| **Read** | 自己 / super_admin | 用戶只能讀自己的 profile | `supabase.from('profiles').select().eq('id', userId)` |
| **Read All** | super_admin | 查看所有用戶列表 | `supabase.from('profiles').select()` |
| **Update** | 自己 | 更新自己的 display_name | `supabase.from('profiles').update({ display_name }).eq('id', userId)` |
| **Update Role** | super_admin | 修改任何用戶的角色 | `supabase.from('profiles').update({ role }).eq('id', targetUserId)` |
| **Delete** | - | 不允許刪除（隨 auth.users 級聯刪除） | - |

```javascript
// 範例：Super Admin 修改用戶角色
const { error } = await supabase
  .from('profiles')
  .update({ role: 'uploader' })
  .eq('id', targetUserId)
```

---

### Documents（簡報文件）

| 操作 | 權限 | 說明 | Supabase Client |
|------|------|------|-----------------|
| **Create** | uploader+ | 呼叫 Edge Function 建立 | `supabase.functions.invoke('fetch-google-doc', { body: {...} })` |
| **Read All** | 登入用戶 | 查看所有文件列表 | `supabase.from('documents').select()` |
| **Read Public** | 任何人 | 查看公開文件 | `supabase.from('documents').select().eq('is_public', true)` |
| **Update** | owner | 更新 title, description, is_public | `supabase.from('documents').update({...}).eq('id', docId)` |
| **Update Version** | owner | 重新抓取 Google Docs（呼叫 Edge Function） | `supabase.functions.invoke('fetch-google-doc', { body: { doc_id, update: true } })` |
| **Delete** | owner | 刪除文件 + Storage 檔案 | `supabase.from('documents').delete().eq('id', docId)` |

```javascript
// 範例：Uploader 上傳新文件
const { data, error } = await supabase.functions.invoke('fetch-google-doc', {
  body: {
    url: 'https://docs.google.com/document/d/xxx/edit',
    title: '2024 年度報告',
    description: '第一季成果分享'
  }
})

// 範例：Owner 更新文件版本
const { data, error } = await supabase.functions.invoke('fetch-google-doc', {
  body: {
    doc_id: 'xxx',
    update: true  // 標記為更新，version +1
  }
})

// 範例：查詢文件列表（含 owner 資訊）
const { data } = await supabase
  .from('documents')
  .select(`
    *,
    owner:profiles(display_name)
  `)
  .order('created_at', { ascending: false })
```

---

### Playlists（播放清單）

| 操作 | 權限 | 說明 | 方式 |
|------|------|------|------|
| **Create** | admin+ | 建立新 playlist | `supabase.from('playlists').insert({...})` |
| **Read All** | 登入用戶 | 查看所有 playlist | `supabase.from('playlists').select()` |
| **Read Public** | 任何人 | 查看公開 playlist | `supabase.from('playlists').select().eq('is_public', true)` |
| **Read with Docs** | 登入/公開 | 取得完整內容 | `supabase.rpc('playlist_get_with_documents', {...})` |
| **Update** | owner | 更新 name, description, is_public | `supabase.from('playlists').update({...})` |
| **Add Doc** | admin+ | 新增 document | `supabase.rpc('playlist_add_document', {...})` |
| **Remove Doc** | admin+ | 移除 document | `supabase.rpc('playlist_remove_document', {...})` |
| **Reorder** | admin+ | 重新排序 | `supabase.rpc('playlist_reorder_documents', {...})` |
| **Delete** | owner | 刪除 playlist | `supabase.from('playlists').delete()` |

```javascript
// 範例：Admin 建立新 playlist
const { data, error } = await supabase
  .from('playlists')
  .insert({
    name: '2024 Q1 報告會議',
    description: '包含財務、人資、研發報告',
    document_ids: [],
    is_public: false,
    owner_id: currentUserId
  })
  .select()
  .single()

// 範例：新增 document 到 playlist（RPC）
const { data } = await supabase.rpc('playlist_add_document', {
  p_playlist_id: 'abc-123',
  p_doc_id: 'doc_1'
})
// 回傳: { success: true, document_ids: ['doc_1'] }

// 範例：移除 document（RPC）
const { data } = await supabase.rpc('playlist_remove_document', {
  p_playlist_id: 'abc-123',
  p_doc_id: 'doc_1'
})

// 範例：重新排序（拖拽後）（RPC）
const { data } = await supabase.rpc('playlist_reorder_documents', {
  p_playlist_id: 'abc-123',
  p_doc_ids: ['doc_9', 'doc_1', 'doc_7']  // 新順序
})

// 範例：取得 playlist 完整內容（含 documents 詳情）（RPC）
const { data } = await supabase.rpc('playlist_get_with_documents', {
  p_playlist_id: 'abc-123'
})
// 回傳:
// {
//   success: true,
//   playlist: { id, name, description, is_public, owner_id },
//   documents: [
//     { doc_id: 'doc_9', title: '年度總結', description: '...', current_version: 2 },
//     { doc_id: 'doc_1', title: '財務報告', description: '...', current_version: 1 },
//     { doc_id: 'doc_7', title: '專案A進度', description: '...', current_version: 3 }
//   ]
// }

// 範例：查詢所有 playlists（簡易列表）
const { data } = await supabase
  .from('playlists')
  .select(`
    id,
    name,
    description,
    is_public,
    document_ids,
    owner:profiles(display_name)
  `)
  .order('created_at', { ascending: false })
```

---

### Storage（檔案儲存）

| 操作 | 權限 | 路徑 | Supabase Client |
|------|------|------|-----------------|
| **Upload** | Edge Function | `<doc_id>/<version>.md` | `supabase.storage.from('slides').upload(path, file)` |
| **Upload** | Edge Function | `<doc_id>/current.html` | `supabase.storage.from('slides').upload(path, file, { upsert: true })` |
| **Upload** | Edge Function | `<doc_id>/images/<name>` | `supabase.storage.from('slides').upload(path, imageBuffer)` |
| **Read** | 登入用戶 | 任何檔案 | `supabase.storage.from('slides').download(path)` |
| **Read Public** | 任何人 | 公開 document 的檔案 | 需設定 Storage Policy 或使用 signed URL |
| **Delete** | Edge Function | 刪除 document 時清理 | `supabase.storage.from('slides').remove([paths])` |

```javascript
// 範例：slides.html 讀取內容
const { data, error } = await supabase.storage
  .from('slides')
  .download(`${docId}/current.html`)

const html = await data.text()

// 範例：取得公開 URL（適用於圖片）
const { data } = supabase.storage
  .from('slides')
  .getPublicUrl(`${docId}/images/img_1.jpg`)
```

---

### Edge Function: fetch-google-doc

```typescript
// supabase/functions/fetch-google-doc/index.ts

interface RequestBody {
  url?: string           // 新建時提供 Google Docs URL
  title?: string         // 文件標題
  description?: string   // 文件描述
  doc_id?: string        // 更新時提供 doc_id
  update?: boolean       // true = 更新版本
}

interface Response {
  success: boolean
  doc_id: string
  version: number
  message?: string
  error?: string
}

// 處理流程：
// 1. 驗證 JWT token
// 2. 查詢 profiles 確認角色 >= uploader
// 3. 新建模式：
//    - 從 URL 提取 doc_id
//    - 檢查 doc_id 是否已存在
//    - 下載 Markdown
//    - 處理 base64 圖片 → Storage
//    - 存入 <doc_id>/1.md
//    - 轉換 HTML → <doc_id>/current.html
//    - INSERT documents 表
// 4. 更新模式：
//    - 查詢現有 document（驗證 owner）
//    - 下載 Markdown
//    - 存入 <doc_id>/<version+1>.md
//    - 更新 current.html
//    - UPDATE documents.current_version
```

## 設計決策記錄

1. **登入方式**：先用 Email/Password，未來接 Keycloak
2. **公開分享**：Playlist 可設為 public（無需登入）或 internal（需登入）
3. **Playlist 概念**：用於組合報告用的 documents，非協作功能。由 admin 建立，選取需要的 documents（如 1, 7, 9）組成一個報告清單
4. **版本控制**：文件更新在 Google Docs 進行，用戶到平台點擊「更新」重新抓取，version +1
