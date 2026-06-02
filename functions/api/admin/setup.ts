import { shimProcessEnv, type Env } from "../../_lib/env-shim";
import { handleSetup } from "../../../server/lib/admin/auth";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  shimProcessEnv(env);
  return handleSetup(request);
};
