// Edge Function: fetch-google-doc
// 用於從 Google Docs 下載文件並存入 Supabase Storage

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  url?: string           // 新建時提供 Google Docs URL
  title?: string         // 文件標題
  description?: string   // 文件描述
  doc_id?: string        // 更新時提供 doc_id
  update?: boolean       // true = 更新版本
}

interface Response {
  success: boolean
  doc_id?: string
  version?: number
  message?: string
  error?: string
}

export default async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 驗證 JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: '需要登入' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 初始化 Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 驗證用戶
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: '驗證失敗' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 檢查用戶角色
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: '找不到用戶資料' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const allowedRoles = ['uploader', 'admin', 'super_admin']
    if (!allowedRoles.includes(profile.role)) {
      return new Response(
        JSON.stringify({ success: false, error: '權限不足，需要 uploader 以上角色' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 解析請求
    const body: RequestBody = await req.json()
    const { url, title, description, doc_id, update } = body

    // TODO: 實作完整的 Google Docs 下載邏輯
    // 1. 從 URL 提取 doc_id (如果是新建)
    // 2. 下載 Markdown (export?format=md)
    // 3. 處理 base64 圖片
    // 4. 存入 Storage
    // 5. 新增/更新 documents 表

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Edge Function placeholder - 待實作',
        user_id: user.id,
        role: profile.role
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
