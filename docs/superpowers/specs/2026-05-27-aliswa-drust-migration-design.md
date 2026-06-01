# Aliswa → Drust Migration Design

**Date:** 2026-05-27
**Status:** Ready for review
**Scope:** Replace aliswa's file-based persistence (`aliswa/data/`) with Drust as the backend.

---

## Background

Aliswa today is a standalone Bun server with three jobs:

1. Fetch Google Docs and convert markdown → HTML (server-side, avoids browser CORS).
2. Store HTML + extracted images on the local filesystem (`aliswa/data/<doc_id>/`).
3. Host an in-memory WebSocket room (`/ws/:room`) for presenter-remote sync.

The main Supabase stack (`/`, Kong + Postgres + Edge Functions + Storage) is being abandoned. The user wants Drust to take over persistence and explicitly does **not** want teams, playlists, or any multi-tenant features. Aliswa already lacks these, which is why it is the migration starting point rather than the main stack.

The Drust tenant (`docs`, id `1e195719-6106-4644-85d1-0eee7d135026`) is currently empty — no collections, no RPCs.

## Goals

- One backend for persistence: Drust.
- One Google Docs URL in → one record out, identified by the Google Docs id.
- Re-importing the same Google Docs id **overwrites** the existing record (no version history).
- Keep the existing Bun API surface so the frontend (`slides.html`, `app.js`) needs minimal changes.
- No login, no teams, no playlists, no Docker.

## Non-Goals

- Auth / multi-tenant.
- A "list all docs" UI. `GET /api/docs` is dropped (the frontend doesn't use it).
- Versioning. Same id overwrites.
- Migrating existing `aliswa/data/*` content. Old docs are abandoned in place; their `/data/*` route is removed so they become unreachable.
- Adding Docker to aliswa. The existing `deployment/` Docker compose for the Supabase stack is left untouched but unused.

## Architecture

```
                            ┌────────────────────────┐
Google Docs ──fetch md────▶ │   Bun server (留)      │
                            │  POST /api/fetch-doc   │
                            │  GET  /api/docs/:id    │
                            │  WS   /ws/:room        │
                            └──────────┬─────────────┘
                                       │ service key
                                       ▼
                            ┌────────────────────────┐
                            │   Drust tenant `docs`  │
                            │                        │
                            │  collection: docs      │  ← HTML + metadata
                            │  files (Garage, public)│  ← extracted images
                            └────────────────────────┘
                                       ▲
                            HTML <img src="...drust file URL"> ┘
```

### Component responsibilities

- **Bun server** — keeps Google Docs fetching, markdown→HTML conversion, and the WebSocket remote room. Replaces local filesystem writes with Drust REST calls. Uses the **service key**.
- **Drust collection `docs`** — one record per Google Docs id. HTML stored inline.
- **Drust files (Garage)** — public image bytes. The HTML stored in the collection references each image by its stable public URL.

### Key handling

| Key | Where | Why |
|---|---|---|
| Service key (`drust_E8p6...`) | Bun env (`DRUST_SERVICE_TOKEN`) | Bun is trusted; needs read + write + file upload + file delete. |
| Anon key (`drust_70Z3...`) | Unused | Frontend talks only to Bun, never to Drust. |
| Drust base URL | Bun env (`DRUST_BASE_URL=https://tool.tzuchi-org.tw`) | Used to build REST + files endpoints. |
| Tenant id | Bun env (`DRUST_TENANT_ID=1e195719-6106-4644-85d1-0eee7d135026`) | Embeds in every REST path. |

## Drust schema

### Collection `docs`

| Field | Type | Nullable | Unique | Notes |
|---|---|---|---|---|
| `id` | integer | no | yes | auto, Drust managed |
| `created_at` | datetime | no | no | auto |
| `updated_at` | datetime | no | no | auto |
| `doc_id` | text | no | **yes** | Google Doc id, the natural key |
| `title` | text | yes | no | from Google Doc title (or doc_id fallback) |
| `html` | text | yes | no | rendered HTML article |
| `image_ids` | json | yes | no | array of Drust file UUIDs used by this doc, for cleanup on overwrite |

Anon caps for `docs`: **empty** (anon role cannot read or write; only the Bun server with service key touches it).

No additional indices needed — `doc_id` already has a unique index from the field constraint.

### Files (Garage)

- Visibility: `public` (slide images need to be loaded by the viewer without auth).
- `meta`: not used. We track file ownership via `docs.image_ids`, not via file metadata.
- Naming: original filename (`img_1.png`, `img_2.jpg`, …) preserved at upload; Drust assigns a UUID id we keep in `image_ids`.

## Bun API surface

All three existing endpoints stay; their semantics change only on the storage side.

### `POST /api/fetch-doc`

Body: `{ url: string, title?: string }`.

1. Extract `doc_id` from `url` (existing `google-docs.ts` logic).
2. `list_records(docs, filter={doc_id: docId})` → check if a record exists.
3. Fetch markdown from `https://docs.google.com/document/d/<docId>/export?format=md` (existing logic).
4. For each base64 image in markdown: POST to `${DRUST_BASE_URL}/drust/t/${tenant}/files` with `visibility=public`. Collect the returned file ids.
5. Resolve a public URL for each new file id via `get_file_url` (or construct the canonical public URL — depends on Drust's URL shape; pin this in the implementation plan).
6. Rewrite markdown image references to those public URLs, then `marked.parse` → HTML wrapped in `<article class="slide-content">`.
7. If step 2 found an existing record: read its old `image_ids`, **delete** each old file, then `update_record` with `{ title, html, image_ids: <new> }`. Otherwise `insert_record` with `{ doc_id, title, html, image_ids: <new> }`.
8. Return `{ success: true, doc_id, images: <count> }`.

### `GET /api/docs/:id`

1. `list_records(docs, filter={doc_id: req.params.id}, per_page=1)`.
2. 404 if none.
3. Respond with `record.html` and `Content-Type: text/html; charset=utf-8`.

### `WS /ws/:room`

Unchanged. In-memory rooms, no Drust involvement.

## Error handling

- Any failure mid-import (Google Docs fetch, image upload, Drust write) bubbles up as a `500` with `{ success: false, error: <message> }`. Existing frontend already surfaces `result.error` to the user.
- Partial-failure cleanup is **not** automated for v1: if image upload succeeds on 3 of 5 images and then Drust write fails, the 3 uploaded files become orphans. Acceptable for a single-user tool; can be addressed later with a periodic GC.
- A failed re-import does NOT roll back the previous successful record. The previous record remains visible until a re-import succeeds.

## File cleanup discipline

- On overwrite: delete the old `image_ids` files **before** updating the record. If file delete fails (e.g. `NOT_FOUND`), proceed — those are orphans we tolerate.
- On record delete (out of scope for v1): would also need to delete `image_ids`. Not implementing now.

## Code changes (high-level)

| File | Change |
|---|---|
| `aliswa/server/lib/storage.ts` | Rewrite: drop fs operations; add Drust REST helpers (`upsertDoc`, `findByDocId`, `uploadImage`, `deleteImage`). |
| `aliswa/server/lib/convert.ts` | Image branch: replace `writeImage` (filesystem) with `uploadImage` (Drust REST). Rewrite markdown references to Drust public URLs instead of `/data/<id>/images/...`. |
| `aliswa/server/lib/google-docs.ts` | No change. |
| `aliswa/server/routes/docs.ts` | `handleFetchDoc` / `handleGetDoc` switch to Drust storage helpers. Drop `handleListDocs` and the `/api/docs` (no id) route. |
| `aliswa/server/routes/ws.ts` | No change. |
| `aliswa/server/index.ts` | Remove `/data/*` static route. Read `DRUST_BASE_URL`, `DRUST_TENANT_ID`, `DRUST_SERVICE_TOKEN` from env at boot; fail fast if missing. |
| `aliswa/.env.example` | New: documents the three required env vars. |
| `aliswa/.gitignore` | `data/` line stays (gitignored old data); add `.env`. |
| `aliswa/public/js/app.js` | No change (API surface preserved). |
| `aliswa/data/` | Abandoned, not touched. |

## Open items deferred to the implementation plan

- Exact Drust REST URL shapes for collection records (record-level routes, query-string format). Verify against tool.tzuchi-org.tw before coding.
- Exact public URL format for a Drust file (whether `get_file_url` is needed per upload, or whether public URLs follow a predictable pattern from the file id).
- Whether `marked` should run on the markdown *after* URL rewriting (yes — see step 6 above) and what HTML transform applies to non-image content.
- Whether a one-shot bootstrap script (creates the `docs` collection + sets anon caps) ships in the repo, or is run via MCP once and never automated.

## `own.domain.com` clarification

Per the earlier discussion, the `docs.google.com → own.domain.com` rewrite is interpreted as "the canonical URL shown to humans for a doc is no longer a Google Docs URL — it's whatever the user surfaces from this aliswa server (e.g. `localhost:3000/?src=<doc_id>` or whatever reverse-proxied domain the user puts in front)." There is no automatic domain rewrite at the data layer. The doc record stores only `doc_id`; how the user wraps it in a URL is presentation, not persistence. Out of scope for this spec.
