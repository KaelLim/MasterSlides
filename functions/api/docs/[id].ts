import { shimProcessEnv, type Env } from "../../_lib/env-shim";
import { handleGetDoc } from "../../../server/routes/docs";

export const onRequestGet: PagesFunction<Env, "id"> = async ({ env, params }) => {
  shimProcessEnv(env);
  return handleGetDoc(String(params.id));
};
