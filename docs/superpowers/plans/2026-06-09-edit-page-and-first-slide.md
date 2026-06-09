# Edit Page + First Slide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an edit page at `/edit/?src=<id>` that collects presentation date / title / reporter list, validates them as required, persists to Drust on save, and prepends a synthesized first slide to the doc body. Reroute `/document/d/<id>/…` from the viewer to the editor.

**Architecture:** Pure helpers (`first-slide.ts`) take metadata → emit first-slide HTML. New routes (`edit.ts`) glue GET-seed and POST-validate-persist. Edit page UI is plain HTML/JS/CSS, no framework. CSS appends `.first-slide` block-axis flex to `manuscript.css`. Cloudflare Pages adapters wrap the shared handlers.

**Tech Stack:** Bun, marked, native fetch, plain DOM, CSS containers and writing-modes.

---

## Task 0: Workspace and pre-flight

**Files:**
- Verify: `/Users/kaellim/Desktop/projects/slides` is the working tree, branch `main`, clean.

- [ ] **Step 1: Pre-flight checks**

```bash
git status -sb && git log -1 --oneline
```

Expected: branch main, clean working tree, last commit `b7ec191 docs(spec): edit page + synthesized first slide`.

- [ ] **Step 2: Confirm baseline tests pass**

```bash
bun test server/lib/convert.test.ts server/lib/storage.test.ts server/lib/drust.test.ts
```

Expected: all green. (Drust tests hit the live tenant; if rate-limited, retry the specific file.)

---

## Task 1: `first-slide.ts` pure helpers (TDD)

Pure functions — date string → Chinese string, then metadata → first-slide HTML. No I/O, no Drust, no DOM.

**Files:**
- Create: `server/lib/first-slide.ts`
- Test: `server/lib/first-slide.test.ts`

- [ ] **Step 1: Write the failing test for `dateToChinese`**

Create `server/lib/first-slide.test.ts`:

```ts
import { test, expect } from "bun:test";
import { dateToChinese, composeFirstSlide } from "./first-slide";

// ── dateToChinese ──────────────────────────────────────────────

test("dateToChinese: 2026-06-09 → 二O二六年六月九日（星期二）", () => {
  expect(dateToChinese("2026-06-09")).toBe("二O二六年六月九日（星期二）");
});

test("dateToChinese: single-digit month and day with no zero-padding", () => {
  expect(dateToChinese("2030-01-01")).toBe("二O三O年一月一日（星期二）");
  expect(dateToChinese("2024-09-08")).toBe("二O二四年九月八日（星期日）");
});

test("dateToChinese: double-digit day uses Chinese tens", () => {
  // 2026-06-10 is a Wednesday
  expect(dateToChinese("2026-06-10")).toBe("二O二六年六月十日（星期三）");
  // 2026-06-21 is a Sunday
  expect(dateToChinese("2026-06-21")).toBe("二O二六年六月二十一日（星期日）");
  // 2026-12-31 is a Thursday
  expect(dateToChinese("2026-12-31")).toBe("二O二六年十二月三十一日（星期四）");
});

test("dateToChinese: weekday mapping — all 7", () => {
  // Use the week starting 2026-06-07 (Sunday).
  expect(dateToChinese("2026-06-07")).toContain("（星期日）");
  expect(dateToChinese("2026-06-08")).toContain("（星期一）");
  expect(dateToChinese("2026-06-09")).toContain("（星期二）");
  expect(dateToChinese("2026-06-10")).toContain("（星期三）");
  expect(dateToChinese("2026-06-11")).toContain("（星期四）");
  expect(dateToChinese("2026-06-12")).toContain("（星期五）");
  expect(dateToChinese("2026-06-13")).toContain("（星期六）");
});

test("dateToChinese: year with multiple zeros → multiple Latin O", () => {
  expect(dateToChinese("2000-03-15")).toBe("二OOO年三月十五日（星期三）");
});

test("dateToChinese: throws on malformed input", () => {
  expect(() => dateToChinese("not-a-date")).toThrow();
  expect(() => dateToChinese("2026/06/09")).toThrow();
  expect(() => dateToChinese("2026-13-01")).toThrow();
});

// ── composeFirstSlide ──────────────────────────────────────────

test("composeFirstSlide: emits .first-slide div + trailing <hr>", () => {
  const out = composeFirstSlide({
    presentation_date: "2026-06-09",
    title: "六月共修",
    unit_report: ["陳老師", "林老師"],
  });
  expect(out).toContain('class="first-slide"');
  expect(out).toContain('class="first-slide-date">二O二六年六月九日（星期二）<');
  expect(out).toContain('class="first-slide-title">六月共修<');
  expect(out).toContain('<li>陳老師</li>');
  expect(out).toContain('<li>林老師</li>');
  expect(out.trimEnd().endsWith("<hr>")).toBe(true);
});

test("composeFirstSlide: single reporter still renders an <ol>", () => {
  const out = composeFirstSlide({
    presentation_date: "2026-06-09",
    title: "T",
    unit_report: ["陳老師"],
  });
  expect(out).toContain("<ol>");
  expect(out).toContain("<li>陳老師</li>");
});

test("composeFirstSlide: escapes HTML in title and reporter names", () => {
  const out = composeFirstSlide({
    presentation_date: "2026-06-09",
    title: "<script>alert(1)</script>",
    unit_report: ["\"o'r\""],
  });
  expect(out).not.toContain("<script>");
  expect(out).toContain("&lt;script&gt;");
  expect(out).toContain("&quot;o&#39;r&quot;");
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
bun test server/lib/first-slide.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `first-slide.ts`**

Create `server/lib/first-slide.ts`:

```ts
// Synthesize the first slide of every presentation from structured
// metadata. Pure functions — no I/O, no DOM. Output is plain HTML that
// the existing paginator treats as one slide-page worth of content
// followed by an HR page-break.

export interface FirstSlideMetadata {
  presentation_date: string; // ISO YYYY-MM-DD
  title: string;
  unit_report: string[];
}

const DIGIT_MAP: Record<string, string> = {
  "0": "O", // Latin uppercase O per spec — not the typographic 〇.
  "1": "一",
  "2": "二",
  "3": "三",
  "4": "四",
  "5": "五",
  "6": "六",
  "7": "七",
  "8": "八",
  "9": "九",
};

const ONES = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

function chineseTwoDigit(n: number): string {
  // 1–10 → 一…十; 11–19 → 十一…十九; 20/30 → 二十/三十; 21–39 → 二十一 … 三十九.
  // Months max 12, days max 31, so we never exceed 39.
  if (n < 1 || n > 39 || !Number.isInteger(n)) {
    throw new Error(`chineseTwoDigit out of range: ${n}`);
  }
  if (n < 10) return ONES[n];
  if (n === 10) return "十";
  if (n < 20) return "十" + ONES[n - 10];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ONES[tens] + "十" + (ones === 0 ? "" : ONES[ones]);
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function dateToChinese(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`dateToChinese: invalid ISO date "${iso}"`);
  const [, y, m, d] = match;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`dateToChinese: invalid date "${iso}"`);
  }
  // Round-trip check: rejects e.g. 2026-13-01 which the Date ctor
  // normalises to 2027-01-01.
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() + 1 !== Number(m) ||
    date.getUTCDate() !== Number(d)
  ) {
    throw new Error(`dateToChinese: out-of-range date "${iso}"`);
  }
  const yearCh = y.split("").map((c) => DIGIT_MAP[c]).join("");
  const monthCh = chineseTwoDigit(Number(m));
  const dayCh = chineseTwoDigit(Number(d));
  const weekdayCh = WEEKDAYS[date.getUTCDay()];
  return `${yearCh}年${monthCh}月${dayCh}日（星期${weekdayCh}）`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function composeFirstSlide(meta: FirstSlideMetadata): string {
  const dateText = dateToChinese(meta.presentation_date);
  const title = escapeHtml(meta.title);
  const reporters = meta.unit_report
    .map((r) => `<li>${escapeHtml(r)}</li>`)
    .join("");
  return (
    `<div class="first-slide">\n` +
    `  <div class="first-slide-date">${dateText}</div>\n` +
    `  <div class="first-slide-title">${title}</div>\n` +
    `  <div class="first-slide-reporters"><ol>${reporters}</ol></div>\n` +
    `</div>\n` +
    `<hr>`
  );
}
```

- [ ] **Step 4: Run tests, confirm green**

```bash
bun test server/lib/first-slide.test.ts
```

Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add server/lib/first-slide.ts server/lib/first-slide.test.ts
git commit -m "$(cat <<'EOF'
feat(first-slide): pure helpers for ISO→Chinese date and slide composition

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: extend Drust + storage layers with metadata fields

The fields flow through two files: `drust.ts` owns the wire shape (`DocFields` for writes, `DocRecord` for reads, `normalizeRecord` for parsing), and `storage.ts` adds them to `UpsertDocInput` and threads them into the insert/update calls.

**Files:**
- Modify: `server/lib/drust.ts`
- Modify: `server/lib/storage.ts`
- Modify: `server/lib/storage.test.ts`

- [ ] **Step 1: Baseline**

```bash
bun test server/lib/storage.test.ts
```

Expected: PASS (existing 3 tests).

- [ ] **Step 2: Write the failing round-trip test**

Append to `server/lib/storage.test.ts`:

```ts
test("upsertDoc: round-trips presentation_date and unit_report", async () => {
  const docId = `__upsert_meta_${Date.now()}`;
  try {
    await upsertDoc({
      doc_id: docId,
      title: "T",
      html: "<article class=\"slide-content\"></article>",
      image_ids: [],
      presentation_date: "2026-06-09",
      unit_report: ["陳老師", "林老師"],
    });
    const stored = await findDocByDocId(docId);
    expect(stored?.presentation_date).toBe("2026-06-09");
    expect(stored?.unit_report).toEqual(["陳老師", "林老師"]);

    await upsertDoc({
      doc_id: docId,
      title: "T2",
      html: "<article class=\"slide-content\"></article>",
      image_ids: [],
      presentation_date: "2026-07-01",
      unit_report: ["A"],
    });
    const updated = await findDocByDocId(docId);
    expect(updated?.presentation_date).toBe("2026-07-01");
    expect(updated?.unit_report).toEqual(["A"]);
  } finally {
    const final = await findDocByDocId(docId);
    if (final) await deleteDoc(final.id);
  }
});
```

- [ ] **Step 3: Confirm failure**

```bash
bun test server/lib/storage.test.ts
```

Expected: FAIL — fields aren't sent to Drust and/or aren't parsed back.

- [ ] **Step 4: Extend `drust.ts` types and round-trip**

In `server/lib/drust.ts`:

```ts
// In DocRecord (add to the existing interface):
export interface DocRecord {
  id: number;
  doc_id: string;
  title: string | null;
  html: string | null;
  image_ids: string[] | null;
  presentation_date: string | null;  // NEW — ISO YYYY-MM-DD
  unit_report: string[] | null;       // NEW — JSON array of strings
  is_public: number;
  created_at: string;
  updated_at: string;
}

// In DocFields (add to the existing interface):
export interface DocFields {
  doc_id: string;
  title: string | null;
  html: string;
  image_ids: string[];
  presentation_date?: string | null;  // NEW
  unit_report?: string[] | null;       // NEW
  is_public?: number;
}
```

Extend `normalizeRecord` to JSON-parse `unit_report` the same way it parses `image_ids`:

```ts
function normalizeRecord(raw: any): DocRecord {
  let image_ids: string[] | null = null;
  if (raw.image_ids != null) {
    if (typeof raw.image_ids === "string") {
      try { image_ids = JSON.parse(raw.image_ids); } catch { image_ids = []; }
    } else if (Array.isArray(raw.image_ids)) {
      image_ids = raw.image_ids;
    }
  }
  let unit_report: string[] | null = null;
  if (raw.unit_report != null) {
    if (typeof raw.unit_report === "string") {
      try { unit_report = JSON.parse(raw.unit_report); } catch { unit_report = []; }
    } else if (Array.isArray(raw.unit_report)) {
      unit_report = raw.unit_report;
    }
  }
  return { ...raw, image_ids, unit_report };
}
```

Extend `insertDoc` so it sends `unit_report` as a JSON string (Drust stores TEXT/JSON columns this way, mirroring how `playlists.doc_ids` is serialized):

```ts
export async function insertDoc(data: DocFields): Promise<DocRecord> {
  const payload: Record<string, unknown> = {
    doc_id: data.doc_id,
    title: data.title,
    html: data.html,
    image_ids: data.image_ids,
    is_public: data.is_public ?? 0,
  };
  if (data.presentation_date !== undefined) {
    payload.presentation_date = data.presentation_date;
  }
  if (data.unit_report !== undefined) {
    payload.unit_report =
      data.unit_report === null ? null : JSON.stringify(data.unit_report);
  }
  const res = await drustJson<{ id: number; record: DocRecord }>(
    `/records/docs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: payload }),
    },
  );
  return normalizeRecord(res.record);
}
```

(Check at runtime whether Drust accepts `image_ids` as a JS array directly or also needs `JSON.stringify`. The current insertDoc passes it as an array — if the existing tests pass, that's fine. If the new test fails on the `unit_report` shape, switch both to stringify for safety.)

Extend `updateDoc` to allow patching the new fields:

```ts
export async function updateDoc(
  id: number,
  data: Partial<Pick<DocFields, "title" | "html" | "image_ids" | "presentation_date" | "unit_report" | "is_public">>,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.html !== undefined) patch.html = data.html;
  if (data.image_ids !== undefined) patch.image_ids = data.image_ids;
  if (data.presentation_date !== undefined) patch.presentation_date = data.presentation_date;
  if (data.unit_report !== undefined) {
    patch.unit_report =
      data.unit_report === null ? null : JSON.stringify(data.unit_report);
  }
  if (data.is_public !== undefined) patch.is_public = data.is_public;
  await drustFetch(`/records/docs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: patch }),
  });
}
```

- [ ] **Step 5: Extend `storage.ts`**

In `server/lib/storage.ts`:

```ts
export interface UpsertDocInput {
  doc_id: string;
  title: string | null;
  html: string;
  image_ids: string[];
  presentation_date?: string | null;
  unit_report?: string[] | null;
}
```

In `upsertDoc`, pass the two new fields to both `insertDoc(input)` (already spreads through) and `updateDoc(existing.id, { …, presentation_date, unit_report })`:

```ts
await updateDoc(existing.id, {
  title: input.title,
  html: input.html,
  image_ids: input.image_ids,
  presentation_date: input.presentation_date,
  unit_report: input.unit_report,
});
```

- [ ] **Step 6: Run tests, confirm green**

```bash
bun test server/lib/storage.test.ts
```

Expected: PASS — all 4 tests (3 existing + 1 new round-trip).

- [ ] **Step 7: Commit**

```bash
git add server/lib/drust.ts server/lib/storage.ts server/lib/storage.test.ts
git commit -m "$(cat <<'EOF'
feat(storage): persist presentation_date and unit_report on docs

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `/api/edit/:id` GET + POST routes

Two endpoints. GET seeds the form (stored row OR fresh Google-Doc fetch for new IDs). POST validates, re-fetches the markdown, runs `convertDocument`, prepends `composeFirstSlide`, and upserts.

**Files:**
- Create: `server/routes/edit.ts`
- Create: `server/routes/edit.test.ts`
- Modify: `server/index.ts` (mount the routes)

- [ ] **Step 1: Write the route shape and its test**

Create `server/routes/edit.test.ts`:

```ts
import { test, expect } from "bun:test";
import { handleGetEdit, handlePostEdit } from "./edit";

test("handlePostEdit: rejects missing presentation_date", async () => {
  const res = await handlePostEdit("__fake_id", {
    title: "T",
    unit_report: ["A"],
  } as never);
  expect(res.status).toBe(422);
  const body = (await res.json()) as { error: string };
  expect(body.error).toBe("presentation_date_invalid");
});

test("handlePostEdit: rejects empty title", async () => {
  const res = await handlePostEdit("__fake_id", {
    presentation_date: "2026-06-09",
    title: "   ",
    unit_report: ["A"],
  });
  expect(res.status).toBe(422);
  expect((await res.json()).error).toBe("title_required");
});

test("handlePostEdit: rejects empty unit_report", async () => {
  const res = await handlePostEdit("__fake_id", {
    presentation_date: "2026-06-09",
    title: "T",
    unit_report: [],
  });
  expect(res.status).toBe(422);
  expect((await res.json()).error).toBe("unit_report_required");
});

test("handlePostEdit: rejects unit_report with only empty strings", async () => {
  const res = await handlePostEdit("__fake_id", {
    presentation_date: "2026-06-09",
    title: "T",
    unit_report: ["", "   "],
  });
  expect(res.status).toBe(422);
  expect((await res.json()).error).toBe("unit_report_required");
});

test("handlePostEdit: rejects malformed presentation_date", async () => {
  const res = await handlePostEdit("__fake_id", {
    presentation_date: "06/09/2026",
    title: "T",
    unit_report: ["A"],
  });
  expect(res.status).toBe(422);
  expect((await res.json()).error).toBe("presentation_date_invalid");
});
```

(Note: the happy-path POST hits Google Docs and Drust. We DO NOT exercise it in unit tests; the validation slice is what we lock down here.)

- [ ] **Step 2: Run the test, confirm it fails**

```bash
bun test server/routes/edit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `edit.ts`**

Create `server/routes/edit.ts`:

```ts
import { fetchMarkdown } from "../lib/google-docs";
import { convertDocument, extractTitle } from "../lib/convert";
import { composeFirstSlide } from "../lib/first-slide";
import { upsertDoc } from "../lib/storage";
import { findDocByDocId } from "../lib/drust";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface EditPayload {
  presentation_date: string;
  title: string;
  unit_report: string[];
}

export interface SeedResponse {
  doc_id: string;
  title: string;
  presentation_date: string; // today if no stored value
  unit_report: string[]; // [] if no stored value
  source: "stored" | "fresh";
}

function todayIsoUtc(): string {
  // YYYY-MM-DD in UTC.
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function handleGetEdit(doc_id: string): Promise<Response> {
  const stored = await findDocByDocId(doc_id);
  if (stored) {
    const body: SeedResponse = {
      doc_id,
      title: stored.title ?? "",
      presentation_date: stored.presentation_date ?? todayIsoUtc(),
      unit_report: stored.unit_report ?? [],
      source: "stored",
    };
    return Response.json(body);
  }
  // No stored record — fetch the Google Doc just to seed the title.
  // If Google fetch fails, fall back to empty title; the user can fill it in.
  let title = "";
  try {
    const markdown = await fetchMarkdown(doc_id);
    title = extractTitle(markdown) ?? "";
  } catch {
    title = "";
  }
  const body: SeedResponse = {
    doc_id,
    title,
    presentation_date: todayIsoUtc(),
    unit_report: [],
    source: "fresh",
  };
  return Response.json(body);
}

function validate(payload: EditPayload): string | null {
  if (typeof payload.presentation_date !== "string" || !DATE_RE.test(payload.presentation_date)) {
    return "presentation_date_invalid";
  }
  const d = new Date(`${payload.presentation_date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "presentation_date_invalid";
  if (typeof payload.title !== "string" || payload.title.trim().length === 0) {
    return "title_required";
  }
  if (!Array.isArray(payload.unit_report)) return "unit_report_required";
  const cleaned = payload.unit_report
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
  if (cleaned.length === 0) return "unit_report_required";
  return null;
}

export async function handlePostEdit(
  doc_id: string,
  payload: EditPayload,
): Promise<Response> {
  const err = validate(payload);
  if (err) {
    return Response.json({ error: err }, { status: 422 });
  }
  const unit_report = payload.unit_report.map((s) => s.trim()).filter((s) => s.length > 0);
  const title = payload.title.trim();
  const presentation_date = payload.presentation_date;

  const markdown = await fetchMarkdown(doc_id);
  const { html: bodyHtml, imageIds } = await convertDocument(markdown);
  const firstSlide = composeFirstSlide({ presentation_date, title, unit_report });
  // Insert first-slide HTML inside the article wrapper so paginator iterates it.
  const finalHtml = bodyHtml.replace(
    /^<article class="slide-content">\n?/,
    (m) => `${m}${firstSlide}\n`,
  );

  await upsertDoc({
    doc_id,
    title,
    html: finalHtml,
    image_ids: imageIds,
    presentation_date,
    unit_report,
  });

  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Wire into Bun server**

In `server/index.ts`, add the dispatch:

```ts
// inside the request handler:
if (url.pathname === "/api/edit/" || url.pathname.startsWith("/api/edit/")) {
  const id = url.pathname.replace(/^\/api\/edit\//, "").replace(/\/$/, "");
  if (!id) return new Response("Bad Request", { status: 400 });
  if (req.method === "GET") return handleGetEdit(id);
  if (req.method === "POST") {
    const payload = (await req.json()) as EditPayload;
    return handlePostEdit(id, payload);
  }
  return new Response("Method Not Allowed", { status: 405 });
}
```

(Adapt to the existing dispatcher's style — match how `/api/fetch-doc` is mounted.)

- [ ] **Step 5: Run tests, confirm green**

```bash
bun test server/routes/edit.test.ts
```

Expected: PASS — 5 validation tests.

- [ ] **Step 6: Commit**

```bash
git add server/routes/edit.ts server/routes/edit.test.ts server/index.ts
git commit -m "$(cat <<'EOF'
feat(edit): GET/POST /api/edit/:id with validation and first-slide injection

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: reroute `/document/d/<id>/…` → `/edit/?src=<id>` (Bun + Pages)

The "paste Google Docs URL with our domain" entry point now lands on the editor, not the viewer.

**Files:**
- Modify: `server/index.ts`
- Modify: `functions/document/d/[[path]].ts`

- [ ] **Step 1: Bun server — change the 302 target**

In `server/index.ts`, find the `/document/d/<id>/…` handler and change its target:

```ts
// before: `/slides/?src=${id}`
// after:
return Response.redirect(`/edit/?src=${encodeURIComponent(id)}`, 302);
```

- [ ] **Step 2: Cloudflare Pages adapter — same change**

In `functions/document/d/[[path]].ts`, change the redirect target to `/edit/?src=${id}`.

- [ ] **Step 3: Quick manual smoke (dev server should already be running)**

```bash
curl -sI http://localhost:3000/document/d/SOME_ID/edit
```

Expected: `HTTP/1.1 302` with `Location: /edit/?src=SOME_ID`.

- [ ] **Step 4: Commit**

```bash
git add server/index.ts functions/document/d/[[path]].ts
git commit -m "$(cat <<'EOF'
feat(routing): /document/d/<id>/* now lands on /edit/ instead of /slides/

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Edit page static UI

Plain HTML/JS/CSS. The page reads `?src=` from the URL, GETs the seed, renders the form, POSTs on submit, redirects to viewer on success.

**Files:**
- Create: `public/edit/index.html`
- Create: `public/edit/edit.js`
- Create: `public/edit/edit.css`
- Modify: `server/index.ts` if the static handler doesn't already serve `/edit/`

- [ ] **Step 1: Build `index.html`**

Create `public/edit/index.html`:

```html
<!DOCTYPE html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>編輯簡報</title>
    <link rel="stylesheet" href="/theme/default/index.css">
    <link rel="stylesheet" href="edit.css">
  </head>
  <body>
    <main class="edit-shell">
      <h1>編輯簡報</h1>

      <div id="status" class="status" hidden></div>

      <form id="edit-form" hidden>
        <label class="field">
          <span class="field-label">簡報日期 <em>*</em></span>
          <input type="date" id="presentation-date" required>
        </label>

        <label class="field">
          <span class="field-label">簡報標題 <em>*</em></span>
          <input type="text" id="title" required maxlength="200">
        </label>

        <fieldset class="field">
          <legend class="field-label">單位報告 <em>*</em></legend>
          <ol id="reporter-list"></ol>
          <button type="button" id="add-reporter" class="ghost-btn">＋ 新增</button>
        </fieldset>

        <div class="actions">
          <a href="/admin/" class="ghost-btn">取消</a>
          <button type="submit" id="save-btn" class="primary-btn" disabled>儲存並預覽</button>
        </div>
      </form>
    </main>
    <script type="module" src="edit.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Build `edit.js`**

Create `public/edit/edit.js`:

```js
const params = new URLSearchParams(location.search);
const docId = params.get("src");
const $form = document.getElementById("edit-form");
const $status = document.getElementById("status");
const $date = document.getElementById("presentation-date");
const $title = document.getElementById("title");
const $list = document.getElementById("reporter-list");
const $add = document.getElementById("add-reporter");
const $save = document.getElementById("save-btn");

function showStatus(msg, kind = "info") {
  $status.hidden = false;
  $status.textContent = msg;
  $status.dataset.kind = kind;
}

function clearStatus() {
  $status.hidden = true;
  $status.textContent = "";
}

function reporterRow(value = "") {
  const li = document.createElement("li");
  li.className = "reporter-row";
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.maxLength = 60;
  input.addEventListener("input", updateSaveState);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "ghost-btn ghost-btn--icon";
  remove.textContent = "−";
  remove.addEventListener("click", () => {
    if ($list.children.length <= 1) return;
    li.remove();
    updateSaveState();
  });
  li.append(input, remove);
  return li;
}

function updateSaveState() {
  const reporters = [...$list.querySelectorAll("input")]
    .map((i) => i.value.trim())
    .filter((v) => v.length > 0);
  const ok =
    !!$date.value &&
    $title.value.trim().length > 0 &&
    reporters.length > 0;
  $save.disabled = !ok;
}

function seedForm(data) {
  $date.value = data.presentation_date;
  $title.value = data.title;
  $list.innerHTML = "";
  const initial = data.unit_report.length > 0 ? data.unit_report : [""];
  for (const name of initial) $list.appendChild(reporterRow(name));
  updateSaveState();
}

$add.addEventListener("click", () => {
  $list.appendChild(reporterRow());
  updateSaveState();
});
$date.addEventListener("input", updateSaveState);
$title.addEventListener("input", updateSaveState);

$form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const unit_report = [...$list.querySelectorAll("input")]
    .map((i) => i.value.trim())
    .filter((v) => v.length > 0);
  const payload = {
    presentation_date: $date.value,
    title: $title.value.trim(),
    unit_report,
  };
  $save.disabled = true;
  showStatus("儲存中…");
  try {
    const res = await fetch(`/api/edit/${encodeURIComponent(docId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      showStatus(`儲存失敗：${body.error || res.status}`, "error");
      $save.disabled = false;
      return;
    }
    location.href = `/slides/?src=${encodeURIComponent(docId)}`;
  } catch (err) {
    showStatus(`儲存失敗：${err.message}`, "error");
    $save.disabled = false;
  }
});

async function init() {
  if (!docId) {
    showStatus("缺少 ?src=<doc_id> 參數", "error");
    return;
  }
  showStatus("載入中…");
  try {
    const res = await fetch(`/api/edit/${encodeURIComponent(docId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    seedForm(data);
    clearStatus();
    $form.hidden = false;
  } catch (err) {
    showStatus(`無法載入：${err.message}`, "error");
  }
}

init();
```

- [ ] **Step 3: Build `edit.css`**

Create `public/edit/edit.css`:

```css
:root {
  color-scheme: dark;
}

.edit-shell {
  max-width: 720px;
  margin: 4rem auto;
  padding: 2rem;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  color: #fff;
  font-family: system-ui, -apple-system, "Helvetica Neue", sans-serif;
}

.edit-shell h1 {
  margin: 0 0 1.5rem;
  font-size: 1.75rem;
}

.field {
  display: block;
  margin-bottom: 1.5rem;
}

.field-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.field-label em {
  font-style: normal;
  color: #ff6b6b;
}

input[type="date"],
input[type="text"] {
  width: 100%;
  padding: 0.6rem 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  font-size: 1rem;
}

fieldset.field {
  border: none;
  padding: 0;
  margin: 0 0 1.5rem;
}

#reporter-list {
  list-style: decimal inside;
  padding-left: 0;
  margin: 0 0 0.8rem;
}

.reporter-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.5rem;
}

.reporter-row input {
  flex: 1;
}

.ghost-btn {
  padding: 0.5rem 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  text-decoration: none;
  font-size: 0.95rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ghost-btn:hover { background: rgba(255, 255, 255, 0.08); }

.ghost-btn--icon {
  width: 2.2rem;
  height: 2.2rem;
  padding: 0;
}

.primary-btn {
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: 6px;
  background: var(--color-primary, #00FDFF);
  color: #000;
  font-weight: 700;
  cursor: pointer;
}

.primary-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 2rem;
}

.status {
  margin-bottom: 1.5rem;
  padding: 0.6rem 0.9rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
}

.status[data-kind="error"] {
  background: rgba(255, 100, 100, 0.18);
  color: #ffb4b4;
}
```

- [ ] **Step 4: Confirm static serving covers `/edit/`**

In `server/index.ts`, the existing static file handler should already serve `public/edit/*`. If routing checks individual top-level paths (`/admin/`, `/slides/`, `/remote/`), add `/edit/` analogously so `GET /edit/` returns `public/edit/index.html`.

- [ ] **Step 5: Smoke test**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/edit/
```

Expected: `200`.

- [ ] **Step 6: Commit**

```bash
git add public/edit/index.html public/edit/edit.js public/edit/edit.css server/index.ts
git commit -m "$(cat <<'EOF'
feat(edit): form UI — date / title / dynamic reporter list

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Cloudflare Pages adapter for `/api/edit/:id`

Mirror the Bun handlers behind a Pages Function so production has parity.

**Files:**
- Create: `functions/api/edit/[id].ts`

- [ ] **Step 1: Write the adapter**

Create `functions/api/edit/[id].ts` mirroring the `functions/api/fetch-doc.ts` shape (env-shim + dispatch):

```ts
import { shimProcessEnv, type Env } from "../../_lib/env-shim";
import { handleGetEdit, handlePostEdit } from "../../../server/routes/edit";

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  shimProcessEnv(env);
  const id = String(params.id);
  return handleGetEdit(id);
};

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  shimProcessEnv(env);
  const id = String(params.id);
  const payload = await request.json();
  return handlePostEdit(id, payload as never);
};
```

- [ ] **Step 2: Verify build still bundles**

```bash
bun run build
```

Expected: build passes.

- [ ] **Step 3: Commit**

```bash
git add functions/api/edit/[id].ts
git commit -m "$(cat <<'EOF'
feat(edit): Cloudflare Pages adapter mirrors Bun edit routes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: admin upload redirect → `/edit/?src=<id>`

When `POST /api/fetch-doc` succeeds in the admin UI, redirect to the edit page (instead of straight to slides), forcing metadata entry.

**Files:**
- Modify: the admin JS file that handles upload success (likely `public/admin/js/<something>.js`)

- [ ] **Step 1: Locate the success handler**

The new-doc modal's submit handler lives in `public/admin/js/dashboard.js` around line 153-186. On `body.success` it currently calls `close(); await refresh();` (stays on admin). It needs to navigate to the edit page so the user fills metadata before the doc is published.

- [ ] **Step 2: Change the success path**

In `public/admin/js/dashboard.js`, replace the success branch:

```js
if (!res.ok || !body.success) {
  errEl.textContent = body.error || `匯入失敗（HTTP ${res.status}）`;
  submitBtn.disabled = false;
  submitBtn.textContent = "匯入";
  return;
}
close();
// Force metadata entry — every newly imported doc passes through the edit
// page before it appears on the slides surface. body.doc_id is the
// canonical id (extracted server-side from the pasted URL).
location.href = `/edit/?src=${encodeURIComponent(body.doc_id)}`;
```

- [ ] **Step 3: Smoke**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/
```

Expected: `200`. Then in the dev tools, the modal submit should navigate to `/edit/?src=<id>` on a successful import. (User verifies in browser; we can't smoke the full modal flow here.)

- [ ] **Step 4: Commit**

```bash
git add public/admin/
git commit -m "$(cat <<'EOF'
feat(admin): post-upload nav goes to /edit/ to force metadata entry

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: first-slide CSS in `manuscript.css`

Layout the synthesized slide as a horizontal-tb flex row, three vertical-rl panels. Document the geometry inline.

**Files:**
- Modify: `public/slides/css/manuscript.css`

- [ ] **Step 1: Append the rules**

Add to `public/slides/css/manuscript.css`:

```css
/* ===========================
   首頁（server-side composed in server/lib/first-slide.ts）
   Three vertical panels — DOM order [date, title, reporters];
   row-reverse flips them visually to [reporters, title, date]
   left-to-right, matching the user spec (rightmost = date, leftmost = reporters)
   and Chinese vertical reading order (right→left = first→last read).
   =========================== */
.first-slide {
  writing-mode: horizontal-tb;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  justify-content: space-around;
  padding: 4cqi;
  box-sizing: border-box;
}

.first-slide-date,
.first-slide-title,
.first-slide-reporters {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  text-align: center;
  letter-spacing: 0.15em;
  line-height: 1.6;
}

.first-slide-date {
  font-size: calc(clamp(28px, 5cqi, 60px) * var(--font-scale) * var(--mode-scale));
  color: var(--color-secondary);
}

.first-slide-title {
  font-size: calc(clamp(48px, 9cqi, 120px) * var(--font-scale) * var(--mode-scale));
  color: var(--color-primary);
  font-weight: 700;
}

.first-slide-reporters {
  font-size: calc(clamp(28px, 5cqi, 60px) * var(--font-scale) * var(--mode-scale));
  color: var(--color-text-primary);
}

.first-slide-reporters ol {
  list-style-position: inside;
  padding: 0;
  margin: 0;
}

.first-slide-reporters li {
  margin-bottom: 0.6rem;
}

.first-slide-reporters li::marker {
  color: var(--color-primary);
}
```

- [ ] **Step 2: Commit**

```bash
git add public/slides/css/manuscript.css
git commit -m "$(cat <<'EOF'
feat(first-slide): horizontal-tb flex layout — date/title/reporters columns

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: full-suite green + deploy

- [ ] **Step 1: Run the full test suite**

```bash
bun test
```

Expected: all green. (Drust tests insert `__roundtrip_*`, `__upsert_*`, etc. and clean up.)

- [ ] **Step 2: Build**

```bash
bun run build
```

Expected: bundle succeeds.

- [ ] **Step 3: Push + deploy**

```bash
git push origin main
CLOUDFLARE_ACCOUNT_ID=$(grep CLOUDFLARE_ACCOUNT_ID key.md | cut -d' ' -f2) \
CLOUDFLARE_API_TOKEN=$(grep CLOUDFLARE_API_TOKEN key.md | cut -d' ' -f2) \
bunx wrangler pages deploy public --project-name=slides --branch=main --commit-dirty=true
```

Expected: deploy succeeds.

- [ ] **Step 4: Report**

Tell the user:
- New routes live: `/edit/?src=<id>` and `/api/edit/:id`.
- `/document/d/<id>/*` and admin upload both now land on the edit page.
- Required fields enforced both client- and server-side.
- Date renders as `二O二六年六月九日（星期X）`; first slide uses `row-reverse` horizontal flex with three vertical-rl panels.
- Existing docs without metadata still render normally; they pick up a first slide the next time they're saved through the edit page.
