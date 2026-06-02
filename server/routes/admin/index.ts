// Path-based dispatcher for /api/admin/* and /api/playlists/* — keeps
// server/index.ts free of per-endpoint switch cases.
import { handleLogin, handleLogout, handleMe, handleSetup, handleSetupState } from "../../lib/admin/auth";
import { handleDocsList, handleDocPatch, handleDocDelete } from "../../lib/admin/docs";
import {
  handlePlaylistsList,
  handlePlaylistCreate,
  handlePlaylistGet,
  handlePlaylistPatch,
  handlePlaylistDelete,
  handlePublicPlaylistGet,
} from "../../lib/admin/playlists";

export async function handleAdminRoute(req: Request, url: URL): Promise<Response | null> {
  const { pathname } = url;
  const m = req.method;

  if (pathname === "/api/admin/login" && m === "POST") return handleLogin(req);
  if (pathname === "/api/admin/logout" && m === "POST") return handleLogout(req);
  if (pathname === "/api/admin/me" && m === "GET") return handleMe(req);
  if (pathname === "/api/admin/setup-state" && m === "GET") return handleSetupState();
  if (pathname === "/api/admin/setup" && m === "POST") return handleSetup(req);

  if (pathname === "/api/admin/docs" && m === "GET") return handleDocsList(req);
  if (pathname.startsWith("/api/admin/docs/")) {
    const docId = pathname.slice("/api/admin/docs/".length);
    if (m === "PATCH") return handleDocPatch(docId, req);
    if (m === "DELETE") return handleDocDelete(docId, req);
  }

  if (pathname === "/api/admin/playlists" && m === "GET") return handlePlaylistsList(req);
  if (pathname === "/api/admin/playlists" && m === "POST") return handlePlaylistCreate(req);
  if (pathname.startsWith("/api/admin/playlists/")) {
    const id = pathname.slice("/api/admin/playlists/".length);
    if (m === "GET") return handlePlaylistGet(id, req);
    if (m === "PATCH") return handlePlaylistPatch(id, req);
    if (m === "DELETE") return handlePlaylistDelete(id, req);
  }

  if (pathname.startsWith("/api/playlists/") && m === "GET") {
    const id = pathname.slice("/api/playlists/".length);
    return handlePublicPlaylistGet(id);
  }

  return null;
}
