// Admin endpoints — login/logout/setup + docs CRUD. Each handler is
// runtime-agnostic (works under Bun.serve and CF Pages Functions). The
// Functions in functions/api/admin/* just shim process.env and delegate.

export {
  handleLogin,
  handleLogout,
  handleMe,
  handleSetupState,
  handleSetup,
} from "../lib/admin/auth";
export { handleDocsList, handleDocPatch, handleDocDelete } from "../lib/admin/docs";
export {
  handlePlaylistsList,
  handlePlaylistCreate,
  handlePlaylistGet,
  handlePlaylistPatch,
  handlePlaylistDelete,
  handlePublicPlaylistGet,
} from "../lib/admin/playlists";
