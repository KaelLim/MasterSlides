# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MasterSlides**: a Google Docs → paginated HTML presentation converter for the Tzu Chi Buddhist organization. Supports Traditional Chinese vertical text layout, remote control via room-based pub/sub, and natural-overflow pagination.

No app-layer auth — access control lives in Drust via per-collection `anon_caps`. The admin UI is reachable by anyone who knows the URL.

## Commands

```bash
cp .env.example .env         # one-time: fill in DRUST_ANON_TOKEN + DRUST_SERVICE_TOKEN
bun install                  # one-time
bun run dev                  # watch mode — http://localhost:3000
bun run start                # plain run
bun run build                # bundle public/slides/js/app.js → public/slides/dist/app.js
bun test                     # convert/paginator/drust/storage/playlists tests (hits live Drust tenant)
```

`server/lib/drust.ts` requires `DRUST_BASE_URL` / `DRUST_TENANT_ID` / `DRUST_ANON_TOKEN`; `server/routes/publish.ts` additionally requires `DRUST_SERVICE_TOKEN` (broadcast publish only). Each path surfaces its own missing-env error on the first request that hits it. After editing anything under `public/slides/js/`, re-run `bun run build`.

## Routing

- `/` → 302 `/admin/` (or `/slides/?...` if a viewer query is present, for back-compat with legacy bookmarks)
- `/admin/` → admin dashboard
- `/slides/?src=<doc_id>` or `/slides/?playlist=<id>` → viewer
- `/remote/?id=<roomId>` → mobile remote
- `/document/d/<id>/...` → 302 `/slides/?src=<id>` (pasted Google Docs URL helper)

Both Bun dev (`server/index.ts`) and Cloudflare Pages (`functions/index.ts` + `_redirects`) implement this routing.

## Architecture

```
Google Docs (shared publicly)
    │
    ▼
Bun server (server/)
    ├─ routes/docs.ts:     fetch + convert + upsert
    ├─ routes/admin/index.ts: dispatcher for /api/admin/* and /api/playlists/*
    ├─ routes/publish.ts:  /api/publish/:room thin proxy to Drust broadcast (service token)
    ├─ lib/admin/{docs,playlists}.ts: admin CRUD handlers (used by Bun + CF Pages adapters)
    ├─ lib/google-docs.ts: download markdown via export?format=md
    ├─ lib/convert.ts:     base64 images → Drust files, markdown → HTML (marked)
    ├─ lib/drust.ts:       REST client (collections + files) — uses anon token
    └─ lib/storage.ts:     upsertDoc({doc_id, title, html, image_ids})
                           same doc_id overwrites + reclaims old images
    │
    ▼
slides/index.html (public/slides/)
    ├─ paginator.ts: natural-overflow pagination
    │   • append into .slide-page
    │   • on overflow: retract + new page, or split textContent in place
    │   • repaginate on font scale / orientation / resize
    └─ remote control via /api/publish/:room (server-side service token)
       + WS subscribe directly to Drust broadcast (anon token in browser)
    │
    ▼
remote/index.html (public/remote/) — mobile phone client.
       WS subscribe to Drust, POST commands via /api/publish/:room.
```

## Layout

```
.
├─ public/                         # browser-served static assets
│  ├─ admin/                       # admin dashboard (HTML + js/css)
│  ├─ slides/                      # viewer
│  │  ├─ index.html
│  │  ├─ css/                      # slides.css (entry) + 12 section files
│  │  ├─ js/                       # state, pagination, loader, playlist,
│  │  │                            # event-listeners, remote-control, font,
│  │  │                            # table-canvas, pdf-export, modals,
│  │  │                            # context-menu, keyboard, app.js (entry)
│  │  │                            # + paginator.ts + paginator.test.ts
│  │  │                            # + drust-broadcast.js
│  │  └─ dist/app.js               # bun build output (gitignored)
│  ├─ remote/                      # mobile remote
│  │  ├─ index.html
│  │  ├─ remote.css
│  │  └─ remote.js
│  ├─ _redirects                   # CF Pages: / → /admin/
│  └─ theme/default/               # background.jpg + index.css
├─ server/                         # Bun server (local dev)
│  ├─ index.ts                     # request dispatcher + static file server
│  ├─ routes/
│  │  ├─ docs.ts                   # POST /api/fetch-doc + GET /docs/:id
│  │  ├─ publish.ts                # POST /api/publish/:room → Drust broadcast
│  │  └─ admin/index.ts            # path-based admin dispatcher
│  └─ lib/
│     ├─ admin/{docs,playlists}.ts (+ playlists.test.ts)
│     ├─ drust.ts                  # Drust REST client (anon token)
│     ├─ google-docs.ts
│     ├─ convert.ts                # markdown → HTML + image extraction
│     └─ storage.ts                # upsertDoc with image reclaim
├─ functions/                      # Cloudflare Pages Functions
│  ├─ index.ts                     # / smart router (viewer query → /slides/)
│  ├─ document/d/[[path]].ts       # Google Docs URL redirect → /slides/?src=
│  └─ api/                         # adapters import handlers from server/lib/admin/*
└─ docs/superpowers/               # design specs + implementation plans
```

## Key Components

**public/slides/index.html**:
- Font scaling: `--font-scale` × `--mode-scale` (vertical=1.6, horizontal=0.8)
- Primary fonts: DFKai-SB / BiauKai / 標楷體 (Traditional Chinese serif)
- Lightbox: click-to-zoom images with touch gestures
- Remote: QR code → `/remote/?id=<roomId>` on same LAN
- Refresh button: re-runs `loadDocument` on original src (re-syncs Google Docs)
- Entry: `public/slides/js/app.js` → reads URL params → `loader.js` / `playlist.js` → then `event-listeners.js` + `remote-control.js`

**public/remote/index.html**: WS subscribes to Drust broadcast, POSTs commands via `/api/publish/:room`. Reconnects automatically; shows '連線中斷' after consecutive errors.

**public/slides/js/paginator.ts**: natural-overflow pagination. Elements append directly into the final `.slide-page`; `scrollWidth` / `scrollHeight` is the overflow signal. On overflow the element is retracted and moved to a fresh page or split in place via binary search of `textContent`. Because measurement happens in the final render context, there is no wrapper-vs-render mismatch.

## Storage (Drust BaaS)

Tenant `docs` at `tool.tzuchi-org.tw`. Collection `docs` holds one record per Google Doc id (HTML inline). Extracted images go to Drust public files at `https://tool.tzuchi-org.tw/public/<tenant>/<file_id>`. Playlists live in collection `playlists`. Both collections have `anon_caps=[select,insert,update,delete]`; the anon token is what the Bun server proxies with for all CRUD. The service token is held server-side and only flows through `/api/publish/:room` (Drust requires service to publish to broadcast rooms).

Same `doc_id` overwrites; old image files are reclaimed automatically. Frontend never sees Drust URLs directly — all reads/writes proxy through the Bun server (or CF Pages adapters).

`.env`:
```
DRUST_BASE_URL=https://tool.tzuchi-org.tw
DRUST_TENANT_ID=1e195719-6106-4644-85d1-0eee7d135026
DRUST_ANON_TOKEN=drust_...       # used for docs/playlists/files CRUD
DRUST_SERVICE_TOKEN=drust_...    # used ONLY for broadcast publish
```

To adjust anon access at the Drust layer, use the Drust admin UI at `https://tool.tzuchi-org.tw/drust/` or its MCP `set_anon_caps` tool. There is no REST endpoint that mutates `anon_caps`.

## Remote Control (Drust broadcast)

Viewer and phone both subscribe to a per-room Drust WS channel (`slides-<roomId>`) using the anon token. Publishing requires the service token, so commands and syncs go through `POST /api/publish/:room` (Bun dev: `server/routes/publish.ts`; CF Pages: `functions/api/publish/[room].ts`). The server forwards the body verbatim to Drust broadcast.

## Tests

`bun test` runs:
- `server/lib/drust.test.ts` + `storage.test.ts` — Drust REST round-trips
- `server/lib/convert.test.ts` — markdown → title/image extraction
- `server/lib/admin/playlists.test.ts` — admin playlist CRUD (no auth — exercises handlers directly)
- `public/slides/js/paginator.test.ts` — paginator unit tests (uses happy-dom; restores native fetch after register so the server-side tests still hit live Drust)

These hit the live Drust tenant. They insert `__roundtrip_*` / `__upsert_*` / `__test_pl_*` rows and clean them up at the end. Drust's rate limit can trip the full suite — prefer per-file `bun test path/to/file.test.ts` while iterating.

## Hotkeys (viewer)

Navigation: `→`/`Space`/`PageDown` (next), `←`/`PageUp` (prev), `Home`/`End` (first/last), `G` (go to page)
Display: `F` (fullscreen), `S` (sidebar), `O` (orientation), `N` (navigation toggle)
Other: `R` (remote QR), `?`/`H` (help), `L` (laser/spotlight), `Cmd/Ctrl + =/- /0` (font size), `Cmd/Ctrl + F` (search), `Cmd/Ctrl + P` (export PDF)

## Google Docs Requirements

Documents must be shared as "Anyone with the link can view". Paste the URL into the admin upload UI — no login required.

Roadmap: see `docs/superpowers/specs/` for active design docs and `docs/superpowers/plans/` for plans.
