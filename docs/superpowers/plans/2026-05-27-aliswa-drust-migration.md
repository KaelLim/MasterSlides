# Aliswa → Drust Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace aliswa's filesystem persistence (`aliswa/data/`) with the Drust BaaS tenant `docs`. The Bun server keeps its current API surface and continues to fetch Google Docs and serve the WebSocket room; only the storage layer changes.

**Architecture:** Bun server holds the service-key credential and talks to Drust REST for collection records, plus Drust's multipart files endpoint for image bytes. Frontend continues to call `/api/fetch-doc` and `/api/docs/:id` against the Bun server and never sees Drust. Same Google Doc id overwrites the existing record and reclaims its old image files.

**Tech Stack:** Bun (HTTP + native `fetch` + `FormData`), TypeScript, Drust REST (multi-tenant SQLite BaaS at `tool.tzuchi-org.tw`), `marked` for markdown.

**Reference spec:** `docs/superpowers/specs/2026-05-27-aliswa-drust-migration-design.md`

---

## Drust REST reference (verified)

These paths and shapes have been verified against the live tenant. Use them as-is in Task 3.

| Operation | Method | Path (under `${BASE}/drust/t/${TENANT}`) | Body | Response |
|---|---|---|---|---|
| **List records** | `POST` | `/collections/<name>/list` | `{ filter?: {field: value}, per_page?: number, page?: number, sort?: {field, dir}, select?: string[] }` | `{ records: [...], total, page, perPage }` |
| **Insert record** | `POST` | `/records/<name>` | `{ data: {…} }` | `{ id, record: {…with auto id/created_at/updated_at} }` |
| **Update record (partial)** | `PATCH` | `/records/<name>/<id>` | `{ data: {…partial set} }` | 200 with `{record:…}` |
| **Delete record** | `DELETE` | `/records/<name>/<id>` | — | 204 |
| **Get record** | `GET` | `/records/<name>/<id>` | — | `{ record: {…} }` |
| **Upload file** | `POST` | `/files` (multipart) | `file=<bytes>` + `visibility=public` | `{ id, key, url, bytes }` — `url` is the public URL |
| **Delete file** | `DELETE` | `/files/<id>` | — | 200/204 |

**Filter shape note:** Use the MCP-style leaf `{field: value}` (equality shorthand) or `{field: {op: value}}` for other operators. The OpenAPI `FilterAst` shape (with explicit `op/field/value`) was rejected by the live server.

**Public file URL pattern:** `https://tool.tzuchi-org.tw/public/<tenant>/<file_id>` — the upload response's `url` field already contains this. Do not compose it manually; just store and reuse `response.url`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `aliswa/server/lib/drust.ts` | **create** | Env-bound REST client: service-token fetch wrapper, doc lookup/insert/update/delete, image upload/delete. |
| `aliswa/server/lib/storage.ts` | **rewrite** | High-level storage (`upsertDoc`, `getDocHtml`) on top of `drust.ts`. Drops all `fs` / `Bun.file` / `Bun.write` code. |
| `aliswa/server/lib/convert.ts` | **modify** | `processImages` uploads bytes to Drust instead of fs; emits `image_ids` and `image_url`-rewritten markdown. |
| `aliswa/server/lib/google-docs.ts` | unchanged | |
| `aliswa/server/routes/docs.ts` | **modify** | `handleFetchDoc` orchestrates the new flow; `handleGetDoc` reads from Drust. Drop `handleListDocs` and the `GET /api/docs` (no id) route. |
| `aliswa/server/routes/ws.ts` | unchanged | |
| `aliswa/server/index.ts` | **modify** | Validate three env vars at boot; remove `/data/*` static route and `DATA_DIR`. |
| `aliswa/.env.example` | **create** | Documents the three required env vars. |
| `aliswa/.gitignore` | **modify** | Add `.env`. |
| `aliswa/data/` | abandoned | Left in place, gitignored, unreachable after `/data/*` route removal. |

---

## Task 1: Create the `docs` collection in Drust

**Why:** Drust tenant is empty; we need the collection before any code can write to it. One-shot setup via MCP tools (not part of the repo).

**Files:** None in repo. Uses MCP `create_collection` and `set_anon_caps`.

- [ ] **Step 1: Create the collection**

Call MCP `create_collection`:

```json
{
  "name": "docs",
  "description": "Aliswa converted Google Docs slides. doc_id = Google Doc id, html = rendered <article>, image_ids = JSON array of Drust file ids used by this doc (for cleanup on re-import).",
  "fields": [
    { "name": "doc_id",    "sql_type": "text", "nullable": false, "unique": true,  "description": "Google Doc id (the bit after /document/d/)." },
    { "name": "title",     "sql_type": "text", "nullable": true,  "unique": false, "description": "Display title, falls back to doc_id." },
    { "name": "html",      "sql_type": "text", "nullable": true,  "unique": false, "description": "Rendered <article class=\"slide-content\"> HTML." },
    { "name": "image_ids", "sql_type": "json", "nullable": true,  "unique": false, "description": "Array of Drust file ids referenced by html, for cleanup on overwrite." }
  ]
}
```

- [ ] **Step 2: Lock anon access**

Call MCP `set_anon_caps({ collection: "docs", caps: [] })`. Anon role can neither read nor write `docs`; only the Bun server with the service token will touch it.

- [ ] **Step 3: Verify**

Call MCP `describe_collection({ name: "docs" })`. Expected: four declared fields plus auto `id`/`created_at`/`updated_at`, `unique: true` on `doc_id`, `anon_caps: []`.

No commit (out of repo).

---

## Task 2: Env config and `.gitignore` update

**Why:** Bun reads `.env` automatically. We document the required vars and prevent the real `.env` from being committed.

**Files:**
- Create: `aliswa/.env.example`
- Modify: `aliswa/.gitignore`

- [ ] **Step 1: Create `aliswa/.env.example`**

```env
# Drust backend (https://tool.tzuchi-org.tw)
DRUST_BASE_URL=https://tool.tzuchi-org.tw
DRUST_TENANT_ID=1e195719-6106-4644-85d1-0eee7d135026
DRUST_SERVICE_TOKEN=drust_REPLACE_ME

# Optional: server port (defaults to 3000)
# PORT=3000
```

- [ ] **Step 2: Append `.env` to `aliswa/.gitignore`**

Current contents:

```
node_modules/
data/
public/dist/
```

Edit to:

```
node_modules/
data/
public/dist/
.env
```

- [ ] **Step 3: Create the local `.env`**

```bash
cd aliswa
cp .env.example .env
```

Then edit `aliswa/.env` and set `DRUST_SERVICE_TOKEN=drust_E8p6mi6XzYkREnyu7Kr07ql-ju_7IzXIFxHdmdDcX2c`. Do NOT commit `.env`.

- [ ] **Step 4: Verify `.env` is gitignored**

```bash
cd /Users/kaellim/Desktop/projects/slides
git check-ignore -v aliswa/.env
```

Expected: prints `aliswa/.gitignore:4:.env\taliswa/.env`.

- [ ] **Step 5: Commit `.env.example` and `.gitignore`**

```bash
git add aliswa/.env.example aliswa/.gitignore
git commit -m "$(cat <<'EOF'
chore(aliswa): add Drust env config template

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Drust REST client module

**Why:** Centralise REST paths and the service-token header. Everything else calls in by intent (`findDocByDocId`, `uploadImage`, …) so the URL strings live in exactly one place.

**Files:**
- Create: `aliswa/server/lib/drust.ts`
- Create: `aliswa/server/lib/drust.test.ts`

- [ ] **Step 1: Create `aliswa/server/lib/drust.ts` — env-bound fetch wrapper**

```typescript
const BASE   = process.env.DRUST_BASE_URL;
const TENANT = process.env.DRUST_TENANT_ID;
const TOKEN  = process.env.DRUST_SERVICE_TOKEN;

if (!BASE || !TENANT || !TOKEN) {
  throw new Error("DRUST_BASE_URL / DRUST_TENANT_ID / DRUST_SERVICE_TOKEN must be set");
}

const TENANT_BASE = `${BASE}/drust/t/${TENANT}`;
const AUTH = { Authorization: `Bearer ${TOKEN}` };

async function drustFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${TENANT_BASE}${path}`, {
    ...init,
    headers: { ...AUTH, ...(init.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Drust ${init.method || "GET"} ${path} → ${res.status}: ${body}`);
  }
  return res;
}

async function drustJson<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  return (await drustFetch(path, init)).json() as Promise<T>;
}
```

- [ ] **Step 2: Append doc record + field types**

```typescript
export interface DocRecord {
  id: number;
  doc_id: string;
  title: string | null;
  html: string | null;
  image_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface DocFields {
  doc_id: string;
  title: string | null;
  html: string;
  image_ids: string[];
}

export interface UploadedFile {
  id: string;
  public_url: string;
}
```

- [ ] **Step 3: Append `findDocByDocId`**

```typescript
export async function findDocByDocId(docId: string): Promise<DocRecord | null> {
  const res = await drustJson<{ records: DocRecord[] }>(
    `/collections/docs/list`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filter: { doc_id: docId }, per_page: 1 }),
    }
  );
  return res.records[0] ?? null;
}
```

- [ ] **Step 4: Append `insertDoc`, `updateDoc`, `deleteDoc`**

```typescript
export async function insertDoc(data: DocFields): Promise<DocRecord> {
  const res = await drustJson<{ id: number; record: DocRecord }>(
    `/records/docs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    }
  );
  return res.record;
}

export async function updateDoc(
  id: number,
  data: Partial<Pick<DocFields, "title" | "html" | "image_ids">>
): Promise<void> {
  await drustFetch(`/records/docs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
}

export async function deleteDoc(id: number): Promise<void> {
  await drustFetch(`/records/docs/${id}`, { method: "DELETE" });
}
```

- [ ] **Step 5: Append `uploadImage` and `deleteImage`**

```typescript
export async function uploadImage(
  bytes: Uint8Array,
  filename: string,
  contentType: string
): Promise<UploadedFile> {
  const form = new FormData();
  // `bytes as BlobPart` works around TS6 strict typing of Uint8Array<ArrayBufferLike>
  form.append("file", new Blob([bytes as BlobPart], { type: contentType }), filename);
  form.append("visibility", "public");

  const res = await drustJson<{ id: string; url: string }>(`/files`, {
    method: "POST",
    body: form,
  });
  return { id: res.id, public_url: res.url };
}

export async function deleteImage(fileId: string): Promise<void> {
  try {
    await drustFetch(`/files/${fileId}`, { method: "DELETE" });
  } catch (err: any) {
    // 404 means already gone — tolerate
    if (!/→ 404/.test(err.message)) throw err;
  }
}
```

- [ ] **Step 6: Create `aliswa/server/lib/drust.test.ts` — smoke tests**

```typescript
import { test, expect } from "bun:test";
import {
  findDocByDocId,
  insertDoc,
  updateDoc,
  deleteDoc,
  uploadImage,
  deleteImage,
} from "./drust";

test("findDocByDocId returns null when nothing matches", async () => {
  const result = await findDocByDocId("__nonexistent_" + Date.now());
  expect(result).toBeNull();
});

test("doc record round-trip: insert → find → update → delete", async () => {
  const docId = "__roundtrip_" + Date.now();
  const inserted = await insertDoc({
    doc_id: docId,
    title: "round-trip",
    html: "<p>v1</p>",
    image_ids: [],
  });
  expect(inserted.doc_id).toBe(docId);
  expect(inserted.id).toBeGreaterThan(0);

  const found = await findDocByDocId(docId);
  expect(found?.id).toBe(inserted.id);

  await updateDoc(inserted.id, { title: "updated", html: "<p>v2</p>" });
  const refetched = await findDocByDocId(docId);
  expect(refetched?.title).toBe("updated");
  expect(refetched?.html).toBe("<p>v2</p>");

  await deleteDoc(inserted.id);
  const afterDelete = await findDocByDocId(docId);
  expect(afterDelete).toBeNull();
});

test("image upload + public fetch + delete", async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic
  const f = await uploadImage(bytes, "probe.png", "image/png");
  expect(f.id).toMatch(/[0-9a-f-]{36}/i);
  expect(f.public_url).toMatch(/^https?:\/\//);

  const fetched = await fetch(f.public_url);
  expect(fetched.ok).toBe(true);

  await deleteImage(f.id);
  const after = await fetch(f.public_url);
  expect(after.status).toBe(404);
});
```

- [ ] **Step 7: Run the tests**

```bash
cd aliswa && bun test server/lib/drust.test.ts
```

Expected: 3 pass. Each test cleans up after itself.

If a test fails:
- Token / env error → check `aliswa/.env` matches what Task 2 set
- 404 on insert/update → verify Task 1 ran (collection `docs` exists)
- 404 on public URL fetch — could be slight propagation delay; retry once. If still failing, file delete may have raced; not our bug.

- [ ] **Step 8: Type-check**

```bash
cd aliswa && bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/kaellim/Desktop/projects/slides
git add aliswa/server/lib/drust.ts aliswa/server/lib/drust.test.ts
git commit -m "$(cat <<'EOF'
feat(aliswa): Drust REST client (collections + files)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Rewrite `convert.ts` to upload images to Drust

**Why:** The image branch is the only part of conversion that touches storage; everything else stays.

**Files:**
- Modify (full rewrite): `aliswa/server/lib/convert.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
import { marked } from "marked";
import { uploadImage } from "./drust";

export interface ConvertResult {
  html: string;
  imageCount: number;
  imageIds: string[];
}

export async function processImages(
  markdown: string
): Promise<{ markdown: string; imageCount: number; imageIds: string[] }> {
  const lines = markdown.split("\n");
  const processedLines: string[] = [];
  const imageIds: string[] = [];
  let imageCount = 0;

  for (const line of lines) {
    // Skip "分頁 N" markers
    if (/^#*\s*分頁\s*\d+\s*$/.test(line.trim())) {
      continue;
    }

    // Match image reference definitions: [image1]: <data:image/...;base64,...>
    const refMatch = line.match(
      /^\[([^\]]+)\]:\s*<data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)>$/
    );

    if (refMatch) {
      const [, refName, format, base64Data] = refMatch;
      imageCount++;

      const ext = format === "jpeg" ? "jpg" : format;
      const filename = `img_${imageCount}.${ext}`;
      const contentType = `image/${format === "jpg" ? "jpeg" : format}`;
      const cleanBase64 = base64Data.replace(/[\r\n\s]/g, "");

      try {
        const binary = atob(cleanBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const uploaded = await uploadImage(bytes, filename, contentType);
        imageIds.push(uploaded.id);
        processedLines.push(`[${refName}]: ${uploaded.public_url}`);
      } catch (err) {
        console.error(`Image upload failed for ${refName}:`, err);
        processedLines.push(line);
      }
    } else {
      processedLines.push(line);
    }
  }

  return { markdown: processedLines.join("\n"), imageCount, imageIds };
}

function cleanImageStyles(html: string): string {
  return html.replace(/<img([^>]*)\s+style="[^"]*"([^>]*)>/gi, "<img$1$2>");
}

export async function convertDocument(markdown: string): Promise<ConvertResult> {
  const { markdown: processed, imageCount, imageIds } = await processImages(markdown);

  marked.setOptions({ breaks: true, gfm: true });
  const rawHtml = marked.parse(processed) as string;
  const cleanHtml = cleanImageStyles(rawHtml);
  const html = `<article class="slide-content">\n${cleanHtml}\n</article>`;

  return { html, imageCount, imageIds };
}
```

Notes:
- `convertDocument` no longer takes `docId` — image URLs are absolute Drust URLs so the doc id is no longer needed for namespacing.
- The `import { writeImage }` from `./storage` is gone.

- [ ] **Step 2: Type-check**

```bash
cd aliswa && bunx tsc --noEmit
```

Expected: `convert.ts` is clean. Other files (`storage.ts`, `routes/docs.ts`) may still error against the old `writeImage` import — those get fixed in Tasks 5/6.

- [ ] **Step 3: Commit**

```bash
cd /Users/kaellim/Desktop/projects/slides
git add aliswa/server/lib/convert.ts
git commit -m "$(cat <<'EOF'
feat(aliswa): upload extracted images to Drust files in convert

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Rewrite `storage.ts` to use Drust

**Why:** Replace every filesystem touchpoint with a Drust-backed equivalent. `upsertDoc` handles same-id overwrites including image cleanup.

**Files:**
- Modify (full rewrite): `aliswa/server/lib/storage.ts`
- Create: `aliswa/server/lib/storage.test.ts`

- [ ] **Step 1: Replace `storage.ts` contents**

```typescript
import {
  findDocByDocId,
  insertDoc,
  updateDoc,
  deleteImage,
  type DocRecord,
} from "./drust";

export interface UpsertDocInput {
  doc_id: string;
  title: string | null;
  html: string;
  image_ids: string[];
}

export async function upsertDoc(input: UpsertDocInput): Promise<DocRecord> {
  const existing = await findDocByDocId(input.doc_id);

  if (existing) {
    // Best-effort delete of old images. Orphans are tolerated (logged, not thrown).
    for (const oldId of existing.image_ids ?? []) {
      try {
        await deleteImage(oldId);
      } catch (err) {
        console.warn(`[storage] failed to delete old image ${oldId}:`, err);
      }
    }
    await updateDoc(existing.id, {
      title: input.title,
      html: input.html,
      image_ids: input.image_ids,
    });
    // Re-fetch to return the updated record (PUT returns no body).
    const refreshed = await findDocByDocId(input.doc_id);
    if (!refreshed) throw new Error(`[storage] record vanished after update: ${input.doc_id}`);
    return refreshed;
  }

  return insertDoc(input);
}

export async function getDocHtml(docId: string): Promise<string | null> {
  const record = await findDocByDocId(docId);
  if (!record || !record.html) return null;
  return record.html;
}
```

Notes:
- Everything else from the old `storage.ts` (`DocMeta`, `docDir`, `imagesDir`, `ensureDocDir`, `readMeta`, `writeMeta`, `nextVersion`, `readDocHtml`, `writeDocHtml`, `writeImage`, `listDocs`, `resolveDataPath`) is **removed**. None of it has callers after Tasks 4 and 6.

- [ ] **Step 2: Create `aliswa/server/lib/storage.test.ts`**

```typescript
import { test, expect } from "bun:test";
import { upsertDoc, getDocHtml } from "./storage";
import { findDocByDocId, deleteDoc, uploadImage } from "./drust";

test("upsertDoc inserts on first call, updates and cleans old images on second", async () => {
  const docId = "__upsert_" + Date.now();

  // First call — insert
  const img1 = await uploadImage(new Uint8Array([1, 2, 3]), "a.png", "image/png");
  const r1 = await upsertDoc({
    doc_id: docId,
    title: "v1",
    html: "<p>v1</p>",
    image_ids: [img1.id],
  });
  expect(r1.doc_id).toBe(docId);
  expect(r1.title).toBe("v1");

  // Second call — update; old image must be deleted
  const img2 = await uploadImage(new Uint8Array([4, 5, 6]), "b.png", "image/png");
  const r2 = await upsertDoc({
    doc_id: docId,
    title: "v2",
    html: "<p>v2</p>",
    image_ids: [img2.id],
  });
  expect(r2.id).toBe(r1.id);
  expect(r2.title).toBe("v2");

  const html = await getDocHtml(docId);
  expect(html).toBe("<p>v2</p>");

  const img1Check = await fetch(img1.public_url);
  expect(img1Check.status).toBe(404);

  const img2Check = await fetch(img2.public_url);
  expect(img2Check.ok).toBe(true);

  // Cleanup
  const final = await findDocByDocId(docId);
  if (final) await deleteDoc(final.id);
});

test("getDocHtml returns null for unknown doc", async () => {
  const result = await getDocHtml("__nonexistent_" + Date.now());
  expect(result).toBeNull();
});
```

- [ ] **Step 3: Run tests**

```bash
cd aliswa && bun test server/lib/storage.test.ts
```

Expected: 2 pass.

- [ ] **Step 4: Type-check**

```bash
cd aliswa && bunx tsc --noEmit
```

Expected: `storage.ts` clean. `routes/docs.ts` still complains; fixed in Task 6.

- [ ] **Step 5: Commit**

```bash
cd /Users/kaellim/Desktop/projects/slides
git add aliswa/server/lib/storage.ts aliswa/server/lib/storage.test.ts
git commit -m "$(cat <<'EOF'
feat(aliswa): storage.ts upserts to Drust + cleans old image files

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update `routes/docs.ts`

**Why:** Wire the routes to the new storage; remove the unused list endpoint.

**Files:**
- Modify (full rewrite): `aliswa/server/routes/docs.ts`

- [ ] **Step 1: Replace `routes/docs.ts` contents**

```typescript
import { extractDocId, fetchMarkdown } from "../lib/google-docs.ts";
import { convertDocument } from "../lib/convert.ts";
import { upsertDoc, getDocHtml } from "../lib/storage.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export async function handleFetchDoc(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { url, title } = body as { url?: string; title?: string };

    if (!url) {
      return json({ success: false, error: "請提供 Google Docs URL" }, 400);
    }

    const docId = extractDocId(url);
    if (!docId) {
      return json({ success: false, error: "無效的 Google Docs URL" }, 400);
    }

    const markdown = await fetchMarkdown(docId);
    const { html, imageCount, imageIds } = await convertDocument(markdown);

    await upsertDoc({
      doc_id: docId,
      title: title ?? docId,
      html,
      image_ids: imageIds,
    });

    return json({ success: true, doc_id: docId, images: imageCount });
  } catch (err: any) {
    console.error("fetch-doc error:", err);
    return json({ success: false, error: err.message }, 500);
  }
}

export async function handleGetDoc(docId: string): Promise<Response> {
  const html = await getDocHtml(docId);
  if (!html) {
    return json({ error: "找不到文件" }, 404);
  }
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function handleDocs(url: URL): Promise<Response> {
  const match = url.pathname.match(/^\/api\/docs\/([a-zA-Z0-9_-]+)$/);
  if (match) {
    return handleGetDoc(match[1]);
  }
  return json({ error: "Not found" }, 404);
}
```

Notes:
- `handleListDocs` and the `GET /api/docs` (no id) branch are gone.
- `title` falls back to `docId` (not to any persisted meta, because there's no version concept anymore).

- [ ] **Step 2: Type-check the whole tree**

```bash
cd aliswa && bunx tsc --noEmit
```

Expected: no errors anywhere.

- [ ] **Step 3: Commit**

```bash
cd /Users/kaellim/Desktop/projects/slides
git add aliswa/server/routes/docs.ts
git commit -m "$(cat <<'EOF'
refactor(aliswa): routes/docs.ts uses Drust storage, drops list endpoint

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update `server/index.ts`

**Why:** Drop the `/data/*` static route (Drust serves images now), and fail fast at boot if Drust env vars are missing.

**Files:**
- Modify: `aliswa/server/index.ts`

- [ ] **Step 1: Add env-validation at the top of the file**

Insert right after the three existing imports (after the line `import { wsHandler } from "./routes/ws.ts";`):

```typescript
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[boot] missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

requireEnv("DRUST_BASE_URL");
requireEnv("DRUST_TENANT_ID");
requireEnv("DRUST_SERVICE_TOKEN");
```

- [ ] **Step 2: Remove the `/data/*` static-route branch**

Find this block (currently lines 41-44):

```typescript
  // /data/* → data directory (converted docs + images)
  if (pathname.startsWith("/data/")) {
    return serveFile(join(DATA_DIR, pathname.replace(/^\/data\//, "")));
  }
```

Delete the whole block.

- [ ] **Step 3: Remove the now-unused `DATA_DIR` constant**

Find at the top of the file (currently line 8):

```typescript
const DATA_DIR = join(import.meta.dir, "../data");
```

Delete it.

- [ ] **Step 4: Type-check**

```bash
cd aliswa && bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify boot with env present**

```bash
cd aliswa && bun run start &
SERVER_PID=$!
sleep 1
curl -sSI http://localhost:3000/slides.html | head -3
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null
```

Expected: `HTTP/1.1 200 OK` for slides.html. Background process exits cleanly.

- [ ] **Step 6: Verify boot fails fast with missing env**

```bash
cd aliswa && DRUST_SERVICE_TOKEN= bun run start
```

Expected: prints `[boot] missing required env var: DRUST_SERVICE_TOKEN` and exits with code 1. Capture the exit code with `echo $?` immediately after.

- [ ] **Step 7: Commit**

```bash
cd /Users/kaellim/Desktop/projects/slides
git add aliswa/server/index.ts
git commit -m "$(cat <<'EOF'
refactor(aliswa): require Drust env vars at boot, drop /data/* route

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: End-to-end integration test

**Why:** Verify the whole flow from a real Google Doc through to the rendered HTML, including overwrite semantics.

**Files:** None (terminal-only verification). Pick a Google Doc id you control and that contains at least one image; the spec example was `12EuRx…`.

- [ ] **Step 1: Start the server in dev mode**

```bash
cd aliswa && bun run dev
```

Expected: `Aliswa server running at http://localhost:3000`. Leave this terminal running.

- [ ] **Step 2: POST a Google Doc URL**

In a new terminal:

```bash
DOC_URL='https://docs.google.com/document/d/<YOUR_DOC_ID>/edit'
curl -sS -X POST -H "Content-Type: application/json" \
  -d "{\"url\":\"$DOC_URL\",\"title\":\"smoke test\"}" \
  http://localhost:3000/api/fetch-doc
```

Expected: `{"success":true,"doc_id":"<YOUR_DOC_ID>","images":<N>}`

- [ ] **Step 3: GET the rendered doc**

```bash
DOC_ID='<YOUR_DOC_ID>'
curl -sS "http://localhost:3000/api/docs/$DOC_ID" | head -40
```

Expected: starts with `<article class="slide-content">`. Image `src` attributes should look like `https://tool.tzuchi-org.tw/public/1e195719-…/...`.

- [ ] **Step 4: Verify images are publicly fetchable**

Copy one `src="..."` from the HTML and:

```bash
curl -sSI '<IMAGE_URL>' | head -5
```

Expected: `HTTP/2 200` with `Content-Type: image/...`.

- [ ] **Step 5: Re-POST to verify overwrite + cleanup**

```bash
curl -sS -X POST -H "Content-Type: application/json" \
  -d "{\"url\":\"$DOC_URL\",\"title\":\"smoke test v2\"}" \
  http://localhost:3000/api/fetch-doc
```

Expected: `success:true`, same `doc_id`.

Then re-check the OLD image URL from Step 3:

```bash
curl -sSI '<OLD_IMAGE_URL>' | head -1
```

Expected: `HTTP/2 404`.

- [ ] **Step 6: View in browser**

Open `http://localhost:3000/?src=<YOUR_DOC_ID>`.

Expected: slides render, images visible, pretext pagination works (paging, font scaling, vertical/horizontal switch). WebSocket remote modal still opens via the remote button.

- [ ] **Step 7: Test missing-doc 404**

```bash
curl -sSI 'http://localhost:3000/api/docs/__definitely_not_a_real_doc__' | head -1
```

Expected: `HTTP/1.1 404`.

- [ ] **Step 8: Stop the server**

Ctrl-C in the `bun run dev` terminal.

No commit — this task is verification only.

---

## Task 9: Update CLAUDE.md

**Why:** The repo's CLAUDE.md describes aliswa's storage as "local filesystem at `aliswa/data/`". After this migration that's wrong, and the Commands block omits the `.env` step.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Aliswa storage bullet**

Find this line in `CLAUDE.md` (under "Aliswa (Alternate Backend)" → "Key differences from the main stack"):

```markdown
- **Storage**: local filesystem at `aliswa/data/<doc_id>/` (gitignored) replaces Supabase Storage.
```

Replace with:

```markdown
- **Storage**: Drust BaaS tenant `docs` at `tool.tzuchi-org.tw`. The `docs` collection holds one record per Google Doc id (HTML inline); extracted images go to Drust public files (`https://tool.tzuchi-org.tw/public/<tenant>/<file_id>`). Requires `DRUST_BASE_URL` / `DRUST_TENANT_ID` / `DRUST_SERVICE_TOKEN` in `aliswa/.env` (see `aliswa/.env.example`). Same `doc_id` overwrites; old image files are reclaimed automatically.
```

- [ ] **Step 2: Update the Aliswa commands block**

Find this in the `## Commands` section:

```bash
# Aliswa (standalone Bun server) — runs at :3000
cd aliswa
bun install                  # one-time (requires sibling ../../pretext-source/)
bun run dev                  # watch mode
bun run start                # plain run
bun run build                # bundle public/js/app.js → public/dist/
```

Replace with:

```bash
# Aliswa (standalone Bun server) — runs at :3000
cd aliswa
cp .env.example .env         # one-time: fill in DRUST_SERVICE_TOKEN
bun install                  # one-time (requires sibling ../../pretext-source/)
bun run dev                  # watch mode
bun run start                # plain run
bun run build                # bundle public/js/app.js → public/dist/
```

- [ ] **Step 3: Commit**

```bash
cd /Users/kaellim/Desktop/projects/slides
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: update CLAUDE.md for aliswa Drust migration

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Done

After Task 9:
- `aliswa/server/` reads from and writes to Drust; no filesystem persistence remains.
- `aliswa/data/` is dormant (gitignored, no route serves it).
- The frontend API surface is unchanged (`POST /api/fetch-doc`, `GET /api/docs/:id`, `WS /ws/:room`).
- Re-importing the same Google Doc id overwrites the record and reclaims its old image files.
- Env-var misconfiguration fails fast at server boot.
