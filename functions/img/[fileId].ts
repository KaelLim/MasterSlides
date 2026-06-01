// Proxy Drust's public bucket as same-origin so html2canvas can read the
// images (cross-origin imgs taint the canvas and break toDataURL).
//
// Mirrors the /img/* handler in server/index.ts.
import { shimProcessEnv, type Env } from "../_lib/env-shim";

export const onRequestGet: PagesFunction<Env, "fileId"> = async ({ env, params }) => {
  shimProcessEnv(env);
  const fileId = String(params.fileId);
  const upstream = await fetch(
    `${env.DRUST_BASE_URL}/public/${env.DRUST_TENANT_ID}/${fileId}`
  );
  if (!upstream.ok) {
    return new Response("Not Found", { status: upstream.status });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") || "application/octet-stream",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
