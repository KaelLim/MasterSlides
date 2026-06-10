import {
  deleteDoc,
  deleteImage,
  findDocByDocId,
  listAllDocs,
  listAllPlaylists,
  updateDoc,
  updatePlaylist,
} from "../drust";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// GET /api/admin/docs → { docs: [...] } (all docs, created_at desc)
export async function handleDocsList(_req: Request): Promise<Response> {
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
// and removes this doc_id from every playlist that references it. Playlists
// are cleaned first so a doc-delete failure leaves the playlists in a
// consistent state for the user's retry (idempotent on re-run).
export async function handleDocDelete(
  docIdParam: string,
  _req: Request,
): Promise<Response> {
  const record = await findDocByDocId(docIdParam);
  if (!record) return jsonResponse({ error: "not-found" }, 404);

  const playlists = await listAllPlaylists();
  for (const pl of playlists) {
    if (!pl.doc_ids.includes(docIdParam)) continue;
    const next = pl.doc_ids.filter((id) => id !== docIdParam);
    try {
      await updatePlaylist(pl.id, { doc_ids: next });
    } catch (err) {
      console.warn(`[admin] failed to detach ${docIdParam} from playlist ${pl.id}:`, err);
    }
  }

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
