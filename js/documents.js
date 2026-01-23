import { getSupabase } from './supabase-client.js'

export async function listDocuments() {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getDocument(docId) {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('doc_id', docId)
    .single()
  if (error) throw error
  return data
}

export async function updateDocument(docId, updates) {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('documents')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('doc_id', docId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteDocument(docId) {
  const supabase = await getSupabase()
  // 清除 Storage bucket 中的檔案
  const { data: files } = await supabase.storage.from('slides').list(docId)
  if (files?.length) {
    const paths = files.map(f => `${docId}/${f.name}`)
    await supabase.storage.from('slides').remove(paths)
  }
  // 刪除 document 記錄（DB trigger 自動清除 playlist 引用）
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('doc_id', docId)
  if (error) throw error
}

export async function togglePublic(docId, isPublic) {
  return updateDocument(docId, { is_public: isPublic })
}
