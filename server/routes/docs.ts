import { extractDocId, fetchMarkdown } from "../lib/google-docs.ts";
import { convertDocument } from "../lib/convert.ts";
import { composeFirstSlide } from "../lib/first-slide.ts";
import { upsertDoc, getDocHtml } from "../lib/storage.ts";
import { findDocByDocId } from "../lib/drust.ts";

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

    // Look up existing metadata BEFORE writing — the viewer's refresh
    // button reuses this endpoint, and we must preserve presentation_date
    // + unit_report (and re-inject the first slide) instead of silently
    // wiping them.
    const existing = await findDocByDocId(docId);

    const markdown = await fetchMarkdown(docId);
    const { html: bodyHtml, imageCount, imageIds, title: extractedTitle } = await convertDocument(markdown);

    // Effective title resolution: explicit request body wins; then the
    // user-edited title from a prior /api/edit save; then the markdown
    // H1; final fallback is the bare doc_id.
    const effectiveTitle = title ?? existing?.title ?? extractedTitle ?? docId;

    // Re-inject the synthesized first slide IF the doc has previously been
    // saved through the edit page (i.e. has both metadata fields). Without
    // this, a refresh would overwrite the stored html with body-only.
    let finalHtml = bodyHtml;
    const reporters = existing?.unit_report?.filter((s) => s.trim().length > 0) ?? [];
    if (existing?.presentation_date && reporters.length > 0) {
      const firstSlide = composeFirstSlide({
        presentation_date: existing.presentation_date,
        title: effectiveTitle,
        unit_report: reporters,
      });
      let injected = false;
      finalHtml = bodyHtml.replace(
        /^<article class="slide-content">\n?/,
        (m) => {
          injected = true;
          return `${m}${firstSlide}\n`;
        },
      );
      if (!injected) {
        // Shape mismatch — bail loudly instead of silently dropping the
        // first slide. convert.ts owns this prefix; anything else is a bug.
        throw new Error("first_slide_injection_failed");
      }
    }

    await upsertDoc({
      doc_id: docId,
      title: effectiveTitle,
      html: finalHtml,
      image_ids: imageIds,
      presentation_date: existing?.presentation_date ?? null,
      unit_report: existing?.unit_report ?? null,
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
