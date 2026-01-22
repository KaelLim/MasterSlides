# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Google Docs to Slides converter that transforms Google Docs markdown exports into paginated HTML presentations. Designed for the Tzu Chi Buddhist organization with Traditional Chinese vertical text layout support.

## Commands

```bash
# Start development server (http://localhost:3000)
npm start

# Build static slides.html from content.md
npm run build

# Docker deployment
docker compose up -d
```

## Architecture

### Directory Structure

```
/
├── theme/
│   └── default/
│       ├── index.css          # Theme CSS
│       └── background.jpg     # Theme background image
├── docs/                      # Generated presentations
│   └── <google-doc-id>/
│       ├── content.html
│       └── images/
├── server.js                  # Express server
├── slides.html                # Presentation viewer
├── upload.html                # Google Docs URL input form
├── badge.js                   # Version badge display
├── config.json                # App configuration
├── Dockerfile                 # Docker image definition
├── docker-compose.yml         # Docker deployment
└── build.js                   # Static build script
```

### Core Components

**server.js** - Express server:
- Static file serving
- `GET /` - Redirect to upload.html
- `GET /api/config` - App configuration (version badge)
- `GET /document/d/:docId/*` - Google Docs URL redirect (auto-convert)
- `POST /api/fetch-doc` - Manual Google Docs conversion API
- Socket.io for remote control

**slides.html** - Presentation viewer:
- Vertical/horizontal text modes
- Keyboard shortcuts (hotkeys)
- Settings sidebar
- Lightbox for images
- Remote control via QR code

**config.json** - App configuration:
```json
{
  "stage": "alpha",      // alpha | beta | rc | stable
  "version": "1.0.0",
  "showBadge": true
}
```

**badge.js** - Auto-displays version badge on all pages

## Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/` | GET | Redirect to /upload.html |
| `/upload.html` | GET | Upload page |
| `/slides.html?src=<docId>` | GET | Presentation viewer |
| `/document/d/<docId>/*` | GET | Google Docs URL redirect |
| `/api/config` | GET | App configuration |
| `/api/fetch-doc` | POST | Convert Google Docs |

## Hotkeys

| Key | Action |
|-----|--------|
| `→` / `Space` / `PageDown` | Next page |
| `←` / `PageUp` | Previous page |
| `Home` / `End` | First / Last page |
| `G` | Go to page |
| `F` | Fullscreen |
| `S` | Sidebar |
| `O` | Toggle orientation |
| `N` | Toggle navigation |
| `R` | Remote QR code |
| `?` / `H` | Help |
| `Cmd/Ctrl` + `=` / `-` / `0` | Font size |

## Docker Deployment

```bash
# Download files
curl -O https://raw.githubusercontent.com/KaelLim/MasterSlides/main/Dockerfile
curl -O https://raw.githubusercontent.com/KaelLim/MasterSlides/main/docker-compose.yml

# Deploy
docker compose up -d
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_STAGE` | Version stage | alpha |
| `APP_VERSION` | Version number | 1.0.0 |
| `APP_SHOW_BADGE` | Show badge | true |

### Docker Commands

```bash
docker compose ps          # Status
docker compose logs -f     # Logs
docker compose restart     # Restart
docker compose build --no-cache && docker compose up -d  # Update
```

## Google Docs Integration

Documents must be shared as "Anyone with the link can view".

**Two ways to convert:**
1. **URL Redirect**: Change `docs.google.com` to your server domain
   ```
   https://docs.google.com/document/d/xxx/edit
   → https://your-server.com/document/d/xxx/edit
   ```
2. **Upload Page**: Paste URL at `/upload.html`

## Key Files

| File | Purpose |
|------|---------|
| `server.js` | Express server, API, routes |
| `slides.html` | Presentation viewer with hotkeys |
| `upload.html` | Google Docs URL input |
| `config.json` | Version/stage configuration |
| `badge.js` | Version badge component |
| `Dockerfile` | Docker image (GitHub clone) |
| `docker-compose.yml` | Docker deployment |
