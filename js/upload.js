import { getSupabase } from './supabase-client.js'

export async function fetchGoogleDoc({ url, docId, title, description }) {
  const supabase = await getSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('未登入')

  const body = {}
  if (url) body.url = url
  if (docId) body.doc_id = docId
  if (title) body.title = title
  if (description) body.description = description

  const response = await fetch('/functions/v1/fetch-google-doc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })

  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.error || `上傳失敗 (${response.status})`)
  }
  return result
}

export function extractDocIdFromUrl(url) {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}
