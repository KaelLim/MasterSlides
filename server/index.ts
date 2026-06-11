import { join } from "path";
// `./lib/drust.ts` validates DRUST_BASE_URL / DRUST_TENANT_ID / DRUST_ANON_TOKEN
// at first call; `./routes/publish.ts` additionally requires DRUST_SERVICE_TOKEN.
// First request that hits each path surfaces the missing-env error.
import { handleFetchDoc, handleDocs } from "./routes/docs.ts";
import { handlePublish, handleConfig } from "./routes/publish.ts";
import { handleAdminRoute } from "./routes/admin/index.ts";
import { handleGetEdit, handlePostEdit, type EditPayload } from "./routes/edit.ts";

const PORT = parseInt(process.env.PORT || "3000");
const PUBLIC_DIR = join(import.meta.dir, "../public");

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

async function serveStatic(pathname: string): Promise<Response> {
  // /img/<file_id> → proxy Drust public bucket as same-origin
  // (html2canvas can't render cross-origin images; same-origin sidesteps
  // the whole CORS problem).
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

  // Everything else → public/ directory (single source for static assets).
  // Mirror CF Pages' clean-URL behaviour: bare directory falls back to
  // index.html; extensionless paths try .html — matches production.
  const candidates: string[] = [];
  if (pathname === "/") {
    candidates.push(join(PUBLIC_DIR, "index.html"));
  } else if (pathname.endsWith("/")) {
    candidates.push(join(PUBLIC_DIR, pathname, "index.html"));
  } else if (/\.[a-z0-9]+$/i.test(pathname)) {
    candidates.push(join(PUBLIC_DIR, pathname));
  } else {
    candidates.push(join(PUBLIC_DIR, pathname));
    candidates.push(join(PUBLIC_DIR, pathname + ".html"));
    candidates.push(join(PUBLIC_DIR, pathname, "index.html"));
  }
  for (const p of candidates) {
    const f = Bun.file(p);
    if (await f.exists()) {
      return new Response(f, { headers: headersFor(p) });
    }
  }
  return new Response("Not Found", { status: 404 });
}

const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // GET /api/config → { wsUrl } for the browser to subscribe directly to
    // Drust's broadcast WS using the anon token (publish requires service
    // token, which the browser never sees — it POSTs through /api/publish).
    if (pathname === "/api/config" && req.method === "GET") {
      return handleConfig();
    }

    // POST /api/publish/:room → proxy to Drust broadcast (service token held
    // server-side). Body is forwarded verbatim as the broadcast payload.
    if (pathname.startsWith("/api/publish/") && req.method === "POST") {
      const room = pathname.slice("/api/publish/".length);
      if (!room) return new Response("Missing room", { status: 400 });
      return handlePublish(room, req);
    }

    // ── Admin + Playlists (dispatcher) ──
    const adminRes = await handleAdminRoute(req, url);
    if (adminRes) return adminRes;

    // / smart router — viewer query → /slides/; otherwise admin.
    if (pathname === "/" && req.method === "GET") {
      if (url.searchParams.has("src") || url.searchParams.has("playlist")) {
        return Response.redirect(`/slides/${url.search}`, 302);
      }
      return Response.redirect("/admin/", 302);
    }

    // Pasted Google Docs URL (e.g. localhost:3000/document/d/<id>/edit) →
    // redirect to the editor at /edit/?src=<doc_id>, so every imported doc
    // passes through the metadata-entry step before it appears on the
    // slides surface.
    const docMatch = pathname.match(/^\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (docMatch) {
      return Response.redirect(`/edit/?src=${encodeURIComponent(docMatch[1])}`, 302);
    }

    // API: POST /api/fetch-doc
    if (pathname === "/api/fetch-doc" && req.method === "POST") {
      return handleFetchDoc(req);
    }

    // API: GET/POST /api/edit/:id
    // Match the charset enforced by extractDocId / handleGetDoc so a
    // malformed path can't be string-interpolated into upstream URLs.
    if (pathname.startsWith("/api/edit/")) {
      const id = pathname.replace(/^\/api\/edit\//, "").replace(/\/$/, "");
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        return Response.json({ error: "invalid_doc_id" }, { status: 400 });
      }
      if (req.method === "GET") return handleGetEdit(id);
      if (req.method === "POST") {
        let payload: EditPayload;
        try {
          payload = (await req.json()) as EditPayload;
        } catch {
          return Response.json({ error: "bad-json" }, { status: 400 });
        }
        return handlePostEdit(id, payload);
      }
      return new Response("Method Not Allowed", { status: 405 });
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
