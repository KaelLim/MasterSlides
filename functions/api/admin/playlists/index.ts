import { shimProcessEnv, type Env } from "../../../_lib/env-shim";
import {
  handlePlaylistsList,
  handlePlaylistCreate,
} from "../../../../server/routes/admin";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  shimProcessEnv(env);
  return handlePlaylistsList(request);
};
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  shimProcessEnv(env);
  return handlePlaylistCreate(request);
};
