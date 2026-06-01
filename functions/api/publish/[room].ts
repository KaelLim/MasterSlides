import { shimProcessEnv, type Env } from "../../_lib/env-shim";
import { handlePublish } from "../../../server/routes/publish";

export const onRequestPost: PagesFunction<Env, "room"> = async ({
  env,
  request,
  params,
}) => {
  shimProcessEnv(env);
  return handlePublish(String(params.room), request);
};
