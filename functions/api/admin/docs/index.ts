import { shimProcessEnv, type Env } from "../../../_lib/env-shim";
import { handleDocsList } from "../../../../server/routes/admin";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  shimProcessEnv(env);
  return handleDocsList(request);
};
