import { join } from "path";
// Importing `./routes/docs.ts` transitively loads `./lib/drust.ts`, which
// validates DRUST_BASE_URL / DRUST_TENANT_ID / DRUST_SERVICE_TOKEN at module
// load and throws if any is missing. That is the fail-fast for missing env.
import { handleFetchDoc, handleDocs } from "./routes/docs.ts";
import {
  handleViewerStream,
  handlePhoneStream,
  handleCommandPost,
  handleSyncPost,
} from "./routes/remote.ts";

const PORT = parseInt(process.env.PORT || "3000");
const PUBLIC_DIR = join(import.meta.dir, "../public");
const PROJECT_ROOT = join(import.meta.dir, "..");  // repo root for css/, theme/, js/slides/

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

function getMime(path: string): string {
  const ext = path.substring(path.lastIndexOf("."));
  return MIME_TYPES[ext] || "application/octet-stream";
}

// Source-like assets (HTML/JS/CSS) we update during development. Disabling
// caching avoids the "I rebuilt the bundle but the browser still shows the
// old version" loop. Static images / fonts get the default no-header
// behaviour (browser heuristic caching is fine for those).
function isHotAsset(path: string): boolean {
  return /\.(html|css|m?js|map)$/i.test(path);
}

function headersFor(path: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": getMime(path) };
  if (isHotAsset(path)) headers["Cache-Control"] = "no-cache";
  return headers;
}

async function serveFile(filePath: string): Promise<Response> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(file, { headers: headersFor(filePath) });
}

async function serveStatic(pathname: string): Promise<Response> {
  // /css/* → check public first (slide-page overrides), then project root
  if (pathname.startsWith("/css/")) {
    const publicFile = Bun.file(join(PUBLIC_DIR, pathname));
    if (await publicFile.exists()) {
      return new Response(publicFile, { headers: headersFor(pathname) });
    }
    return serveFile(join(PROJECT_ROOT, pathname));
  }

  // /theme/* → project root (shared assets)
  if (pathname.startsWith("/theme/")) {
    return serveFile(join(PROJECT_ROOT, pathname));
  }

  // /js/slides/* → project root's js/slides/ (shared viewer modules)
  if (pathname.startsWith("/js/slides/")) {
    return serveFile(join(PROJECT_ROOT, pathname));
  }

  // /img/<file_id> → proxy Drust public bucket as same-origin
  // (html2canvas can't render cross-origin images; same-origin sidesteps the whole CORS problem)
  if (pathname.startsWith("/img/")) {
    const fileId = pathname.slice("/img/".length);
    const upstream = await fetch(
      `${process.env.DRUST_BASE_URL}/public/${process.env.DRUST_TENANT_ID}/${fileId}`
    );
    if (!upstream.ok) {
      return new Response("Not Found", { status: upstream.status });
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  // /dist/* → public/dist/ (bundled JS)
  if (pathname.startsWith("/dist/")) {
    return serveFile(join(PUBLIC_DIR, pathname));
  }

  // Everything else → public/ directory
  let filePath = join(PUBLIC_DIR, pathname);

  // Default to index.html for directory requests
  if (pathname === "/") {
    filePath = join(PUBLIC_DIR, "slides.html");
  }

  return serveFile(filePath);
}

const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // SSE viewer stream: GET /sse/viewer/:room
    if (pathname.startsWith("/sse/viewer/") && req.method === "GET") {
      const room = pathname.slice("/sse/viewer/".length);
      if (!room) return new Response("Missing room", { status: 400 });
      return handleViewerStream(room, url);
    }

    // SSE phone stream: GET /sse/phone/:room
    if (pathname.startsWith("/sse/phone/") && req.method === "GET") {
      const room = pathname.slice("/sse/phone/".length);
      if (!room) return new Response("Missing room", { status: 400 });
      return handlePhoneStream(room, url);
    }

    // POST /api/room/:room/command  (phone → viewer)
    // POST /api/room/:room/sync     (viewer → phone)
    if (pathname.startsWith("/api/room/") && req.method === "POST") {
      const rest = pathname.slice("/api/room/".length);
      const slash = rest.indexOf("/");
      if (slash > 0) {
        const room = rest.slice(0, slash);
        const action = rest.slice(slash + 1);
        if (action === "command") return handleCommandPost(room, req);
        if (action === "sync") return handleSyncPost(room, req);
      }
    }

    // Pasted Google Docs URL (e.g. localhost:3000/document/d/<id>/edit) →
    // redirect to the clean short form /?src=<doc_id>. The frontend's
    // loadDocument auto-syncs from Google on cache miss, so first-time visits
    // still work; subsequent visits read from Drust cache.
    const docMatch = pathname.match(/^\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (docMatch) {
      return Response.redirect(`/?src=${docMatch[1]}`, 302);
    }

    // API: POST /api/fetch-doc
    if (pathname === "/api/fetch-doc" && req.method === "POST") {
      return handleFetchDoc(req);
    }

    // API: GET /api/docs or /api/docs/:id
    if (pathname.startsWith("/api/docs")) {
      return handleDocs(url);
    }

    // Static files
    return serveStatic(pathname);
  },
});

console.log(`Slides server running at http://localhost:${server.port}`);
