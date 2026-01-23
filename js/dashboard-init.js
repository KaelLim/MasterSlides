import { getSupabase } from '/js/supabase-client.js'
import { store } from '/js/store.js'
import '/js/components/master-sidebar.js'
import '/js/components/master-toast.js'

export async function initDashboard(activePage) {
  const supabase = await getSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    location.href = '/login.html'
    throw new Error('redirecting')
  }

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', session.user.id).single()
  store.setUser(session.user, profile)

  await Promise.all([store.refreshDocuments(), store.refreshPlaylists()])

  const sidebar = document.querySelector('master-sidebar')
  sidebar.role = profile.role
  sidebar.email = session.user.email
  sidebar.active = activePage

  return { session, profile, supabase }
}
