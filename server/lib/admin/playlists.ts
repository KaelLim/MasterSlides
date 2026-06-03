import {
  deletePlaylist,
  findPlaylist,
  insertPlaylist,
  listAllPlaylists,
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

function parsePlaylistId(s: string): number | null {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sanitizeDocIds(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string" || !v) return null;
    if (!/^[a-zA-Z0-9_-]+$/.test(v)) return null;
    out.push(v);
  }
  return out;
}

// GET /api/admin/playlists → { playlists: [...] }
export async function handlePlaylistsList(_req: Request): Promise<Response> {
  const playlists = await listAllPlaylists();
  return jsonResponse({ playlists });
}

// POST /api/admin/playlists  { title, doc_ids[], is_public? }
export async function handlePlaylistCreate(req: Request): Promise<Response> {
  const body = await readBody(req);
  if (!body) return jsonResponse({ error: "bad-body" }, 400);

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const doc_ids = sanitizeDocIds(body.doc_ids ?? []);
  if (!title || doc_ids === null) {
    return jsonResponse({ error: "bad-body" }, 400);
  }
  const is_public =
    typeof body.is_public === "boolean" ? (body.is_public ? 1 : 0)
    : typeof body.is_public === "number" ? (body.is_public ? 1 : 0)
    : 0;

  const created = await insertPlaylist({ title, doc_ids, is_public });
  return jsonResponse({ playlist: created }, 201);
}

// GET /api/admin/playlists/:id → { playlist }
export async function handlePlaylistGet(
  idParam: string,
  _req: Request,
): Promise<Response> {
  const id = parsePlaylistId(idParam);
  if (id === null) return jsonResponse({ error: "bad-id" }, 400);
  const playlist = await findPlaylist(id);
  if (!playlist) return jsonResponse({ error: "not-found" }, 404);
  return jsonResponse({ playlist });
}

// PATCH /api/admin/playlists/:id  { title?, doc_ids?, is_public? }
export async function handlePlaylistPatch(
  idParam: string,
  req: Request,
): Promise<Response> {
  const id = parsePlaylistId(idParam);
  if (id === null) return jsonResponse({ error: "bad-id" }, 400);

  const existing = await findPlaylist(id);
  if (!existing) return jsonResponse({ error: "not-found" }, 404);

  const body = await readBody(req);
  if (!body) return jsonResponse({ error: "bad-body" }, 400);

  const patch: { title?: string; doc_ids?: string[]; is_public?: number } = {};
  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t) return jsonResponse({ error: "title-empty" }, 400);
    patch.title = t;
  }
  if (body.doc_ids !== undefined) {
    const ids = sanitizeDocIds(body.doc_ids);
    if (ids === null) return jsonResponse({ error: "bad-doc-ids" }, 400);
    patch.doc_ids = ids;
  }
  if (typeof body.is_public === "boolean") patch.is_public = body.is_public ? 1 : 0;
  if (typeof body.is_public === "number") patch.is_public = body.is_public ? 1 : 0;

  if (Object.keys(patch).length === 0) {
    return jsonResponse({ error: "no-changes" }, 400);
  }
  await updatePlaylist(id, patch);
  const updated = await findPlaylist(id);
  return jsonResponse({ playlist: updated });
}

// DELETE /api/admin/playlists/:id → 204
export async function handlePlaylistDelete(
  idParam: string,
  _req: Request,
): Promise<Response> {
  const id = parsePlaylistId(idParam);
  if (id === null) return jsonResponse({ error: "bad-id" }, 400);
  const existing = await findPlaylist(id);
  if (!existing) return jsonResponse({ error: "not-found" }, 404);
  await deletePlaylist(id);
  return new Response(null, { status: 204 });
}

// GET /api/playlists/:id → { playlist } — viewer endpoint (drafts included
// so the slides viewer can play them by id even if not listed publicly).
export async function handlePublicPlaylistGet(idParam: string): Promise<Response> {
  const id = parsePlaylistId(idParam);
  if (id === null) return jsonResponse({ error: "bad-id" }, 400);
  const playlist = await findPlaylist(id);
  if (!playlist) return jsonResponse({ error: "not-found" }, 404);
  return jsonResponse({ playlist });
}
