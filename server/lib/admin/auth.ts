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
} from "../auth";

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function requireAuth(
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
