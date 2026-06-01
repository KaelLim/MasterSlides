// Admin auth: thin wrapper around Drust's /auth/* + /me endpoints. The
// session token (drust_user_*) lives in a httpOnly cookie. Each /admin/*
// request hands the cookie back to Drust to verify and identify the user.

const COOKIE_NAME = "slides_admin_session";
// 30-day session matches Drust's default expiry.
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30;

function drustBase(): { url: string; tenant: string } {
  const url = process.env.DRUST_BASE_URL;
  const tenant = process.env.DRUST_TENANT_ID;
  if (!url || !tenant) {
    throw new Error("DRUST_BASE_URL / DRUST_TENANT_ID must be set");
  }
  return { url, tenant };
}

function serviceAuth(): { Authorization: string } {
  const token = process.env.DRUST_SERVICE_TOKEN;
  if (!token) throw new Error("DRUST_SERVICE_TOKEN must be set");
  return { Authorization: `Bearer ${token}` };
}

export function parseSessionCookie(req: Request): string | null {
  const raw = req.headers.get("Cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE_NAME) return v.join("=") || null;
  }
  return null;
}

function buildSetCookie(token: string | null, req: Request): string {
  // Secure attribute requires the request to be over https. Chrome treats
  // http://localhost as secure too; Safari does not. Detect protocol from
  // the request URL so dev (http) and production (https) both work.
  const isHttps = new URL(req.url).protocol === "https:";
  const secureAttr = isHttps ? " Secure;" : "";
  const base = `${COOKIE_NAME}=${token ?? ""}; Path=/; HttpOnly;${secureAttr} SameSite=Strict`;
  return token === null
    ? `${base}; Max-Age=0`
    : `${base}; Max-Age=${COOKIE_MAX_AGE_S}`;
}

export interface AdminUser {
  id: string;
  email: string;
}

// Verify a session token by calling Drust /me. Returns user info on
// success, null on any failure (expired, revoked, network blip).
export async function verifySession(token: string | null): Promise<AdminUser | null> {
  if (!token) return null;
  const { url, tenant } = drustBase();
  try {
    const res = await fetch(`${url}/drust/t/${tenant}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const u = (await res.json()) as { id: string; email: string };
    return { id: u.id, email: u.email };
  } catch {
    return null;
  }
}

// Exchange email+password for a Drust user token. Returns the token on
// success or an error string on failure (don't leak Drust internals to
// the browser).
export async function loginToDrust(
  email: string,
  password: string,
): Promise<{ token: string } | { error: string }> {
  const { url, tenant } = drustBase();
  const res = await fetch(`${url}/drust/t/${tenant}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    return { error: res.status === 401 ? "invalid-credentials" : `drust-${res.status}` };
  }
  const body = (await res.json()) as { token: string };
  return { token: body.token };
}

// Invalidate a Drust session. Best-effort — failures don't bubble up,
// the cookie is cleared either way.
export async function logoutFromDrust(token: string): Promise<void> {
  const { url, tenant } = drustBase();
  try {
    await fetch(`${url}/drust/t/${tenant}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* ignore — cookie clear is what matters */
  }
}

// Bootstrap path: counts existing admin users. The /admin/setup page
// only proceeds if this returns 0 — once an admin exists, further user
// creation must happen via Drust's MCP/REST directly.
export async function countAdminUsers(): Promise<number> {
  const { url, tenant } = drustBase();
  const res = await fetch(`${url}/drust/t/${tenant}/admin/users`, {
    headers: serviceAuth(),
  });
  if (!res.ok) throw new Error(`admin/users → ${res.status}`);
  const body = (await res.json()) as { total: number };
  return body.total ?? 0;
}

// Create the first admin user via service token. Caller MUST gate this
// with countAdminUsers() === 0.
export async function createAdminUser(
  email: string,
  password: string,
): Promise<{ user_id: string } | { error: string }> {
  const { url, tenant } = drustBase();
  const res = await fetch(`${url}/drust/t/${tenant}/admin/users`, {
    method: "POST",
    headers: { ...serviceAuth(), "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { error: `drust-${res.status}: ${text.slice(0, 100)}` };
  }
  const body = (await res.json()) as { user_id: string };
  return { user_id: body.user_id };
}

export function jsonWithCookie(
  data: unknown,
  token: string | null,
  req: Request,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": buildSetCookie(token, req),
    },
  });
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
