// Edge Functions Main Entry Point
// 此檔案作為 Edge Runtime 的入口點

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const FUNCTION_ROUTES: Record<string, string> = {
  '/fetch-google-doc': './fetch-google-doc',
}

serve(async (req: Request) => {
  const url = new URL(req.url)
  const pathname = url.pathname

  // Health check
  if (pathname === '/health' || pathname === '/') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Route to specific function
  const functionPath = FUNCTION_ROUTES[pathname]
  if (functionPath) {
    try {
      const module = await import(functionPath)
      return await module.default(req)
    } catch (error) {
      console.error(`Error loading function ${pathname}:`, error)
      return new Response(JSON.stringify({ error: 'Function not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  })
})
