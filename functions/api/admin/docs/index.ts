import { shimProcessEnv, type Env } from "../../../_lib/env-shim";
import { handleDocsList } from "../../../../server/lib/admin/docs";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  shimProcessEnv(env);
  return handleDocsList(request);
};
