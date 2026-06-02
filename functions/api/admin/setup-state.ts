import { shimProcessEnv, type Env } from "../../_lib/env-shim";
import { handleSetupState } from "../../../server/lib/admin/auth";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  shimProcessEnv(env);
  return handleSetupState();
};
