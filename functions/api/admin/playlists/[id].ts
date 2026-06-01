import { shimProcessEnv, type Env } from "../../../_lib/env-shim";
import {
  handlePlaylistGet,
  handlePlaylistPatch,
  handlePlaylistDelete,
} from "../../../../server/routes/admin";

export const onRequest: PagesFunction<Env, "id"> = async ({
  env,
  request,
  params,
}) => {
  shimProcessEnv(env);
  const id = String(params.id);
  if (request.method === "GET") return handlePlaylistGet(id, request);
  if (request.method === "PATCH") return handlePlaylistPatch(id, request);
  if (request.method === "DELETE") return handlePlaylistDelete(id, request);
  return new Response("Method Not Allowed", { status: 405 });
};
