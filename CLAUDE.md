# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MasterSlides: A Google Docs to paginated HTML presentation converter for the Tzu Chi Buddhist organization. Supports Traditional Chinese vertical text layout, remote control via Supabase Realtime Broadcast, and self-hosted Supabase backend.

## Commands

```bash
# Production (Supabase + MasterSlides)
cd deployment/supabase-official/docker
docker compose --profile app up -d

# Development (Studio at root, no app)
cd deployment/supabase-official/docker
docker compose up -d

# Re-process a document (after Edge Function changes)
# Get token → call fetch-google-doc Edge Function
```

No test framework is configured. No linter configured. No build step required (vanilla JS with ES Modules).

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

**slides.html** — Presentation viewer (~60KB, self-contained):
- Loads content from Supabase Storage via documents table lookup
- Font scaling: `--font-scale` × `--mode-scale` (vertical=1.6, horizontal=0.8)
- Primary fonts: DFKai-SB/BiauKai/標楷體 (Traditional Chinese serif)
- Lightbox: Click-to-zoom images with touch gestures
- Remote: Supabase Realtime Broadcast (generates QR code → remote.html)
- Playlist mode: `?playlist=<id>` loads ordered document list via RPC

**remote.html** — Mobile remote control (Supabase Realtime Broadcast client)

**dashboard/*.html** — Multi-page admin panel (Lit Web Components):
- `upload.html`: Google Docs → Edge Function conversion (uploader+)
- `documents.html`: List, view, toggle public/private, delete (owner)
- `playlists.html`: Create, edit, drag-sort, toggle public (admin+)
- `users.html`: Role management table (super_admin)

**login.html** — Supabase Auth email/password login

**index.html** — Session-based router (→ dashboard if logged in, → login if not)

**badge.js** — IIFE that fetches `/config.json` and shows version badge

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

### Supabase Self-Hosting (deployment/)

The `deployment/supabase-official/docker/` directory contains a full Supabase self-hosted setup integrated with MasterSlides via Kong API Gateway:

```
Kong (:8000) — Single entry point
├── /studio/*        → Supabase Studio (basePath=/studio)
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

### Database Schema

- **profiles** — User roles (viewer, uploader, admin, super_admin), auto-created on signup
- **documents** — doc_id, title, owner_id, current_version, is_public
- **playlists** — name, description, document_ids (JSONB array), is_public

RLS enforced. `is_super_admin()` SECURITY DEFINER helper prevents recursive policy checks.

### Storage

- Bucket: `slides` (public=true for image access via `/object/public/` URLs)
- Structure: `<doc_id>/<version>.html`, `<doc_id>/images/img_N.ext`

## Key Architectural Decisions

- **No frontend framework**: Vanilla HTML/CSS/JS, ES Modules, no bundler
- **Supabase Storage**: Versioned HTML files + extracted images (replaces file-based /docs/)
- **Edge Functions (Deno)**: Google Docs processing (replaces Express server.js)
- **Supabase Realtime Broadcast**: Room-based remote control (replaces Socket.io)
- **Relative image URLs**: Edge Function writes `/storage/v1/object/public/...` paths (not absolute)
- **Public bucket**: Images accessible without auth; HTML access controlled by documents table RLS
- **esm.sh CDN fixed version**: `@supabase/supabase-js@2.49.1` (no build step)
- **Kong single entry point**: All services behind one port (:8000)
- **Nginx Alpine**: Static file server for HTML/CSS/JS (replaces Express)
- **Custom Studio image**: `NEXT_PUBLIC_BASE_PATH=/studio` for sub-path deployment
- **macOS Docker fix**: `docker-compose.override.yml` for Storage volume xattr support

## Routes (through Kong :8000)

| Route | Description |
|-------|-------------|
| `/` | Session check → dashboard or login |
| `/slides.html?src=<docId>` | Presentation viewer |
| `/slides.html?playlist=<id>` | Playlist mode |
| `/remote.html?id=<roomId>` | Remote control |
| `/login.html` | Login page |
| `/dashboard/upload.html` | Upload page (uploader+) |
| `/dashboard/documents.html` | Document list |
| `/dashboard/playlists.html` | Playlist management (admin+) |
| `/dashboard/users.html` | User management (super_admin) |
| `/config.json` | App config (badge, anonKey) |
| `/storage/v1/object/public/slides/...` | Public image/file access |
| `/functions/v1/fetch-google-doc` | Edge Function (POST, auth required) |

## Hotkeys (slides.html)

Navigation: `→`/`Space`/`PageDown` (next), `←`/`PageUp` (prev), `Home`/`End` (first/last), `G` (go to page)
Display: `F` (fullscreen), `S` (sidebar), `O` (orientation), `N` (navigation toggle)
Other: `R` (remote QR), `?`/`H` (help), `Cmd/Ctrl + =/- /0` (font size)

## Google Docs Requirements

Documents must be shared as "Anyone with the link can view". Upload via dashboard (uploader+ role required).
