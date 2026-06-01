import { shimProcessEnv, type Env } from "../_lib/env-shim";
import { handleConfig } from "../../server/routes/publish";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  shimProcessEnv(env);
  return handleConfig();
};
