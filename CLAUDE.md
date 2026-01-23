# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MasterSlides: A Google Docs to paginated HTML presentation converter for the Tzu Chi Buddhist organization. Supports Traditional Chinese vertical text layout, remote control via Socket.io, and self-hosted Supabase backend.

## Commands

```bash
# Development (local)
npm start                    # http://localhost:3000

# Development (Docker with hot reload)
docker build -f Dockerfile.dev -t slides:dev . && docker run -p 3000:3000 -v $(pwd):/app slides:dev

# Production
docker compose up -d         # Uses Dockerfile (clones from GitHub)
```

No test framework is configured. No linter configured. No build step required (vanilla JS).

## Architecture

### Data Flow

```
Google Docs (shared publicly)
    ↓ curl download as markdown
server.js processGoogleDoc()
    ├─ Extract base64 images → /docs/<docId>/images/
    ├─ Convert markdown → HTML (via marked)
    └─ Save → /docs/<docId>/content.html
    ↓
slides.html?src=<docId>
    ├─ Fetch content.html, paginate into slides
    ├─ Vertical/horizontal text modes (CSS --mode-scale)
    └─ Optional: Socket.io remote control (room-based)
```

### Key Components

**server.js** — Express 5 server + Socket.io:
- Routes: `/` → upload.html, `/api/fetch-doc` (POST), `/document/d/:docId/*` (GET, auto-convert), `/api/config`
- `processGoogleDoc(docId)`: Downloads markdown export, extracts base64 images to files, converts to HTML
- Socket.io rooms: Host creates room → remote.html joins → bidirectional page control
- Error handling returns styled HTML error pages with Chinese messages based on HTTP status

**slides.html** — Presentation viewer (~60KB, self-contained):
- Font scaling: `--font-scale` × `--mode-scale` (vertical=1.6, horizontal=0.8)
- Primary fonts: DFKai-SB/BiauKai/標楷體 (Traditional Chinese serif)
- Lightbox: Click-to-zoom images with touch gestures
- Remote: Generates QR code linking to remote.html with room ID

**remote.html** — Mobile remote control interface (Socket.io client)

**badge.js** — IIFE that fetches `/api/config` and shows colored version badge (alpha=red, beta=orange, rc=blue, stable=hidden)

### Configuration Priority

Environment variables > `config.json` > hardcoded defaults

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_STAGE` | alpha/beta/rc/stable | alpha |
| `APP_VERSION` | Version string | 1.0.0 |
| `APP_SHOW_BADGE` | Show version badge | true |

### Supabase Self-Hosting (deployment/)

The `deployment/supabase-official/docker/` directory contains a full Supabase self-hosted setup integrated with MasterSlides via Kong API Gateway:

```
Kong (:8000) — Single entry point
├── /studio/*        → Supabase Studio (custom image with basePath=/studio)
├── /api/platform/*  → Studio API (path rewrite to /studio/api/platform/*)
├── /api/v1/*        → Studio API (path rewrite to /studio/api/v1/*)
├── /rest/v1/*       → PostgREST
├── /auth/v1/*       → GoTrue
├── /storage/v1/*    → Storage
├── /realtime/v1/*   → Realtime
└── /*               → App catch-all (profile-dependent)
```

**Two modes:**
- `docker compose up` — Development (root → Studio)
- `docker compose --profile app up` — Production (root → MasterSlides)

See `deployment/supabase-official/docker/tech.md` for full technical documentation.

## Key Architectural Decisions

- **No frontend framework**: Vanilla HTML/CSS/JS, no bundler, no transpilation
- **File-based storage**: Generated presentations stored in `/docs/<docId>/` (not database)
- **Base64 extraction**: Google Docs markdown embeds images as base64; server extracts to files and rewrites references
- **Docker production image clones from GitHub** (not local build context) — configured via `REPO_URL` and `BRANCH` build args
- **Socket.io rooms are in-memory only** — no persistence, state lost on restart
- **Custom Studio image required** for sub-path deployment — `NEXT_PUBLIC_BASE_PATH=/studio` must be set at build time
- **macOS Docker Storage fix**: `docker-compose.override.yml` switches Storage volume from bind mount to named volume (xattr support)

## Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/` | GET | Redirect to /upload.html |
| `/slides.html?src=<docId>` | GET | Presentation viewer |
| `/document/d/<docId>/*` | GET | Google Docs URL redirect (auto-convert) |
| `/api/config` | GET | App config for badge |
| `/api/fetch-doc` | POST | Convert Google Docs to presentation |

## Hotkeys (slides.html)

Navigation: `→`/`Space`/`PageDown` (next), `←`/`PageUp` (prev), `Home`/`End` (first/last), `G` (go to page)
Display: `F` (fullscreen), `S` (sidebar), `O` (orientation), `N` (navigation toggle)
Other: `R` (remote QR), `?`/`H` (help), `Cmd/Ctrl + =/- /0` (font size)

## Google Docs Requirements

Documents must be shared as "Anyone with the link can view". Two conversion methods:
1. **URL redirect**: Replace `docs.google.com` with your server domain in the URL
2. **Upload page**: Paste URL at `/upload.html`
