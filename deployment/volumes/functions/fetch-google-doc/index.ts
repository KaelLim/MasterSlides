// Edge Function: fetch-google-doc
// 從 Google Docs 下載文件，處理圖片，存入 Supabase Storage

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { marked } from 'https://esm.sh/marked@9.1.6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  url?: string           // Google Docs URL
  title?: string         // 文件標題 (可選，預設使用 doc_id)
  description?: string   // 文件描述
  doc_id?: string        // 更新時提供 (不需要 url)
}

// 從 Google Docs URL 提取 doc_id
function extractDocId(url: string): string | null {
  // 支援格式：
  // https://docs.google.com/document/d/DOC_ID/edit
  // https://docs.google.com/document/d/DOC_ID/edit?tab=t.0
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// 處理 Markdown 中的 base64 圖片
async function processImages(
  markdown: string,
  docId: string,
  supabase: any
): Promise<{ markdown: string; imageCount: number }> {
  const lines = markdown.split('\n');
  const processedLines: string[] = [];
  let imageCount = 0;

  for (const line of lines) {
    // 跳過「分頁 N」標記
    if (/^#*\s*分頁\s*\d+\s*$/.test(line.trim())) {
      continue;
    }

    // 檢查圖片引用定義: [image1]: <data:image/...;base64,...>
    const refMatch = line.match(/^\[([^\]]+)\]:\s*<data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)>$/);

    if (refMatch) {
      const [, refName, format, base64Data] = refMatch;
      imageCount++;

      const ext = format === 'jpeg' ? 'jpg' : format;
      const imgFilename = `img_${imageCount}.${ext}`;
      const storagePath = `${docId}/images/${imgFilename}`;

      // 清理並解碼 base64
      const cleanBase64 = base64Data.replace(/[\r\n\s]/g, '');

      try {
        // 將 base64 轉為 Uint8Array
        const binaryString = atob(cleanBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // 上傳到 Storage
        const { error: uploadError } = await supabase.storage
          .from('slides')
          .upload(storagePath, bytes, {
            contentType: `image/${format}`,
            upsert: true
          });

        if (uploadError) {
          console.error(`圖片上傳失敗 ${refName}:`, uploadError);
          processedLines.push(line);
        } else {
          // 使用公開 URL
          processedLines.push(`[${refName}]: /storage/v1/object/public/slides/${storagePath}`);
        }
      } catch (err) {
        console.error(`圖片處理失敗 ${refName}:`, err);
        processedLines.push(line);
      }
    } else {
      processedLines.push(line);
    }
  }

  return { markdown: processedLines.join('\n'), imageCount };
}

// 生成純內容 HTML（不含完整 HTML 結構）
function generateContentHtml(htmlContent: string): string {
  return `<article class="slide-content">\n${htmlContent}\n</article>`;
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

    // 初始化 Supabase client (使用 service role 繞過 RLS)
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
    const { url, description } = body
    let { doc_id, title } = body

    // 如果沒有 doc_id，從 URL 提取
    if (!doc_id) {
      if (!url) {
        return new Response(
          JSON.stringify({ success: false, error: '請提供 Google Docs URL 或 doc_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      doc_id = extractDocId(url)
      if (!doc_id) {
        return new Response(
          JSON.stringify({ success: false, error: '無效的 Google Docs URL' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 如果沒有 title，使用 doc_id 作為預設值
    if (!title) {
      title = doc_id
    }

    // 檢查文件是否已存在
    const { data: existingDoc } = await supabase
      .from('documents')
      .select('id, current_version, owner_id')
      .eq('doc_id', doc_id)
      .single()

    const isUpdate = !!existingDoc
    let newVersion = 1

    if (isUpdate) {
      // 檢查是否為 owner
      if (existingDoc.owner_id !== user.id) {
        return new Response(
          JSON.stringify({ success: false, error: '只有文件擁有者可以更新' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      newVersion = existingDoc.current_version + 1
    }

    // 從 Google Docs 下載 Markdown
    const exportUrl = `https://docs.google.com/document/d/${doc_id}/export?format=md`
    console.log(`下載 Google Doc: ${doc_id}`)

    const response = await fetch(exportUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MasterSlides/1.0)'
      }
    })

    if (!response.ok) {
      const errorMap: Record<number, string> = {
        401: '文件需要登入才能存取，請確認已設為「任何人都可檢視」',
        403: '沒有權限存取此文件，請確認已設為「任何人都可檢視」',
        404: '找不到此文件，請確認文件 ID 正確'
      }
      const errorMsg = errorMap[response.status] || `下載失敗 (HTTP ${response.status})`
      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let markdown = await response.text()

    if (!markdown || markdown.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: '文件內容為空' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`下載成功，原始大小: ${markdown.length} bytes`)

    // 處理圖片
    const { markdown: processedMarkdown, imageCount } = await processImages(markdown, doc_id, supabase)
    console.log(`處理了 ${imageCount} 張圖片`)

    // 轉換為 HTML
    marked.setOptions({ breaks: true, gfm: true })
    const htmlContent = marked.parse(processedMarkdown)
    const finalHtml = generateContentHtml(htmlContent as string)

    // 上傳 HTML 到 Storage
    const htmlPath = `${doc_id}/${newVersion}.html`
    const { error: htmlUploadError } = await supabase.storage
      .from('slides')
      .upload(htmlPath, finalHtml, {
        contentType: 'text/html; charset=utf-8',
        upsert: true
      })

    if (htmlUploadError) {
      console.error('HTML 上傳失敗:', htmlUploadError)
      return new Response(
        JSON.stringify({ success: false, error: 'HTML 上傳失敗' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 新增或更新 documents 表
    if (isUpdate) {
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          title,
          description: description || null,
          current_version: newVersion,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingDoc.id)

      if (updateError) {
        console.error('更新 documents 失敗:', updateError)
        return new Response(
          JSON.stringify({ success: false, error: '更新資料庫失敗' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      const { error: insertError } = await supabase
        .from('documents')
        .insert({
          doc_id,
          title,
          description: description || null,
          owner_id: user.id,
          current_version: newVersion,
          is_public: false
        })

      if (insertError) {
        console.error('新增 documents 失敗:', insertError)
        return new Response(
          JSON.stringify({ success: false, error: '新增資料庫失敗: ' + insertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    console.log(`成功${isUpdate ? '更新' : '新增'}文件: ${doc_id}, 版本: ${newVersion}`)

    return new Response(
      JSON.stringify({
        success: true,
        doc_id,
        version: newVersion,
        message: isUpdate ? '文件已更新' : '文件已新增',
        images: imageCount
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
