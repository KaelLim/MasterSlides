// SSE-based remote control replacing the previous WebSocket transport.
//
// Two role-specific streams (/sse/viewer/:room, /sse/phone/:room) plus two
// POST endpoints (/api/room/:room/command, /api/room/:room/sync). Rooms are
// in-memory and lazily created. The server caches only the latest viewer
// sync payload (`lastSync`) so a late-joining or auto-reconnecting phone can
// be caught up via the initial `init` event. There is no message replay
// beyond that single snapshot.
//
// The wire format intentionally mirrors the WS era: each frame carries the
// JSON the WS used to carry (with the `type` field re-injected by the
// server) so the client-side handlers stay byte-identical.

interface Subscriber {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  heartbeat: ReturnType<typeof setInterval>;
  closed: boolean;
}

interface Room {
  viewers: Set<Subscriber>;
  phones: Set<Subscriber>;
  lastSync: unknown | null;
  lastActivity: number;
  graceTimer: ReturnType<typeof setTimeout> | null;
  joinedOnce: boolean;
}

const rooms = new Map<string, Room>();

const HEARTBEAT_MS = 25000;
const GRACE_MS = 30000;
const STALE_SWEEP_MS = 60000;
const STALE_AGE_MS = 600000;

const encoder = new TextEncoder();

function getOrCreateRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      viewers: new Set(),
      phones: new Set(),
      lastSync: null,
      lastActivity: Date.now(),
      graceTimer: null,
      joinedOnce: false,
    };
    rooms.set(roomId, room);
  }
  if (room.graceTimer) {
    clearTimeout(room.graceTimer);
    room.graceTimer = null;
  }
  return room;
}

function formatEvent(event: string, data: unknown): Uint8Array {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  return encoder.encode(`event: ${event}\ndata: ${payload}\n\n`);
}

function formatComment(text: string): Uint8Array {
  return encoder.encode(`: ${text}\n\n`);
}

function safeEnqueue(sub: Subscriber, chunk: Uint8Array): boolean {
  if (sub.closed) return false;
  try {
    sub.controller.enqueue(chunk);
    return true;
  } catch {
    // Underlying stream is gone (client disconnected before cancel fired,
    // or controller already closed). Mark and let cleanup happen via the
    // cancel path; here we just report failure to broadcast loops.
    sub.closed = true;
    return false;
  }
}

function broadcast(
  set: Set<Subscriber>,
  event: string,
  data: unknown,
): void {
  const chunk = formatEvent(event, data);
  for (const sub of set) {
    safeEnqueue(sub, chunk);
  }
}

function removeSubscriber(
  roomId: string,
  set: Set<Subscriber>,
  sub: Subscriber,
  role: "viewer" | "phone",
): void {
  if (sub.closed && !set.has(sub)) {
    // Already cleaned up (cancel + enqueue-failure can both fire).
    return;
  }
  sub.closed = true;
  clearInterval(sub.heartbeat);
  set.delete(sub);

  const room = rooms.get(roomId);
  if (!room) return;

  console.log(
    `[sse] ${role} left room ${roomId} (viewers=${room.viewers.size}, phones=${room.phones.size})`,
  );

  if (room.viewers.size === 0 && room.phones.size === 0) {
    if (room.graceTimer) clearTimeout(room.graceTimer);
    room.graceTimer = setTimeout(() => {
      const current = rooms.get(roomId);
      if (
        current &&
        current.viewers.size === 0 &&
        current.phones.size === 0
      ) {
        rooms.delete(roomId);
        console.log(`[sse] reaped room ${roomId}`);
      }
    }, GRACE_MS);
  }
}

function evictByClientId(set: Set<Subscriber>, clientId: string | null): void {
  if (!clientId) return;
  for (const sub of set) {
    if (sub.id === clientId) {
      try {
        sub.controller.close();
      } catch {
        // ignore
      }
      sub.closed = true;
      clearInterval(sub.heartbeat);
      set.delete(sub);
    }
  }
}

function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function handleViewerStream(roomId: string, url: URL): Response {
  const clientId =
    url.searchParams.get("clientId") ||
    (globalThis.crypto?.randomUUID?.() ?? `v-${Date.now()}-${Math.random()}`);

  const room = getOrCreateRoom(roomId);
  evictByClientId(room.viewers, clientId);

  let subscriber: Subscriber | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sub: Subscriber = {
        id: clientId,
        controller,
        heartbeat: setInterval(() => {
          if (!safeEnqueue(sub, formatComment("ping"))) {
            removeSubscriber(roomId, room.viewers, sub, "viewer");
          }
        }, HEARTBEAT_MS),
        closed: false,
      };
      subscriber = sub;
      room.viewers.add(sub);
      room.lastActivity = Date.now();

      console.log(
        `[sse] viewer joined room ${roomId} (viewers=${room.viewers.size}, phones=${room.phones.size})`,
      );

      safeEnqueue(
        sub,
        formatEvent("init", {
          role: "viewer",
          room: roomId,
          phoneConnected: room.phones.size > 0,
        }),
      );
    },
    cancel() {
      if (subscriber) {
        removeSubscriber(roomId, room.viewers, subscriber, "viewer");
      }
    },
  });

  return new Response(stream, { status: 200, headers: sseHeaders() });
}

export function handlePhoneStream(roomId: string, url: URL): Response {
  const clientId =
    url.searchParams.get("clientId") ||
    (globalThis.crypto?.randomUUID?.() ?? `p-${Date.now()}-${Math.random()}`);

  const room = getOrCreateRoom(roomId);
  evictByClientId(room.phones, clientId);

  let subscriber: Subscriber | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sub: Subscriber = {
        id: clientId,
        controller,
        heartbeat: setInterval(() => {
          if (!safeEnqueue(sub, formatComment("ping"))) {
            removeSubscriber(roomId, room.phones, sub, "phone");
          }
        }, HEARTBEAT_MS),
        closed: false,
      };
      subscriber = sub;

      const priorSize = room.phones.size;
      room.phones.add(sub);
      room.lastActivity = Date.now();

      console.log(
        `[sse] phone joined room ${roomId} (viewers=${room.viewers.size}, phones=${room.phones.size})`,
      );

      // Initial frame: replay latest cached sync if available, else a
      // "waiting" placeholder so the phone can flip its status UI.
      const initPayload =
        room.lastSync !== null
          ? room.lastSync
          : { role: "phone", room: roomId, waiting: true };
      safeEnqueue(sub, formatEvent("init", initPayload));

      // Synthesize WS-era `remote-joined` only on the 0→1 transition for
      // this room session (matches "one join announcement per phone").
      if (priorSize === 0 && !room.joinedOnce) {
        room.joinedOnce = true;
        broadcast(room.viewers, "remote-joined", {});
      }
    },
    cancel() {
      if (subscriber) {
        removeSubscriber(roomId, room.phones, subscriber, "phone");
      }
    },
  });

  return new Response(stream, { status: 200, headers: sseHeaders() });
}

export async function handleCommandPost(
  roomId: string,
  req: Request,
): Promise<Response> {
  const room = rooms.get(roomId);
  if (!room || (room.viewers.size === 0 && room.phones.size === 0)) {
    return jsonResponse({ error: "room-not-found" }, 404);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "bad-json" }, 400);
  }

  const payload = { type: "command", ...body };
  broadcast(room.viewers, "command", payload);
  room.lastActivity = Date.now();
  if (room.graceTimer) {
    clearTimeout(room.graceTimer);
    room.graceTimer = null;
  }

  return new Response(null, { status: 204 });
}

export async function handleSyncPost(
  roomId: string,
  req: Request,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "bad-json" }, 400);
  }

  // Viewer's own POST lazily upserts the room — covers the case where the
  // sync arrives before /sse/viewer/:room finishes opening.
  const room = getOrCreateRoom(roomId);

  const payload = { type: "sync", ...body };
  room.lastSync = payload;
  room.lastActivity = Date.now();
  broadcast(room.phones, "sync", payload);

  return new Response(null, { status: 204 });
}

// Backstop sweeper: catches rooms whose grace timer was somehow lost (e.g.
// a crash mid-cleanup). Runs at module load — Bun's hot reload will tear
// the old interval down when the module is replaced.
const staleSweep = setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (
      room.viewers.size === 0 &&
      room.phones.size === 0 &&
      now - room.lastActivity > STALE_AGE_MS
    ) {
      if (room.graceTimer) clearTimeout(room.graceTimer);
      rooms.delete(id);
      console.log(`[sse] stale-sweep reaped room ${id}`);
    }
  }
}, STALE_SWEEP_MS);
// Unref so the interval doesn't keep the process alive during shutdown.
(staleSweep as unknown as { unref?: () => void }).unref?.();

// Graceful shutdown: notify every active subscriber and close the streams.
function shutdown(): void {
  for (const [, room] of rooms) {
    for (const sub of room.viewers) {
      safeEnqueue(sub, formatEvent("bye", { reason: "shutdown" }));
      try {
        sub.controller.close();
      } catch {
        // ignore
      }
      clearInterval(sub.heartbeat);
    }
    for (const sub of room.phones) {
      safeEnqueue(sub, formatEvent("bye", { reason: "shutdown" }));
      try {
        sub.controller.close();
      } catch {
        // ignore
      }
      clearInterval(sub.heartbeat);
    }
    if (room.graceTimer) clearTimeout(room.graceTimer);
  }
  rooms.clear();
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});
