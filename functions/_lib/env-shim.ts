// Bridge between CF Pages Functions per-request `context.env` and the
// shared `server/lib/*` code that reads `process.env`. Workers don't expose
// process.env natively (unless nodejs_compat is on); even with compat the
// shape is per-isolate. Setting globalThis.process here keeps the same lib
// code working under both Bun (native process.env) and Pages Functions.
//
// Idempotent: called from every Function entrypoint. Safe to call repeatedly
// within an isolate.
export function shimProcessEnv(env: object): void {
  const g = globalThis as { process?: { env?: Record<string, unknown> } };
  if (!g.process) {
    g.process = { env: { ...env } };
    return;
  }
  if (!g.process.env) {
    g.process.env = { ...env };
    return;
  }
  Object.assign(g.process.env, env);
}

export interface Env {
  DRUST_BASE_URL: string;
  DRUST_TENANT_ID: string;
  DRUST_SERVICE_TOKEN: string;
  DRUST_ANON_TOKEN: string;
}
