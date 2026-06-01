import { shimProcessEnv, type Env } from "../../_lib/env-shim";
import { handleLogout } from "../../../server/routes/admin";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  shimProcessEnv(env);
  return handleLogout(request);
};
