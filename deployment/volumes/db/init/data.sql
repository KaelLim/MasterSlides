-- MasterSlides Schema
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

-- Helper function to check super_admin without recursion
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
$$;

-- Profile policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Super admin can view all profiles" ON profiles
  FOR SELECT USING (is_super_admin());

CREATE POLICY "Super admin can update all profiles" ON profiles
  FOR UPDATE USING (is_super_admin());

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

-- Storage bucket: slides (public access for images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('slides', 'slides', true, 52428800, NULL)
ON CONFLICT (id) DO NOTHING;
