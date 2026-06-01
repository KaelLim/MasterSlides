# Aliswa Backend Design

Standalone pure Bun server (+ marked) replacing Supabase for the aliswa slides viewer. Handles Google Docs conversion, file storage, WebSocket remote control, and static file serving.

## Goals

- No Supabase dependency — single `bun run server` starts everything
- Google Docs URL → paginated HTML conversion (same quality as existing Edge Function)
- WebSocket-based remote control (replaces Supabase Realtime Broadcast)
- Local filesystem storage for converted documents and images
- Future-ready for pretext integration (front-end text layout)

## Non-Goals

- User authentication / roles (no login, no RLS)
- Playlist management
- Dashboard admin panel
- Database (no PostgreSQL, no ORM)

## Architecture

```
aliswa/
├── server/
│   ├── index.ts              # Hono app + Bun.serve (HTTP + WebSocket)
│   ├── routes/
│   │   ├── docs.ts           # POST /api/fetch-doc, GET /docs/:id
│   │   └── ws.ts             # WebSocket /ws/:room upgrade + relay
│   └── lib/
│       ├── google-docs.ts    # Download markdown from Google Docs
│       ├── convert.ts        # Markdown → HTML (marked), image extraction
│       └── storage.ts        # Local filesystem read/write for data/
├── public/                   # Static files served at /
│   ├── slides.html
│   ├── remote.html
│   ├── js/
│   │   └── app.js            # Simplified frontend (no Supabase)
│   └── css/ → symlink to /css (or copied)
├── data/                     # Runtime data (gitignored)
│   └── {doc_id}/
│       ├── {version}.html    # Converted content
│       └── images/
│           └── img_N.ext     # Extracted images
├── package.json
├── tsconfig.json
└── bunfig.toml               # (optional) Bun config
```

## Components

### 1. HTTP Server (`server/index.ts`)

Pure `Bun.serve()` with manual routing. No framework dependency.

```ts
Bun.serve({
  port: 3000,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname.startsWith('/ws/')) {
      const room = url.pathname.split('/')[2];
      if (server.upgrade(req, { data: { room } })) return;
    }

    // API routes
    if (url.pathname === '/api/fetch-doc' && req.method === 'POST')
      return handleFetchDoc(req);
    if (url.pathname.startsWith('/api/docs'))
      return handleDocs(url);

    // Static files: data/, public/, css/, theme/
    return serveStatic(url);
  },
  websocket: wsHandler,
});
```

### 2. Google Docs Conversion (`POST /api/fetch-doc`)

**Request:**
```json
{
  "url": "https://docs.google.com/document/d/DOC_ID/edit"
}
```

**Flow:**
1. Extract `doc_id` from URL
2. Fetch `https://docs.google.com/document/d/{doc_id}/export?format=md`
3. Parse markdown, extract base64 images → save to `data/{doc_id}/images/`
4. Replace image references with `/data/{doc_id}/images/img_N.ext`
5. Convert markdown → HTML via `marked`
6. Wrap in `<article class="slide-content">` container
7. Determine version number (count existing `.html` files in `data/{doc_id}/`)
8. Save to `data/{doc_id}/{version}.html`
9. Write `data/{doc_id}/meta.json` with title, version, timestamp

**Response:**
```json
{
  "success": true,
  "doc_id": "abc123",
  "version": 1,
  "images": 5
}
```

**`meta.json` format:**
```json
{
  "doc_id": "abc123",
  "title": "Document Title",
  "current_version": 2,
  "created_at": "2026-04-07T10:00:00Z",
  "updated_at": "2026-04-07T12:00:00Z"
}
```

### 3. Document Access (`GET /api/docs/:id`)

Returns the latest version HTML for a given doc_id.

**Flow:**
1. Read `data/{doc_id}/meta.json`
2. Return `data/{doc_id}/{current_version}.html`

This is what `slides.html?src={doc_id}` calls to load content.

### 4. Document List (`GET /api/docs`)

Lists all available documents by scanning `data/` directory for `meta.json` files.

**Response:**
```json
[
  { "doc_id": "abc123", "title": "My Doc", "current_version": 2, "updated_at": "..." },
  { "doc_id": "def456", "title": "Other Doc", "current_version": 1, "updated_at": "..." }
]
```

### 5. WebSocket Remote Control (`/ws/:room`)

Replaces Supabase Realtime Broadcast. Pure relay — server doesn't interpret messages.

**Protocol:**
- Client connects to `ws://host/ws/{roomId}`
- Server tracks rooms as `Map<string, Set<WebSocket>>`
- Any message from a client is broadcast to all other clients in the same room
- Message format preserved from existing protocol:

```json
// Command (remote → slides)
{ "type": "command", "action": "next" }
{ "type": "command", "action": "goto", "page": 5 }
{ "type": "command", "action": "search", "keyword": "text" }

// Sync (slides → remote)
{ "type": "sync", "currentPage": 3, "totalPages": 20, "images": [...] }

// Lifecycle
{ "type": "remote-joined" }
```

**Room cleanup:** When all clients disconnect, room is removed from the map.

### 6. Frontend Changes

**`slides.html`** (already in `aliswa/`):
- No changes to HTML structure (already cleaned up)
- Keep existing CSS container-based pagination

**`js/app.js`** modifications:
- `loadDocument(docId)`: Change from `fetch(src)` to `fetch('/api/docs/' + docId)`
  - The `src` parameter now accepts either a doc_id or a direct URL path
- Add WebSocket connection for remote control (replaces Supabase Realtime imports)
- Remote init: connect to `ws://host/ws/{roomId}`, listen for commands, broadcast sync state

**`remote.html`**: Restore from original, replace Supabase `joinRoom`/`sendCommand` with native WebSocket:
```js
const ws = new WebSocket(`ws://${location.host}/ws/${roomId}`);
ws.onmessage = (e) => { /* handle sync */ };
function sendCommand(action, data) {
  ws.send(JSON.stringify({ type: 'command', action, ...data }));
}
```

### 7. Static Assets

CSS and theme files are referenced via absolute paths (`/css/slides.css`, `/theme/default/`). The server serves the project root's `css/` and `theme/` directories alongside aliswa's own `public/` files.

```ts
// Serve shared assets from project root
app.get('/css/*', serveStatic({ root: '../' }));
app.get('/theme/*', serveStatic({ root: '../' }));
```

## Dependencies

```json
{
  "dependencies": {
    "marked": "^9"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

Single runtime dependency. Bun provides everything else:
- HTTP server (`Bun.serve()` with manual routing, no framework)
- WebSocket server (built into `Bun.serve()`)
- File system operations (`Bun.file()`, `Bun.write()`)
- Static file serving (`new Response(Bun.file(path))`)
- TypeScript execution (no build step)

## Commands

```bash
cd aliswa
bun install
bun run server/index.ts        # Start server on port 3000

# Or with package.json script
bun run dev                     # Same, with --watch for auto-reload
```

## Data Flow

```
Google Docs URL
    ↓ POST /api/fetch-doc
server/lib/google-docs.ts       # Download as markdown
    ↓
server/lib/convert.ts           # Extract images, markdown → HTML
    ↓
data/{doc_id}/                  # Save HTML + images to filesystem
    ↓
slides.html?src={doc_id}
    ↓ GET /api/docs/{doc_id}
    ↓ Returns latest version HTML
    ↓
Browser renders + paginates     # CSS container + scrollHeight (later: pretext)
    ↓
WebSocket /ws/{roomId}          # Remote control relay
    ↓
remote.html?id={roomId}
```

## Future: pretext Integration

Not in scope for this phase. When ready:
- Add `@chenglou/pretext` as frontend dependency
- Replace `navigation.js`'s `scrollHeight/containerHeight` pagination with pretext `prepare()` + `layout()`
- Potentially enables server-side pre-calculation of page breaks (if canvas polyfill becomes available for Bun)

## File Inventory

| File | Action | Description |
|------|--------|-------------|
| `server/index.ts` | Create | Hono app entry point |
| `server/routes/docs.ts` | Create | Document conversion + access API |
| `server/routes/ws.ts` | Create | WebSocket room relay |
| `server/lib/google-docs.ts` | Create | Google Docs markdown downloader |
| `server/lib/convert.ts` | Create | Markdown → HTML + image extraction |
| `server/lib/storage.ts` | Create | Filesystem helpers for data/ |
| `public/slides.html` | Move | From current `aliswa/slides.html` |
| `public/remote.html` | Create | Restored + WebSocket-based |
| `public/js/app.js` | Modify | Add WebSocket remote, change doc loading |
| `package.json` | Create | Dependencies + scripts |
| `tsconfig.json` | Create | TypeScript config for Bun |
| `.gitignore` | Create | Ignore `data/`, `node_modules/` |
