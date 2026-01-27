// Edge Functions Main Entry Point
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Static imports for all functions
import fetchGoogleDoc from "../fetch-google-doc/index.ts"

const FUNCTION_HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  '/fetch-google-doc': fetchGoogleDoc,
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
  const handler = FUNCTION_HANDLERS[pathname]
  if (handler) {
    try {
      return await handler(req)
    } catch (error) {
      console.error(`Error in function ${pathname}:`, error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  })
})
