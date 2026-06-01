# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MasterSlides**: a Google Docs → paginated HTML presentation converter for the Tzu Chi Buddhist organization. Supports Traditional Chinese vertical text layout, remote control via room-based pub/sub, and natural-overflow pagination.

Single-user local tool. No auth.

## Commands

```bash
cp .env.example .env         # one-time: fill in DRUST_SERVICE_TOKEN
bun install                  # one-time
bun run dev                  # watch mode — http://localhost:3000
bun run start                # plain run
bun run build                # bundle public/js/app.js → public/dist/app.js
bun test                     # run drust.test.ts + storage.test.ts (hits live Drust tenant)
```

The server fails fast at boot if `DRUST_BASE_URL` / `DRUST_TENANT_ID` / `DRUST_SERVICE_TOKEN` are not set. After editing `public/js/app.js` or `public/js/paginator.ts`, re-run `bun run build`.

## Architecture

```
Google Docs (shared publicly)
    │
    ▼
Bun server (server/)
    ├─ routes/docs.ts:     fetch + convert + upsert
    ├─ lib/google-docs.ts: download markdown via export?format=md
    ├─ lib/convert.ts:     base64 images → Drust files, markdown → HTML (marked)
    ├─ lib/drust.ts:       REST client (collections + files)
    └─ lib/storage.ts:     upsertDoc({doc_id, title, html, image_ids})
                           same doc_id overwrites + reclaims old images
    │
    ▼
slides.html (public/)
    ├─ paginator.ts: natural-overflow pagination
    │   • append into .slide-page
    │   • on overflow: retract + new page, or split textContent in place
    │   • repaginate on font scale / orientation / resize
    └─ remote control via /sse/viewer/:room + /sse/phone/:room
                       + POST /api/room/:room/{command,sync}
    │
    ▼
remote.html — mobile phone client. EventSource subscribe, POST publish.
```

## Layout

```
.
├─ public/                  # browser-served static assets
│  ├─ slides.html           # presentation viewer
│  ├─ remote.html           # mobile remote
│  ├─ css/slides-aliswa.css # override for natural-overflow layout
│  ├─ js/app.js             # orchestration + PDF export + remote client
│  ├─ js/paginator.ts       # natural-overflow paginator
│  └─ dist/app.js           # bun build output (gitignored)
├─ server/                  # Bun server
│  ├─ index.ts              # request dispatcher + static file server
│  ├─ routes/docs.ts        # POST /api/fetch-doc + GET /docs/:id
│  ├─ routes/remote.ts      # SSE viewer/phone + POST command/sync
│  ├─ lib/drust.ts          # Drust REST client (service token only)
│  ├─ lib/google-docs.ts    # Google Docs export?format=md fetch
│  ├─ lib/convert.ts        # markdown → HTML + image extraction
│  └─ lib/storage.ts        # upsertDoc with image reclaim
├─ js/slides/               # shared viewer modules (imported by public/slides.html)
│  ├─ state.js, display.js, navigation.js, keyboard.js
│  ├─ lightbox.js, search.js, goto.js, laser.js
│  ├─ context-menu.js, modals.js, print.js
│  ├─ loader.js, main.js
│  └─ remote.js             # currently unused (Supabase-era client; kept for reference)
├─ css/slides.css           # base presentation styles (overridden by slides-aliswa.css)
├─ theme/default/           # background.jpg + index.css
└─ docs/superpowers/        # design specs + implementation plans
```

`server/index.ts` serves three roots:
- `/css/*` — checks `public/css/` first (overrides), then root `css/`
- `/theme/*`, `/js/slides/*` — root (`PROJECT_ROOT = join(import.meta.dir, "..")`)
- everything else — `public/`

`/img/:fileId` proxies the Drust public bucket as same-origin so html2canvas can render images without CORS issues.

## Key Components

**slides.html**:
- Font scaling: `--font-scale` × `--mode-scale` (vertical=1.6, horizontal=0.8)
- Primary fonts: DFKai-SB / BiauKai / 標楷體 (Traditional Chinese serif)
- Lightbox: click-to-zoom images with touch gestures
- Remote: QR code → remote.html on same LAN
- Refresh button: re-runs loadDocument on original src (re-syncs Google Docs)
- Entry: `js/slides/main.js` → `state.js` + `loader.js`

**remote.html**: EventSource subscribes to `/sse/phone/:room`, POSTs commands to `/api/room/:room/command`. Reconnects automatically; shows '連線中斷' after 5 consecutive POST errors.

**paginator.ts**: natural-overflow pagination. Elements append directly into the final `.slide-page`; `scrollWidth` / `scrollHeight` is the overflow signal. On overflow the element is retracted and moved to a fresh page or split in place via binary search of `textContent`. Because measurement happens in the final render context, there is no wrapper-vs-render mismatch.

## Storage (Drust BaaS)

Tenant `docs` at `tool.tzuchi-org.tw`. Single collection `docs` holds one record per Google Doc id (HTML inline). Extracted images go to Drust public files at `https://tool.tzuchi-org.tw/public/<tenant>/<file_id>`.

Same `doc_id` overwrites; old image files are reclaimed automatically. Frontend never sees Drust directly — all reads/writes proxy through the Bun server using the service token.

`.env`:
```
DRUST_BASE_URL=https://tool.tzuchi-org.tw
DRUST_TENANT_ID=1e195719-6106-4644-85d1-0eee7d135026
DRUST_SERVICE_TOKEN=drust_...
```

## Remote Control (SSE + POST)

In-memory rooms in `server/routes/remote.ts`:
- `GET /sse/viewer/:room` — viewer stream (init / command / remote-joined / bye)
- `GET /sse/phone/:room` — phone stream (init / sync / bye)
- `POST /api/room/:room/command` — phone publishes a command (re-injected as type:'command')
- `POST /api/room/:room/sync` — viewer publishes a state snapshot (stored as lastSync, fanned out to phone)

25s heartbeat, 30s grace timer when last subscriber drops, 10min stale-room sweep. Each client may pass `?clientId=<uuid>` to dedupe reconnects.

**Planned**: replace SSE+POST with [Drust broadcast](https://tool.tzuchi-org.tw) — WS subscribe directly from browser using anon token; publish via thin POST proxy (server-side) holding the service token. Drust handles fan-out; Bun server (or eventually CF Pages Function) becomes a thin proxy.

## Tests

`bun test` runs Drust REST round-trip tests in `server/lib/drust.test.ts` and `storage.test.ts`. These hit the live Drust tenant — they insert `__roundtrip_*` / `__upsert_*` rows and clean them up at the end. A leftover row means a test panicked partway through; safe to delete manually.

## Hotkeys (slides.html)

Navigation: `→`/`Space`/`PageDown` (next), `←`/`PageUp` (prev), `Home`/`End` (first/last), `G` (go to page)
Display: `F` (fullscreen), `S` (sidebar), `O` (orientation), `N` (navigation toggle)
Other: `R` (remote QR), `?`/`H` (help), `Cmd/Ctrl + =/- /0` (font size)

## Google Docs Requirements

Documents must be shared as "Anyone with the link can view". Paste the URL into the upload UI.

## Roadmap

Tracked in `docs/superpowers/plans/`. Active items:
- Replace SSE+POST with Drust broadcast (viewer/phone subscribe direct to Drust WS; Bun server becomes thin publish proxy).
- Migrate Bun server → Cloudflare Pages + Functions. `functions/api/publish.js` holds `DRUST_SERVICE_TOKEN` as a Pages Secret env var. Browser subscribes Drust WS directly with anon token.
