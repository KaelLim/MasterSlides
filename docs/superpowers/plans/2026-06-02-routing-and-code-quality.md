# Routing Reshuffle + Code-Quality Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `/` to the admin dashboard, relocate the viewer to `/slides/`, split four oversized files (`app.js`, `slides.css`, `remote.html`, `admin.ts`) into single-responsibility modules, delete the dead `public/js/slides/` scaffolding, and add four missing test files.

**Architecture:** Build the new tree (`public/slides/`, `public/remote/`, `server/lib/admin/`) side-by-side with the existing code. Each task is one atomic commit and leaves the codebase compilable + functional. Routing flips at Phase 6; the old tree is deleted at Phase 7. Tests come first as a safety net for the refactor.

**Tech Stack:** Bun (local dev), Cloudflare Pages + Pages Functions (prod), Drust BaaS, TypeScript + JavaScript ESM, html2canvas, QRCode.js. `bun test` runs against the live Drust tenant with `__test_` row prefixes.

**Source spec:** `docs/superpowers/specs/2026-06-02-routing-and-code-quality-design.md`

---

## Phase 1 — Add Missing Tests (Safety Net)

### Task 1: `convert.test.ts` — extractTitle + image extraction

**Files:**
- Create: `server/lib/convert.test.ts`
- Reference: `server/lib/convert.ts` (existing)

- [ ] **Step 1: Read the existing convert.ts to see exports**

Run: `grep -n "^export\|^function extractTitle\|^function convertDocument" server/lib/convert.ts`
Expected: shows `extractTitle` and `convertDocument` exist.

- [ ] **Step 2: Write the test file**

Create `server/lib/convert.test.ts`:

```ts
import { test, expect } from "bun:test";
import { extractTitle } from "./convert";

test("extractTitle: takes the first H1", () => {
  expect(extractTitle("# Hello\n## World\nbody")).toBe("Hello");
});

test("extractTitle: trims trailing # marks and whitespace", () => {
  expect(extractTitle("#   Hello   ###  \nbody")).toBe("Hello");
});

test("extractTitle: returns null when no H1 present", () => {
  expect(extractTitle("## H2 only\nbody")).toBeNull();
  expect(extractTitle("plain text only")).toBeNull();
});

test("extractTitle: ignores '# ' inside fenced code blocks", () => {
  const md = "```\n# not a heading\n```\n# Real Title\nbody";
  expect(extractTitle(md)).toBe("Real Title");
});

test("extractTitle: ignores leading blank lines", () => {
  expect(extractTitle("\n\n\n# Hello\nbody")).toBe("Hello");
});
```

- [ ] **Step 3: Run the test**

Run: `bun test server/lib/convert.test.ts`
Expected: all 5 tests pass. If `extractTitle` doesn't yet handle fenced code blocks, fix `convert.ts` to skip lines inside ``` fences before scanning for H1.

- [ ] **Step 4: Commit**

```bash
git add server/lib/convert.test.ts server/lib/convert.ts
git commit -m "test(convert): cover extractTitle edge cases"
```

---

### Task 2: `storage.test.ts` — image reclaim on overwrite

**Files:**
- Modify: `server/lib/storage.test.ts`
- Reference: `server/lib/storage.ts:upsertDoc`, `server/lib/drust.ts:deleteImage`

- [ ] **Step 1: Read existing storage.test.ts to match its pattern**

Run: `cat server/lib/storage.test.ts`
Expected: shows `__upsert_*` prefix pattern and afterAll cleanup.

- [ ] **Step 2: Append the reclaim test**

Append to `server/lib/storage.test.ts`:

```ts
import { findDocByDocId } from "./drust";

test("upsertDoc: same doc_id overwrites and reclaims orphaned image_ids", async () => {
  const docId = `__upsert_reclaim_${Date.now()}`;

  // V1 with two fake image ids
  await upsertDoc({
    doc_id: docId,
    title: "v1",
    html: "<p>v1</p>",
    image_ids: ["__test_img_a", "__test_img_b"],
  });
  const v1 = await findDocByDocId(docId);
  expect(v1?.image_ids).toEqual(["__test_img_a", "__test_img_b"]);

  // V2 keeps b, drops a, adds c
  await upsertDoc({
    doc_id: docId,
    title: "v2",
    html: "<p>v2</p>",
    image_ids: ["__test_img_b", "__test_img_c"],
  });
  const v2 = await findDocByDocId(docId);
  expect(v2?.image_ids).toEqual(["__test_img_b", "__test_img_c"]);
  expect(v2?.html).toBe("<p>v2</p>");
  expect(v2?.title).toBe("v2");
});
```

Note: the test uses fake `__test_img_*` ids — `upsertDoc`'s reclaim logic will issue a DELETE to Drust files for the orphaned `__test_img_a`. Drust returns 404 for unknown ids; `upsertDoc` already tolerates this (matches the `console.warn` pattern in `handleDocDelete`).

- [ ] **Step 3: Run the test**

Run: `bun test server/lib/storage.test.ts`
Expected: previously-passing tests + the new reclaim test pass.

- [ ] **Step 4: Commit**

```bash
git add server/lib/storage.test.ts
git commit -m "test(storage): cover upsertDoc image reclaim on overwrite"
```

---

### Task 3: `admin/auth.test.ts` — login, logout, me, session

**Files:**
- Create: `server/lib/admin/` (directory)
- Create: `server/lib/admin/auth.test.ts`
- Reference: `server/routes/admin.ts:handleLogin/Logout/Me`, `server/lib/auth.ts`

- [ ] **Step 1: Create directory and the test file**

Create `server/lib/admin/auth.test.ts`:

```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { createAdminUser, loginToDrust } from "../auth";
import { handleLogin, handleLogout, handleMe } from "../../routes/admin";

const TEST_EMAIL = `__test_auth_${Date.now()}@example.com`;
const TEST_PASSWORD = "test-password-12345";

beforeAll(async () => {
  const r = await createAdminUser(TEST_EMAIL, TEST_PASSWORD);
  if ("error" in r) throw new Error(`setup failed: ${r.error}`);
});

afterAll(async () => {
  // Drust doesn't expose a delete-user API for service tokens; rely on
  // tenant rotation for cleanup. Test users are tagged with __test_ so
  // they're easy to filter out in dashboards.
});

function makeRequest(body: object, cookieToken?: string): Request {
  return new Request("http://localhost/api/admin/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieToken ? { Cookie: `slides_admin_session=${cookieToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("login: rejects bad credentials with 401", async () => {
  const res = await handleLogin(
    makeRequest({ email: TEST_EMAIL, password: "wrong-password" }),
  );
  expect(res.status).toBe(401);
  expect(res.headers.get("Set-Cookie")).toBeNull();
});

test("login: accepts good credentials, sets HttpOnly cookie", async () => {
  const res = await handleLogin(
    makeRequest({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  );
  expect(res.status).toBe(200);
  const cookie = res.headers.get("Set-Cookie") || "";
  expect(cookie).toContain("slides_admin_session=");
  expect(cookie).toContain("HttpOnly");
  // No Secure attribute on http origins (test uses http://localhost)
  expect(cookie).not.toContain("Secure");
});

test("me: returns 401 without cookie", async () => {
  const req = new Request("http://localhost/api/admin/me", { method: "GET" });
  const res = await handleMe(req);
  expect(res.status).toBe(401);
});

test("me: returns user with valid cookie", async () => {
  const login = await loginToDrust(TEST_EMAIL, TEST_PASSWORD);
  if ("error" in login) throw new Error(`login failed: ${login.error}`);

  const req = new Request("http://localhost/api/admin/me", {
    method: "GET",
    headers: { Cookie: `slides_admin_session=${login.token}` },
  });
  const res = await handleMe(req);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.user.email).toBe(TEST_EMAIL);
});

test("logout: clears cookie", async () => {
  const req = new Request("http://localhost/api/admin/logout", {
    method: "POST",
    headers: { Cookie: "slides_admin_session=anything" },
  });
  const res = await handleLogout(req);
  const cookie = res.headers.get("Set-Cookie") || "";
  expect(cookie).toMatch(/Max-Age=0|Expires=/);
});
```

- [ ] **Step 2: Run the tests**

Run: `bun test server/lib/admin/auth.test.ts`
Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/lib/admin/auth.test.ts
git commit -m "test(admin): cover login/logout/me session flow"
```

---

### Task 4: `admin/playlists.test.ts` — CRUD + public read

**Files:**
- Create: `server/lib/admin/playlists.test.ts`

- [ ] **Step 1: Write the test file**

Create `server/lib/admin/playlists.test.ts`:

```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { createAdminUser, loginToDrust } from "../auth";
import { deletePlaylist, listAllPlaylists } from "../drust";
import {
  handlePlaylistCreate,
  handlePlaylistGet,
  handlePlaylistPatch,
  handlePlaylistDelete,
  handlePublicPlaylistGet,
  handlePlaylistsList,
} from "../../routes/admin";

const TEST_EMAIL = `__test_pl_${Date.now()}@example.com`;
const TEST_PASSWORD = "test-password-12345";
let cookieToken = "";

beforeAll(async () => {
  await createAdminUser(TEST_EMAIL, TEST_PASSWORD);
  const r = await loginToDrust(TEST_EMAIL, TEST_PASSWORD);
  if ("error" in r) throw new Error(`login failed: ${r.error}`);
  cookieToken = r.token;
});

afterAll(async () => {
  const all = await listAllPlaylists();
  for (const p of all) {
    if (p.title.startsWith("__test_pl_")) await deletePlaylist(p.id);
  }
});

function req(method: string, path: string, body?: object, auth = true): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Cookie: `slides_admin_session=${cookieToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("create: 401 without auth cookie", async () => {
  const res = await handlePlaylistCreate(
    req("POST", "/api/admin/playlists", { title: "__test_pl_x", doc_ids: [] }, false),
  );
  expect(res.status).toBe(401);
});

test("create + get: round-trips title, doc_ids, is_public", async () => {
  const createRes = await handlePlaylistCreate(
    req("POST", "/api/admin/playlists", {
      title: "__test_pl_roundtrip",
      doc_ids: ["abc_123", "def_456"],
      is_public: true,
    }),
  );
  expect(createRes.status).toBe(201);
  const { playlist } = await createRes.json();
  expect(playlist.title).toBe("__test_pl_roundtrip");
  expect(playlist.doc_ids).toEqual(["abc_123", "def_456"]);
  expect(playlist.is_public).toBe(1);

  const getRes = await handlePlaylistGet(String(playlist.id), req("GET", `/api/admin/playlists/${playlist.id}`));
  expect(getRes.status).toBe(200);
});

test("patch: updates doc_ids preserving order", async () => {
  const createRes = await handlePlaylistCreate(
    req("POST", "/api/admin/playlists", { title: "__test_pl_patch", doc_ids: ["a", "b"] }),
  );
  const { playlist } = await createRes.json();
  const patchRes = await handlePlaylistPatch(
    String(playlist.id),
    req("PATCH", `/api/admin/playlists/${playlist.id}`, { doc_ids: ["b", "c", "a"] }),
  );
  expect(patchRes.status).toBe(200);
  const updated = (await patchRes.json()).playlist;
  expect(updated.doc_ids).toEqual(["b", "c", "a"]);
});

test("delete: returns 204, subsequent get returns 404", async () => {
  const createRes = await handlePlaylistCreate(
    req("POST", "/api/admin/playlists", { title: "__test_pl_delete", doc_ids: [] }),
  );
  const { playlist } = await createRes.json();
  const delRes = await handlePlaylistDelete(String(playlist.id), req("DELETE", `/api/admin/playlists/${playlist.id}`));
  expect(delRes.status).toBe(204);
  const getRes = await handlePlaylistGet(String(playlist.id), req("GET", `/api/admin/playlists/${playlist.id}`));
  expect(getRes.status).toBe(404);
});

test("public get: 200 when is_public=1", async () => {
  const createRes = await handlePlaylistCreate(
    req("POST", "/api/admin/playlists", {
      title: "__test_pl_public",
      doc_ids: ["x"],
      is_public: true,
    }),
  );
  const { playlist } = await createRes.json();
  const pubRes = await handlePublicPlaylistGet(String(playlist.id));
  expect(pubRes.status).toBe(200);
});

test("create: rejects doc_ids containing '..' or whitespace", async () => {
  const badIds = [["valid", "../etc"], ["", "ok"], ["bad id"]];
  for (const doc_ids of badIds) {
    const res = await handlePlaylistCreate(
      req("POST", "/api/admin/playlists", { title: "__test_pl_bad", doc_ids }),
    );
    expect(res.status).toBe(400);
  }
});
```

- [ ] **Step 2: Run the tests**

Run: `bun test server/lib/admin/playlists.test.ts`
Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/lib/admin/playlists.test.ts
git commit -m "test(admin): cover playlists CRUD + public read + sanitization"
```

---

## Phase 2 — Server Admin Split

### Task 5: Move auth handlers into `server/lib/admin/auth.ts`

**Files:**
- Create: `server/lib/admin/auth.ts`
- Modify: `server/routes/admin.ts` (will be deleted in Task 10)

- [ ] **Step 1: Create the new file**

Create `server/lib/admin/auth.ts` containing:
- `readBody` helper (copy from `server/routes/admin.ts:29-35`)
- `requireAuth` helper (copy from `server/routes/admin.ts:37-46`)
- `handleLogin` (copy from `server/routes/admin.ts:49-60`)
- `handleLogout` (copy from `server/routes/admin.ts:63-67`)
- `handleMe` (copy from `server/routes/admin.ts:70-74`)
- `handleSetupState` (copy from `server/routes/admin.ts:79-86`)
- `handleSetup` (copy from `server/routes/admin.ts:90-116`)

Header imports (paths shift by one `..`):

```ts
import {
  countAdminUsers,
  createAdminUser,
  jsonResponse,
  jsonWithCookie,
  loginToDrust,
  logoutFromDrust,
  parseSessionCookie,
  verifySession,
  type AdminUser,
} from "../auth";
```

Export `readBody` and `requireAuth` from this file too — `docs.ts` and `playlists.ts` will import them.

- [ ] **Step 2: Update `server/routes/admin.ts` to re-export**

Replace the function bodies with re-exports so existing callers don't break:

```ts
export {
  handleLogin,
  handleLogout,
  handleMe,
  handleSetupState,
  handleSetup,
} from "../lib/admin/auth";
```

- [ ] **Step 3: Run tests to verify no regression**

Run: `bun test`
Expected: all tests pass (including the new admin/auth.test.ts).

- [ ] **Step 4: Commit**

```bash
git add server/lib/admin/auth.ts server/routes/admin.ts
git commit -m "refactor(admin): extract auth handlers to lib/admin/auth.ts"
```

---

### Task 6: Move docs handlers into `server/lib/admin/docs.ts`

**Files:**
- Create: `server/lib/admin/docs.ts`
- Modify: `server/routes/admin.ts`

- [ ] **Step 1: Create the new file**

Create `server/lib/admin/docs.ts` containing:
- `handleDocsList` (copy from `server/routes/admin.ts:119-126`)
- `handleDocPatch` (copy from `server/routes/admin.ts:129-154`)
- `handleDocDelete` (copy from `server/routes/admin.ts:157-178`)

Header imports:

```ts
import { jsonResponse } from "../auth";
import {
  deleteDoc,
  deleteImage,
  findDocByDocId,
  listAllDocs,
  updateDoc,
} from "../drust";
import { readBody, requireAuth } from "./auth";
```

- [ ] **Step 2: Re-export from `server/routes/admin.ts`**

Add to `server/routes/admin.ts`:

```ts
export {
  handleDocsList,
  handleDocPatch,
  handleDocDelete,
} from "../lib/admin/docs";
```

Remove the original function bodies.

- [ ] **Step 3: Run tests**

Run: `bun test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add server/lib/admin/docs.ts server/routes/admin.ts
git commit -m "refactor(admin): extract docs handlers to lib/admin/docs.ts"
```

---

### Task 7: Move playlists handlers into `server/lib/admin/playlists.ts`

**Files:**
- Create: `server/lib/admin/playlists.ts`
- Modify: `server/routes/admin.ts`

- [ ] **Step 1: Create the new file**

Create `server/lib/admin/playlists.ts` containing:
- `parsePlaylistId` helper (copy from `server/routes/admin.ts:182-186`)
- `sanitizeDocIds` helper (copy from `server/routes/admin.ts:188-197`)
- `handlePlaylistsList` (copy from `server/routes/admin.ts:200-205`)
- `handlePlaylistCreate` (copy from `server/routes/admin.ts:208-226`)
- `handlePlaylistGet` (copy from `server/routes/admin.ts:229-240`)
- `handlePlaylistPatch` (copy from `server/routes/admin.ts:243-278`)
- `handlePlaylistDelete` (copy from `server/routes/admin.ts:281-293`)
- `handlePublicPlaylistGet` (copy from `server/routes/admin.ts:298-304`)

Header imports:

```ts
import { jsonResponse } from "../auth";
import {
  deletePlaylist,
  findPlaylist,
  insertPlaylist,
  listAllPlaylists,
  updatePlaylist,
} from "../drust";
import { readBody, requireAuth } from "./auth";
```

- [ ] **Step 2: Re-export from `server/routes/admin.ts`**

Replace remaining playlists section with:

```ts
export {
  handlePlaylistsList,
  handlePlaylistCreate,
  handlePlaylistGet,
  handlePlaylistPatch,
  handlePlaylistDelete,
  handlePublicPlaylistGet,
} from "../lib/admin/playlists";
```

`server/routes/admin.ts` is now a 30-line re-export shim.

- [ ] **Step 3: Run tests**

Run: `bun test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add server/lib/admin/playlists.ts server/routes/admin.ts
git commit -m "refactor(admin): extract playlists handlers to lib/admin/playlists.ts"
```

---

### Task 8: Create `server/routes/admin/` dispatch + update `server/index.ts`

**Files:**
- Create: `server/routes/admin/index.ts`
- Modify: `server/index.ts`
- Delete: `server/routes/admin.ts` (after verification)

- [ ] **Step 1: Create the dispatch file**

Create `server/routes/admin/index.ts`:

```ts
// Path-based dispatcher for /api/admin/* and /api/playlists/* — keeps
// server/index.ts free of per-endpoint switch cases.
import { handleLogin, handleLogout, handleMe, handleSetup, handleSetupState } from "../../lib/admin/auth";
import { handleDocsList, handleDocPatch, handleDocDelete } from "../../lib/admin/docs";
import {
  handlePlaylistsList,
  handlePlaylistCreate,
  handlePlaylistGet,
  handlePlaylistPatch,
  handlePlaylistDelete,
  handlePublicPlaylistGet,
} from "../../lib/admin/playlists";

export async function handleAdminRoute(req: Request, url: URL): Promise<Response | null> {
  const { pathname } = url;
  const m = req.method;

  if (pathname === "/api/admin/login" && m === "POST") return handleLogin(req);
  if (pathname === "/api/admin/logout" && m === "POST") return handleLogout(req);
  if (pathname === "/api/admin/me" && m === "GET") return handleMe(req);
  if (pathname === "/api/admin/setup-state" && m === "GET") return handleSetupState();
  if (pathname === "/api/admin/setup" && m === "POST") return handleSetup(req);

  if (pathname === "/api/admin/docs" && m === "GET") return handleDocsList(req);
  if (pathname.startsWith("/api/admin/docs/")) {
    const docId = pathname.slice("/api/admin/docs/".length);
    if (m === "PATCH") return handleDocPatch(docId, req);
    if (m === "DELETE") return handleDocDelete(docId, req);
  }

  if (pathname === "/api/admin/playlists" && m === "GET") return handlePlaylistsList(req);
  if (pathname === "/api/admin/playlists" && m === "POST") return handlePlaylistCreate(req);
  if (pathname.startsWith("/api/admin/playlists/")) {
    const id = pathname.slice("/api/admin/playlists/".length);
    if (m === "GET") return handlePlaylistGet(id, req);
    if (m === "PATCH") return handlePlaylistPatch(id, req);
    if (m === "DELETE") return handlePlaylistDelete(id, req);
  }

  if (pathname.startsWith("/api/playlists/") && m === "GET") {
    const id = pathname.slice("/api/playlists/".length);
    return handlePublicPlaylistGet(id);
  }

  return null;
}
```

- [ ] **Step 2: Replace switch cases in `server/index.ts`**

In `server/index.ts`, remove the 15-line block of admin handler imports (lines 7-22) and the 24-line block of admin route switches (lines 128-152). Replace with:

```ts
import { handleAdminRoute } from "./routes/admin/index.ts";
```

And inside the `fetch` handler, before the `/document/d/` regex (around line 154), add:

```ts
const adminRes = await handleAdminRoute(req, url);
if (adminRes) return adminRes;
```

- [ ] **Step 3: Update test imports**

In `server/lib/admin/auth.test.ts` and `server/lib/admin/playlists.test.ts`, change:

```ts
import { handleLogin, … } from "../../routes/admin";
```

to:

```ts
import { handleLogin, … } from "./auth";
// and similarly for playlists.test.ts → "./playlists"
```

- [ ] **Step 4: Run tests**

Run: `bun test`
Expected: all green.

- [ ] **Step 5: Delete `server/routes/admin.ts`**

```bash
rm server/routes/admin.ts
```

Verify nothing else imports it:

Run: `grep -rn "routes/admin\.ts\|routes/admin\"" server functions`
Expected: zero hits.

- [ ] **Step 6: Run tests + smoke test**

Run: `bun test && bun run dev` (kill after 5s, just verify boot)
Expected: server starts on port 3000 with no errors.

- [ ] **Step 7: Commit**

```bash
git add server/routes/admin server/index.ts server/lib/admin
git rm server/routes/admin.ts
git commit -m "refactor(admin): dispatch via routes/admin/index.ts, drop monolithic admin.ts"
```

---

### Task 9: Update CF Pages Function adapters

**Files:**
- Modify: every file under `functions/api/admin/`

- [ ] **Step 1: List the adapter files**

Run: `find functions/api/admin -name "*.ts" -type f`
Expected: lists the adapter files (login.ts, logout.ts, me.ts, setup.ts, setup-state.ts, docs/index.ts, docs/[doc_id].ts, playlists/index.ts, playlists/[id].ts).

- [ ] **Step 2: Update import paths**

For each adapter, change the import path from `server/routes/admin` (or wherever it points) to the matching `server/lib/admin/*` module. Concretely, for each handler import currently resolving to the old monolith, point it at:

| Handler | New module |
|---|---|
| `handleLogin`, `handleLogout`, `handleMe`, `handleSetup`, `handleSetupState` | `server/lib/admin/auth` |
| `handleDocsList`, `handleDocPatch`, `handleDocDelete` | `server/lib/admin/docs` |
| `handlePlaylistsList`, `handlePlaylistCreate`, `handlePlaylistGet`, `handlePlaylistPatch`, `handlePlaylistDelete`, `handlePublicPlaylistGet` | `server/lib/admin/playlists` |

Verify each adapter file by reading it. The relative-path depth from `functions/api/admin/login.ts` to `server/lib/admin/auth.ts` is `../../../server/lib/admin/auth`.

- [ ] **Step 3: Verify with a deploy preview** *(optional, only if you have wrangler set up locally)*

Run: `wrangler pages dev public --compatibility-date=2026-05-01`
Expected: dev server starts; visiting `/api/admin/setup-state` returns JSON without 500.

If wrangler is not available, skip this step — CF Pages will surface any import errors at next push.

- [ ] **Step 4: Commit**

```bash
git add functions/api/admin
git commit -m "refactor(cf-pages): point admin adapters at lib/admin/* modules"
```

---

## Phase 3 — CSS Split

### Task 10: Split `slides.css` into entry + 10 sub-files

**Files:**
- Create: `public/slides/css/` (directory)
- Create: `public/slides/css/slides.css`, `base.css`, `ui-shell.css`, `manuscript.css`, `lightbox.css`, `modals-remote.css`, `modals-help.css`, `modals-goto.css`, `search.css`, `print.css`, `context-menu.css`
- Reference: `public/css/slides.css` (existing — leave in place for now)
- Reference: `public/css/slides-aliswa.css` (44 lines — absorbed into `manuscript.css`)

- [ ] **Step 1: Create the directory**

```bash
mkdir -p public/slides/css
```

- [ ] **Step 2: Create the entry file**

Create `public/slides/css/slides.css`:

```css
/* Entry — imports section files in cascade order. */
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

- [ ] **Step 3: Split by line ranges**

Use `sed -n` (or your editor) to extract each range from `public/css/slides.css` into the matching new file. Map:

| New file | Source lines |
|---|---|
| `base.css` | 1–52 |
| `ui-shell.css` | 53–179 then 333–566 (concatenate in that order) |
| `manuscript.css` | 180–332 |
| `lightbox.css` | 567–724 |
| `modals-remote.css` | 725–807 |
| `modals-help.css` | 808–908 |
| `modals-goto.css` | 909–1181 |
| `search.css` | 1182–1273 |
| `print.css` | 1274–1368 |
| `context-menu.css` | 1369–1441 |

For example:

```bash
sed -n '1,52p' public/css/slides.css > public/slides/css/base.css
sed -n '53,179p;333,566p' public/css/slides.css > public/slides/css/ui-shell.css
sed -n '180,332p' public/css/slides.css > public/slides/css/manuscript.css
# ... and so on
```

- [ ] **Step 4: Append `slides-aliswa.css` to `manuscript.css`**

```bash
cat public/css/slides-aliswa.css >> public/slides/css/manuscript.css
```

- [ ] **Step 5: Verify byte-level coverage**

Run:

```bash
wc -l public/slides/css/*.css
# Total should be 1441 (slides.css) + 44 (aliswa) + 10 (entry @imports) ≈ 1495
```

Expected: total lines ≈ original sum.

Run: `diff <(cat public/css/slides.css public/css/slides-aliswa.css) <(cd public/slides/css && cat base.css ui-shell.css manuscript.css lightbox.css modals-remote.css modals-help.css modals-goto.css search.css print.css context-menu.css)`

Expected: zero diff (line-by-line equivalent). If diff shows differences, fix the line-range extractions.

- [ ] **Step 6: Commit**

```bash
git add public/slides/css
git commit -m "refactor(css): split slides.css into 10 section files (no behavior change)"
```

---

## Phase 4 — Viewer JS Split

### Task 11: Copy shared viewer modules to `public/slides/js/`

**Files:**
- Create: `public/slides/js/` (directory)
- Copy verbatim: `public/js/slides/state.js`, `display.js`, `navigation.js`, `lightbox.js`, `search.js`, `goto.js`, `laser.js` → `public/slides/js/`
- Copy verbatim: `public/js/drust-broadcast.js`, `paginator.ts`, `paginator.test.ts` → `public/slides/js/`

- [ ] **Step 1: Create directory and copy**

```bash
mkdir -p public/slides/js
cp public/js/slides/state.js public/slides/js/
cp public/js/slides/display.js public/slides/js/
cp public/js/slides/navigation.js public/slides/js/
cp public/js/slides/lightbox.js public/slides/js/
cp public/js/slides/search.js public/slides/js/
cp public/js/slides/goto.js public/slides/js/
cp public/js/slides/laser.js public/slides/js/
cp public/js/drust-broadcast.js public/slides/js/
cp public/js/paginator.ts public/slides/js/
cp public/js/paginator.test.ts public/slides/js/
```

- [ ] **Step 2: Update `state.js` with new shared viewer state**

Open `public/slides/js/state.js`. Find the `state` object export and add four fields:

```js
// at the end of the existing state object literal:
  currentWritingMode: 'vertical-rl',
  allPageElements: [],
  currentSrc: null,
  playlistState: null,
```

The new fields are seeded so first-read code paths see a sensible default.

- [ ] **Step 3: Verify the test still works in the new location**

Run: `bun test public/slides/js/paginator.test.ts`
Expected: passes (same code as the original test).

- [ ] **Step 4: Commit**

```bash
git add public/slides/js
git commit -m "refactor(viewer): copy shared modules to public/slides/js/ and extend state"
```

---

### Task 12: Create `public/slides/js/pagination.js`

**Files:**
- Create: `public/slides/js/pagination.js`
- Reference: `public/js/app.js:19-75` (pagination block)

- [ ] **Step 1: Create the file**

Create `public/slides/js/pagination.js`:

```js
// Pagination + writing-mode shell — orchestrates paginate() from paginator.ts
// for the viewer. Shared state (currentWritingMode, allPageElements) lives in
// state.js so other modules read/write the same identity.
import { state, dom } from './state.js';
import { paginate, showPage } from './paginator.ts';

export function isVerticalMode() {
  return state.currentWritingMode === 'vertical-rl';
}

export function setWritingMode(mode) {
  state.currentWritingMode = mode;
  if (mode === 'horizontal-tb') document.body.classList.add('horizontal-mode');
  else document.body.classList.remove('horizontal-mode');
}

export function updatePageCount() {
  const pageCount = document.querySelectorAll('.slide-page').length;
  state.totalPages = Math.max(1, pageCount);
  dom.totalPagesEl.textContent = state.totalPages;
  if (state.currentPage >= state.totalPages) state.currentPage = state.totalPages - 1;
  dom.currentPageEl.textContent = state.currentPage + 1;
}

export function goToPage(page) {
  if (page < 0 || page >= state.totalPages) return;
  state.currentPage = page;
  showPage(page);
  dom.currentPageEl.textContent = state.currentPage + 1;
}

export function prevPage() {
  if (state.currentPage <= 0 && state.playlistState) {
    // Boundary jump handled by playlist.js; expose a hook via a callback
    // registered at app entry to avoid pagination→playlist coupling.
    if (pagination._onLeftBoundary) {
      void pagination._onLeftBoundary();
      return;
    }
  }
  goToPage(state.currentPage - 1);
}

export function nextPage() {
  if (state.currentPage >= state.totalPages - 1 && state.playlistState) {
    if (pagination._onRightBoundary) {
      void pagination._onRightBoundary();
      return;
    }
  }
  goToPage(state.currentPage + 1);
}

// Callback registry — playlist.js sets these at app entry.
export const pagination = { _onLeftBoundary: null, _onRightBoundary: null };

export function repaginate() {
  // Deep-clone canonical elements so paginate's in-place splits never touch
  // the originals captured at load.
  const article = document.createElement('article');
  article.className = 'slide-content';
  state.allPageElements.forEach(el => article.appendChild(el.cloneNode(true)));
  paginate(article, dom.manuscript, state.currentWritingMode);
  updatePageCount();
  goToPage(Math.min(state.currentPage, state.totalPages - 1));
}
```

Note: the `pagination._onLeftBoundary` / `_onRightBoundary` callback pattern decouples pagination from playlist. `playlist.js` will register these at app entry — see Task 19.

- [ ] **Step 2: Commit**

```bash
git add public/slides/js/pagination.js
git commit -m "refactor(viewer): extract pagination into its own module"
```

---

### Task 13: Create `public/slides/js/font.js`

**Files:**
- Create: `public/slides/js/font.js`
- Reference: `public/js/app.js:77-115` (font block)

- [ ] **Step 1: Create the file**

Create `public/slides/js/font.js`:

```js
import { state, dom, FONT_SCALES, STORAGE_KEYS } from './state.js';
import { repaginate } from './pagination.js';

export function setFontScale(scale, save = true) {
  state.fontScale = scale;
  document.documentElement.style.setProperty('--font-scale', scale);
  dom.fontSizeDisplayEl.textContent = Math.round(scale * 100) + '%';
  if (save) localStorage.setItem(STORAGE_KEYS.fontSize, scale.toString());
  setTimeout(() => repaginate(), 50);
}

export function increaseFontSize() {
  const idx = FONT_SCALES.indexOf(state.fontScale);
  if (idx < FONT_SCALES.length - 1) setFontScale(FONT_SCALES[idx + 1]);
  else if (idx === -1) {
    const larger = FONT_SCALES.filter(s => s > state.fontScale);
    if (larger.length > 0) setFontScale(larger[0]);
  }
}

export function decreaseFontSize() {
  const idx = FONT_SCALES.indexOf(state.fontScale);
  if (idx > 0) setFontScale(FONT_SCALES[idx - 1]);
  else if (idx === -1) {
    const smaller = FONT_SCALES.filter(s => s < state.fontScale);
    if (smaller.length > 0) setFontScale(smaller[smaller.length - 1]);
  }
}

export function applyFont(fontFamily, save = true) {
  let fontValue;
  if (fontFamily === 'DFKai-SB') {
    fontValue = '"DFKai-SB", "BiauKai", "標楷體", serif';
  } else {
    fontValue = `"${fontFamily}", sans-serif`;
  }
  document.documentElement.style.setProperty('--font-family-body', fontValue);
  if (save) localStorage.setItem(STORAGE_KEYS.fontFamily, fontFamily);
  setTimeout(() => repaginate(), 50);
}
```

- [ ] **Step 2: Commit**

```bash
git add public/slides/js/font.js
git commit -m "refactor(viewer): extract font controls into its own module"
```

---

### Task 14: Create `public/slides/js/table-canvas.js`

**Files:**
- Create: `public/slides/js/table-canvas.js`
- Reference: `public/js/app.js:380-454` (table-canvas block)

- [ ] **Step 1: Create the file**

Create `public/slides/js/table-canvas.js`:

```js
import { dom } from './state.js';

// Bilinear-resample a canvas to fit within maxW × maxH while preserving
// aspect ratio.
export function downscaleCanvas(src, maxW, maxH) {
  const ratio = Math.min(maxW / src.width, maxH / src.height, 1);
  if (ratio === 1) return src;
  const dst = document.createElement('canvas');
  dst.width = Math.max(1, Math.floor(src.width * ratio));
  dst.height = Math.max(1, Math.floor(src.height * ratio));
  const ctx = dst.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, dst.width, dst.height);
  }
  return dst;
}

export async function convertTablesToImages() {
  const tables = dom.manuscript.querySelectorAll('table');
  if (tables.length === 0) return;
  const containerWidth = dom.manuscriptContainer.clientWidth * 0.95;
  for (const table of tables) {
    try {
      table.style.cssText = `writing-mode:horizontal-tb;width:${containerWidth}px;background:rgba(0,0,0,0.3);color:white;border-collapse:collapse;font-size:24px`;
      table.querySelectorAll('td').forEach(td => {
        td.style.cssText = 'writing-mode:horizontal-tb;border:1px solid rgba(255,255,255,0.3);padding:10px 14px;color:white;vertical-align:middle;text-align:left';
      });
      table.querySelectorAll('th').forEach(th => {
        th.style.cssText = 'writing-mode:horizontal-tb;border:1px solid rgba(255,255,255,0.3);padding:10px 14px;color:white;vertical-align:middle;text-align:center;background:#1a365d;font-weight:bold';
      });
      table.querySelectorAll('img').forEach(img => {
        img.style.display = 'block';
        img.style.margin = '0 auto';
      });
      table.querySelectorAll('tr').forEach(tr => {
        const cells = Array.from(tr.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
        if (cells.length === 0) return;
        const heights = cells.map(c => c.offsetHeight);
        const maxH = Math.max(...heights);
        cells.forEach((c, i) => {
          const diff = maxH - heights[i];
          if (diff <= 0) return;
          const extra = Math.round(diff / 2);
          c.style.padding = `${10 + extra}px 14px`;
        });
      });
      const canvas = await html2canvas(table, { backgroundColor: 'transparent', scale: 2, logging: false });
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      img.className = 'table-image';
      const thumb = downscaleCanvas(canvas, 600, 450);
      img.dataset.thumbSrc = thumb.toDataURL('image/jpeg', 0.7);
      table.parentNode.replaceChild(img, table);
    } catch (err) {
      console.error('table conversion failed:', err);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/slides/js/table-canvas.js
git commit -m "refactor(viewer): extract table→canvas conversion into its own module"
```

---

### Task 15: Create `public/slides/js/pdf-export.js`

**Files:**
- Create: `public/slides/js/pdf-export.js`
- Reference: `public/js/app.js:119-173` (PDF export block)

- [ ] **Step 1: Create the file**

Create `public/slides/js/pdf-export.js`:

```js
import { dom } from './state.js';

let printContainer = null;
let printStyle = null;

export function exportPDF() {
  if (printContainer) { printContainer.remove(); printContainer = null; }
  if (printStyle) { printStyle.remove(); printStyle = null; }

  const containerW = dom.manuscriptContainer.clientWidth;
  const containerH = dom.manuscriptContainer.clientHeight;
  const pageW = containerW + 160;
  const pageH = containerH + 120;

  printStyle = document.createElement('style');
  printStyle.id = 'printPageStyle';
  printStyle.textContent = `@page { size: ${pageW}px ${pageH}px; margin: 0; }`;
  document.head.appendChild(printStyle);

  printContainer = document.createElement('div');
  printContainer.id = 'printContainer';

  const slidePages = document.querySelectorAll('.slide-page');
  slidePages.forEach(sp => {
    const page = document.createElement('div');
    page.className = 'print-page';
    const bgWrap = document.createElement('div');
    bgWrap.className = 'print-page-bg';
    const clipArea = document.createElement('div');
    clipArea.className = 'print-page-clip';
    const clone = sp.cloneNode(true);
    clone.style.display = '';
    clone.style.width = containerW + 'px';
    clone.style.height = containerH + 'px';
    clipArea.appendChild(clone);
    bgWrap.appendChild(clipArea);
    page.appendChild(bgWrap);
    printContainer.appendChild(page);
  });

  document.body.appendChild(printContainer);

  const cleanup = () => {
    if (printContainer) { printContainer.remove(); printContainer = null; }
    if (printStyle) { printStyle.remove(); printStyle = null; }
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
}
```

- [ ] **Step 2: Commit**

```bash
git add public/slides/js/pdf-export.js
git commit -m "refactor(viewer): extract PDF export into its own module"
```

---

### Task 16: Create `public/slides/js/modals.js`

**Files:**
- Create: `public/slides/js/modals.js`
- Reference: `public/js/app.js:579-609` (modals block)

- [ ] **Step 1: Create the file**

Create `public/slides/js/modals.js`:

```js
import { dom, modKey } from './state.js';
import { closeLightbox } from './lightbox.js';
import { closeGotoModal } from './goto.js';
import { closeSidebar } from './display.js';

export function updateModKeyDisplay() {
  document.querySelectorAll('.mod-key').forEach(el => { el.textContent = modKey; });
}

export function showHelpModal() {
  if (dom.helpModal) { dom.helpModal.classList.add('active'); closeSidebar(); }
}

export function closeHelpModal() {
  if (dom.helpModal) dom.helpModal.classList.remove('active');
}

// closeRemoteModal lives in remote-control.js (the modal is owned by the
// remote subsystem). modals.js holds the dispatch logic only.
let _closeRemoteModal = () => {};
export function registerRemoteModalCloser(fn) { _closeRemoteModal = fn; }

export function closeAllModals() {
  if (dom.lightbox.classList.contains('active')) closeLightbox();
  else if (dom.remoteModal?.classList.contains('active')) _closeRemoteModal();
  else if (dom.gotoModal?.classList.contains('active')) closeGotoModal();
  else if (dom.helpModal?.classList.contains('active')) closeHelpModal();
  else if (dom.sidebar.classList.contains('open')) closeSidebar();
}

export function initHelpModal() {
  const closeBtn = document.querySelector('.help-modal-close');
  if (closeBtn) closeBtn.onclick = closeHelpModal;
  if (dom.helpModal) {
    dom.helpModal.onclick = (e) => { if (e.target === dom.helpModal) closeHelpModal(); };
  }
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) helpBtn.onclick = showHelpModal;
}
```

The `registerRemoteModalCloser` registry pattern avoids `modals.js → remote-control.js → modals.js` cycle (remote-control.js calls `closeAllModals`). `remote-control.js` calls `registerRemoteModalCloser` at module init.

- [ ] **Step 2: Commit**

```bash
git add public/slides/js/modals.js
git commit -m "refactor(viewer): extract help-modal + closeAllModals into its own module"
```

---

### Task 17: Create `public/slides/js/remote-control.js`

**Files:**
- Create: `public/slides/js/remote-control.js`
- Reference: `public/js/app.js:177-378` (remote-control block)

- [ ] **Step 1: Create the file**

Create `public/slides/js/remote-control.js`:

```js
import { state, dom } from './state.js';
import { connectRoom } from './drust-broadcast.js';
import { goToPage, prevPage, nextPage, isVerticalMode, setWritingMode, repaginate } from './pagination.js';
import { closeLightbox, openLightbox, setLightboxZoom, resetLightboxZoom, panLightbox } from './lightbox.js';
import { searchFor, nextMatch, prevMatch, closeSearch, getSearchState } from './search.js';
import { toggleLaser, isLaserActive } from './laser.js';
import { toggleFullscreen, closeSidebar } from './display.js';
import { navigation } from './navigation.js';
import { registerRemoteModalCloser } from './modals.js';

let room = null;
let roomChannel = null;
let syncTimer = null;

function getCurrentPageImages() {
  const containerWidth = dom.manuscriptContainer.clientWidth;
  const containerHeight = dom.manuscriptContainer.clientHeight;
  const images = dom.manuscript.querySelectorAll('img');
  const visible = [];
  images.forEach(img => {
    const rect = img.getBoundingClientRect();
    const cRect = dom.manuscriptContainer.getBoundingClientRect();
    const iL = rect.left - cRect.left, iT = rect.top - cRect.top;
    const vW = Math.min(iL + rect.width, containerWidth) - Math.max(iL, 0);
    const vH = Math.min(iT + rect.height, containerHeight) - Math.max(iT, 0);
    if (!(vW > rect.width * 0.5 && vH > rect.height * 0.5 && img.src)) return;
    if (img.classList.contains('table-image')) {
      if (img.dataset.thumbSrc) visible.push({ src: img.dataset.thumbSrc, alt: img.alt || '' });
      return;
    }
    visible.push({ src: img.src, alt: img.alt || '' });
  });
  return visible;
}

function buildSyncPayload() {
  const searchState = getSearchState();
  return {
    type: 'sync',
    currentPage: state.currentPage + 1,
    totalPages: state.totalPages,
    images: getCurrentPageImages(),
    lightboxActive: dom.lightbox.classList.contains('active'),
    lightboxZoom: state.lbZoom,
    spotlightActive: isLaserActive(),
    ...searchState,
  };
}

function publishSync() {
  if (!room) return;
  room.publish(buildSyncPayload());
}

export function syncRemoteState() {
  if (syncTimer != null) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    publishSync();
  }, 50);
}

function handleRemoteCommand(payload) {
  const { action } = payload;
  const lightboxActive = dom.lightbox.classList.contains('active');
  switch (action) {
    case 'prev': lightboxActive ? closeLightbox() : prevPage(); break;
    case 'next': lightboxActive ? closeLightbox() : nextPage(); break;
    case 'first': lightboxActive ? closeLightbox() : goToPage(0); break;
    case 'last': lightboxActive ? closeLightbox() : goToPage(state.totalPages - 1); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'toggleMode':
      setWritingMode(isVerticalMode() ? 'horizontal-tb' : 'vertical-rl');
      state.currentPage = 0;
      repaginate();
      break;
    case 'toggleLightbox':
      if (payload.src) {
        if (lightboxActive) {
          const cur = dom.lightboxImg.src;
          const same = cur && new URL(cur, location.href).pathname === new URL(payload.src, location.href).pathname;
          same ? closeLightbox() : openLightbox(payload.src, payload.alt || '');
        } else openLightbox(payload.src, payload.alt || '');
      }
      break;
    case 'zoomIn': setLightboxZoom(state.lbZoom + 0.25); break;
    case 'zoomOut': setLightboxZoom(state.lbZoom - 0.25); break;
    case 'zoomReset': resetLightboxZoom(); break;
    case 'pan': panLightbox(payload.dx || 0, payload.dy || 0); break;
    case 'toggleSpotlight': toggleLaser(); break;
    case 'search': if (payload.keyword) searchFor(payload.keyword); break;
    case 'searchPrev': prevMatch(); break;
    case 'searchNext': nextMatch(); break;
    case 'searchClose': closeSearch(); break;
    case 'goto':
      if (payload.page >= 1 && payload.page <= state.totalPages) {
        if (lightboxActive) closeLightbox();
        goToPage(payload.page - 1);
      }
      break;
  }
  syncRemoteState();
}

function markRemoteConnected() {
  const status = document.getElementById('remoteStatus');
  if (status) {
    status.textContent = '遙控器已連線！';
    status.classList.add('connected');
  }
  setTimeout(closeRemoteModal, 2000);
}

function drustRoomFor(roomId) {
  return `slides-${roomId}`;
}

export async function initRemote() {
  if (!state.roomId) {
    state.roomId = Math.random().toString(36).substring(2, 8);
    navigation.onPageChange = syncRemoteState;
    document.getElementById('remoteBtn').onclick = openRemoteModal;
    document.getElementById('remoteModalClose').onclick = closeRemoteModal;
    dom.remoteModal.onclick = (e) => { if (e.target === dom.remoteModal) closeRemoteModal(); };
  }

  const channel = drustRoomFor(state.roomId);
  if (room != null) {
    if (roomChannel === channel) return;
    room.stop();
    room = null;
    roomChannel = null;
  }
  roomChannel = channel;
  room = await connectRoom(channel, {
    onMessage: (msg) => {
      if (!msg || typeof msg !== 'object') return;
      switch (msg.type) {
        case 'command': handleRemoteCommand(msg); break;
        case 'phone-join':
          markRemoteConnected();
          publishSync();
          break;
      }
    },
  });
}

export function openRemoteModal() {
  const qrcodeEl = document.getElementById('qrcode');
  const urlEl = document.getElementById('remoteUrl');
  qrcodeEl.innerHTML = '';
  const host = window.location.hostname;
  const port = window.location.port;
  // NB: path is /remote/ (not /remote.html) after the Phase-6 reshuffle.
  const remoteUrl = `${location.protocol}//${host}${port ? ':' + port : ''}/remote/?id=${state.roomId}`;
  new QRCode(qrcodeEl, { text: remoteUrl, width: 200, height: 200 });
  urlEl.textContent = remoteUrl;
  dom.remoteModal.classList.add('active');
  closeSidebar();
}

export function closeRemoteModal() {
  dom.remoteModal.classList.remove('active');
}

// Register the modal closer with modals.js so closeAllModals can dispatch.
registerRemoteModalCloser(closeRemoteModal);
```

- [ ] **Step 2: Commit**

```bash
git add public/slides/js/remote-control.js
git commit -m "refactor(viewer): extract remote control into its own module"
```

---

### Task 18: Create `public/slides/js/loader.js`

**Files:**
- Create: `public/slides/js/loader.js`
- Reference: `public/js/app.js:456-577` (loader block)

- [ ] **Step 1: Create the file**

Create `public/slides/js/loader.js`:

```js
import { state, dom } from './state.js';
import { loadSettings, resetNavHideTimer, updateFullscreenButton } from './display.js';
import { repaginate } from './pagination.js';
import { convertTablesToImages } from './table-canvas.js';
import { syncRemoteState } from './remote-control.js';
import { updateModKeyDisplay } from './modals.js';

export function extractDocId(url) {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export async function syncFromGoogle(googleUrl) {
  const res = await fetch('/api/fetch-doc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: googleUrl }),
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
  return result;
}

export async function refresh() {
  if (!state.currentSrc) return;
  const btn = document.getElementById('refreshBtn');
  if (btn?.classList.contains('refreshing')) return;
  btn?.classList.add('refreshing');
  try {
    await loadDocument(state.currentSrc, { forceSync: true });
  } finally {
    btn?.classList.remove('refreshing');
  }
}

export async function loadDocument(src, { forceSync = false } = {}) {
  try {
    const googleDocId = extractDocId(src);
    const isDocId = !googleDocId && /^[a-zA-Z0-9_-]+$/.test(src);
    let docId = null;

    if (googleDocId) {
      dom.manuscript.innerHTML = '<p class="loading-message">轉換中，請稍候...</p>';
      const result = await syncFromGoogle(src);
      docId = result.doc_id;
    } else if (isDocId) {
      docId = src;
      if (forceSync) {
        dom.manuscript.innerHTML = '<p class="loading-message">同步中，請稍候...</p>';
        await syncFromGoogle(`https://docs.google.com/document/d/${docId}/edit`);
      }
    }

    if (docId) {
      let res = await fetch(`/api/docs/${docId}`);
      if (!res.ok && !forceSync) {
        dom.manuscript.innerHTML = '<p class="loading-message">首次載入，同步中...</p>';
        await syncFromGoogle(`https://docs.google.com/document/d/${docId}/edit`);
        res = await fetch(`/api/docs/${docId}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      dom.manuscript.innerHTML = await res.text();
    } else {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      dom.manuscript.innerHTML = await res.text();
    }
  } catch (err) {
    dom.manuscript.innerHTML = `<p style="color:#ff6b6b;font-size:24px;">載入失敗: ${err.message}</p>`;
    return;
  }

  loadSettings();
  updateModKeyDisplay();
  await document.fonts.ready;

  const images = dom.manuscript.querySelectorAll('img');
  if (images.length > 0) {
    await Promise.all(Array.from(images).map(img =>
      img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
    ));
  }
  await convertTablesToImages();

  const content = dom.manuscript.firstElementChild;
  if (content && content.tagName === 'ARTICLE') {
    state.allPageElements = Array.from(content.children);
  } else {
    state.allPageElements = Array.from(dom.manuscript.children);
  }

  repaginate();
  // NB: initEventListeners() and initRemote() moved to app.js entry.
  // syncRemoteState here is safe — it no-ops if room is unset.
  syncRemoteState();
  resetNavHideTimer();
}
```

- [ ] **Step 2: Commit**

```bash
git add public/slides/js/loader.js
git commit -m "refactor(viewer): extract document loader into its own module"
```

---

### Task 19: Create `public/slides/js/playlist.js`

**Files:**
- Create: `public/slides/js/playlist.js`
- Reference: `public/js/app.js:871-930` (playlist block)

- [ ] **Step 1: Create the file**

Create `public/slides/js/playlist.js`:

```js
import { state, dom } from './state.js';
import { loadDocument } from './loader.js';
import { goToPage, pagination } from './pagination.js';

export async function loadPlaylist(id) {
  try {
    const res = await fetch(`/api/playlists/${encodeURIComponent(id)}`);
    if (!res.ok) {
      dom.manuscript.innerHTML = `<p style="color:#ff6b6b;font-size:24px;">找不到 playlist (${res.status})</p>`;
      return;
    }
    const { playlist } = await res.json();
    if (!playlist.doc_ids || playlist.doc_ids.length === 0) {
      dom.manuscript.innerHTML = `<p style="color:#ff6b6b;font-size:24px;">「${playlist.title}」沒有文件</p>`;
      return;
    }
    state.playlistState = { id: playlist.id, title: playlist.title, doc_ids: playlist.doc_ids, index: 0 };
    updatePlaylistBadge();
    state.currentSrc = state.playlistState.doc_ids[0];
    await loadDocument(state.currentSrc);
  } catch (err) {
    dom.manuscript.innerHTML = `<p style="color:#ff6b6b;font-size:24px;">Playlist 載入失敗: ${err.message}</p>`;
  }
}

function updatePlaylistBadge() {
  if (!state.playlistState) return;
  let badge = document.getElementById('playlistBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'playlistBadge';
    badge.style.cssText =
      'position:fixed;top:14px;left:50%;transform:translateX(-50%);' +
      'background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);color:white;' +
      'padding:6px 14px;border-radius:16px;font-size:13px;z-index:50;' +
      'pointer-events:none;font-family:-apple-system,sans-serif;';
    document.body.appendChild(badge);
  }
  badge.textContent = `${state.playlistState.title} · ${state.playlistState.index + 1} / ${state.playlistState.doc_ids.length}`;
}

async function jumpToPlaylistDoc(delta) {
  const pl = state.playlistState;
  if (!pl) return false;
  const next = pl.index + delta;
  if (next < 0 || next >= pl.doc_ids.length) return false;
  pl.index = next;
  state.currentSrc = pl.doc_ids[next];
  updatePlaylistBadge();
  const landOnLast = delta < 0;
  await loadDocument(state.currentSrc);
  if (landOnLast) goToPage(state.totalPages - 1);
  return true;
}

// Wire boundary callbacks so pagination.prevPage/nextPage cross between docs
// without pagination needing to know about playlists.
pagination._onLeftBoundary = () => jumpToPlaylistDoc(-1);
pagination._onRightBoundary = () => jumpToPlaylistDoc(+1);
```

- [ ] **Step 2: Commit**

```bash
git add public/slides/js/playlist.js
git commit -m "refactor(viewer): extract playlist mode into its own module"
```

---

### Task 20: Create `public/slides/js/context-menu.js`

**Files:**
- Create: `public/slides/js/context-menu.js`
- Reference: `public/js/app.js:691-781` (context menu block)

- [ ] **Step 1: Create the file**

Create `public/slides/js/context-menu.js`:

```js
import { showHelpModal } from './modals.js';
import { openSearch } from './search.js';
import { toggleLaser } from './laser.js';
import { exportPDF } from './pdf-export.js';
import { openRemoteModal } from './remote-control.js';
import { toggleFullscreen } from './display.js';
import { isVerticalMode, setWritingMode, repaginate } from './pagination.js';
import { state } from './state.js';

const CTX_ICONS = {
  spotlight: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>',
  search: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  pdf: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>',
  remote: '<svg width="28" height="28" viewBox="0 -960 960 960" fill="currentColor"><path d="M320-40q-33 0-56.5-23.5T240-120v-720q0-33 23.5-56.5T320-920h320q33 0 56.5 23.5T720-840v720q0 33-23.5 56.5T640-40H320Zm0-80h320v-720H320v720Zm160-440q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Z"/></svg>',
  orientation: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/></svg>',
  fullscreen: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  help: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

function toggleOrientation() {
  // Capture the pre-flip mode — after setWritingMode(), isVerticalMode()
  // returns the NEW value, so we'd flip the buttons backwards.
  const wasVertical = isVerticalMode();
  setWritingMode(wasVertical ? 'horizontal-tb' : 'vertical-rl');
  document.getElementById(wasVertical ? 'horizontalBtn' : 'verticalBtn').classList.add('active');
  document.getElementById(wasVertical ? 'verticalBtn' : 'horizontalBtn').classList.remove('active');
  state.currentPage = 0;
  repaginate();
}

const CTX_ITEMS = [
  { id: 'ctx-spotlight', icon: CTX_ICONS.spotlight, label: '聚光燈', action: toggleLaser },
  { id: 'ctx-search', icon: CTX_ICONS.search, label: '文字搜尋', action: openSearch },
  { id: 'ctx-pdf', icon: CTX_ICONS.pdf, label: '匯出 PDF', action: exportPDF },
  { id: 'ctx-remote', icon: CTX_ICONS.remote, label: '遙控器', action: openRemoteModal },
  { divider: true },
  { id: 'ctx-orientation', icon: CTX_ICONS.orientation, label: '', action: toggleOrientation },
  { id: 'ctx-fullscreen', icon: CTX_ICONS.fullscreen, label: '全螢幕', action: toggleFullscreen },
  { divider: true },
  { id: 'ctx-help', icon: CTX_ICONS.help, label: '快捷鍵說明', action: showHelpModal },
];

let ctxMenu = null;
let longPressTimer = null;

function getOrientationLabel() {
  return isVerticalMode() ? '切換為橫書' : '切換為直書';
}

function buildMenu() {
  ctxMenu = document.createElement('div');
  ctxMenu.className = 'context-menu';
  ctxMenu.id = 'contextMenu';
  CTX_ITEMS.forEach(item => {
    if (item.divider) {
      const d = document.createElement('div');
      d.className = 'context-menu-divider';
      ctxMenu.appendChild(d);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'context-menu-item';
    btn.id = item.id;
    btn.innerHTML = `<span class="context-menu-icon">${item.icon}</span><span class="context-menu-label">${item.label}</span>`;
    btn.addEventListener('click', (e) => { e.stopPropagation(); hideMenu(); item.action(); });
    ctxMenu.appendChild(btn);
  });
  document.body.appendChild(ctxMenu);
}

function showMenu(x, y) {
  if (!ctxMenu) buildMenu();
  const ol = ctxMenu.querySelector('#ctx-orientation .context-menu-label');
  if (ol) ol.textContent = getOrientationLabel();
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top = y + 'px';
  ctxMenu.classList.add('active');
  requestAnimationFrame(() => {
    const r = ctxMenu.getBoundingClientRect();
    if (r.right > window.innerWidth) ctxMenu.style.left = (x - r.width) + 'px';
    if (r.bottom > window.innerHeight) ctxMenu.style.top = (y - r.height) + 'px';
  });
}

function hideMenu() {
  if (ctxMenu) ctxMenu.classList.remove('active');
}

export function initContextMenu() {
  buildMenu();
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.sidebar,.help-modal,.remote-modal,.goto-modal,.search-bar')) return;
    e.preventDefault();
    showMenu(e.clientX, e.clientY);
  });
  document.addEventListener('click', (e) => {
    if (ctxMenu?.classList.contains('active') && !ctxMenu.contains(e.target)) hideMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ctxMenu?.classList.contains('active')) { hideMenu(); e.stopPropagation(); }
  }, true);
  document.addEventListener('touchstart', (e) => {
    if (e.target.closest('.sidebar,.help-modal,.remote-modal,.goto-modal,.search-bar,.context-menu,.slide-nav,.left-panel')) return;
    const t = e.touches[0];
    longPressTimer = setTimeout(() => showMenu(t.clientX, t.clientY), 600);
  }, { passive: true });
  document.addEventListener('touchmove', () => { clearTimeout(longPressTimer); }, { passive: true });
  document.addEventListener('touchend', () => { clearTimeout(longPressTimer); }, { passive: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add public/slides/js/context-menu.js
git commit -m "refactor(viewer): extract context menu into its own module"
```

---

### Task 21: Create `public/slides/js/keyboard.js`

**Files:**
- Create: `public/slides/js/keyboard.js`
- Reference: `public/js/app.js:611-689` (keyboard block)

- [ ] **Step 1: Create the file**

Create `public/slides/js/keyboard.js`:

```js
import { state, dom, isMac } from './state.js';
import { goToPage, prevPage, nextPage, isVerticalMode, setWritingMode, repaginate } from './pagination.js';
import { showGoToPageDialog } from './goto.js';
import { toggleFullscreen, toggleSidebar, toggleNavVisibility, showNav } from './display.js';
import { closeLightbox } from './lightbox.js';
import { openSearch, closeSearch, isSearchOpen } from './search.js';
import { toggleLaser } from './laser.js';
import { showHelpModal, closeAllModals } from './modals.js';
import { openRemoteModal } from './remote-control.js';
import { setFontScale, increaseFontSize, decreaseFontSize } from './font.js';
import { exportPDF } from './pdf-export.js';
import { syncRemoteState } from './remote-control.js';

const HOTKEYS = {
  'ArrowRight': 'next', ' ': 'next', 'PageDown': 'next',
  'ArrowLeft': 'prev', 'PageUp': 'prev',
  'Home': 'first', 'End': 'last',
  'g': 'goto', 'G': 'goto',
  'f': 'fullscreen', 'F': 'fullscreen',
  's': 'sidebar', 'S': 'sidebar',
  'o': 'orientation', 'O': 'orientation',
  'n': 'toggleNav', 'N': 'toggleNav',
  'r': 'remoteQR', 'R': 'remoteQR',
  'l': 'laser', 'L': 'laser',
  '?': 'help', 'h': 'help', 'H': 'help',
  'Escape': 'escape',
};

const COMBO_KEYS = {
  'Enter': 'fullscreen', '=': 'fontUp', '+': 'fontUp',
  '-': 'fontDown', '0': 'fontReset',
  ',': 'sidebar', 'f': 'search', 'p': 'exportPDF',
};

function closeLightboxIfActive() {
  if (dom.lightbox.classList.contains('active')) { closeLightbox(); return true; }
  return false;
}

const ACTIONS = {
  next: () => { if (!closeLightboxIfActive()) nextPage(); syncRemoteState(); },
  prev: () => { if (!closeLightboxIfActive()) prevPage(); syncRemoteState(); },
  first: () => { if (!closeLightboxIfActive()) goToPage(0); syncRemoteState(); },
  last: () => { if (!closeLightboxIfActive()) goToPage(state.totalPages - 1); syncRemoteState(); },
  goto: showGoToPageDialog,
  fullscreen: toggleFullscreen,
  sidebar: toggleSidebar,
  orientation: () => {
    const wasVertical = isVerticalMode();
    setWritingMode(wasVertical ? 'horizontal-tb' : 'vertical-rl');
    document.getElementById(wasVertical ? 'horizontalBtn' : 'verticalBtn').classList.add('active');
    document.getElementById(wasVertical ? 'verticalBtn' : 'horizontalBtn').classList.remove('active');
    state.currentPage = 0;
    repaginate();
  },
  toggleNav: toggleNavVisibility,
  remoteQR: openRemoteModal,
  laser: toggleLaser,
  help: showHelpModal,
  escape: () => { if (isSearchOpen()) closeSearch(); else closeAllModals(); },
  fontUp: increaseFontSize,
  fontDown: decreaseFontSize,
  fontReset: () => setFontScale(1.0),
  search: openSearch,
  exportPDF: exportPDF,
};

export function handleKeydown(e) {
  const tag = e.target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (mod && !e.shiftKey && !e.altKey) {
    const a = COMBO_KEYS[e.key];
    if (a && ACTIONS[a]) { e.preventDefault(); ACTIONS[a](); showNav(); return; }
  }
  if (!e.metaKey && !e.ctrlKey && !e.altKey) {
    const a = HOTKEYS[e.key];
    if (a && ACTIONS[a]) { e.preventDefault(); ACTIONS[a](); if (a !== 'escape') showNav(); return; }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/slides/js/keyboard.js
git commit -m "refactor(viewer): extract keyboard handler into its own module"
```

---

### Task 22: Create `public/slides/js/event-listeners.js`

**Files:**
- Create: `public/slides/js/event-listeners.js`
- Reference: `public/js/app.js:783-852` (event listeners block)

- [ ] **Step 1: Create the file**

Create `public/slides/js/event-listeners.js`:

```js
import { state, dom } from './state.js';
import { prevPage, nextPage, repaginate, setWritingMode, isVerticalMode } from './pagination.js';
import { toggleSidebar, closeSidebar, showNav, toggleFullscreen, updateFullscreenButton, toggleNavVisibility } from './display.js';
import { increaseFontSize, decreaseFontSize, applyFont } from './font.js';
import { initLaser, toggleLaser } from './laser.js';
import { initSearch } from './search.js';
import { initLightbox } from './lightbox.js';
import { initGotoModal } from './goto.js';
import { initHelpModal } from './modals.js';
import { initContextMenu } from './context-menu.js';
import { exportPDF } from './pdf-export.js';
import { refresh } from './loader.js';
import { handleKeydown } from './keyboard.js';
import { syncRemoteState } from './remote-control.js';

let eventsInit = false;

export function initEventListeners() {
  if (eventsInit) return;
  eventsInit = true;

  document.getElementById('prevBtn').onclick = () => { prevPage(); syncRemoteState(); };
  document.getElementById('nextBtn').onclick = () => { nextPage(); syncRemoteState(); };
  dom.hamburgerBtn.onclick = toggleSidebar;
  dom.sidebarOverlay.onclick = closeSidebar;
  document.getElementById('fontDecrease').onclick = decreaseFontSize;
  document.getElementById('fontIncrease').onclick = increaseFontSize;
  document.getElementById('verticalBtn').onclick = () => {
    setWritingMode('vertical-rl');
    document.getElementById('verticalBtn').classList.add('active');
    document.getElementById('horizontalBtn').classList.remove('active');
    state.currentPage = 0;
    repaginate();
  };
  document.getElementById('horizontalBtn').onclick = () => {
    setWritingMode('horizontal-tb');
    document.getElementById('horizontalBtn').classList.add('active');
    document.getElementById('verticalBtn').classList.remove('active');
    state.currentPage = 0;
    repaginate();
  };
  document.getElementById('fontSelect').onchange = function () { applyFont(this.value); };
  document.getElementById('fullscreenBtn').onclick = toggleFullscreen;
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  document.getElementById('toggleNavBtn').onclick = toggleNavVisibility;
  document.getElementById('laserBtn').onclick = toggleLaser;
  initLaser();
  document.getElementById('exportPdfBtn').onclick = exportPDF;
  document.getElementById('refreshBtn').onclick = refresh;

  initHelpModal();
  initGotoModal();
  initSearch();

  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('mousemove', showNav);

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { repaginate(); }, 200);
  });

  let touchStartX = 0;
  document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const diff = touchStartX - e.changedTouches[0].screenX;
    if (Math.abs(diff) > 50) {
      diff > 0 ? prevPage() : nextPage();
      syncRemoteState();
    }
  }, { passive: true });

  initLightbox();
  initContextMenu();
}
```

- [ ] **Step 2: Commit**

```bash
git add public/slides/js/event-listeners.js
git commit -m "refactor(viewer): extract event wiring into its own module"
```

---

### Task 23: Create the new `public/slides/js/app.js` entry + update build script

**Files:**
- Create: `public/slides/js/app.js`
- Modify: `package.json`

- [ ] **Step 1: Create the entry**

Create `public/slides/js/app.js`:

```js
// Slides viewer entry. Reads URL params, dispatches to loader or playlist,
// then wires DOM events + remote control once the first document is in.
import { initDOM, state, dom } from './state.js';
import { loadDocument } from './loader.js';
import { loadPlaylist } from './playlist.js';
import { initEventListeners } from './event-listeners.js';
import { initRemote } from './remote-control.js';

document.addEventListener('DOMContentLoaded', async () => {
  initDOM();
  const params = new URLSearchParams(window.location.search);
  const src = params.get('src');
  const playlistId = params.get('playlist');

  if (playlistId) {
    await loadPlaylist(playlistId);
  } else if (src) {
    state.currentSrc = src;
    await loadDocument(src);
  } else {
    dom.manuscript.innerHTML = '<p style="color:#ff6b6b;font-size:24px;">請提供 src 或 playlist 參數</p>';
    return;
  }
  initEventListeners();
  initRemote();
});
```

- [ ] **Step 2: Update `package.json` build script**

Open `package.json`. Change the `build` script:

```json
"build": "bun build public/slides/js/app.js --outfile public/slides/dist/app.js"
```

- [ ] **Step 3: Build and verify**

Run: `bun run build`
Expected: produces `public/slides/dist/app.js` with no module-not-found errors. Check file exists and has non-zero size.

```bash
ls -lh public/slides/dist/app.js
```

- [ ] **Step 4: Commit**

```bash
git add public/slides/js/app.js package.json
git commit -m "refactor(viewer): new app.js entry + point build script at /slides/js/"
```

---

### Task 24: Create `public/slides/index.html`

**Files:**
- Create: `public/slides/index.html`
- Reference: `public/index.html` (existing viewer HTML — copy verbatim with path updates)

- [ ] **Step 1: Copy the existing viewer HTML**

```bash
cp public/index.html public/slides/index.html
```

- [ ] **Step 2: Update asset paths inside `public/slides/index.html`**

Update three references:

1. `<link rel="stylesheet" href="/css/slides.css">` → `<link rel="stylesheet" href="/slides/css/slides.css">`
2. Remove the second `<link rel="stylesheet" href="/css/slides-aliswa.css">` line (absorbed into manuscript.css)
3. `<script type="module" src="/dist/app.js"></script>` → `<script type="module" src="/slides/dist/app.js"></script>`

Run to confirm:

```bash
grep -n "slides.css\|slides-aliswa\|/dist/" public/slides/index.html
```

Expected: only `/slides/css/slides.css` and `/slides/dist/app.js` remain.

- [ ] **Step 3: Smoke-test the new viewer locally**

Run: `bun run dev`
Visit: `http://localhost:3000/slides/?src=<some doc_id>` in a browser.
Expected: viewer renders, navigation, font scale, fullscreen, lightbox, search, goto, PDF export, refresh, playlist mode all work. The user is responsible for the visual smoke test.

The OLD viewer at `http://localhost:3000/?src=...` should ALSO still work — both viewer trees coexist until Phase 7.

- [ ] **Step 4: Commit**

```bash
git add public/slides/index.html
git commit -m "feat(viewer): public/slides/index.html mirrors the old viewer at the new path"
```

---

## Phase 5 — Remote Split

### Task 25: Create `public/remote/` with separated CSS and JS

**Files:**
- Create: `public/remote/index.html`, `public/remote/remote.css`, `public/remote/remote.js`
- Reference: `public/remote.html` (existing, 774 lines)

- [ ] **Step 1: Extract the CSS**

Extract lines 8–389 (the contents inside `<style>…</style>`) from `public/remote.html` into `public/remote/remote.css`:

```bash
mkdir -p public/remote
sed -n '8,389p' public/remote.html > public/remote/remote.css
```

- [ ] **Step 2: Extract the JS**

Extract lines 475–771 (the contents inside `<script type="module">…</script>`) into `public/remote/remote.js`:

```bash
sed -n '475,771p' public/remote.html > public/remote/remote.js
```

- [ ] **Step 3: Build the new index.html**

Create `public/remote/index.html`:

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
```

Then append the markup from `public/remote.html` lines 391–473 (everything between the closing `</style>` and the opening `<script>`):

```bash
sed -n '391,473p' public/remote.html >> public/remote/index.html
```

Then append the closing script tag and body/html:

```html
  <script type="module" src="/remote/remote.js"></script>
</body>
</html>
```

(Concretely: open the file and add those last three lines manually.)

- [ ] **Step 4: Verify size and content**

Run:

```bash
wc -l public/remote/*.{html,css,js}
```

Expected: roughly: html ~90, css ~382, js ~297. Total close to 770 (original remote.html minus tag boilerplate).

- [ ] **Step 5: Smoke-test the new remote locally**

Run: `bun run dev`
Open the viewer at `http://localhost:3000/slides/?src=<doc>`, click remote QR, but manually visit `http://localhost:3000/remote/?id=<roomId>` in a separate browser (since the QR still points at the old path until Phase 6 lands the route updates).

Verify the remote page loads its CSS and JS and connects to the room.

- [ ] **Step 6: Commit**

```bash
git add public/remote
git commit -m "refactor(remote): split inline CSS/JS out of remote.html into /remote/"
```

---

## Phase 6 — Routing

### Task 26: Update in-app links and document/d redirect

**Files:**
- Modify: `public/admin/js/dashboard.js`
- Modify: `public/admin/js/playlists.js`
- Modify: `functions/document/d/[[path]].ts`

- [ ] **Step 1: Update `public/admin/js/dashboard.js`**

Change line 101 (the "Play" button handler):

```js
// from:
window.open(`/?src=${encodeURIComponent(docId)}`, "_blank");
// to:
window.open(`/slides/?src=${encodeURIComponent(docId)}`, "_blank");
```

- [ ] **Step 2: Update `public/admin/js/playlists.js`**

Change line 93 (the "Open playlist" button handler):

```js
// from:
window.open(`/?playlist=${id}`, "_blank");
// to:
window.open(`/slides/?playlist=${id}`, "_blank");
```

- [ ] **Step 3: Update `functions/document/d/[[path]].ts`**

Replace the file body with:

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

- [ ] **Step 4: Commit**

```bash
git add public/admin/js/dashboard.js public/admin/js/playlists.js functions/document/d/[[path]].ts
git commit -m "fix(routing): in-app links + Google Docs redirect target /slides/"
```

---

### Task 27: Create `functions/index.ts` smart router + update `_redirects`

**Files:**
- Create: `functions/index.ts`
- Modify: `public/_redirects`

- [ ] **Step 1: Create the Function**

Create `functions/index.ts`:

```ts
// Smart router for `/` — if a viewer query is present (legacy bookmark from
// the days when the viewer lived at root), forward it to /slides/. Otherwise
// fall through to _redirects, which sends bare `/` to `/admin/`.
export const onRequest: PagesFunction = ({ request, next }) => {
  const url = new URL(request.url);
  if (url.searchParams.has("src") || url.searchParams.has("playlist")) {
    const target = new URL(`/slides/${url.search}`, url.origin);
    return Response.redirect(target.toString(), 302);
  }
  return next();
};
```

- [ ] **Step 2: Update `public/_redirects`**

Replace the file contents with:

```
# /  → admin dashboard (Function functions/index.ts handles viewer
# query strings first; this fires only for bare /).
/    /admin/    302
```

- [ ] **Step 3: Commit**

```bash
git add functions/index.ts public/_redirects
git commit -m "feat(routing): `/` routes to /admin/ (or to /slides/ if viewer query present)"
```

---

### Task 28: Update Bun dev (`server/index.ts`) for parity

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Replace the `/document/d/` redirect target**

Find lines 158–161:

```ts
const docMatch = pathname.match(/^\/document\/d\/([a-zA-Z0-9_-]+)/);
if (docMatch) {
  return Response.redirect(`/?src=${docMatch[1]}`, 302);
}
```

Replace the redirect target with `/slides/?src=...`:

```ts
const docMatch = pathname.match(/^\/document\/d\/([a-zA-Z0-9_-]+)/);
if (docMatch) {
  return Response.redirect(`/slides/?src=${docMatch[1]}`, 302);
}
```

- [ ] **Step 2: Add `/` smart router and admin fallback**

Just below the static-file `serveStatic(pathname)` call, but **before** the call, add:

```ts
// /` smart router — viewer query → /slides/; otherwise admin.
if (pathname === "/" && req.method === "GET") {
  if (url.searchParams.has("src") || url.searchParams.has("playlist")) {
    return Response.redirect(`/slides/${url.search}`, 302);
  }
  return Response.redirect("/admin/", 302);
}
```

Place this block immediately after the `/api/playlists/` block (around line 152) and before the `/document/d/` block — so all explicit routes are checked first, but `/` is intercepted before static fallback.

- [ ] **Step 3: Test the routing**

Run: `bun run dev`

In a separate shell:

```bash
for path in "/" "/?src=abc123" "/?playlist=1" "/document/d/abc123/edit?tab=t.0" "/slides/?src=abc123"; do
  echo "--- $path"
  curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3000$path"
done
```

Expected:
- `/` → 302 `/admin/`
- `/?src=abc123` → 302 `/slides/?src=abc123`
- `/?playlist=1` → 302 `/slides/?playlist=1`
- `/document/d/abc123/edit?tab=t.0` → 302 `/slides/?src=abc123`
- `/slides/?src=abc123` → 200 (serves the viewer HTML)

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat(routing): Bun dev parity with CF Pages — / smart router + /slides/ target"
```

---

## Phase 7 — Cleanup

### Task 29: Delete obsolete files

**Files (delete):**
- `public/index.html`
- `public/remote.html`
- `public/js/` (entire directory)
- `public/css/slides.css`
- `public/css/slides-aliswa.css`
- `public/dist/` (gitignored already)
- `server/routes/admin.ts` (if not already deleted in Task 8)

- [ ] **Step 1: Verify no remaining references**

Run:

```bash
grep -rn "public/js/\|/js/slides/\|/css/slides\|/dist/app.js" public functions server CLAUDE.md docs/superpowers
```

Expected: zero hits (or only doc references in `docs/superpowers/specs/*` historical docs, which we leave alone).

- [ ] **Step 2: Delete**

```bash
git rm public/index.html public/remote.html public/css/slides.css public/css/slides-aliswa.css
git rm -r public/js
rm -rf public/dist   # gitignored, no `git rm`
```

If `public/css/` is now empty, remove it too: `rmdir public/css`.

- [ ] **Step 3: Smoke-test once more**

Run: `bun run dev`

Hit (in a browser):
- `http://localhost:3000/` → admin dashboard
- `http://localhost:3000/slides/?src=<doc>` → viewer
- `http://localhost:3000/remote/?id=test` → remote page

All should work without 404s on any asset.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove obsolete public/ and routes/admin.ts stubs after refactor"
```

---

### Task 30: Update `.gitignore` and `CLAUDE.md`

**Files:**
- Modify: `.gitignore`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `.gitignore`**

Open `.gitignore`. Remove the line `public/dist/` (if present). Add `public/slides/dist/`.

```diff
-public/dist/
+public/slides/dist/
```

- [ ] **Step 2: Update `CLAUDE.md`**

Open `CLAUDE.md`. Make the following targeted updates:

**Section "Project Overview"** — keep as is, the description is still accurate.

**Section "Commands"** — change the build line:

```diff
-bun run build                # bundle public/js/app.js → public/dist/app.js
+bun run build                # bundle public/slides/js/app.js → public/slides/dist/app.js
```

**Section "Architecture"** — the diagram needs revision. Replace the `slides.html (public/)` line with `slides/index.html (public/slides/)` and the `remote.html` line with `remote/index.html (public/remote/)`. The Bun server bullet points stay; admin and Drust references stay.

**Section "Layout"** — replace the tree with the post-refactor tree (mirror `docs/superpowers/specs/2026-06-02-routing-and-code-quality-design.md` Section 1).

**Section "Key Components"** — every reference to `js/slides/` becomes `public/slides/js/`. The `slides.html:` heading becomes `public/slides/index.html:`. The `remote.html:` heading becomes `public/remote/index.html:`. The `paginator.ts` reference stays but its path is now `public/slides/js/paginator.ts`. The "Entry" line `js/slides/main.js → state.js + loader.js` becomes `public/slides/js/app.js → loader.js + playlist.js + event-listeners.js + remote-control.js`.

**Section "Roadmap"** — delete the two "Planned" bullets (SSE→Drust broadcast and Bun→CF Pages migration) since both are done. Replace the whole section with one line:

```
Roadmap: see `docs/superpowers/specs/` for active design docs and `docs/superpowers/plans/` for plans.
```

- [ ] **Step 3: Run tests one more time + final smoke**

Run: `bun test && bun run build`
Expected: tests pass, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add .gitignore CLAUDE.md
git commit -m "docs: sync CLAUDE.md and .gitignore with post-refactor layout"
```

---

## Verification Checklist (post-implementation)

After Task 30, run through this checklist to confirm the implementation is complete:

- [ ] `bun test` — all tests pass (original 3 suites + 4 new suites)
- [ ] `bun run build` — produces `public/slides/dist/app.js` with no errors
- [ ] `bun run dev` — server starts, all routes work:
  - `/` → 302 `/admin/`
  - `/?src=X` → 302 `/slides/?src=X`
  - `/?playlist=N` → 302 `/slides/?playlist=N`
  - `/slides/?src=X` → viewer renders
  - `/admin/` → admin dashboard
  - `/remote/?id=test` → remote page
  - `/document/d/<id>/edit?tab=t.0` → 302 `/slides/?src=<id>`
- [ ] User-side viewer smoke (the user runs this): page navigation, font scale, vertical/horizontal toggle, lightbox, search, goto, laser, PDF export, refresh, playlist mode, remote QR+phone connect all work
- [ ] CF Pages deploy of the branch — all routes from above work in prod; existing `/?src=...` bookmarks still take the viewer
- [ ] `grep -rn "/js/slides/\|/css/slides.css\|public/dist\|remote.html" public functions server` — zero hits
- [ ] `CLAUDE.md` reads correctly against the new tree
- [ ] `git log --oneline` — ~30 atomic commits, each one passing tests at HEAD

---

## Out of Scope (intentional)

Per the spec, these are NOT addressed in this plan and stay as follow-up work:

- Performance work (table-canvas async pipeline, image-load streaming, incremental repagination).
- Linter / formatter / CI.
- Drust schema migration or service-token rotation.
- Bookmark migration for `/remote.html?id=…` URLs.
- Pushing the local 88 commits to `origin` — operational decision, not part of this plan.
