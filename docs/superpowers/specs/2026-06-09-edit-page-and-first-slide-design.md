# Edit Page + Synthesized First Slide

**Date:** 2026-06-09
**Status:** Ready for review
**Scope:** Add a per-document edit page that collects presentation metadata (date, title, reporters) and synthesizes a uniform first slide from those fields. Reroute the `/document/d/<id>/…` "paste Google Docs URL with our domain" entrypoint to this edit page instead of jumping straight to the viewer.

---

## Background

Today, pasting a Google Docs URL with our domain (or hitting any `/document/d/<id>/…` path) 302s to `/slides/?src=<id>`. The viewer either renders the existing record or, if the doc was never ingested, hits an empty state. Admin upload also takes a URL and silently ingests with no chance to attach metadata.

For internal usage in the org, every presentation needs three pieces of metadata that aren't in the Google Doc body:

1. **簡報日期** — when the talk is being given (not when the doc was created)
2. **簡報標題** — display title (today this is the doc's H1, which doesn't always match the talk title)
3. **單位報告** — one or more reporter names

These were previously typed manually into the first slide of each Google Doc, which is error-prone and inconsistent. The goal is to move them into structured fields and render a single canonical first slide format every time.

## Goals

- Single ingest path: every doc passes through the edit page before becoming a slide. New ID or existing ID, same form.
- Metadata is stored separately from the body HTML, in known columns on the `docs` Drust collection.
- First slide is server-side composed at save time from the form fields, prepended to the body HTML with a forced page break.
- All three fields are required (frontend + backend validation).
- Existing records (no metadata) keep working — they just don't get a synthesized first slide until their next save.

## Non-Goals

- Editing the slide body HTML or markdown on this page. Body comes from Google Docs as before; the edit page is for metadata + the trigger-re-fetch action.
- Backfilling existing docs automatically. Migration is opt-in: the next time a record is saved through the edit page, the new fields fill in.
- Per-org or per-tenant unit/reporter directories. The reporter list is freeform strings, not a managed entity.
- Permission / auth. The edit page is reachable by anyone who knows the URL, same as the rest of the app — access control stays in Drust's `anon_caps`.

## Routing

| URL | Behavior |
|---|---|
| `GET /document/d/<id>/…` | 302 → `/edit/?src=<id>` (was: `/slides/?src=<id>`) |
| `GET /edit/?src=<id>` | Renders the edit page UI |
| `GET /api/edit/<id>` | Returns `{ doc_id, title, presentation_date, unit_report, source: "stored" \| "fresh" }`. Stored = read from Drust. Fresh = no record exists, so server fetches the Google Doc to seed `title` from its H1 |
| `POST /api/edit/<id>` | Body: `{ presentation_date, title, unit_report[] }`. Server (1) re-fetches markdown from Google Docs, (2) converts to body HTML, (3) composes first-slide HTML from the posted metadata, (4) upserts `{title, presentation_date, unit_report, html, image_ids}`. Returns `{ok: true}` |
| `GET /slides/?src=<id>` | Unchanged |
| `GET /admin/` upload action | After successful POST `/api/fetch-doc`, redirect client-side to `/edit/?src=<id>` instead of going straight to the viewer |

The Bun dev server (`server/routes/`) and the Cloudflare Pages adapter (`functions/document/d/[[path]].ts`, `functions/api/edit/[id].ts`) both implement this contract.

## Data Model

`docs` collection currently has `{doc_id, title, html, image_ids, created_at}`. Add:

| Column | Type | Required | Notes |
|---|---|---|---|
| `presentation_date` | `date` (ISO `YYYY-MM-DD`) | nullable | Distinct from `created_at`. Nullable so existing records still read. |
| `unit_report` | `json` (array of strings) | nullable | `null` for legacy records; `[]` is treated the same as `null` on read. Validated non-empty on write. |

No schema migration script — Drust accepts new keys per-row. Old rows without these keys simply return `undefined`, which the read path treats as "legacy record, skip first-slide synthesis."

## Edit Page UI

`public/edit/index.html` + `public/edit/edit.js` + `public/edit/edit.css`. Single-page form, no framework.

```
┌─────────────────────────────────────────────┐
│  編輯簡報                                    │
│                                             │
│  簡報日期 *                                  │
│  [ 2026-06-09 ▾ ]                          │
│                                             │
│  簡報標題 *                                  │
│  [ ____________________________________ ]   │
│                                             │
│  單位報告 *                                  │
│  1. [ ________________ ] [ − ]              │
│  2. [ ________________ ] [ − ]              │
│  [ + 新增 ]                                  │
│                                             │
│           [ 取消 ]   [ 儲存並預覽 ]            │
└─────────────────────────────────────────────┘
```

- Date input: native `<input type="date">`, default today for new IDs.
- Title input: text, default to Google Doc's H1 (server-supplied via `GET /api/edit/<id>`).
- Reporter list: a vertical stack of text inputs, each with a `−` button. A single `+ 新增` button at the bottom appends a blank row.
  - Removing the last remaining row is disabled (must have ≥1 row).
  - Empty rows on submit are stripped, then validated; if zero non-empty rows remain, submission is rejected client-side.
- "儲存並預覽" is disabled until all three fields are valid. On success → `location.href = '/slides/?src=<id>'`.
- "取消" → `/admin/`.

Validation rules (enforced both client-side and in `POST /api/edit/<id>`):

| Field | Rule | Error response on POST |
|---|---|---|
| `presentation_date` | matches `^\d{4}-\d{2}-\d{2}$`, parseable as a Date | 422 `{error: "presentation_date_invalid"}` |
| `title` | trimmed length ≥ 1 | 422 `{error: "title_required"}` |
| `unit_report` | array of ≥1 strings, each trimmed length ≥ 1 | 422 `{error: "unit_report_required"}` |

## First Slide Synthesis

A server-side helper `composeFirstSlide({ presentation_date, title, unit_report }) → string` returns:

```html
<div class="first-slide">
  <div class="first-slide-date">二O二六年六月九日（星期二）</div>
  <div class="first-slide-title">課程名稱</div>
  <div class="first-slide-reporters">
    <ol>
      <li>陳老師</li>
      <li>林老師</li>
    </ol>
  </div>
</div>
<hr>
```

This is prepended to the converted body HTML at save time. The trailing `<hr>` forces the paginator to start a new page after the first slide (paginator already treats `<hr>` as a hard page break — `paginator.ts:207`).

### Date rendering

Input is the ISO `YYYY-MM-DD` stored value. Output is `二O二六年六月九日（星期X）`.

- Year: each digit mapped, **0 → `O`** (Latin uppercase O, as the user wrote — not the typographic `〇`).
- Month and day: rendered as Chinese cardinal numerals with no leading zero. `6` → `六`, `10` → `十`, `12` → `十二`, `21` → `二十一`, `30` → `三十`.
- Weekday: computed in UTC from the ISO date to avoid timezone drift; mapped `日 一 二 三 四 五 六` (Sunday = 日).

Pure function, lives in `server/lib/first-slide.ts`, unit-tested with edge cases (single-digit day, end-of-month, year boundaries, all weekdays).

### Layout

The parent `.slide-page` is `writing-mode: vertical-rl`. A child with `display: flex; flex-direction: row` lays items along the inline axis, which in `vertical-rl` is top-to-bottom — wrong. So `.first-slide` itself flips to `writing-mode: horizontal-tb` (only for laying out the three sections), while each of the three inner blocks declares `writing-mode: vertical-rl` so their text still reads vertically.

DOM order is `[date, title, reporters]` so the source matches reading order (right → left in vertical-rl). With `flex-direction: row-reverse` in a horizontal-tb container, the visual order becomes `[reporters, title, date]` left-to-right — which matches the user's spec (rightmost = date).

```css
.first-slide {
  writing-mode: horizontal-tb;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  justify-content: space-around;
}
.first-slide-date,
.first-slide-title,
.first-slide-reporters {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  text-align: center;
}
```

Resulting layout:

```
←-- inline-axis (vertical-rl writes here) ----
 ┌──────┬──────┬──────┐
 │      │      │      │
 │ 1.陳 │ 課程  │  二O │
 │ 2.林 │ 名稱  │  二六 │
 │      │      │  年   │
 └──────┴──────┴──────┘
   left  center  right
   ↑                ↑
   last read   first read (reading order is right→left)
```

Per the user: rightmost = date, center = title, leftmost = reporters.

### Body integration

`composeFirstSlide` runs in the `POST /api/edit/<id>` handler, AFTER `convertDocument`:

```ts
const { html: bodyHtml, imageIds, title: docH1 } = await convertDocument(markdown);
const firstSlide = composeFirstSlide({ presentation_date, title, unit_report });
const finalHtml = firstSlide + bodyHtml;  // <article> still wraps bodyHtml; firstSlide sits before it
```

Actually `convertDocument` already wraps in `<article class="slide-content">`. The first slide needs to be inside that wrapper so the paginator iterates it. So `composeFirstSlide` returns the `<div class="first-slide">...</div><hr>` only, and the handler injects it inside the article:

```ts
const finalHtml = bodyHtml.replace(
  /^<article class="slide-content">\n/,
  `<article class="slide-content">\n${firstSlide}\n`,
);
```

A small, predictable replace against the known prefix.

## Admin upload flow

`POST /api/fetch-doc` keeps its existing behavior (fetch + convert + upsert). The admin UI's success handler changes:

- Before: redirect to `/slides/?src=<id>`
- After: redirect to `/edit/?src=<id>`

This forces the metadata-fill step. If a user uploads a doc and immediately closes the tab without filling metadata, the Drust record still exists with the old body HTML and `presentation_date = null`, so the viewer still works — they just don't get a first slide. Re-visiting the URL drops them back at the edit page to complete it.

## File Structure

```
public/edit/
├── index.html             # NEW — form skeleton
├── edit.js                # NEW — form logic, GET seed, POST submit
└── edit.css               # NEW — form styling, matches admin

public/slides/css/
└── manuscript.css         # MODIFY — add .first-slide rules

server/lib/
├── first-slide.ts         # NEW — composeFirstSlide + dateToChinese helpers
├── first-slide.test.ts    # NEW — unit tests for date rendering edge cases
├── storage.ts             # MODIFY — upsertDoc accepts presentation_date + unit_report
└── google-docs.ts         # unchanged

server/routes/
├── edit.ts                # NEW — GET /api/edit/:id, POST /api/edit/:id
└── docs.ts                # MODIFY — admin redirect target

server/index.ts            # MODIFY — /document/d/* now → /edit/?src=, route /edit/ static, mount edit routes

functions/
├── document/d/[[path]].ts # MODIFY — redirect target
├── api/edit/[id].ts       # NEW — Pages Function adapter for the edit routes
└── index.ts               # MODIFY — / smart router includes /edit/

public/_redirects          # unchanged
```

## Tests

New:
- `server/lib/first-slide.test.ts` — `dateToChinese` rendering: `2026-06-09` → `二O二六年六月九日（星期二）`, year boundaries (`2020-01-01`, `2030-12-31`), Sunday/Saturday, single-digit day, two-digit day, weekday correctness against a known reference date.
- `server/routes/edit.test.ts` — `GET /api/edit/:id` returns stored vs fresh; `POST /api/edit/:id` validates required fields, persists, returns 422 on missing data, returns 200 on success.

Modified:
- `server/lib/storage.test.ts` — round-trip `presentation_date` + `unit_report` through upsertDoc.

## Open Questions

None — all design decisions confirmed in brainstorming.

## Done When

- Pasting `https://[platform]/document/d/<id>/edit?tab=t.0` lands on the edit page (not the viewer).
- Edit page seeds: new ID → title=H1, date=today, reporters=`[]`; existing ID → all three from Drust.
- Submit with any empty field is rejected client-side AND with 422 server-side.
- Successful save → re-fetches markdown, composes first slide, upserts, redirects to viewer.
- Viewer renders the synthesized first slide as the literal first page; existing pre-feature records still render normally with no first slide.
- All new tests pass; existing tests still pass.
