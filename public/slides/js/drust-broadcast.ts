// Browser-side Drust broadcast client.
//
// connectRoom(roomName, { onMessage, onOpen, onClose }) opens a WebSocket to
// Drust's /realtime endpoint using the anon token (fetched once via
// /api/config), subscribes to roomName, and dispatches each incoming
// envelope's `.payload` to onMessage.
//
// publish(payload) goes through the Bun server's /api/publish/:room proxy
// (the server holds the service token; the browser never sees it).
//
// Reconnects automatically with exponential backoff. Re-subscribes on each
// reconnect. Drust broadcast is fire-and-forget — late subscribers receive
// nothing — so callers are responsible for any rejoin handshake (e.g. phone
// publishes 'phone-join' on open so the viewer answers with a fresh sync).

interface DrustConfig {
  wsUrl: string;
}

interface DrustEnvelope {
  kind?: string;
  room?: string;
  payload?: unknown;
  ts?: number;
}

export interface ConnectRoomOptions {
  onMessage?: (payload: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface RoomConnection {
  publish: (payload: unknown) => Promise<void>;
  stop: () => void;
}

let _configPromise: Promise<DrustConfig> | null = null;
function getConfig(): Promise<DrustConfig> {
  if (!_configPromise) {
    _configPromise = fetch("/api/config")
      .then((r) => {
        if (!r.ok) throw new Error(`/api/config → ${r.status}`);
        return r.json() as Promise<DrustConfig>;
      })
      .catch((err) => {
        // Don't memoize failures — let the next caller retry.
        _configPromise = null;
        throw err;
      });
  }
  return _configPromise;
}

const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;

export async function connectRoom(
  roomName: string,
  { onMessage, onOpen, onClose }: ConnectRoomOptions = {},
): Promise<RoomConnection> {
  const { wsUrl } = await getConfig();

  let ws: WebSocket | null = null;
  let backoff = MIN_BACKOFF_MS;
  let stopped = false;
  let openTimer: ReturnType<typeof setTimeout> | null = null;

  function open(): void {
    if (stopped) return;
    ws = new WebSocket(wsUrl);

    ws.addEventListener("open", () => {
      backoff = MIN_BACKOFF_MS;
      // (Re-)subscribe on every open — Drust subscriptions are per-connection.
      ws!.send(JSON.stringify({ op: "subscribe", room: roomName }));
      onOpen?.();
    });

    ws.addEventListener("message", (ev: MessageEvent) => {
      let env: DrustEnvelope | undefined;
      try {
        env = JSON.parse(ev.data) as DrustEnvelope;
      } catch {
        return; // malformed frame
      }
      // Drust wraps payloads as { kind:'message', room, payload, ts }. Drop
      // anything that isn't a broadcast for our room (heartbeats etc).
      if (env && env.kind === "message" && env.room === roomName && env.payload) {
        onMessage?.(env.payload);
      }
    });

    ws.addEventListener("close", () => {
      onClose?.();
      if (stopped) return;
      openTimer = setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    });

    // 'error' precedes 'close'; the reconnect lives in close so nothing here.
    ws.addEventListener("error", () => {});
  }

  open();

  async function publish(payload: unknown): Promise<void> {
    try {
      const res = await fetch(`/api/publish/${roomName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // Non-2xx is silent by default (best-effort). Log so payload-size
      // failures (Drust caps at 64 KiB) are visible during debugging.
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn(`[drust] publish to ${roomName} → ${res.status}: ${text}`);
      }
    } catch {
      // Network error. Reconnect + phone-join will eventually resync.
    }
  }

  function stop(): void {
    stopped = true;
    if (openTimer) clearTimeout(openTimer);
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
  }

  return { publish, stop };
}
