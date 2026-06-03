import { test, expect, afterAll } from "bun:test";
import { deletePlaylist, listAllPlaylists } from "../drust";
import type { PlaylistRecord } from "../drust";
import {
  handlePlaylistCreate,
  handlePlaylistGet,
  handlePlaylistPatch,
  handlePlaylistDelete,
  handlePublicPlaylistGet,
} from "./playlists";

afterAll(async () => {
  const all = await listAllPlaylists();
  for (const p of all) {
    if (p.title.startsWith("__test_pl_")) await deletePlaylist(p.id);
  }
});

function req(method: string, path: string, body?: object): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("create + get: round-trips title, doc_ids, is_public", async () => {
  const createRes = await handlePlaylistCreate(
    req("POST", "/api/admin/playlists", {
      title: "__test_pl_roundtrip",
      doc_ids: ["abc_123", "def_456"],
      is_public: true,
    }),
  );
  expect(createRes.status).toBe(201);
  const { playlist } = (await createRes.json()) as { playlist: PlaylistRecord };
  expect(playlist.title).toBe("__test_pl_roundtrip");
  expect(playlist.doc_ids).toEqual(["abc_123", "def_456"]);
  expect(playlist.is_public).toBe(1);

  const getRes = await handlePlaylistGet(String(playlist.id), req("GET", `/api/admin/playlists/${playlist.id}`));
  expect(getRes.status).toBe(200);
});

test("patch: updates doc_ids preserving order", async () => {
  const createRes = await handlePlaylistCreate(
    req("POST", "/api/admin/playlists", { title: "__test_pl_patch", doc_ids: ["a", "b"] }),
  );
  const { playlist } = (await createRes.json()) as { playlist: PlaylistRecord };
  const patchRes = await handlePlaylistPatch(
    String(playlist.id),
    req("PATCH", `/api/admin/playlists/${playlist.id}`, { doc_ids: ["b", "c", "a"] }),
  );
  expect(patchRes.status).toBe(200);
  const updated = ((await patchRes.json()) as { playlist: PlaylistRecord }).playlist;
  expect(updated.doc_ids).toEqual(["b", "c", "a"]);
});

test("delete: returns 204, subsequent get returns 404", async () => {
  const createRes = await handlePlaylistCreate(
    req("POST", "/api/admin/playlists", { title: "__test_pl_delete", doc_ids: [] }),
  );
  const { playlist } = (await createRes.json()) as { playlist: PlaylistRecord };
  const delRes = await handlePlaylistDelete(String(playlist.id), req("DELETE", `/api/admin/playlists/${playlist.id}`));
  expect(delRes.status).toBe(204);
  const getRes = await handlePlaylistGet(String(playlist.id), req("GET", `/api/admin/playlists/${playlist.id}`));
  expect(getRes.status).toBe(404);
});

test("public get: 200 when is_public=1", async () => {
  const createRes = await handlePlaylistCreate(
    req("POST", "/api/admin/playlists", {
      title: "__test_pl_public",
      doc_ids: ["x"],
      is_public: true,
    }),
  );
  const { playlist } = (await createRes.json()) as { playlist: PlaylistRecord };
  const pubRes = await handlePublicPlaylistGet(String(playlist.id));
  expect(pubRes.status).toBe(200);
});

test("create: rejects doc_ids containing '..' or whitespace", async () => {
  const badIds = [["valid", "../etc"], ["", "ok"], ["bad id"]];
  for (const doc_ids of badIds) {
    const res = await handlePlaylistCreate(
      req("POST", "/api/admin/playlists", { title: "__test_pl_bad", doc_ids }),
    );
    expect(res.status).toBe(400);
  }
});
