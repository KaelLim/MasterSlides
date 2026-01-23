import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

let _supabase = null

export async function getSupabase() {
  if (_supabase) return _supabase
  const res = await fetch('/config.json')
  const config = await res.json()
  _supabase = createClient(window.location.origin, config.anonKey)
  return _supabase
}
