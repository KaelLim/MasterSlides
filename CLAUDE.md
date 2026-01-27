# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MasterSlides: A Google Docs to paginated HTML presentation converter for the Tzu Chi Buddhist organization. Supports Traditional Chinese vertical text layout, remote control via Supabase Realtime Broadcast, and self-hosted Supabase backend.

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

**Important**: `config.json` anonKey must match `deployment/.env` ANON_KEY.

## Deployment Structure

```
deployment/
├── docker-compose.yml           # Main compose file (Kong architecture)
├── docker-compose.override.yml  # macOS fix (named volume for Storage) - NOT in git
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

# macOS only: create override file
cat > docker-compose.override.yml << 'EOF'
services:
  storage:
    volumes:
      - storage-data:/var/lib/storage
volumes:
  storage-data:
EOF

# Start
docker compose --profile app up -d

# Create first super_admin (via psql)
docker exec -it supabase-db psql -U postgres -d postgres -c \
  "UPDATE profiles SET role = 'super_admin' WHERE email = 'your@email.com';"

# Sync config.json anonKey with .env ANON_KEY
```

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

## Troubleshooting

**Storage upload fails on macOS**: Create `docker-compose.override.yml` with named volume (see First-Time Setup)

**Edge Function changes not applied**: Run `docker compose restart functions`

**401 on API calls**: Check `config.json` anonKey matches `.env` ANON_KEY

**Studio login**: Use credentials from `.env` DASHBOARD_USERNAME/DASHBOARD_PASSWORD
