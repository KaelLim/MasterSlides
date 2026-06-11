import { marked } from "marked";

export interface ConvertResult {
  html: string;
  imageCount: number;
  imageIds: string[];
  title: string | null;
}

// First level-1 ATX heading ("# Title") in the document — that's what
// Google Docs renders as the doc's H1. Returns null if absent so callers
// can fall back to doc_id or an explicit override.
export function extractTitle(markdown: string): string | null {
  let inFence = false;
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line || line.startsWith("[")) continue;
    const m = line.match(/^#\s+(.+?)\s*#*$/);
    if (m) {
      const t = m[1].trim();
      return t || null;
    }
  }
  return null;
}

// Images are kept inline as base64 data URLs in the rendered HTML — the
// whole HTML file gets PUT to one S3 object via uploadHtmlFile(), which
// avoids: N atob/uploadImage subrequests per convert (was killing CF Pages
// CPU on image-heavy decks), per-file orphan tracking, the (img-fetch ×
// viewer-load) bandwidth multiplier, and the same-origin proxy hop that
// previously existed only so html2canvas wouldn't choke on cross-origin
// Drust URLs (base64 sidesteps CORS entirely).
//
// This function now only strips "分頁 N" page-break markers (unrelated to
// images but cheap to keep colocated) and tallies image refs for telemetry.
// imageIds is always `[]` — upsertDoc's old-image-cleanup loop becomes a
// no-op for new saves, and naturally garbage-collects legacy file_ids when
// a pre-2026-06-12 doc is re-synced.
export async function processImages(
  markdown: string
): Promise<{ markdown: string; imageCount: number; imageIds: string[] }> {
  const lines = markdown.split("\n");
  const processedLines: string[] = [];
  let imageCount = 0;

  const imageRefRe = /^\[[^\]]+\]:\s*<data:image\/(?:png|jpeg|jpg|gif|webp);base64,/;

  for (const line of lines) {
    // Skip "分頁 N" markers
    if (/^#*\s*分頁\s*\d+\s*$/.test(line.trim())) {
      continue;
    }
    if (imageRefRe.test(line)) imageCount++;
    processedLines.push(line);
  }

  return { markdown: processedLines.join("\n"), imageCount, imageIds: [] };
}

function cleanImageStyles(html: string): string {
  return html.replace(/<img([^>]*)\s+style="[^"]*"([^>]*)>/gi, "<img$1$2>");
}

// ── Video embeds ────────────────────────────────────────────────────────
// Single-link-per-paragraph YouTube/Drive URLs become responsive iframes.
// A URL surrounded by other text in the same paragraph stays a clickable
// link — Notion/Obsidian-style heuristic.

export function extractYouTubeId(url: string): string | null {
  // youtu.be/<id>, youtube.com/{watch?v=, embed/, shorts/, live/}<id>.
  // Video IDs are exactly 11 chars from [A-Za-z0-9_-].
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:[^"\s]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})\b/,
  );
  return m ? m[1] : null;
}

export function extractDriveId(url: string): string | null {
  let m = url.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  m = url.match(/drive\.google\.com\/(?:open|uc)\?(?:[^"\s]*&)?id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

// A heading immediately followed by a <table> is the user's signal that the
// two should travel together as a horizontally-laid-out group (centered
// heading on top, table below) — even when the rest of the document is
// vertical. We wrap them in a single .heading-table div so:
//   1. paginator.ts naturally treats the wrapper as an atomic block (it's
//      not list/text, so the split strategies skip it — overflow forces a
//      page break before the whole group).
//   2. manuscript.css can flip just this group to horizontal-tb and stack
//      heading + table vertically.
export function wrapHeadingTablePairs(html: string): string {
  // The heading body is restricted to *inline* content (no h*/p/ul/ol/table/
  // hr/div/blockquote opens, and no </hN> closes other than its own). Without
  // this guard the non-greedy [\s\S]*? would happily backtrack across the
  // whole document until it found the next heading-then-table pair — so a doc
  // with one "<h3>表</h3><table>" buried 20 sections down would have every
  // section above swallowed into a single .heading-table wrapper.
  return html.replace(
    /(<h([1-4])(?:\s[^>]*)?>(?:(?!<\/h[1-6]>|<(?:h[1-6]|p|ul|ol|table|hr|div|blockquote)\b)[\s\S])*<\/h\2>)\s*(<table(?:\s[^>]*)?>[\s\S]*?<\/table>)/g,
    '<div class="heading-table">$1$3</div>',
  );
}

// Replace `<p><a href="…">…</a></p>` where the <a> is the paragraph's only
// content. Inline links (text + link + more text) are left alone.
export function transformVideoEmbeds(html: string): string {
  return html.replace(
    /<p>\s*<a\s+href="([^"]+)"(?:\s+[^>]*)?>([^<]*)<\/a>\s*<\/p>/g,
    (whole, href: string) => {
      const fallback = `<a class="video-fallback" href="${href}" target="_blank" rel="noopener">${href}</a>`;
      const yt = extractYouTubeId(href);
      if (yt) {
        return (
          `<div class="video-embed" data-provider="youtube">` +
          `<iframe src="https://www.youtube.com/embed/${yt}" loading="lazy" ` +
          // `fullscreen` in allow= is what modern browsers actually gate on;
          // `allowfullscreen` is kept as the legacy fallback for older UAs.
          `allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share" ` +
          `allowfullscreen></iframe>` +
          fallback +
          `</div>`
        );
      }
      const drv = extractDriveId(href);
      if (drv) {
        return (
          `<div class="video-embed" data-provider="drive">` +
          `<iframe src="https://drive.google.com/file/d/${drv}/preview" loading="lazy" ` +
          `allow="autoplay; fullscreen" allowfullscreen></iframe>` +
          fallback +
          `</div>`
        );
      }
      return whole;
    },
  );
}

// Strip whitespace that lives strictly BETWEEN tags. Whitespace that's
// adjacent to text content (e.g. " " inside `<p>foo <strong>bar</strong></p>`)
// is not matched because the regex requires `>` immediately before the
// whitespace and `<` immediately after. Whitespace inside `<pre>`/`<code>`
// is text content too, so it's preserved automatically.
//
// Used as the last step before persisting HTML to Drust. Marked emits one
// newline between every block element, which compounds into KB of useless
// payload on multi-page presentations and contributes to Drust's body-
// size ceiling on /records/docs PATCH.
export function minifyHtml(html: string): string {
  return html.replace(/>\s+</g, "><");
}

// Promote URL-only lines whose URL is a YouTube or Drive video into their
// OWN paragraph, wrapped in CommonMark autolink syntax (<URL>). This is the
// "be smart for the user" step: without it, a URL line that immediately
// follows a text line collapses into a single <p>text<br><a></a></p> under
// marked's `breaks: true`, which transformVideoEmbeds (paragraph-level
// matcher) can't see. The user shouldn't have to know to insert a blank line
// — we do it for them.
//
// Recognized forms (each must be the ENTIRE trimmed line — URLs mid-prose
// are left alone):
//   bare:       https://www.youtube.com/watch?v=…
//   md-link:    [https://www.youtube.com/watch?v=…](https://www.youtube.com/watch?v=…)
//               (this is what Google Docs export emits for any link)
//   autolink:   <https://www.youtube.com/watch?v=…>
//
// Non-video URLs (e.g. plain docs link) are untouched.
function extractUrlIfFullLine(trimmed: string): string | null {
  let m = /^(https?:\/\/[^\s<>]+)$/.exec(trimmed);
  if (m) return m[1];
  m = /^<(https?:\/\/[^>]+)>$/.exec(trimmed);
  if (m) return m[1];
  m = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(trimmed);
  if (m) return m[2]; // href wins regardless of link text
  return null;
}

export function normalizeVideoUrlLines(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const url = extractUrlIfFullLine(trimmed);
    const isVideo = url !== null && (
      extractYouTubeId(url) !== null ||
      extractDriveId(url) !== null
    );
    if (isVideo) {
      if (out.length > 0 && out[out.length - 1].trim() !== "") out.push("");
      out.push(`<${url}>`);
      if (i + 1 < lines.length && lines[i + 1].trim() !== "") out.push("");
    } else {
      out.push(lines[i]);
    }
  }
  return out.join("\n");
}

// Top-level pipeline: markdown → ConvertResult. Order matters:
//   1. extractTitle reads from the RAW markdown (the H1 may sit inside a line
//      that normalizeVideoUrlLines later reflows).
//   2. processImages strips "分頁 N" markers and tallies image refs.
//   3. normalizeVideoUrlLines promotes URL-only lines into their own paragraph
//      so the paragraph-level transformVideoEmbeds matcher can see them.
//   4. marked → wrapHeadingTablePairs → transformVideoEmbeds → cleanImageStyles
//      → wrap in <article class="slide-content"> → minifyHtml (last, so the
//      between-tag whitespace introduced by every prior step is collapsed once).
export async function convertDocument(markdown: string): Promise<ConvertResult> {
  const title = extractTitle(markdown);
  const { markdown: processed, imageCount, imageIds } = await processImages(markdown);
  const normalized = normalizeVideoUrlLines(processed);

  marked.setOptions({ breaks: true, gfm: true });
  const rawHtml = marked.parse(normalized) as string;
  const wrapped = wrapHeadingTablePairs(rawHtml);
  const withVideos = transformVideoEmbeds(wrapped);
  const cleanHtml = cleanImageStyles(withVideos);
  const html = minifyHtml(`<article class="slide-content">\n${cleanHtml}\n</article>`);

  return { html, imageCount, imageIds, title };
}
