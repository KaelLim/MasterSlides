import { shimProcessEnv, type Env } from "../../../_lib/env-shim";
import { handleDocPatch, handleDocDelete } from "../../../../server/lib/admin/docs";

export const onRequest: PagesFunction<Env, "doc_id"> = async ({
  env,
  request,
  params,
}) => {
  shimProcessEnv(env);
  const docId = String(params.doc_id);
  if (request.method === "PATCH") return handleDocPatch(docId, request);
  if (request.method === "DELETE") return handleDocDelete(docId, request);
  return new Response("Method Not Allowed", { status: 405 });
};
