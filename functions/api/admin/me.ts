import { shimProcessEnv, type Env } from "../../_lib/env-shim";
import { handleMe } from "../../../server/lib/admin/auth";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  shimProcessEnv(env);
  return handleMe(request);
};
