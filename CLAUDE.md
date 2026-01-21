# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Google Docs to Slides converter that transforms Google Docs markdown exports into paginated HTML presentations using Paged.js. Designed for the Tzu Chi Buddhist organization with Traditional Chinese vertical text layout support.

## Commands

```bash
# Start development server (http://localhost:3000)
npm start

# Build static slides.html from content.md
npm run build
```

## Architecture

### Directory Structure

```
/
├── theme/
│   └── default/
│       ├── index.css          # All CSS (theme + slider + sidebar + nav)
│       └── background.jpg     # Theme background image
├── slides.js                  # Core JavaScript (slider, settings, sidebar)
├── slides.html                # Static build output
├── build.js                   # Static build script
├── server.js                  # Express server
├── content.md                 # Static build source
└── docs/
    └── <google-doc-id>/       # Uses Google Doc ID as directory name
        ├── index.html         # Presentation
        └── images/            # Extracted images
            └── img_*.{jpeg,png}
```

### Core Components

**server.js** - Express server with two main functions:
1. Static file serving for the presentation viewer
2. `POST /api/fetch-doc` API endpoint that:
   - Accepts Google Docs URL
   - Extracts Doc ID from URL (e.g., `1EJi4AabcbPV2Eqhx...`)
   - Downloads markdown via Google export API
   - Extracts base64-encoded images to `docs/<docId>/images/`
   - Converts markdown to HTML using marked.js
   - Generates `docs/<docId>/index.html`
   - Overwrites existing files on re-upload

**build.js** - Static build script that:
- Reads `content.md`
- Generates `slides.html` with references to external CSS/JS

**theme/default/index.css** - All presentation styling:
- Paged.js CSS for print-ready pagination
- Vertical text support (`writing-mode: vertical-rl`)
- Slider mode styles
- Sidebar settings panel
- Navigation bar styles

**slides.js** - Core JavaScript functionality:
- Slider navigation (keyboard, touch, buttons)
- Settings sidebar (font size, orientation, font family)
- Fullscreen control
- Auto-hiding navigation bar

## Key Files

| File | Purpose |
|------|---------|
| `server.js` | Express server with Google Docs fetch API |
| `build.js` | Static build from content.md |
| `slides.js` | Core JavaScript for all presentations |
| `theme/default/index.css` | Theme CSS with Paged.js integration |
| `upload.html` | Google Docs URL input form |
| `content.md` | Source markdown for static build |
| `docs/` | Generated presentations (Doc ID-named) |

## Google Docs Integration

Documents must be shared as "Anyone with the link can view" for the fetch API to work. The server uses curl to download the markdown export format.

## Theme System

Themes are stored in `theme/<theme-name>/` directories. Each theme contains:
- `index.css` - Complete theme styling
- `background.jpg` - Background image

CSS paths use relative references (`background.jpg`) for portability.
