# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MasterSlides: A Google Docs to paginated HTML presentation converter for the Tzu Chi Buddhist organization. Supports Traditional Chinese vertical text layout, remote control via Supabase Realtime Broadcast, and self-hosted Supabase backend.

The repo contains **two implementations** of the viewer:
- **Main stack** (`/`) — Supabase-backed multi-tenant SaaS (Kong + Postgres + Edge Functions + Storage), CSS multi-column pagination, deployed via Docker Compose.
- **Aliswa** (`aliswa/`) — Standalone single-user Bun server, **Drust BaaS persistence**, WebSocket remote, and pure-DOM binary-search pagination. Reuses the main viewer's `/js/slides/*` modules. Recent feature work has happened here.

## Commands

```bash
# Production (Supabase + MasterSlides)
cd deployment
docker compose --profile app up -d

# Development (Studio at root, no app)
cd deployment
docker compose up -d

# Restart Edge Functions (after code changes)
docker compose restart functions

# View logs
docker compose logs -f functions
docker compose logs -f storage

# Reset everything (WARNING: deletes all data)
docker compose --profile app down -v
```

```bash
# Aliswa (standalone Bun server) — runs at :3000
cd aliswa
cp .env.example .env         # one-time: fill in DRUST_SERVICE_TOKEN
bun install                  # one-time
bun run dev                  # watch mode
bun run start                # plain run
bun run build                # bundle public/js/app.js → public/dist/
bun test                     # run drust.test.ts + storage.test.ts (hits live Drust)
```

The main stack has no build step (vanilla JS with ES Modules); Aliswa requires `bun run build` after editing `public/js/app.js` or `public/js/paginator.ts`. The Aliswa server fails fast at boot if `DRUST_BASE_URL` / `DRUST_TENANT_ID` / `DRUST_SERVICE_TOKEN` aren't set.

## Architecture

### Data Flow

```
Google Docs (shared publicly)
    ↓ Edge Function downloads as markdown
fetch-google-doc (Deno Edge Function)
    ├─ Extract base64 images → Supabase Storage /slides/<docId>/images/
    ├─ Convert markdown → HTML (via marked)
    └─ Upload HTML → Storage /slides/<docId>/<version>.html
    ↓
slides.html?src=<docId>
    ├─ Query documents table for current_version
    ├─ Download <version>.html from Storage
    ├─ Paginate into slides (vertical/horizontal)
    └─ Supabase Realtime Broadcast (remote control)
```

### Key Components

**slides.html** — Presentation viewer (modularized into `js/slides/`):
- Loads content from Supabase Storage via documents table lookup
- Font scaling: `--font-scale` × `--mode-scale` (vertical=1.6, horizontal=0.8)
- Primary fonts: DFKai-SB/BiauKai/標楷體 (Traditional Chinese serif)
- Lightbox: Click-to-zoom images with touch gestures
- Remote: Supabase Realtime Broadcast (generates QR code → remote.html)
- Playlist mode: `?playlist=<id>` loads ordered document list via RPC
- Entry point: `js/slides/main.js` → `state.js` (shared mutable state) + `loader.js` (init)
- Modules: navigation, display, keyboard, search, goto, print, laser, lightbox, context-menu, modals, remote

**remote.html** — Mobile remote control (Supabase Realtime Broadcast client)

**dashboard/*.html** — Multi-page admin panel (Lit Web Components in `js/components/`):
- `upload.html`: Google Docs → Edge Function conversion (uploader+)
- `documents.html`: List, view, toggle public/private, delete (owner) — `master-doc-list`
- `playlists.html`: Create, edit, drag-sort, toggle public (admin+) — `master-playlist-list`, `master-playlist-editor`
- `users.html`: Role management table (super_admin) — `master-user-manager`
- Shared components: `master-sidebar`, `master-toast`, `master-confirm`

**login.html** — Supabase Auth email/password login

**index.html** — Session-based router (→ dashboard if logged in, → login if not)

**badge.js** — IIFE that fetches `/config.json` and shows version badge

**redirect.html** — Post-upload redirect page (shows conversion status)

**dashboard.html** — Redirects to `/dashboard/documents.html`

### CSS & Theming

- `css/common.css` — Shared styles across pages
- `css/dashboard.css` — Dashboard-specific styles
- `css/slides.css` — Presentation viewer styles
- `theme/default/` — Default theme (background.jpg + index.css)

### JS Modules (ES Modules, no bundler)

| Module | Purpose |
|--------|---------|
| `js/supabase-client.js` | Singleton Supabase client (from config.json anonKey) |
| `js/auth.js` | login, logout, requireAuth, getSession, getUserRole |
| `js/documents.js` | Document CRUD operations |
| `js/playlists.js` | Playlist CRUD + RPC calls |
| `js/upload.js` | Edge Function caller for doc conversion |
| `js/realtime.js` | Realtime Broadcast: createRoom, joinRoom, sendCommand, syncState |
| `js/store.js` | Reactive EventTarget store for dashboard state |
| `js/dashboard-init.js` | Shared auth guard + store init for multi-page dashboard |

### Configuration

`config.json` (served by Nginx, no-cache):
```json
{
  "anonKey": "<supabase-anon-key>",
  "stage": "alpha",
  "version": "1.0.0",
  "showBadge": true
}
```

**Important**: `config.json` anonKey must match `deployment/.env` ANON_KEY.

### Aliswa (Alternate Backend)

A parallel, single-user implementation under `aliswa/` that drops Supabase/Docker entirely and uses the Drust BaaS for persistence:

```
Google Docs ──▶ aliswa server (Bun)
                  ├─ google-docs.ts: fetch markdown
                  ├─ convert.ts:     base64 images → Drust files (public bucket),
                  │                  markdown → HTML via marked
                  ├─ drust.ts:       REST client (collections + files)
                  └─ storage.ts:     upsertDoc({doc_id, title, html, image_ids})
                                     — same doc_id overwrites + reclaims old images
                     ↓
              slides.html  ──▶  paginator.ts (pure-DOM binary-search pagination)
                                 ├─ measure block elements (offsetWidth/Height)
                                 └─ binary search splits to prove zero overflow at scale
                     ↓
              WebSocket /ws/:room  ←→  remote.html  (in-memory rooms in Bun)
```

**Key differences from the main stack:**
- **Pagination**: pure-DOM binary-search pagination (`paginator.ts`) replaces the main viewer's CSS multi-column layout. Each split helper proves its first half fits via DOM measurement, so there is zero visible overflow at any supported font scale. Repaginates on font scale, orientation, and resize.
- **Storage**: Drust BaaS tenant `docs` at `tool.tzuchi-org.tw`. The `docs` collection holds one record per Google Doc id (HTML inline); extracted images go to Drust public files (`https://tool.tzuchi-org.tw/public/<tenant>/<file_id>`). Requires `DRUST_BASE_URL` / `DRUST_TENANT_ID` / `DRUST_SERVICE_TOKEN` in `aliswa/.env` (see `aliswa/.env.example`). Same `doc_id` overwrites; old image files are reclaimed automatically. The frontend never sees Drust directly — all reads/writes are proxied through the Bun server using the service token.
- **Remote**: in-memory WebSocket rooms (`server/routes/ws.ts`) replace Supabase Realtime Broadcast.
- **Doc fetch**: direct `docs.google.com/.../export?format=md` from the Bun server (`google-docs.ts`) replaces the Edge Function.
- **Auth**: none. Single-user local tool.
- **Module reuse**: `server/index.ts` serves `/js/slides/*` and `/theme/*` from the project root, so aliswa shares `state.js`, `display.js`, `lightbox.js`, `search.js`, `goto.js`, `laser.js` with the main viewer. Only `paginator.js` and `app.js` (orchestration + PDF export + WS remote) are aliswa-specific.
- **CSS**: `public/css/slides-aliswa.css` overrides the column-based rules from the main `/css/slides.css`.

**External dependencies**: none beyond what npm resolves. `bun install` works from a clean checkout without requiring any sibling repositories.

**Build**: `app.js` is an ES module that imports `paginate` / `renderPages` / `showPage` from `./paginator.ts`. `bun run build` bundles the TS sources into `public/dist/app.js` (referenced by `public/slides.html`). The `/js/slides/*` shared modules are marked `external` so they load at runtime from the project root.

**Tests**: `bun test` runs the Drust REST round-trip tests in `server/lib/drust.test.ts` and `storage.test.ts`. These hit the live Drust tenant — they insert `__roundtrip_*` / `__upsert_*` rows and clean them up at the end. A leftover row means a test panicked partway through; safe to delete manually.

## Deployment Structure

```
deployment/
├── docker-compose.yml           # Main compose file (Kong architecture)
├── docker-compose.override.yml  # Storage named volume (xattr support)
├── .env                         # Secrets (from .env.example) - NOT in git
├── .env.example                 # Template for .env
├── nginx/
│   └── app.conf                 # MasterSlides static file config
└── volumes/
    ├── api/kong.yml             # Kong routing config
    ├── db/
    │   ├── init/data.sql        # MasterSlides schema (auto-run on first boot)
    │   └── *.sql                # Supabase system schemas
    ├── functions/
    │   ├── main/index.ts        # Edge Function router
    │   └── fetch-google-doc/    # Google Docs processor
    └── logs/vector.yml          # Log collection config
```

### Kong Routes (:8000)

```
Kong (:8000) — Single entry point
├── /studio/*        → Supabase Studio (basePath=/studio, basic-auth)
├── /rest/v1/*       → PostgREST
├── /auth/v1/*       → GoTrue
├── /storage/v1/*    → Storage
├── /realtime/v1/*   → Realtime
├── /functions/v1/*  → Edge Functions (Deno)
└── /*               → MasterSlides (nginx:alpine, profile=app)
```

**Two modes (kong.yml [A]/[B] toggle):**
- `docker compose up` — Development (root → Studio, basic-auth)
- `docker compose --profile app up` — Production (root → MasterSlides)

## Edge Functions (Deno)

Located in `deployment/volumes/functions/`:

```
functions/
├── main/index.ts              # Router - static imports all functions
└── fetch-google-doc/index.ts  # Google Docs → Storage processor
```

**main/index.ts** routes requests:
- `/health` → health check
- `/fetch-google-doc` → document processor

**fetch-google-doc/index.ts** workflow:
1. Verify JWT token
2. Check user role (uploader+)
3. Extract doc_id from Google Docs URL
4. Download markdown via `export?format=md`
5. Process base64 images → Storage
6. Convert markdown → HTML (marked)
7. Upload HTML → Storage
8. Insert/update documents table

After editing functions, restart: `docker compose restart functions`

## Database Schema

Tables in `deployment/volumes/db/init/data.sql`:

- **profiles** — User roles (viewer, uploader, admin, super_admin), auto-created on signup
- **documents** — doc_id, title, owner_id, current_version, is_public
- **playlists** — name, description, document_ids (JSONB array), is_public

RLS enforced. `is_super_admin()` SECURITY DEFINER helper prevents recursive policy checks.

**RPC Functions:**
- `playlist_add_document(p_playlist_id, p_doc_id)`
- `playlist_remove_document(p_playlist_id, p_doc_id)`
- `playlist_reorder_documents(p_playlist_id, p_doc_ids)`
- `playlist_get_with_documents(p_playlist_id)`

## Storage

- Bucket: `slides` (public=true for image access)
- Structure: `<doc_id>/<version>.html`, `<doc_id>/images/img_N.ext`
- macOS requires `docker-compose.override.yml` for xattr support

## First-Time Setup

```bash
cd deployment
cp .env.example .env
# Edit .env: change passwords, secrets

# Start
docker compose --profile app up -d

# Create first super_admin (via psql)
docker exec -it supabase-db psql -U postgres -d postgres -c \
  "UPDATE profiles SET role = 'super_admin' WHERE email = 'your@email.com';"

# Sync config.json anonKey with .env ANON_KEY
```

## Archive

`archive/` contains deprecated implementations: `express-server/` (old Express.js backend, replaced by Supabase Edge Functions) and `pagedjs/` (old paged.js-based viewer, replaced by custom pagination). Do not modify — reference only.

## Key Architectural Decisions

- **No frontend framework**: Vanilla HTML/CSS/JS, ES Modules, no bundler
- **Supabase Storage**: Versioned HTML files + extracted images (replaces file-based /docs/)
- **Edge Functions (Deno)**: Google Docs processing (replaces Express server.js)
- **Supabase Realtime Broadcast**: Room-based remote control (replaces Socket.io)
- **Relative image URLs**: Edge Function writes `/storage/v1/object/public/...` paths
- **Public bucket**: Images accessible without auth; HTML access controlled by RLS
- **esm.sh CDN**: `@supabase/supabase-js@2` for frontend, `marked@9.1.6` for Edge Functions
- **Kong single entry point**: All services behind one port (:8000)
- **Nginx Alpine**: Static file server for HTML/CSS/JS (replaces Express)
- **Custom Studio image**: `ghcr.io/kaellim/supabase-root:latest` with `/studio` basePath
- **macOS Docker fix**: `docker-compose.override.yml` for Storage volume xattr support

## Hotkeys (slides.html)

Navigation: `→`/`Space`/`PageDown` (next), `←`/`PageUp` (prev), `Home`/`End` (first/last), `G` (go to page)
Display: `F` (fullscreen), `S` (sidebar), `O` (orientation), `N` (navigation toggle)
Other: `R` (remote QR), `?`/`H` (help), `Cmd/Ctrl + =/- /0` (font size)

## Google Docs Requirements

Documents must be shared as "Anyone with the link can view". Upload via dashboard (uploader+ role required).

## Troubleshooting

**Edge Function changes not applied**: Run `docker compose restart functions`

**401 on API calls**: Check `config.json` anonKey matches `.env` ANON_KEY

**Studio login**: Use credentials from `.env` DASHBOARD_USERNAME/DASHBOARD_PASSWORD
