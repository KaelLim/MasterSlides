# Routing Reshuffle + Code-Quality Cleanup Design

**Date:** 2026-06-02
**Goal:** Move `/` to the admin dashboard (viewer relocates to `/slides/`), split the four oversized files
(`app.js`, `slides.css`, `remote.html`, `admin.ts`) into single-responsibility modules,
delete the half-finished `public/js/slides/` refactor scaffolding, and add the missing tests
(`convert`, `storage` reclaim, `admin` auth, `playlists` CRUD).

**Approach:** All-in-one. Single coherent landing — file moves, route Functions, splits,
deletions, and new tests are sequenced inside one development pass with a single set of
post-conditions to verify. No phased rollout.

**Tech Stack:** Bun (local dev), Cloudflare Pages + Pages Functions (prod), Drust BaaS,
TypeScript + JavaScript, html2canvas, QRCode.js, ESM (browser + server). Tests run on
`bun test` against the live Drust tenant under `__test_` prefixes.

---

## 1. Final File Layout

After this change, the project tree under `public/`, `server/`, and `functions/` is:

```
public/
├── slides/                            ← viewer (was /index.html)
│   ├── index.html
│   ├── css/
│   │   ├── slides.css                 ← entry; only @import statements
│   │   ├── base.css                   ← :root vars, flex shell
│   │   ├── ui-shell.css               ← left panel, nav bar, sidebar
│   │   ├── manuscript.css             ← content area, headings, paragraphs,
│   │   │                                lists, images, page-break hr
│   │   │                                (absorbs the 44 lines of slides-aliswa.css)
│   │   ├── lightbox.css
│   │   ├── modals-remote.css
│   │   ├── modals-help.css
│   │   ├── modals-goto.css            ← modal + tabs + grid overview
│   │   ├── search.css
│   │   ├── print.css
│   │   └── context-menu.css
│   ├── js/
│   │   ├── app.js                     ← thin orchestrator (~25 lines)
│   │   ├── state.js                   ← from /js/slides/state.js, adds shared
│   │   │                                viewer-only state (playlistState,
│   │   │                                currentWritingMode, allPageElements,
│   │   │                                currentSrc)
│   │   ├── loader.js                  ← loadDocument, refresh, syncFromGoogle,
│   │   │                                extractDocId
│   │   ├── playlist.js                ← loadPlaylist, jumpToPlaylistDoc,
│   │   │                                updatePlaylistBadge
│   │   ├── pagination.js              ← repaginate, goToPage, prevPage,
│   │   │                                nextPage, updatePageCount,
│   │   │                                isVerticalMode
│   │   ├── font.js                    ← setFontScale, increase/decrease,
│   │   │                                applyFont
│   │   ├── pdf-export.js              ← exportPDF
│   │   ├── remote-control.js         ← initRemote, handleRemoteCommand,
│   │   │                                buildSyncPayload, publishSync,
│   │   │                                syncRemoteState, getCurrentPageImages,
│   │   │                                openRemoteModal, closeRemoteModal,
│   │   │                                drustRoomFor, markRemoteConnected
│   │   ├── table-canvas.js            ← convertTablesToImages, downscaleCanvas
│   │   ├── modals.js                  ← help modal, closeAllModals,
│   │   │                                updateModKeyDisplay
│   │   ├── keyboard.js                ← HOTKEYS, COMBO_KEYS, ACTIONS,
│   │   │                                handleKeydown
│   │   ├── context-menu.js            ← CTX_ICONS, CTX_ITEMS, buildMenu,
│   │   │                                showMenu, hideMenu, initContextMenu
│   │   ├── event-listeners.js         ← initEventListeners
│   │   ├── drust-broadcast.js         ← unchanged (moved with viewer)
│   │   ├── paginator.ts               ← unchanged (moved with viewer)
│   │   ├── paginator.test.ts          ← unchanged (moved with viewer)
│   │   ├── display.js                 ← from /js/slides/display.js
│   │   ├── navigation.js              ← from /js/slides/navigation.js
│   │   ├── lightbox.js                ← from /js/slides/lightbox.js
│   │   ├── search.js                  ← from /js/slides/search.js
│   │   ├── goto.js                    ← from /js/slides/goto.js
│   │   └── laser.js                   ← from /js/slides/laser.js
│   └── dist/
│       └── app.js                     ← bun build output (gitignored)
├── admin/                              ← unchanged
├── remote/                             ← was /remote.html
│   ├── index.html                     ← markup + <link> + <script type=module>
│   ├── remote.css                     ← from old <style>…</style>
│   └── remote.js                      ← from old <script type=module>…</script>
├── _redirects                          ← `/` → `/admin/` 302
└── (no /index.html, no /remote.html, no /js/, no /css/, no /dist/)

server/
├── index.ts                            ← dev router; new clean-URL handling
│                                         for /, /slides, /slides/, /remote,
│                                         /remote/
├── routes/
│   ├── docs.ts                        ← unchanged
│   ├── remote.ts                      ← unchanged (legacy SSE remote, dev-only)
│   └── admin/
│       ├── index.ts                   ← path-dispatch switch
│       ├── auth.ts                    ← handleLogin, handleLogout, handleMe,
│       │                                handleSetupState, handleSetup
│       ├── docs.ts                    ← handleDocsList, handleDocPatch,
│       │                                handleDocDelete, sanitizeDocIds
│       └── playlists.ts               ← handlePlaylistsList, handlePlaylistCreate,
│                                        handlePlaylistGet, handlePlaylistPatch,
│                                        handlePlaylistDelete, handlePublicPlaylistGet
└── lib/
    ├── admin/                          ← shared handlers (used by both
    │                                     server/routes/admin/* and
    │                                     functions/api/admin/*)
    │   ├── auth.ts                    ← handler implementations + requireAuth
    │   ├── docs.ts
    │   └── playlists.ts
    ├── auth.ts                         ← unchanged (Drust login wrapper)
    ├── convert.ts                      ← unchanged
    ├── convert.test.ts                 ← new
    ├── drust.ts                        ← unchanged
    ├── drust.test.ts                   ← unchanged
    ├── google-docs.ts                  ← unchanged
    ├── storage.ts                      ← unchanged
    └── storage.test.ts                 ← extended with reclaim test
└── lib/admin/
    ├── auth.test.ts                    ← new
    └── playlists.test.ts               ← new

functions/
├── index.ts                            ← new: /` smart-router
├── document/d/[[path]].ts              ← Location updated to /slides/?src=…
└── api/                                ← unchanged shape; admin/* adapters
                                          import server/lib/admin/* handlers

docs/superpowers/specs/                  ← this file lives here
```

The legacy `public/js/slides/` directory and `public/css/{slides.css,slides-aliswa.css}` are
deleted. `public/index.html` and `public/remote.html` are deleted.

The 7 unused files inside `public/js/slides/` (`keyboard.js`, `context-menu.js`, `modals.js`,
`print.js`, `loader.js`, `main.js`, `remote.js`) are dropped entirely — they were scaffolding
for a refactor that was never wired up. Verified via `grep -rn "js/slides/(keyboard|context-menu|modals|print|loader|main|remote)" public` returning zero hits, and via
`codegraph_callers initKeyboard / initModals / initPrint` returning "not found in the codebase."

---

## 2. Routing

### 2.1 Smart router at `/`

`functions/index.ts`:

```ts
export const onRequest: PagesFunction = ({ request, next }) => {
  const url = new URL(request.url);
  if (url.searchParams.has("src") || url.searchParams.has("playlist")) {
    const target = new URL(`/slides/${url.search}`, url.origin);
    return Response.redirect(target.toString(), 302);
  }
  return next();
};
```

For requests to `/` without viewer query params, the Function calls `next()` and `_redirects`
takes over:

```
# public/_redirects
/    /admin/    302
```

### 2.2 Google Docs URL redirect

`functions/document/d/[[path]].ts`:

```ts
export const onRequest: PagesFunction<unknown, "path"> = ({ params, request }) => {
  const segs = Array.isArray(params.path) ? params.path : [];
  const id = segs[0] || "";
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return new Response("Bad doc id", { status: 400 });
  }
  const url = new URL(request.url);
  const target = new URL(`/slides/?src=${encodeURIComponent(id)}`, url.origin);
  return Response.redirect(target.toString(), 302);
};
```

`Response.redirect()` is used here (not the hand-built header pattern from the prior
fix) because we now have `request.url` in scope and can resolve the absolute URL — the
Workers runtime accepts `Response.redirect()` only when given an absolute URL.

### 2.3 Dev server (Bun) parity

`server/index.ts` adds, at the top of the request dispatcher:

1. `GET /` with `?src=` or `?playlist=` → 302 to `/slides/${url.search}`.
2. `GET /` with no viewer query → 302 to `/admin/`.
3. `GET /slides` → serve `public/slides/index.html` (CF Pages auto-resolves this; Bun needs
   the existing clean-URL fallback to be aware of the new path).
4. `GET /remote` → serve `public/remote/index.html`.

### 2.4 In-app links updated

| File | Old | New |
|---|---|---|
| `public/admin/js/dashboard.js:101` | `/?src=${encodeURIComponent(docId)}` | `/slides/?src=${encodeURIComponent(docId)}` |
| `public/admin/js/playlists.js:93` | `/?playlist=${id}` | `/slides/?playlist=${id}` |
| `public/slides/js/remote-control.js` (was `app.js:369`) | `${...}/remote.html?id=${state.roomId}` | `${...}/remote/?id=${state.roomId}` |
| `functions/document/d/[[path]].ts:21` | `/?src=…` | `/slides/?src=…` |

### 2.5 Legacy URL compatibility

- `https://slides-6rb.pages.dev/?src=<id>` — still works via `functions/index.ts` (302 to `/slides/`).
- `https://slides-6rb.pages.dev/?playlist=<id>` — same path, still works.
- `https://slides-6rb.pages.dev/remote.html?id=<id>` — no automatic redirect; existing QR
  codes are session-scoped (lifetime ≤ a few hours of a single presentation), so we
  consciously do not maintain compatibility. New QR codes from the viewer point to
  `/remote/`.

---

## 3. `app.js` Split (931 → 12 modules)

### 3.1 Module boundaries

Each new module under `public/slides/js/`:

| File | Symbols moved from `app.js` | Approx LoC |
|---|---|---|
| `loader.js` | `refresh`, `extractDocId`, `syncFromGoogle`, `loadDocument`, `currentSrc` (state) | 100 |
| `playlist.js` | `playlistState` (state), `loadPlaylist`, `updatePlaylistBadge`, `jumpToPlaylistDoc` | 60 |
| `pagination.js` | `currentWritingMode` (state), `allPageElements` (state), `isVerticalMode`, `updatePageCount`, `goToPage`, `prevPage`, `nextPage`, `repaginate` | 75 |
| `font.js` | `localSetFontScale`, `localIncreaseFontSize`, `localDecreaseFontSize`, `localApplyFont` | 40 |
| `pdf-export.js` | `printContainer` (state), `printStyle` (state), `exportPDF` | 55 |
| `remote-control.js` | `room` (state), `roomChannel` (state), `syncTimer` (state), `getCurrentPageImages`, `buildSyncPayload`, `publishSync`, `syncRemoteState`, `handleRemoteCommand`, `markRemoteConnected`, `drustRoomFor`, `initRemote`, `openRemoteModal`, `closeRemoteModal` | 180 |
| `table-canvas.js` | `downscaleCanvas`, `convertTablesToImages` | 70 |
| `modals.js` | `updateModKeyDisplay`, `showHelpModal`, `closeHelpModal`, `closeAllModals`, `initHelpModal` | 30 |
| `keyboard.js` | `HOTKEYS`, `COMBO_KEYS`, `ACTIONS`, `closeLightboxIfActive`, `handleKeydown` | 80 |
| `context-menu.js` | `CTX_ICONS`, `CTX_ITEMS`, `ctxMenu` (state), `longPressTimer` (state), `getOrientationLabel`, `buildMenu`, `showMenu`, `hideMenu`, `initContextMenu` | 90 |
| `event-listeners.js` | `eventsInit` (state), `initEventListeners` | 70 |
| `app.js` | `DOMContentLoaded` entry — reads URL params, dispatches to `loadPlaylist(id)` or `loadDocument(src)` | 25 |

### 3.2 Shared state

The module-level `let` variables move to `state.js`. The current `state.js` already exports
a `state` object — additions:

```js
// state.js — additions
export const state = {
  // ... existing fields (currentPage, totalPages, etc.)
  fontScale: 1.0,
  roomId: null,
  lbZoom: 1,
  // new shared mutable state:
  currentWritingMode: 'vertical-rl',
  allPageElements: [],
  currentSrc: null,
  playlistState: null,
};
```

Module-local state (e.g. `room`, `roomChannel`, `syncTimer`, `printContainer`, `ctxMenu`,
`longPressTimer`, `eventsInit`) stays inside its owning module — those are private
implementation details, not shared.

### 3.3 Dependency graph (no cycles)

```
state.js                  (leaf — no deps)
   ↑
   ├─ pagination.js       (also depends on paginator.ts)
   ├─ font.js             (depends on pagination via setTimeout(repaginate))
   ├─ table-canvas.js
   ├─ pdf-export.js       (depends on pagination for slide-page DOM)
   ├─ loader.js           (depends on pagination, table-canvas, display,
   │                       remote-control [for syncRemoteState only])
   ├─ playlist.js         (depends on loader, pagination)
   ├─ remote-control.js   (depends on pagination, modals via toggleFullscreen,
   │                       laser, lightbox, search, drust-broadcast)
   ├─ modals.js           (depends on lightbox, goto, search — modules
   │                       already exist in /slides/js/)
   ├─ context-menu.js     (depends on modals, laser, search, pdf-export)
   ├─ keyboard.js         (depends on pagination, modals, lightbox, search,
   │                       laser, font, pdf-export, remote-control)
   ├─ event-listeners.js  (depends on loader for refresh; pagination, font,
   │                       pdf-export, remote-control, lightbox, search,
   │                       laser, display for everything else it wires)
   └─ app.js              (entry; depends on loader, playlist,
                           event-listeners, remote-control)
```

**Cycle-breaking change** (vs the current `app.js` shape): in the existing code,
`loadDocument()` ends with `initEventListeners()` and `initRemote()` calls. That would
require `loader.js` to import `event-listeners.js` and `remote-control.js`, but those two
import `refresh` and `syncRemoteState`/etc. *from* `loader.js`/`remote-control.js` — a
cycle.

Resolution: `loadDocument()` ends with only `repaginate()`, `syncRemoteState()` (imported
one-way from `remote-control.js`), and `resetNavHideTimer()`. The `initEventListeners()`
and `initRemote()` calls move into `app.js`'s `DOMContentLoaded` handler, invoked once
after the first `loadDocument`/`loadPlaylist` completes. The existing `eventsInit` and
`initRemote` singleton guards make subsequent refreshes safely no-op anyway — so behavior
matches the current code on refresh.

The resulting edges (`loader → remote-control` for `syncRemoteState`; `event-listeners →
loader` for `refresh`; `event-listeners → remote-control` for `openRemoteModal`;
`remote-control → pagination` for `goToPage`/`nextPage`/`prevPage`; `remote-control →
modals` for `closeAllModals`) are all one-way — no cycle.

### 3.4 Build

`bun build public/slides/js/app.js --outfile public/slides/dist/app.js` produces a single
bundle. `public/slides/index.html` loads `<script type="module" src="/slides/dist/app.js">`.
`package.json` `build` script updated accordingly.

---

## 4. `slides.css` Split (1441 → entry + 10 sub-files)

`public/slides/css/slides.css` (entry):

```css
@import "base.css";
@import "ui-shell.css";
@import "manuscript.css";
@import "lightbox.css";
@import "modals-remote.css";
@import "modals-help.css";
@import "modals-goto.css";
@import "search.css";
@import "print.css";
@import "context-menu.css";
```

Section-to-file mapping is verbatim from the section headers in the existing
`public/css/slides.css`:

| Sub-file | Source lines |
|---|---|
| `base.css` | 1–52 (CSS Variables, 主要 Flex 布局) |
| `ui-shell.css` | 53–179 (左側面板, Refresh button), 333–566 (導航列, Sidebar) |
| `manuscript.css` | 180–331 (內容區 Container Query, 標題, 段落, 列表, 圖片, 分頁線) + the 44 lines from `slides-aliswa.css` appended |
| `lightbox.css` | 567–724 |
| `modals-remote.css` | 725–807 |
| `modals-help.css` | 808–908 |
| `modals-goto.css` | 909–1181 (modal + tabs + grid overview) |
| `search.css` | 1182–1273 |
| `print.css` | 1274–1368 |
| `context-menu.css` | 1369–end |

`slides-aliswa.css` is absorbed because its overrides apply specifically to the manuscript
column / page model and have no meaning outside it. No cascade-order risk: the original
load order in `index.html` placed `slides-aliswa.css` *after* `slides.css`, so appending it
inside `manuscript.css` (the last `@import` before lightbox/modals/etc.) preserves
specificity behavior — its `!important` declarations win over earlier `manuscript.css`
rules just as they did before.

`public/slides/index.html` loads only `/slides/css/slides.css` — the rest cascades via
`@import`. Native CSS `@import` is synchronous in browsers and prod-acceptable for a
single-user local-deploy tool (~5 KB total CSS); no bundler stage required.

---

## 5. `remote.html` Split (774 → 3 files)

`public/remote/index.html` — markup only:

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>簡報遙控器</title>
  <link rel="stylesheet" href="/remote/remote.css">
</head>
<body>
  <!-- (existing markup from inside old <body>) -->
  <script type="module" src="/remote/remote.js"></script>
</body>
</html>
```

`public/remote/remote.css` — verbatim copy of the old `<style>…</style>` (lines 7–389),
no rule changes.

`public/remote/remote.js` — verbatim copy of the old `<script type="module">…</script>`
(lines 474–771), no logic changes. The script previously had implicit access to
`document.querySelector(...)` for elements that were defined earlier in the same HTML
file; with `type="module"` and a `<script>` tag at the end of `<body>`, DOM is already
parsed when the module runs, so no `DOMContentLoaded` wrapper is needed.

`public/remote.html` is deleted.

---

## 6. `admin.ts` Split (304 → 3 lib files + 3 route adapters)

### 6.1 Shared handlers in `server/lib/admin/`

Handler implementations move out of `server/routes/admin.ts` and into:

- `server/lib/admin/auth.ts` — exports `handleLogin`, `handleLogout`, `handleMe`,
  `handleSetupState`, `handleSetup`, plus the `requireAuth` helper.
- `server/lib/admin/docs.ts` — exports `handleDocsList`, `handleDocPatch`,
  `handleDocDelete`, `sanitizeDocIds`.
- `server/lib/admin/playlists.ts` — exports `handlePlaylistsList`,
  `handlePlaylistCreate`, `handlePlaylistGet`, `handlePlaylistPatch`,
  `handlePlaylistDelete`, `handlePublicPlaylistGet`.

Every handler keeps its existing signature: `(req: Request, ...args) => Promise<Response>`.
Web-standard `Request`/`Response` are available in both Bun and the Cloudflare Workers
runtime, so the same handler runs both places.

### 6.2 Bun route adapters in `server/routes/admin/`

- `server/routes/admin/index.ts` — exports a single `handleAdminRoute(req, url)` that
  dispatches on `url.pathname` and delegates to imported handlers.
- `server/routes/admin/{auth,docs,playlists}.ts` — re-export from `server/lib/admin/*` so
  callers inside `server/` get the existing import path shape.

### 6.3 CF Pages Function adapters in `functions/api/admin/`

Each existing `functions/api/admin/<endpoint>.ts` file becomes a thin adapter:

```ts
// functions/api/admin/login.ts (example)
import { handleLogin } from "../../../server/lib/admin/auth";
export const onRequestPost: PagesFunction = ({ request }) => handleLogin(request);
```

The shared `server/lib/admin/*` is the single source of truth.

### 6.4 `server/index.ts` change

```ts
// before:
//   import { handleAdminLogin, handleAdminDocsList, … } from "./routes/admin";
// after:
import { handleAdminRoute } from "./routes/admin/index";
// in dispatcher: if (url.pathname.startsWith("/api/admin/")) return handleAdminRoute(req, url);
```

---

## 7. Tests (4 new files)

All tests use the live Drust tenant under `__test_` prefixes, mirroring the existing
`drust.test.ts` pattern. Each suite has an `afterAll` cleanup that removes its prefix.

### 7.1 `server/lib/convert.test.ts`

```ts
test("extractTitle: takes first H1 and ignores deeper headings");
test("extractTitle: ignores leading whitespace and trailing # marks");
test("extractTitle: returns null when no H1 is present");
test("extractTitle: does not match '# ' that appears inside a fenced code block");
test("convertDocument: extracts inline base64 images and replaces them with /img/<id>");
test("convertDocument: surfaces extracted title on the result object");
```

For `convertDocument`, the Drust file-upload call is exercised against the real tenant.
Image upload uses the `__test_` filename prefix and is reclaimed in `afterAll`.

### 7.2 `server/lib/storage.test.ts` — extended

Adds:

```ts
test("upsertDoc: same doc_id overwrites and reclaims orphaned image_ids");
test("upsertDoc: image_ids that survive the rewrite are retained");
```

The existing `__upsert_*` row tests stay; the new tests insert two versions of the same
`doc_id`, assert that orphaned image rows go to Drust files DELETE and surviving ones
do not.

### 7.3 `server/lib/admin/auth.test.ts` — new

```ts
test("login: rejects bad credentials with 401, no Set-Cookie header");
test("login: accepts good credentials, sets HttpOnly cookie, omits Secure on http");
test("login: includes Secure on https origins");
test("verifySession: rejects forged tokens");
test("verifySession: rejects expired sessions");
test("logout: clears the cookie via Max-Age=0");
test("me: 401 without cookie");
test("me: 200 with valid cookie, returns user email");
```

A `__test_admin_user@example.com` user is created in Drust at suite setup and removed
in `afterAll`.

### 7.4 `server/lib/admin/playlists.test.ts` — new

```ts
test("create: 401 without auth cookie");
test("create + get: round-trips title, doc_ids, is_public");
test("patch: updates title");
test("patch: updates doc_ids preserving order");
test("patch: toggles is_public");
test("delete: returns 200, subsequent get returns 404");
test("public get: 200 when is_public=1");
test("public get: 404 when is_public=0");
test("sanitizeDocIds: rejects '..', whitespace, empty strings");
```

All created playlists use `__test_pl_` title prefix and are cleaned up in `afterAll`.

### 7.5 Running

`bun test` invokes the whole suite. CI/CD is out of scope — this is a single-user local
tool, and the user runs tests manually before deploying.

---

## 8. Dead-Code Purge

The following are deleted in this change:

- `public/index.html` — replaced by `public/slides/index.html`.
- `public/remote.html` — replaced by `public/remote/index.html`.
- `public/js/slides/` — the whole directory. Already-used files (`state`, `display`,
  `navigation`, `lightbox`, `search`, `goto`, `laser`) are recreated in
  `public/slides/js/`. The 7 dead files (`keyboard`, `context-menu`, `modals`, `print`,
  `loader`, `main`, `remote`) are dropped — no replacement.
- `public/js/app.js` — split (see Section 3).
- `public/js/paginator.ts`, `public/js/paginator.test.ts`, `public/js/drust-broadcast.js`
  — moved into `public/slides/js/`.
- `public/css/slides.css` — split (see Section 4).
- `public/css/slides-aliswa.css` — absorbed into `manuscript.css`.
- `public/dist/` — gitignored directory, no longer used. Build output now goes to
  `public/slides/dist/`.

Verification before delete:

```bash
grep -rn "/js/slides/" public functions server   # must return zero hits
grep -rn "/css/slides" public functions server   # must return zero hits
grep -rn "/dist/app.js" public functions server  # must return only /slides/dist/app.js
grep -rn "remote.html" public functions server   # only QR generation in remote-control.js,
                                                 # which is also updated to /remote/
```

---

## 9. `CLAUDE.md` Sync

The project-level `CLAUDE.md` is rewritten in the same change:

- **Architecture diagram** — `slides.html (public/)` → `public/slides/index.html`; admin
  is now reachable at `/`; remote at `/remote/`.
- **Layout tree** — reflects the new directory structure from Section 1.
- **Key Components** — references to `js/slides/*` updated to `public/slides/js/*`.
- **Commands** — `bun build public/slides/js/app.js → public/slides/dist/app.js`.
- **Roadmap section** — the "Planned: replace SSE+POST with Drust broadcast" and "Planned:
  migrate Bun server → Cloudflare Pages + Functions" bullets are removed (both completed).
  The section is either deleted entirely or replaced with a single line: "Roadmap: see
  `docs/superpowers/specs/`."

`.gitignore` adds `public/slides/dist/` and removes the now-stale `public/dist/`.

`package.json` build script updated:

```json
"build": "bun build public/slides/js/app.js --outfile public/slides/dist/app.js"
```

---

## 10. Verification Checklist

The change is complete when:

1. `bun test` passes — original 3 tests + 4 new test files all green.
2. `bun run dev` serves:
   - `GET /` → 302 to `/admin/`
   - `GET /?src=<id>` → 302 to `/slides/?src=<id>`
   - `GET /?playlist=<id>` → 302 to `/slides/?playlist=<id>`
   - `GET /slides/` → viewer (with playlist/src param working end-to-end)
   - `GET /admin/` → admin dashboard
   - `GET /remote/?id=<roomId>` → remote control page
   - `GET /document/d/<id>/edit?tab=t.0` → 302 to `/slides/?src=<id>`
3. `bun run build` produces `public/slides/dist/app.js` with no module-not-found errors.
4. Viewer manual smoke (kept by user — UI testing): page navigation, font scale, vertical/
   horizontal toggle, lightbox, search, goto, laser, PDF export, refresh, playlist mode,
   remote QR + phone connect all work end-to-end.
5. `grep -rn "/js/slides/\|/css/slides.css\|public/dist\|remote.html" public functions server`
   returns zero hits.
6. CF Pages deploy of the branch:
   - All routes from (2) work in prod.
   - Existing `/?src=...` bookmarks still take the viewer (legacy compat).
7. `CLAUDE.md` reads correctly against the new tree.

---

## 11. Out of Scope

- Performance optimizations (table-canvas async pipeline, image-load streaming, incremental
  repagination) — explicitly deferred per the user's earlier scoping choice.
- Linter / formatter / CI — separate concern.
- Drust schema migrations or service-token rotation.
- Bookmark migration for the `/remote.html?id=…` URL (consciously dropped — see 2.5).
- Pushing the local 88 commits to `origin` — operational, not part of this design.
