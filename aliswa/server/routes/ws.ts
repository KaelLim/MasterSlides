import type { ServerWebSocket } from "bun";

interface WsData {
  room: string;
}

const rooms = new Map<string, Set<ServerWebSocket<WsData>>>();

export const wsHandler = {
  open(ws: ServerWebSocket<WsData>) {
    const { room } = ws.data;
    if (!rooms.has(room)) {
      rooms.set(room, new Set());
    }
    rooms.get(room)!.add(ws);
    console.log(`[ws] joined room ${room} (${rooms.get(room)!.size} clients)`);
  },

  message(ws: ServerWebSocket<WsData>, message: string | Buffer) {
    const { room } = ws.data;
    const clients = rooms.get(room);
    if (!clients) return;

    const msg = typeof message === "string" ? message : message.toString();

    // Broadcast to all other clients in the room
    for (const client of clients) {
      if (client !== ws) {
        client.send(msg);
      }
    }
  },

  close(ws: ServerWebSocket<WsData>) {
    const { room } = ws.data;
    const clients = rooms.get(room);
    if (!clients) return;

    clients.delete(ws);
    console.log(`[ws] left room ${room} (${clients.size} clients)`);

    if (clients.size === 0) {
      rooms.delete(room);
    }
  },
};
