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

export async function getSession() {
  const supabase = await getSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getUserRole() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role, display_name').eq('id', user.id).single()
  return profile
}
