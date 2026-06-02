import { test, expect, beforeAll, afterAll } from "bun:test";
import { createAdminUser, loginToDrust } from "../auth";
import { handleLogin, handleLogout, handleMe } from "../../routes/admin";

const TEST_EMAIL = `__test_auth_${Date.now()}@example.com`;
const TEST_PASSWORD = "test-password-12345";

beforeAll(async () => {
  const r = await createAdminUser(TEST_EMAIL, TEST_PASSWORD);
  if ("error" in r) throw new Error(`setup failed: ${r.error}`);
});

afterAll(async () => {
  // Drust doesn't expose a delete-user API for service tokens; rely on
  // tenant rotation for cleanup. Test users are tagged with __test_ so
  // they're easy to filter out in dashboards.
});

function makeRequest(body: object, cookieToken?: string): Request {
  return new Request("http://localhost/api/admin/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieToken ? { Cookie: `slides_admin_session=${cookieToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("login: rejects bad credentials with 401", async () => {
  const res = await handleLogin(
    makeRequest({ email: TEST_EMAIL, password: "wrong-password" }),
  );
  expect(res.status).toBe(401);
  expect(res.headers.get("Set-Cookie")).toBeNull();
});

test("login: accepts good credentials, sets HttpOnly cookie", async () => {
  const res = await handleLogin(
    makeRequest({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  );
  expect(res.status).toBe(200);
  const cookie = res.headers.get("Set-Cookie") || "";
  expect(cookie).toContain("slides_admin_session=");
  expect(cookie).toContain("HttpOnly");
  // No Secure attribute on http origins (test uses http://localhost)
  expect(cookie).not.toContain("Secure");
});

test("me: returns 401 without cookie", async () => {
  const req = new Request("http://localhost/api/admin/me", { method: "GET" });
  const res = await handleMe(req);
  expect(res.status).toBe(401);
});

test("me: returns user with valid cookie", async () => {
  const login = await loginToDrust(TEST_EMAIL, TEST_PASSWORD);
  if ("error" in login) throw new Error(`login failed: ${login.error}`);

  const req = new Request("http://localhost/api/admin/me", {
    method: "GET",
    headers: { Cookie: `slides_admin_session=${login.token}` },
  });
  const res = await handleMe(req);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.user.email).toBe(TEST_EMAIL);
});

test("logout: clears cookie", async () => {
  const req = new Request("http://localhost/api/admin/logout", {
    method: "POST",
    headers: { Cookie: "slides_admin_session=anything" },
  });
  const res = await handleLogout(req);
  const cookie = res.headers.get("Set-Cookie") || "";
  expect(cookie).toMatch(/Max-Age=0|Expires=/);
});
