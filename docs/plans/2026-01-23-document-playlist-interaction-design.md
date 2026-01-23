# Document & Playlist 互動設計

## 概述

解決四個相關問題：
1. URL redirect 上傳未註冊 document 記錄
2. Document public/private 與 playlist 播放的互動規則
3. Document 刪除時的 cascade 清除
4. Playlist RPC type mismatch error

---

## 1. URL Redirect 上傳流程

### 現狀問題

`/document/d/:docId/*` 路徑由 Edge Function 處理轉換，但未要求登入，也未在 `documents` table 建立記錄。

### 解決方案

新增 `redirect.html` 作為 auth wrapper：

1. Kong 將 `/document/d/:docId/*` 路由到 `redirect.html`
2. `redirect.html` 檢查 Supabase session：
   - **未登入** → `/login.html?redirect=/document/d/:docId/...`
   - **已登入** → 呼叫 `/functions/v1/fetch-google-doc`（帶 auth token）
3. 成功後導向 `/slides.html?src=:docId`

### Edge Function 行為

- `doc_id` 已存在 → 更新 `current_version`
- `doc_id` 不存在 → insert（`owner_id` = 當前用戶，`is_public = true`）

---

## 2. Document & Playlist 公開/私有互動

### 規則

- 新上傳 document 預設 `is_public = true`
- Playlist 的 `document_ids` 不因 document 變 unpublic 而移除（保留引用）
- 播放時由 RPC 查詢層過濾，只回傳 public 的 documents

### RPC 修改

`playlist_get_with_documents` 改用 `INNER JOIN` + `is_public = true`：

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
  SELECT p.id, p.name, d.doc_id, d.title, d.current_version, idx.ordinality
  FROM playlists p,
    jsonb_array_elements_text(p.document_ids) WITH ORDINALITY AS idx(val, ordinality)
    INNER JOIN documents d ON d.doc_id = idx.val
  WHERE p.id = p_playlist_id
    AND d.is_public = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

slides.html 不需額外判斷，RPC 已過濾。全部 unpublic 時回傳空結果，顯示「播放清單為空」。

---

## 3. Document 刪除 Cascade

### 需清除項目

1. Storage bucket `slides/<docId>/` 資料夾
2. 所有 playlist `document_ids` 中該 docId 的引用

### 分工

- **前端**：刪除前先清除 Storage 檔案
- **DB trigger**：AFTER DELETE 自動清除 playlist 引用

### Database Objects

```sql
-- Helper: 從所有 playlist 移除指定 docId
CREATE OR REPLACE FUNCTION remove_doc_from_all_playlists(p_doc_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE playlists
  SET document_ids = (
    SELECT COALESCE(jsonb_agg(val), '[]'::jsonb)
    FROM jsonb_array_elements_text(document_ids) AS val
    WHERE val != p_doc_id
  )
  WHERE document_ids @> to_jsonb(p_doc_id)::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function
CREATE OR REPLACE FUNCTION on_document_delete()
RETURNS trigger AS $$
BEGIN
  PERFORM remove_doc_from_all_playlists(OLD.doc_id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger
CREATE TRIGGER trg_document_delete
  AFTER DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION on_document_delete();
```

### 前端 deleteDocument 修改

```javascript
export async function deleteDocument(docId) {
  const supabase = await getSupabase()
  // 1. 清除 Storage
  const { data: files } = await supabase.storage.from('slides').list(docId)
  if (files?.length) {
    const paths = files.map(f => `${docId}/${f.name}`)
    await supabase.storage.from('slides').remove(paths)
  }
  // 2. 刪除 document（trigger 自動清除 playlist 引用）
  const { error } = await supabase.from('documents').delete().eq('doc_id', docId)
  if (error) throw error
}
```

---

## 4. Playlist RPC Error 修正

### 錯誤

`structure of query does not match function result type`

### Root Cause

`RETURNS TABLE` 宣告 `sort_order INT`，但 `WITH ORDINALITY` 產生 `BIGINT`。

### 修正

`sort_order INT` → `sort_order BIGINT`（已包含在第 2 節的 RPC 重寫中）。

---

## Migration SQL

一次性套用所有變更（在 Supabase SQL Editor 執行）：

```sql
-- 1. 修正 playlist_get_with_documents（修 BIGINT + 加 public 過濾）
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
  SELECT p.id, p.name, d.doc_id, d.title, d.current_version, idx.ordinality
  FROM playlists p,
    jsonb_array_elements_text(p.document_ids) WITH ORDINALITY AS idx(val, ordinality)
    INNER JOIN documents d ON d.doc_id = idx.val
  WHERE p.id = p_playlist_id
    AND d.is_public = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Helper function: 從所有 playlist 移除指定 docId
CREATE OR REPLACE FUNCTION remove_doc_from_all_playlists(p_doc_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE playlists
  SET document_ids = (
    SELECT COALESCE(jsonb_agg(val), '[]'::jsonb)
    FROM jsonb_array_elements_text(document_ids) AS val
    WHERE val != p_doc_id
  )
  WHERE document_ids @> to_jsonb(p_doc_id)::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger function
CREATE OR REPLACE FUNCTION on_document_delete()
RETURNS trigger AS $$
BEGIN
  PERFORM remove_doc_from_all_playlists(OLD.doc_id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Bind trigger (drop if exists first)
DROP TRIGGER IF EXISTS trg_document_delete ON documents;
CREATE TRIGGER trg_document_delete
  AFTER DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION on_document_delete();
```

---

## 修改檔案

| 檔案 | 修改內容 |
|------|----------|
| `redirect.html` | 新增：auth wrapper for URL redirect |
| `js/documents.js` | 修改 deleteDocument：加 Storage 清除 |
| `deployment/.../init.sql` | 更新 RPC + 新增 trigger/helper |

---

## 驗證方式

1. **URL redirect**：未登入訪問 `/document/d/:id/...` → 跳轉 login → 登入後轉換並建立記錄
2. **Public 過濾**：playlist 含 unpublic doc → slides.html 播放時跳過該 doc
3. **刪除 cascade**：刪除 document → Storage 檔案消失 + playlist 中該 docId 移除
4. **RPC error**：playlist 播放不再報 type mismatch 錯誤
