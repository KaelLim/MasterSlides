// Admin endpoints — login/logout/setup + docs CRUD. Each handler is
// runtime-agnostic (works under Bun.serve and CF Pages Functions). The
// Functions in functions/api/admin/* just shim process.env and delegate.

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
} from "../lib/auth";
import {
  deleteDoc,
  deleteImage,
  findDocByDocId,
  listAllDocs,
  updateDoc,
} from "../lib/drust";

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function requireAuth(
  req: Request,
): Promise<{ user: AdminUser; token: string } | Response> {
  const token = parseSessionCookie(req);
  const user = await verifySession(token);
  if (!user || !token) {
    return jsonResponse({ error: "unauthorised" }, 401);
  }
  return { user, token };
}

// POST /api/admin/login  { email, password } → cookie + { user }
export async function handleLogin(req: Request): Promise<Response> {
  const body = await readBody(req);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    return jsonResponse({ error: "bad-body" }, 400);
  }
  const r = await loginToDrust(body.email, body.password);
  if ("error" in r) {
    return jsonResponse({ error: r.error }, r.error === "invalid-credentials" ? 401 : 500);
  }
  const user = await verifySession(r.token);
  return jsonWithCookie({ user }, r.token, req);
}

// POST /api/admin/logout → clears cookie, best-effort Drust logout
export async function handleLogout(req: Request): Promise<Response> {
  const token = parseSessionCookie(req);
  if (token) await logoutFromDrust(token);
  return jsonWithCookie({ ok: true }, null, req);
}

// GET /api/admin/me → { user } | 401
export async function handleMe(req: Request): Promise<Response> {
  const guard = await requireAuth(req);
  if (guard instanceof Response) return guard;
  return jsonResponse({ user: guard.user });
}

// GET /api/admin/setup-state → { needsSetup: boolean }
// Anonymous endpoint so the login page can decide whether to show the
// initial-admin form. Only reveals a count of zero (yes/no), nothing else.
export async function handleSetupState(): Promise<Response> {
  try {
    const count = await countAdminUsers();
    return jsonResponse({ needsSetup: count === 0 });
  } catch {
    return jsonResponse({ needsSetup: false, error: "drust-unreachable" }, 500);
  }
}

// POST /api/admin/setup  { email, password } → creates first admin if
// none exists, auto-logs in via cookie. 409 if any admin already exists.
export async function handleSetup(req: Request): Promise<Response> {
  const count = await countAdminUsers();
  if (count > 0) return jsonResponse({ error: "already-set-up" }, 409);

  const body = await readBody(req);
  if (
    !body ||
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    body.password.length < 8
  ) {
    return jsonResponse({ error: "bad-body" }, 400);
  }

  const created = await createAdminUser(body.email, body.password);
  if ("error" in created) {
    return jsonResponse({ error: created.error }, 500);
  }

  // Auto-login: exchange the just-created credentials for a session.
  const login = await loginToDrust(body.email, body.password);
  if ("error" in login) {
    return jsonResponse({ error: login.error }, 500);
  }
  const user = await verifySession(login.token);
  return jsonWithCookie({ user }, login.token, req);
}

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
