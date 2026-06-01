# Aliswa Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Bun server that replaces Supabase for the aliswa slides viewer — handling Google Docs conversion, file storage, WebSocket remote control, and static file serving.

**Architecture:** Pure `Bun.serve()` with manual routing (no framework). Single `marked` dependency for markdown→HTML. Local filesystem `data/` directory for documents and images. WebSocket relay for remote control between slides.html and remote.html.

**Tech Stack:** Bun, TypeScript, marked, WebSocket (Bun built-in)

---

## File Structure

```
aliswa/
├── server/
│   ├── index.ts              # Bun.serve() entry: routing, static files, WS upgrade
│   ├── routes/
│   │   ├── docs.ts           # POST /api/fetch-doc, GET /api/docs, GET /api/docs/:id
│   │   └── ws.ts             # WebSocket handler: room relay logic
│   └── lib/
│       ├── google-docs.ts    # extractDocId(), fetchMarkdown()
│       ├── convert.ts        # processImages(), markdownToHtml()
│       └── storage.ts        # readMeta(), writeMeta(), nextVersion(), listDocs()
├── public/
│   ├── slides.html           # Moved from aliswa/slides.html + remote button restored
│   ├── remote.html           # Restored from original, WebSocket-based
│   └── js/
│       └── app.js            # Modified: API doc loading + WebSocket remote
├── data/                     # Runtime (gitignored)
├── package.json
├── tsconfig.json
└── .gitignore
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `aliswa/package.json`
- Create: `aliswa/tsconfig.json`
- Create: `aliswa/.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "aliswa",
  "type": "module",
  "scripts": {
    "dev": "bun --watch server/index.ts",
    "start": "bun server/index.ts"
  },
  "dependencies": {
    "marked": "^9.1.6"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["server/**/*.ts"]
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
data/
```

- [ ] **Step 4: Install dependencies**

Run: `cd aliswa && bun install`
Expected: `bun.lock` created, `node_modules/` populated.

- [ ] **Step 5: Restructure existing files into public/**

Move existing `aliswa/slides.html` → `aliswa/public/slides.html`
Move existing `aliswa/js/` → `aliswa/public/js/`

```bash
cd aliswa
mkdir -p public/js
mv slides.html public/slides.html
mv js/app.js public/js/app.js
rmdir js
```

- [ ] **Step 6: Create data directory**

```bash
mkdir -p aliswa/data
```

- [ ] **Step 7: Commit**

```bash
git add aliswa/package.json aliswa/tsconfig.json aliswa/.gitignore aliswa/public/
git commit -m "chore(aliswa): scaffold Bun project, restructure into public/"
```

---

### Task 2: Filesystem Storage Helpers

**Files:**
- Create: `aliswa/server/lib/storage.ts`

- [ ] **Step 1: Create storage.ts**

```ts
import { join } from "path";
import { readdir, mkdir } from "fs/promises";

const DATA_DIR = join(import.meta.dir, "../../data");

export interface DocMeta {
  doc_id: string;
  title: string;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export function docDir(docId: string): string {
  return join(DATA_DIR, docId);
}

export function imagesDir(docId: string): string {
  return join(DATA_DIR, docId, "images");
}

export async function ensureDocDir(docId: string): Promise<void> {
  await mkdir(imagesDir(docId), { recursive: true });
}

export async function readMeta(docId: string): Promise<DocMeta | null> {
  const file = Bun.file(join(docDir(docId), "meta.json"));
  if (!(await file.exists())) return null;
  return file.json();
}

export async function writeMeta(meta: DocMeta): Promise<void> {
  const path = join(docDir(meta.doc_id), "meta.json");
  await Bun.write(path, JSON.stringify(meta, null, 2));
}

export async function nextVersion(docId: string): Promise<number> {
  const meta = await readMeta(docId);
  return meta ? meta.current_version + 1 : 1;
}

export async function readDocHtml(docId: string): Promise<string | null> {
  const meta = await readMeta(docId);
  if (!meta) return null;
  const file = Bun.file(join(docDir(docId), `${meta.current_version}.html`));
  if (!(await file.exists())) return null;
  return file.text();
}

export async function writeDocHtml(docId: string, version: number, html: string): Promise<void> {
  const path = join(docDir(docId), `${version}.html`);
  await Bun.write(path, html);
}

export async function writeImage(docId: string, filename: string, data: Uint8Array): Promise<void> {
  const path = join(imagesDir(docId), filename);
  await Bun.write(path, data);
}

export async function listDocs(): Promise<DocMeta[]> {
  const docs: DocMeta[] = [];
  try {
    const entries = await readdir(DATA_DIR);
    for (const entry of entries) {
      const meta = await readMeta(entry);
      if (meta) docs.push(meta);
    }
  } catch {
    // data/ doesn't exist yet
  }
  return docs;
}

export function resolveDataPath(pathname: string): string {
  // pathname like "/data/abc123/images/img_1.png"
  return join(DATA_DIR, pathname.replace(/^\/data\//, ""));
}
```

- [ ] **Step 2: Commit**

```bash
git add aliswa/server/lib/storage.ts
git commit -m "feat(aliswa): add filesystem storage helpers"
```

---

### Task 3: Google Docs Downloader

**Files:**
- Create: `aliswa/server/lib/google-docs.ts`

- [ ] **Step 1: Create google-docs.ts**

```ts
export function extractDocId(url: string): string | null {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export async function fetchMarkdown(docId: string): Promise<string> {
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=md`;

  const res = await fetch(exportUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Aliswa/1.0)",
    },
  });

  if (!res.ok) {
    const errorMap: Record<number, string> = {
      401: "文件需要登入才能存取，請確認已設為「任何人都可檢視」",
      403: "沒有權限存取此文件，請確認已設為「任何人都可檢視」",
      404: "找不到此文件，請確認文件 ID 正確",
    };
    throw new Error(errorMap[res.status] || `下載失敗 (HTTP ${res.status})`);
  }

  const text = await res.text();
  if (!text || text.length === 0) {
    throw new Error("文件內容為空");
  }

  return text;
}
```

- [ ] **Step 2: Commit**

```bash
git add aliswa/server/lib/google-docs.ts
git commit -m "feat(aliswa): add Google Docs markdown downloader"
```

---

### Task 4: Markdown → HTML Converter with Image Extraction

**Files:**
- Create: `aliswa/server/lib/convert.ts`

- [ ] **Step 1: Create convert.ts**

```ts
import { marked } from "marked";
import { writeImage } from "./storage.ts";

export interface ConvertResult {
  html: string;
  imageCount: number;
}

export async function processImages(
  markdown: string,
  docId: string
): Promise<{ markdown: string; imageCount: number }> {
  const lines = markdown.split("\n");
  const processedLines: string[] = [];
  let imageCount = 0;

  for (const line of lines) {
    // Skip "分頁 N" markers
    if (/^#*\s*分頁\s*\d+\s*$/.test(line.trim())) {
      continue;
    }

    // Match image reference definitions: [image1]: <data:image/...;base64,...>
    const refMatch = line.match(
      /^\[([^\]]+)\]:\s*<data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)>$/
    );

    if (refMatch) {
      const [, refName, format, base64Data] = refMatch;
      imageCount++;

      const ext = format === "jpeg" ? "jpg" : format;
      const imgFilename = `img_${imageCount}.${ext}`;
      const cleanBase64 = base64Data.replace(/[\r\n\s]/g, "");

      try {
        const binary = atob(cleanBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        await writeImage(docId, imgFilename, bytes);
        processedLines.push(`[${refName}]: /data/${docId}/images/${imgFilename}`);
      } catch (err) {
        console.error(`Image processing failed for ${refName}:`, err);
        processedLines.push(line);
      }
    } else {
      processedLines.push(line);
    }
  }

  return { markdown: processedLines.join("\n"), imageCount };
}

function cleanImageStyles(html: string): string {
  return html.replace(/<img([^>]*)\s+style="[^"]*"([^>]*)>/gi, "<img$1$2>");
}

export async function convertDocument(
  markdown: string,
  docId: string
): Promise<ConvertResult> {
  const { markdown: processed, imageCount } = await processImages(markdown, docId);

  marked.setOptions({ breaks: true, gfm: true });
  const rawHtml = await marked.parse(processed);
  const cleanHtml = cleanImageStyles(rawHtml);
  const html = `<article class="slide-content">\n${cleanHtml}\n</article>`;

  return { html, imageCount };
}
```

- [ ] **Step 2: Commit**

```bash
git add aliswa/server/lib/convert.ts
git commit -m "feat(aliswa): add markdown-to-HTML converter with image extraction"
```

---

### Task 5: Document API Routes

**Files:**
- Create: `aliswa/server/routes/docs.ts`

- [ ] **Step 1: Create docs.ts**

```ts
import { extractDocId, fetchMarkdown } from "../lib/google-docs.ts";
import { convertDocument } from "../lib/convert.ts";
import {
  ensureDocDir,
  readMeta,
  writeMeta,
  nextVersion,
  readDocHtml,
  writeDocHtml,
  listDocs,
  type DocMeta,
} from "../lib/storage.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export async function handleFetchDoc(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { url, title } = body as { url?: string; title?: string };

    if (!url) {
      return json({ success: false, error: "請提供 Google Docs URL" }, 400);
    }

    const docId = extractDocId(url);
    if (!docId) {
      return json({ success: false, error: "無效的 Google Docs URL" }, 400);
    }

    await ensureDocDir(docId);

    const markdown = await fetchMarkdown(docId);
    const { html, imageCount } = await convertDocument(markdown, docId);

    const version = await nextVersion(docId);
    await writeDocHtml(docId, version, html);

    const existingMeta = await readMeta(docId);
    const now = new Date().toISOString();
    const meta: DocMeta = {
      doc_id: docId,
      title: title || existingMeta?.title || docId,
      current_version: version,
      created_at: existingMeta?.created_at || now,
      updated_at: now,
    };
    await writeMeta(meta);

    return json({
      success: true,
      doc_id: docId,
      version,
      images: imageCount,
    });
  } catch (err: any) {
    console.error("fetch-doc error:", err);
    return json({ success: false, error: err.message }, 500);
  }
}

export async function handleGetDoc(docId: string): Promise<Response> {
  const html = await readDocHtml(docId);
  if (!html) {
    return json({ error: "找不到文件" }, 404);
  }
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function handleListDocs(): Promise<Response> {
  const docs = await listDocs();
  return json(docs);
}

export async function handleDocs(url: URL): Promise<Response> {
  const path = url.pathname;

  // GET /api/docs
  if (path === "/api/docs") {
    return handleListDocs();
  }

  // GET /api/docs/:id
  const match = path.match(/^\/api\/docs\/([a-zA-Z0-9_-]+)$/);
  if (match) {
    return handleGetDoc(match[1]);
  }

  return json({ error: "Not found" }, 404);
}
```

- [ ] **Step 2: Commit**

```bash
git add aliswa/server/routes/docs.ts
git commit -m "feat(aliswa): add document API routes (fetch, get, list)"
```

---

### Task 6: WebSocket Room Relay

**Files:**
- Create: `aliswa/server/routes/ws.ts`

- [ ] **Step 1: Create ws.ts**

```ts
import type { ServerWebSocket } from "bun";

interface WsData {
  room: string;
}

const rooms = new Map<string, Set<ServerWebSocket<WsData>>>();

export const wsHandler = {
  open(ws: ServerWebSocket<WsData>) {
    const { room } = ws.data;
    if (!rooms.has(room)) {
      rooms.set(room, new Set());
    }
    rooms.get(room)!.add(ws);
    console.log(`[ws] joined room ${room} (${rooms.get(room)!.size} clients)`);
  },

  message(ws: ServerWebSocket<WsData>, message: string | Buffer) {
    const { room } = ws.data;
    const clients = rooms.get(room);
    if (!clients) return;

    const msg = typeof message === "string" ? message : message.toString();

    // Broadcast to all other clients in the room
    for (const client of clients) {
      if (client !== ws) {
        client.send(msg);
      }
    }
  },

  close(ws: ServerWebSocket<WsData>) {
    const { room } = ws.data;
    const clients = rooms.get(room);
    if (!clients) return;

    clients.delete(ws);
    console.log(`[ws] left room ${room} (${clients.size} clients)`);

    if (clients.size === 0) {
      rooms.delete(room);
    }
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add aliswa/server/routes/ws.ts
git commit -m "feat(aliswa): add WebSocket room relay"
```

---

### Task 7: Server Entry Point

**Files:**
- Create: `aliswa/server/index.ts`

- [ ] **Step 1: Create index.ts**

```ts
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
```

- [ ] **Step 2: Verify server starts**

Run: `cd aliswa && bun run server/index.ts`
Expected: `Aliswa server running at http://localhost:3000`

- [ ] **Step 3: Commit**

```bash
git add aliswa/server/index.ts
git commit -m "feat(aliswa): add Bun server entry point with routing"
```

---

### Task 8: Update Frontend — app.js with API Loading + WebSocket Remote

**Files:**
- Modify: `aliswa/public/js/app.js`

- [ ] **Step 1: Rewrite app.js**

Key changes from current version:
- `loadDocument(src)`: detect doc_id vs URL path, use `/api/docs/:id` for doc IDs
- Add WebSocket remote control: `initRemote()`, `syncRemoteState()`, `handleRemoteCommand()`
- Add remote modal and hotkey back
- Add remote item back to context menu

Replace the entire file with:

```js
// Aliswa slides app — standalone Bun backend, no Supabase
// Loads via /api/docs/:id or direct URL, WebSocket remote control

import { initDOM, state, dom, isMac, modKey } from '/js/slides/state.js';
import { updatePageCount, goToPage, prevPage, nextPage, isVerticalMode } from '/js/slides/navigation.js';
import {
  loadSettings, resetNavHideTimer, updateFullscreenButton, showNav,
  toggleFullscreen, toggleSidebar, closeSidebar, toggleNavVisibility,
  setVerticalMode, setHorizontalMode,
  increaseFontSize, decreaseFontSize, setFontScale, applyFont
} from '/js/slides/display.js';
import { initLightbox, closeLightbox, openLightbox, setLightboxZoom, resetLightboxZoom, panLightbox } from '/js/slides/lightbox.js';
import { initSearch, openSearch, closeSearch, isSearchOpen, searchFor, nextMatch, prevMatch, getSearchState } from '/js/slides/search.js';
import { showGoToPageDialog, initGotoModal, closeGotoModal } from '/js/slides/goto.js';
import { exportPDF } from '/js/slides/print.js';
import { initLaser, toggleLaser, isLaserActive } from '/js/slides/laser.js';

// ── WebSocket Remote Control ────────────────────────────────────

let ws = null;

function getCurrentPageImages() {
  const containerWidth = dom.manuscriptContainer.clientWidth;
  const containerHeight = dom.manuscriptContainer.clientHeight;
  const images = dom.manuscript.querySelectorAll('img');
  const visible = [];
  images.forEach(img => {
    const rect = img.getBoundingClientRect();
    const cRect = dom.manuscriptContainer.getBoundingClientRect();
    const iL = rect.left - cRect.left, iT = rect.top - cRect.top;
    const vW = Math.min(iL + rect.width, containerWidth) - Math.max(iL, 0);
    const vH = Math.min(iT + rect.height, containerHeight) - Math.max(iT, 0);
    if (vW > rect.width * 0.5 && vH > rect.height * 0.5 && img.src) {
      visible.push({ src: img.src, alt: img.alt || '' });
    }
  });
  return visible;
}

function syncRemoteState() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const searchState = getSearchState();
  ws.send(JSON.stringify({
    type: 'sync',
    currentPage: state.currentPage + 1,
    totalPages: state.totalPages,
    images: getCurrentPageImages(),
    lightboxActive: dom.lightbox.classList.contains('active'),
    lightboxZoom: state.lbZoom,
    spotlightActive: isLaserActive(),
    ...searchState
  }));
}

function handleRemoteCommand(payload) {
  const { action } = payload;
  const lightboxActive = dom.lightbox.classList.contains('active');

  switch (action) {
    case 'prev': lightboxActive ? closeLightbox() : prevPage(); break;
    case 'next': lightboxActive ? closeLightbox() : nextPage(); break;
    case 'first': lightboxActive ? closeLightbox() : goToPage(0); break;
    case 'last': lightboxActive ? closeLightbox() : goToPage(state.totalPages - 1); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'toggleMode': isVerticalMode() ? setHorizontalMode() : setVerticalMode(); break;
    case 'toggleLightbox':
      if (payload.src) {
        if (lightboxActive) {
          const cur = dom.lightboxImg.src;
          const same = cur && new URL(cur, location.href).pathname === new URL(payload.src, location.href).pathname;
          same ? closeLightbox() : openLightbox(payload.src, payload.alt || '');
        } else {
          openLightbox(payload.src, payload.alt || '');
        }
      }
      break;
    case 'zoomIn': setLightboxZoom(state.lbZoom + 0.25); break;
    case 'zoomOut': setLightboxZoom(state.lbZoom - 0.25); break;
    case 'zoomReset': resetLightboxZoom(); break;
    case 'pan': panLightbox(payload.dx || 0, payload.dy || 0); break;
    case 'toggleSpotlight': toggleLaser(); break;
    case 'search': if (payload.keyword) searchFor(payload.keyword); break;
    case 'searchPrev': prevMatch(); break;
    case 'searchNext': nextMatch(); break;
    case 'searchClose': closeSearch(); break;
    case 'goto':
      if (payload.page >= 1 && payload.page <= state.totalPages) {
        if (lightboxActive) closeLightbox();
        goToPage(payload.page - 1);
      }
      break;
  }
  syncRemoteState();
}

function initRemote() {
  state.roomId = Math.random().toString(36).substring(2, 8);
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws/${state.roomId}`);

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'command') handleRemoteCommand(data);
      if (data.type === 'remote-joined') {
        document.getElementById('remoteStatus').textContent = '遙控器已連線！';
        document.getElementById('remoteStatus').classList.add('connected');
        syncRemoteState();
        setTimeout(closeRemoteModal, 2000);
      }
    } catch {}
  };

  document.getElementById('remoteBtn').onclick = openRemoteModal;
  document.getElementById('remoteModalClose').onclick = closeRemoteModal;
  dom.remoteModal.onclick = (e) => { if (e.target === dom.remoteModal) closeRemoteModal(); };
}

function openRemoteModal() {
  const qrcodeEl = document.getElementById('qrcode');
  const urlEl = document.getElementById('remoteUrl');
  qrcodeEl.innerHTML = '';
  const host = window.location.hostname;
  const port = window.location.port;
  const remoteUrl = `${location.protocol}//${host}${port ? ':' + port : ''}/remote.html?id=${state.roomId}`;
  new QRCode(qrcodeEl, { text: remoteUrl, width: 200, height: 200 });
  urlEl.textContent = remoteUrl;
  dom.remoteModal.classList.add('active');
  closeSidebar();
}

function closeRemoteModal() {
  dom.remoteModal.classList.remove('active');
}

// ── Table conversion (html2canvas) ──────────────────────────────

async function convertTablesToImages() {
  const tables = dom.manuscript.querySelectorAll('table');
  if (tables.length === 0) return;
  const containerWidth = dom.manuscriptContainer.clientWidth * 0.95;
  for (const table of tables) {
    try {
      table.style.cssText = `writing-mode:horizontal-tb;width:${containerWidth}px;background:rgba(0,0,0,0.3);color:white;border-collapse:collapse;font-size:18px`;
      table.querySelectorAll('td').forEach(td => {
        td.style.cssText = 'writing-mode:horizontal-tb;border:1px solid rgba(255,255,255,0.3);padding:10px 14px;color:white;vertical-align:middle;text-align:left';
      });
      table.querySelectorAll('th').forEach(th => {
        th.style.cssText = 'writing-mode:horizontal-tb;border:1px solid rgba(255,255,255,0.3);padding:10px 14px;color:white;vertical-align:middle;text-align:center;background:#1a365d;font-weight:bold';
      });
      const canvas = await html2canvas(table, { backgroundColor: 'transparent', scale: 2, logging: false });
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      img.className = 'table-image';
      table.parentNode.replaceChild(img, table);
    } catch (err) {
      console.error('table conversion failed:', err);
    }
  }
}

// ── Document loader ─────────────────────────────────��───────────

async function loadDocument(src) {
  try {
    // If src looks like a doc_id (alphanumeric/hyphens/underscores), use API
    const isDocId = /^[a-zA-Z0-9_-]+$/.test(src);
    const url = isDocId ? `/api/docs/${src}` : src;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    dom.manuscript.innerHTML = await res.text();
  } catch (err) {
    dom.manuscript.innerHTML = `<p style="color:#ff6b6b;font-size:24px;">載入失敗: ${err.message}</p>`;
    return;
  }

  loadSettings();
  updateModKeyDisplay();
  await convertTablesToImages();

  requestAnimationFrame(() => {
    updatePageCount();
    initEventListeners();
    initRemote();
    resetNavHideTimer();
  });
}

// ── Modals ──────────────────────────────────────────────────────

function updateModKeyDisplay() {
  document.querySelectorAll('.mod-key').forEach(el => { el.textContent = modKey; });
}

function showHelpModal() {
  if (dom.helpModal) { dom.helpModal.classList.add('active'); closeSidebar(); }
}

function closeHelpModal() {
  if (dom.helpModal) dom.helpModal.classList.remove('active');
}

function closeAllModals() {
  if (dom.lightbox.classList.contains('active')) closeLightbox();
  else if (dom.remoteModal?.classList.contains('active')) closeRemoteModal();
  else if (dom.gotoModal?.classList.contains('active')) closeGotoModal();
  else if (dom.helpModal?.classList.contains('active')) closeHelpModal();
  else if (dom.sidebar.classList.contains('open')) closeSidebar();
}

function initHelpModal() {
  const closeBtn = document.querySelector('.help-modal-close');
  if (closeBtn) closeBtn.onclick = closeHelpModal;
  if (dom.helpModal) {
    dom.helpModal.onclick = (e) => { if (e.target === dom.helpModal) closeHelpModal(); };
  }
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) helpBtn.onclick = showHelpModal;
}

// ── Keyboard ────────────────────────────────────────────────────

const HOTKEYS = {
  'ArrowRight': 'next', ' ': 'next', 'PageDown': 'next',
  'ArrowLeft': 'prev', 'PageUp': 'prev',
  'Home': 'first', 'End': 'last',
  'g': 'goto', 'G': 'goto',
  'f': 'fullscreen', 'F': 'fullscreen',
  's': 'sidebar', 'S': 'sidebar',
  'o': 'orientation', 'O': 'orientation',
  'n': 'toggleNav', 'N': 'toggleNav',
  'r': 'remoteQR', 'R': 'remoteQR',
  'l': 'laser', 'L': 'laser',
  '?': 'help', 'h': 'help', 'H': 'help',
  'Escape': 'escape'
};

const COMBO_KEYS = {
  'Enter': 'fullscreen', '=': 'fontUp', '+': 'fontUp',
  '-': 'fontDown', '0': 'fontReset',
  ',': 'sidebar', 'f': 'search', 'p': 'exportPDF'
};

function closeLightboxIfActive() {
  if (dom.lightbox.classList.contains('active')) { closeLightbox(); return true; }
  return false;
}

const ACTIONS = {
  next: () => { if (!closeLightboxIfActive()) nextPage(); syncRemoteState(); },
  prev: () => { if (!closeLightboxIfActive()) prevPage(); syncRemoteState(); },
  first: () => { if (!closeLightboxIfActive()) goToPage(0); syncRemoteState(); },
  last: () => { if (!closeLightboxIfActive()) goToPage(state.totalPages - 1); syncRemoteState(); },
  goto: showGoToPageDialog,
  fullscreen: toggleFullscreen,
  sidebar: toggleSidebar,
  orientation: () => { isVerticalMode() ? setHorizontalMode() : setVerticalMode(); },
  toggleNav: toggleNavVisibility,
  remoteQR: openRemoteModal,
  laser: toggleLaser,
  help: showHelpModal,
  escape: () => { if (isSearchOpen()) closeSearch(); else closeAllModals(); },
  fontUp: increaseFontSize,
  fontDown: decreaseFontSize,
  fontReset: () => setFontScale(1.0),
  search: openSearch,
  exportPDF: exportPDF
};

function handleKeydown(e) {
  const tag = e.target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  const mod = isMac ? e.metaKey : e.ctrlKey;

  if (mod && !e.shiftKey && !e.altKey) {
    const a = COMBO_KEYS[e.key];
    if (a && ACTIONS[a]) { e.preventDefault(); ACTIONS[a](); showNav(); return; }
  }

  if (!e.metaKey && !e.ctrlKey && !e.altKey) {
    const a = HOTKEYS[e.key];
    if (a && ACTIONS[a]) { e.preventDefault(); ACTIONS[a](); if (a !== 'escape') showNav(); return; }
  }
}

// ── Context Menu ────────────────────────────────────────────────

const CTX_ICONS = {
  spotlight: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>',
  search: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  pdf: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>',
  remote: '<svg width="28" height="28" viewBox="0 -960 960 960" fill="currentColor"><path d="M320-40q-33 0-56.5-23.5T240-120v-720q0-33 23.5-56.5T320-920h320q33 0 56.5 23.5T720-840v720q0 33-23.5 56.5T640-40H320Zm0-80h320v-720H320v720Zm160-440q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Z"/></svg>',
  orientation: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/></svg>',
  fullscreen: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  help: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
};

const CTX_ITEMS = [
  { id: 'ctx-spotlight', icon: CTX_ICONS.spotlight, label: '聚光燈', action: toggleLaser },
  { id: 'ctx-search', icon: CTX_ICONS.search, label: '文字搜尋', action: openSearch },
  { id: 'ctx-pdf', icon: CTX_ICONS.pdf, label: '匯出 PDF', action: exportPDF },
  { id: 'ctx-remote', icon: CTX_ICONS.remote, label: '遙控器', action: openRemoteModal },
  { divider: true },
  { id: 'ctx-orientation', icon: CTX_ICONS.orientation, label: '', action: () => { isVerticalMode() ? setHorizontalMode() : setVerticalMode(); } },
  { id: 'ctx-fullscreen', icon: CTX_ICONS.fullscreen, label: '全螢幕', action: toggleFullscreen },
  { divider: true },
  { id: 'ctx-help', icon: CTX_ICONS.help, label: '快捷鍵說明', action: showHelpModal }
];

let ctxMenu = null;
let longPressTimer = null;

function getOrientationLabel() {
  return isVerticalMode() ? '切換為橫書' : '切換為直書';
}

function buildMenu() {
  ctxMenu = document.createElement('div');
  ctxMenu.className = 'context-menu';
  ctxMenu.id = 'contextMenu';
  CTX_ITEMS.forEach(item => {
    if (item.divider) {
      const d = document.createElement('div');
      d.className = 'context-menu-divider';
      ctxMenu.appendChild(d);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'context-menu-item';
    btn.id = item.id;
    btn.innerHTML = `<span class="context-menu-icon">${item.icon}</span><span class="context-menu-label">${item.label}</span>`;
    btn.addEventListener('click', (e) => { e.stopPropagation(); hideMenu(); item.action(); });
    ctxMenu.appendChild(btn);
  });
  document.body.appendChild(ctxMenu);
}

function showMenu(x, y) {
  if (!ctxMenu) buildMenu();
  const ol = ctxMenu.querySelector('#ctx-orientation .context-menu-label');
  if (ol) ol.textContent = getOrientationLabel();
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top = y + 'px';
  ctxMenu.classList.add('active');
  requestAnimationFrame(() => {
    const r = ctxMenu.getBoundingClientRect();
    if (r.right > window.innerWidth) ctxMenu.style.left = (x - r.width) + 'px';
    if (r.bottom > window.innerHeight) ctxMenu.style.top = (y - r.height) + 'px';
  });
}

function hideMenu() {
  if (ctxMenu) ctxMenu.classList.remove('active');
}

function initContextMenu() {
  buildMenu();
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.sidebar,.help-modal,.remote-modal,.goto-modal,.search-bar')) return;
    e.preventDefault();
    showMenu(e.clientX, e.clientY);
  });
  document.addEventListener('click', (e) => {
    if (ctxMenu?.classList.contains('active') && !ctxMenu.contains(e.target)) hideMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ctxMenu?.classList.contains('active')) { hideMenu(); e.stopPropagation(); }
  }, true);
  document.addEventListener('touchstart', (e) => {
    if (e.target.closest('.sidebar,.help-modal,.remote-modal,.goto-modal,.search-bar,.context-menu,.slide-nav,.left-panel')) return;
    const t = e.touches[0];
    longPressTimer = setTimeout(() => showMenu(t.clientX, t.clientY), 600);
  }, { passive: true });
  document.addEventListener('touchmove', () => { clearTimeout(longPressTimer); }, { passive: true });
  document.addEventListener('touchend', () => { clearTimeout(longPressTimer); }, { passive: true });
}

// ── Event Listeners ─────────────────────────────────────────────

let eventsInit = false;

function initEventListeners() {
  if (eventsInit) return;
  eventsInit = true;

  document.getElementById('prevBtn').onclick = () => { prevPage(); syncRemoteState(); };
  document.getElementById('nextBtn').onclick = () => { nextPage(); syncRemoteState(); };
  dom.hamburgerBtn.onclick = toggleSidebar;
  dom.sidebarOverlay.onclick = closeSidebar;
  document.getElementById('fontDecrease').onclick = decreaseFontSize;
  document.getElementById('fontIncrease').onclick = increaseFontSize;
  document.getElementById('verticalBtn').onclick = setVerticalMode;
  document.getElementById('horizontalBtn').onclick = setHorizontalMode;
  document.getElementById('fontSelect').onchange = function () { applyFont(this.value); };
  document.getElementById('fullscreenBtn').onclick = toggleFullscreen;
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  document.getElementById('toggleNavBtn').onclick = toggleNavVisibility;
  document.getElementById('laserBtn').onclick = toggleLaser;
  initLaser();
  document.getElementById('exportPdfBtn').onclick = exportPDF;

  initHelpModal();
  initGotoModal();
  initSearch();

  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('mousemove', showNav);

  window.addEventListener('resize', () => {
    updatePageCount();
    goToPage(state.currentPage);
  });

  // Touch swipe
  let touchStartX = 0;
  document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const diff = touchStartX - e.changedTouches[0].screenX;
    if (Math.abs(diff) > 50) {
      diff > 0 ? prevPage() : nextPage();
      syncRemoteState();
    }
  }, { passive: true });

  initLightbox();
  initContextMenu();
}

// ── Entry Point ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initDOM();
  const src = new URLSearchParams(window.location.search).get('src');
  if (!src) {
    dom.manuscript.innerHTML = '<p style="color:#ff6b6b;font-size:24px;">請提供 src 參數</p>';
    return;
  }
  loadDocument(src);
});
```

- [ ] **Step 2: Commit**

```bash
git add aliswa/public/js/app.js
git commit -m "feat(aliswa): update app.js with API loading and WebSocket remote"
```

---

### Task 9: Restore slides.html with Remote Button and Modal

**Files:**
- Modify: `aliswa/public/slides.html`

- [ ] **Step 1: Add QR code library and badge back to head**

In `<head>`, after the html2canvas script, add:

```html
  <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
```

- [ ] **Step 2: Restore remote button in sidebar icon-btn-row**

In the `.icon-btn-row` div, add the remote button before the laser button:

```html
        <button class="icon-btn" id="remoteBtn" data-tooltip="遙控器">
          <svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor"><path d="M320-40q-33 0-56.5-23.5T240-120v-720q0-33 23.5-56.5T320-920h320q33 0 56.5 23.5T720-840v720q0 33-23.5 56.5T640-40H320Zm0-80h320v-720H320v720Zm160-440q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0-80q-17 0-28.5-11.5T440-680q0-17 11.5-28.5T480-720q17 0 28.5 11.5T520-680q0 17-11.5 28.5T480-640Zm-80 240q17 0 28.5-11.5T440-440q0-17-11.5-28.5T400-480q-17 0-28.5 11.5T360-440q0 17 11.5 28.5T400-400Zm160 0q17 0 28.5-11.5T600-440q0-17-11.5-28.5T560-480q-17 0-28.5 11.5T520-440q0 17 11.5 28.5T560-400ZM400-280q17 0 28.5-11.5T440-320q0-17-11.5-28.5T400-360q-17 0-28.5 11.5T360-320q0 17 11.5 28.5T400-280Zm160 0q17 0 28.5-11.5T600-320q0-17-11.5-28.5T560-360q-17 0-28.5 11.5T520-320q0 17 11.5 28.5T560-280ZM400-160q17 0 28.5-11.5T440-200q0-17-11.5-28.5T400-240q-17 0-28.5 11.5T360-200q0 17 11.5 28.5T400-160Zm160 0q17 0 28.5-11.5T600-200q0-17-11.5-28.5T560-240q-17 0-28.5 11.5T520-200q0 17 11.5 28.5T560-160Zm-240 40v-720 720Z"/></svg>
        </button>
```

- [ ] **Step 3: Restore remote modal**

Before the help modal comment, add:

```html
  <!-- 遙控 Modal -->
  <div class="remote-modal" id="remoteModal">
    <span class="remote-modal-close" id="remoteModalClose">&times;</span>
    <h2>掃描 QR Code 開啟遙控器</h2>
    <p>使用手機掃描下方 QR Code</p>
    <div id="qrcode"></div>
    <div class="remote-url" id="remoteUrl"></div>
    <div class="remote-status" id="remoteStatus">等待連線...</div>
  </div>
```

- [ ] **Step 4: Restore R hotkey in help modal**

In the help modal "其他" column, add back before the `?`/`H` line:

```html
          <div class="help-item"><kbd>R</kbd><span>遙控器 QR Code</span></div>
```

- [ ] **Step 5: Commit**

```bash
git add aliswa/public/slides.html
git commit -m "feat(aliswa): restore remote button, modal, and QR in slides.html"
```

---

### Task 10: Create WebSocket-based remote.html

**Files:**
- Create: `aliswa/public/remote.html`

- [ ] **Step 1: Copy original remote.html as base**

```bash
cp slides/remote.html aliswa/public/remote.html
```

(Copy from project root's `remote.html`)

- [ ] **Step 2: Replace the script block**

Replace the entire `<script type="module">...</script>` block (from line 474 to line 731 in the original) with the WebSocket-based version. The only change is the connection mechanism — all UI logic (updateImages, updateZoomControls, updateSearchState, joystick, etc.) stays identical.

Replace:
```js
    import { joinRoom, sendCommand } from '/js/realtime.js'
```

With native WebSocket setup:
```js
    let ws = null;

    function sendCommand(action, data = {}) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'command', action, ...data }));
    }
```

Replace the connection block:
```js
    if (!roomId) {
      // ... same error handling
    } else {
      document.getElementById('status').textContent = '連線中...'

      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/ws/${roomId}`);

      ws.onopen = () => {
        document.getElementById('status').textContent = '等待簡報同步...'
        // Notify host that remote has joined
        ws.send(JSON.stringify({ type: 'remote-joined' }));
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'sync') {
            document.getElementById('status').textContent = '已連線'
            document.getElementById('status').classList.add('connected')
            document.getElementById('currentPage').textContent = data.currentPage
            document.getElementById('totalPages').textContent = data.totalPages
            document.getElementById('remoteGotoInput').max = data.totalPages
            updateImages(data.images || [])
            updateZoomControls(data.lightboxActive, data.lightboxZoom)
            updateSearchState(data)
          }
        } catch {}
      };

      ws.onerror = () => {
        document.getElementById('status').textContent = '連線失敗'
        document.getElementById('status').classList.add('error')
        document.getElementById('errorBox').style.display = 'block'
      };

      ws.onclose = () => {
        document.getElementById('status').textContent = '連線已斷開'
        document.getElementById('status').classList.remove('connected')
      };

      // ... rest of the event handlers stay the same (navigation, zoom, search, goto, keyboard, joystick)
    }
```

All the remaining code (event bindings for prevBtn, nextBtn, zoom, search, goto, keyboard, updateImages, updateZoomControls, updateSearchState, toggleSearchPanel, closeSearchPanel, doSearch, toggleGotoPanel, doGoto, initJoystick) stays identical — they all call `sendCommand()` which now goes through WebSocket instead of Supabase.

- [ ] **Step 3: Commit**

```bash
git add aliswa/public/remote.html
git commit -m "feat(aliswa): add WebSocket-based remote.html"
```

---

### Task 11: End-to-End Verification

- [ ] **Step 1: Start the server**

```bash
cd aliswa && bun run dev
```

Expected: `Aliswa server running at http://localhost:3000`

- [ ] **Step 2: Test static file serving**

Open `http://localhost:3000/slides.html?src=test` in browser.
Expected: Page loads with "載入失敗: HTTP 404" (no document yet, but page renders).

- [ ] **Step 3: Test document conversion**

```bash
curl -X POST http://localhost:3000/api/fetch-doc \
  -H "Content-Type: application/json" \
  -d '{"url": "https://docs.google.com/document/d/SOME_PUBLIC_DOC_ID/edit"}'
```

Expected: JSON response with `success: true`, `doc_id`, `version: 1`.

- [ ] **Step 4: Test document viewing**

Open `http://localhost:3000/slides.html?src=SOME_PUBLIC_DOC_ID` in browser.
Expected: Slides render with pagination working.

- [ ] **Step 5: Test remote control**

1. Open slides page, press `R` to show QR code
2. Open the remote URL in another tab
3. Click prev/next on remote
Expected: Slides page responds to remote commands.

- [ ] **Step 6: Test document list**

```bash
curl http://localhost:3000/api/docs
```

Expected: JSON array containing the document created in step 3.

- [ ] **Step 7: Final commit**

```bash
git add -A aliswa/
git commit -m "feat(aliswa): complete standalone Bun server with WebSocket remote"
```
