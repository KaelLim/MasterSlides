import { getSupabase } from './supabase-client.js'

export async function listPlaylists() {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('playlists')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createPlaylist({ name, description = '', document_ids = [] } = {}) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('playlists')
    .insert({ name, description, document_ids, owner_id: user.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updatePlaylist(id, updates) {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('playlists')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deletePlaylist(id) {
  const supabase = await getSupabase()
  const { error } = await supabase
    .from('playlists')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function addDocument(playlistId, docId) {
  const supabase = await getSupabase()
  const { error } = await supabase.rpc('playlist_add_document', {
    p_playlist_id: playlistId,
    p_doc_id: docId,
  })
  if (error) throw error
}

export async function removeDocument(playlistId, docId) {
  const supabase = await getSupabase()
  const { error } = await supabase.rpc('playlist_remove_document', {
    p_playlist_id: playlistId,
    p_doc_id: docId,
  })
  if (error) throw error
}

export async function reorderDocuments(playlistId, docIds) {
  const supabase = await getSupabase()
  const { error } = await supabase.rpc('playlist_reorder_documents', {
    p_playlist_id: playlistId,
    p_doc_ids: docIds,
  })
  if (error) throw error
}

export async function getWithDocuments(playlistId, { publicOnly = false } = {}) {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc('playlist_get_with_documents', {
    p_playlist_id: playlistId,
    p_public_only: publicOnly,
  })
  if (error) throw error
  return data
}

export async function togglePublic(id, isPublic) {
  return updatePlaylist(id, { is_public: isPublic })
}
