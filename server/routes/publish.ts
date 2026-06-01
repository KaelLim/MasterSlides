// Thin proxy: viewer/phone POST to /api/publish/:room; we forward the JSON
// payload to Drust broadcast using the service token (which never leaves the
// server). Drust handles fan-out to every WebSocket subscriber on that room.
//
// /api/config returns the connection details the browser needs to subscribe
// directly via Drust WS (anon token — externally visible is fine).
//
// Replaces the previous SSE+POST implementation in routes/remote.ts.

const BASE = process.env.DRUST_BASE_URL!;
const TENANT = process.env.DRUST_TENANT_ID!;
const SERVICE_TOKEN = process.env.DRUST_SERVICE_TOKEN!;
const ANON_TOKEN = process.env.DRUST_ANON_TOKEN;

if (!ANON_TOKEN) {
  throw new Error("DRUST_ANON_TOKEN must be set (subscribers need it)");
}

// Drust enforces ^[a-zA-Z][a-zA-Z0-9_:.-]{0,127}$ on room names server-side,
// but we validate here too so a malformed name returns 400 before the
// network hop.
const ROOM_RE = /^[a-zA-Z][a-zA-Z0-9_:.-]{0,127}$/;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handlePublish(
  roomId: string,
  req: Request,
): Promise<Response> {
  if (!ROOM_RE.test(roomId)) {
    return jsonResponse({ error: "invalid-room" }, 400);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "bad-json" }, 400);
  }

  const res = await fetch(`${BASE}/drust/t/${TENANT}/rooms/${roomId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return new Response(text || `drust ${res.status}`, { status: res.status });
  }
  return new Response(null, { status: 204 });
}

export function handleConfig(): Response {
  const wsUrl = `${BASE.replace(/^http/, "ws")}/drust/t/${TENANT}/realtime?token=${ANON_TOKEN}`;
  return jsonResponse({ wsUrl });
}
