import { jsonResponse } from "../auth";
import {
  deleteDoc,
  deleteImage,
  findDocByDocId,
  listAllDocs,
  updateDoc,
} from "../drust";
import { readBody, requireAuth } from "./auth";

// GET /api/admin/docs → { docs: [...] } (all docs, created_at desc)
export async function handleDocsList(req: Request): Promise<Response> {
  const guard = await requireAuth(req);
  if (guard instanceof Response) return guard;
  const docs = await listAllDocs();
  // html is big; admin list doesn't need it. Strip on the way out.
  const slim = docs.map(({ html: _html, ...rest }) => rest);
  return jsonResponse({ docs: slim });
}

// PATCH /api/admin/docs/:doc_id  { is_public?, title? } → updated row
export async function handleDocPatch(
  docIdParam: string,
  req: Request,
): Promise<Response> {
  const guard = await requireAuth(req);
  if (guard instanceof Response) return guard;

  const body = await readBody(req);
  if (!body) return jsonResponse({ error: "bad-body" }, 400);

  const record = await findDocByDocId(docIdParam);
  if (!record) return jsonResponse({ error: "not-found" }, 404);

  const patch: { is_public?: number; title?: string } = {};
  if (typeof body.is_public === "boolean") patch.is_public = body.is_public ? 1 : 0;
  if (typeof body.is_public === "number") patch.is_public = body.is_public ? 1 : 0;
  if (typeof body.title === "string") patch.title = body.title;

  if (Object.keys(patch).length === 0) {
    return jsonResponse({ error: "no-changes" }, 400);
  }

  await updateDoc(record.id, patch);
  const updated = await findDocByDocId(docIdParam);
  return jsonResponse({ doc: updated });
}

// DELETE /api/admin/docs/:doc_id → 204, reclaims all associated images
export async function handleDocDelete(
  docIdParam: string,
  req: Request,
): Promise<Response> {
  const guard = await requireAuth(req);
  if (guard instanceof Response) return guard;

  const record = await findDocByDocId(docIdParam);
  if (!record) return jsonResponse({ error: "not-found" }, 404);

  // Best-effort image reclaim. Tolerated if any single image is gone.
  for (const imgId of record.image_ids ?? []) {
    try {
      await deleteImage(imgId);
    } catch (err) {
      console.warn(`[admin] failed to delete image ${imgId}:`, err);
    }
  }

  await deleteDoc(record.id);
  return new Response(null, { status: 204 });
}
