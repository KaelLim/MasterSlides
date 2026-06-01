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
    const { html, imageCount, imageIds, title: extractedTitle } = await convertDocument(markdown);

    await upsertDoc({
      doc_id: docId,
      // Explicit `title` in the request wins. Otherwise use the first H1 we
      // extracted from the markdown; final fallback is the bare doc_id so
      // dashboards still have something to show.
      title: title ?? extractedTitle ?? docId,
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
