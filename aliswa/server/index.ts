import { join } from "path";
import { handleFetchDoc, handleDocs } from "./routes/docs.ts";
import { wsHandler } from "./routes/ws.ts";

const PORT = parseInt(process.env.PORT || "3000");
const PUBLIC_DIR = join(import.meta.dir, "../public");
const PROJECT_ROOT = join(import.meta.dir, "../..");  // slides/ root for css/, theme/
const DATA_DIR = join(import.meta.dir, "../data");

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

async function serveFile(filePath: string): Promise<Response> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(file, {
    headers: { "Content-Type": getMime(filePath) },
  });
}

async function serveStatic(pathname: string): Promise<Response> {
  // /data/* → data directory (converted docs + images)
  if (pathname.startsWith("/data/")) {
    return serveFile(join(DATA_DIR, pathname.replace(/^\/data\//, "")));
  }

  // /css/* and /theme/* → project root (shared assets)
  if (pathname.startsWith("/css/") || pathname.startsWith("/theme/")) {
    return serveFile(join(PROJECT_ROOT, pathname));
  }

  // /js/slides/* → project root's js/slides/ (shared viewer modules)
  if (pathname.startsWith("/js/slides/")) {
    return serveFile(join(PROJECT_ROOT, pathname));
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

  async fetch(req, server) {
    const url = new URL(req.url);
    const { pathname } = url;

    // WebSocket upgrade: /ws/:room
    if (pathname.startsWith("/ws/")) {
      const room = pathname.split("/")[2];
      if (room && server.upgrade(req, { data: { room } })) {
        return undefined as any;
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
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

  websocket: wsHandler,
});

console.log(`Aliswa server running at http://localhost:${server.port}`);
