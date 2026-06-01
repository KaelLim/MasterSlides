import { shimProcessEnv, type Env } from "../_lib/env-shim";
import { handleFetchDoc } from "../../server/routes/docs";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  shimProcessEnv(env);
  return handleFetchDoc(request);
};
