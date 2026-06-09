import { shimProcessEnv, type Env } from "../../_lib/env-shim";
import { handleGetEdit, handlePostEdit } from "../../../server/routes/edit";

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  shimProcessEnv(env);
  const id = String(params.id);
  return handleGetEdit(id);
};

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  shimProcessEnv(env);
  const id = String(params.id);
  const payload = await request.json();
  return handlePostEdit(id, payload as never);
};
