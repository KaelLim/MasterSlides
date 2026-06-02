// Public playlist read — the slides viewer fetches this when launched with
// ?playlist=<id>. No auth: anyone with the id can see it.
import { shimProcessEnv, type Env } from "../../_lib/env-shim";
import { handlePublicPlaylistGet } from "../../../server/lib/admin/playlists";

export const onRequestGet: PagesFunction<Env, "id"> = async ({ env, params }) => {
  shimProcessEnv(env);
  return handlePublicPlaylistGet(String(params.id));
};
