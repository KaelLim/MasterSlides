import { extractDocId, fetchMarkdown } from "../lib/google-docs.ts";
import { convertDocument } from "../lib/convert.ts";
import {
  ensureDocDir,
  readMeta,
  writeMeta,
  nextVersion,
  readDocHtml,
  writeDocHtml,
  listDocs,
  type DocMeta,
} from "../lib/storage.ts";

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

    await ensureDocDir(docId);

    const markdown = await fetchMarkdown(docId);
    const { html, imageCount } = await convertDocument(markdown, docId);

    const version = await nextVersion(docId);
    await writeDocHtml(docId, version, html);

    const existingMeta = await readMeta(docId);
    const now = new Date().toISOString();
    const meta: DocMeta = {
      doc_id: docId,
      title: title || existingMeta?.title || docId,
      current_version: version,
      created_at: existingMeta?.created_at || now,
      updated_at: now,
    };
    await writeMeta(meta);

    return json({
      success: true,
      doc_id: docId,
      version,
      images: imageCount,
    });
  } catch (err: any) {
    console.error("fetch-doc error:", err);
    return json({ success: false, error: err.message }, 500);
  }
}

export async function handleGetDoc(docId: string): Promise<Response> {
  const html = await readDocHtml(docId);
  if (!html) {
    return json({ error: "找不到文件" }, 404);
  }
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function handleListDocs(): Promise<Response> {
  const docs = await listDocs();
  return json(docs);
}

export async function handleDocs(url: URL): Promise<Response> {
  const path = url.pathname;

  // GET /api/docs
  if (path === "/api/docs") {
    return handleListDocs();
  }

  // GET /api/docs/:id
  const match = path.match(/^\/api\/docs\/([a-zA-Z0-9_-]+)$/);
  if (match) {
    return handleGetDoc(match[1]);
  }

  return json({ error: "Not found" }, 404);
}
