// Shared auth gate for /admin/* pages. Reads /api/admin/me — on 401,
// redirects to /admin/login/ (or /admin/setup/ if no users exist).
// Returns the user on success; pages should not render UI until this
// resolves successfully.
export async function requireAuth() {
  const meRes = await fetch("/api/admin/me", { credentials: "same-origin" });
  if (meRes.ok) {
    return (await meRes.json()).user;
  }
  // Not logged in — pick login vs setup based on whether any admin exists.
  const stateRes = await fetch("/api/admin/setup-state");
  if (stateRes.ok && (await stateRes.json()).needsSetup) {
    window.location.replace("/admin/setup");
  } else {
    window.location.replace("/admin/login");
  }
  // Pause the calling page until the redirect kicks in.
  return new Promise(() => {});
}

export async function logout() {
  await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
  window.location.replace("/admin/login");
}
