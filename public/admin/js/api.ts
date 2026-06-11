// Real API client for the redesigned admin dashboard.
//
// All functions throw an HttpError (Error with optional .status) on non-2xx.
// Server endpoint surface — these match server/routes/admin/index.ts:
//   GET    /api/admin/docs            → { docs: [{ doc_id, title?, is_public?, created_at? }] }
//   PATCH  /api/admin/docs/:doc_id    body { title?, is_public? } → { doc }
//   DELETE /api/admin/docs/:doc_id    → 204
//   GET    /api/admin/playlists       → { playlists: [...] }
//   POST   /api/admin/playlists       body { title, doc_ids[], is_public } → 201 { playlist }
//   PATCH  /api/admin/playlists/:id   body { title?, doc_ids?, is_public? } → { playlist }
//   DELETE /api/admin/playlists/:id   → 204
//   POST   /api/fetch-doc             body { url } → { success, doc_id, images } — used for both import + resync
//   GET    /api/edit/:doc_id          → { presentation_date?, title?, unit_report? }
//   POST   /api/edit/:doc_id          body { presentation_date, title, unit_report } → ok
//
// Note: the brief spec said `POST /api/admin/docs` for import and
// `/api/playlists` for the list. We use the actual server endpoints
// (`/api/fetch-doc` and `/api/admin/playlists`) so the client works today.

import type { Doc, Playlist, PubState } from "./types.js";

export interface HttpError extends Error {
  status?: number;
}

// ── Low-level helpers ────────────────────────────────────────────────────────

function makeError(message: string, status?: number): HttpError {
  const e = new Error(message) as HttpError;
  if (typeof status === "number") e.status = status;
  return e;
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = "GET", body, headers = {} } = opts;
  const init: RequestInit = {
    method,
    credentials: "same-origin",
    headers: { ...headers },
  };
  if (body !== undefined) {
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (netErr) {
    // Network failure (offline, DNS, CORS) — surface as status 0 so
    // classifyError can map it.
    throw makeError((netErr as Error).message || "network error", 0);
  }

  // 204 / 205 — no body.
  if (res.status === 204 || res.status === 205) {
    if (!res.ok) throw makeError(`HTTP ${res.status}`, res.status);
    return null as unknown as T;
  }

  // Try to parse the body once; we use it for both success and error paths.
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON response — leave parsed as null and fall through.
    }
  }

  if (!res.ok) {
    const serverMsg =
      parsed && typeof parsed === "object"
        ? (parsed as { error?: unknown; message?: unknown }).error ??
          (parsed as { message?: unknown }).message
        : null;
    const msg = typeof serverMsg === "string" && serverMsg.length > 0
      ? serverMsg
      : `HTTP ${res.status}`;
    throw makeError(msg, res.status);
  }

  return (parsed ?? null) as T;
}

// ── Date parsing ─────────────────────────────────────────────────────────────

// Drust returns timestamps as `YYYY-MM-DD HH:MM:SS` in UTC, with no Z.
// Replacing the space with T and appending Z yields an ISO string the
// Date constructor parses correctly across browsers.
export function parseDate(s: string | undefined | null): number {
  if (!s || typeof s !== "string") return 0;
  // Already-ms-epoch numbers can also be passed defensively.
  const trimmed = s.trim();
  if (!trimmed) return 0;
  const iso = trimmed.includes("T") ? trimmed : `${trimmed.replace(" ", "T")}Z`;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

// ── Shape adapters ───────────────────────────────────────────────────────────

interface RawDoc {
  doc_id: string;
  title?: string;
  is_public?: number | boolean;
  created_at?: string;
  updated_at?: string;
}

interface RawPlaylist {
  id: number | string;
  title?: string;
  is_public?: number | boolean;
  doc_ids?: string[];
  created_at?: string;
  updated_at?: string;
}

function stateFromPublic(v: number | boolean | undefined): PubState {
  return v ? "public" : "draft";
}

function adaptDoc(raw: RawDoc): Doc {
  const created_at = parseDate(raw.created_at);
  const updated_at = parseDate(raw.updated_at) || created_at;
  return {
    doc_id: raw.doc_id,
    title: raw.title || raw.doc_id,
    state: stateFromPublic(raw.is_public),
    updated_at,
    created_at,
    playlist_count: 0,
  };
}

function adaptPlaylist(raw: RawPlaylist): Playlist {
  const updated_at = parseDate(raw.updated_at) || parseDate(raw.created_at);
  return {
    id: String(raw.id),
    title: raw.title || "",
    state: stateFromPublic(raw.is_public),
    updated_at,
    members: Array.isArray(raw.doc_ids) ? raw.doc_ids.slice() : [],
  };
}

// ── Docs ─────────────────────────────────────────────────────────────────────

export async function listDocs(): Promise<Doc[]> {
  const body = await request<{ docs?: RawDoc[] }>("/api/admin/docs");
  return (body?.docs ?? []).map(adaptDoc);
}

// Both importDoc (paste a Google Docs URL) and resyncDoc (re-fetch by id)
// hit POST /api/fetch-doc — the server treats the doc_id-only form as a
// refresh and preserves existing title/presentation_date/unit_report.
//
// The server response is `{ success, doc_id, images }` — not a full Doc.
// We therefore round-trip the listing to find the just-imported row so
// the caller gets a stable Doc shape (matches the spec's contract).
async function fetchAndFindDoc(payload: { url?: string; doc_id?: string }): Promise<Doc> {
  const body = await request<{ success?: boolean; doc_id?: string; error?: string }>(
    "/api/fetch-doc",
    { method: "POST", body: payload },
  );
  if (!body || body.success === false || !body.doc_id) {
    throw makeError(body?.error || "import failed");
  }
  const docId = body.doc_id;
  // Find the imported doc in the fresh listing.
  const docs = await listDocs();
  const match = docs.find((d) => d.doc_id === docId);
  if (match) return match;
  // Server upserted but list doesn't show it — return a minimal Doc rather
  // than throwing, so the caller can still proceed.
  return {
    doc_id: docId,
    title: docId,
    state: "draft",
    updated_at: Date.now(),
    created_at: Date.now(),
    playlist_count: 0,
  };
}

export async function importDoc(rawUrlOrId: string): Promise<Doc> {
  const trimmed = (rawUrlOrId || "").trim();
  if (!trimmed) throw makeError("missing url");
  // The /api/fetch-doc handler accepts either a full URL or anything that
  // contains /document/d/<id>; if the caller passed a bare doc_id, wrap it
  // as a synthetic URL so extractDocId() finds it.
  const looksLikeUrl = /^https?:\/\//i.test(trimmed) || trimmed.includes("/document/d/");
  const url = looksLikeUrl ? trimmed : `https://docs.google.com/document/d/${trimmed}/edit`;
  return fetchAndFindDoc({ url });
}

export async function resyncDoc(docId: string): Promise<Doc> {
  if (!docId) throw makeError("missing doc_id");
  const url = `https://docs.google.com/document/d/${docId}/edit`;
  return fetchAndFindDoc({ url });
}

export async function patchDoc(
  docId: string,
  patch: { title?: string; is_public?: number },
): Promise<void> {
  await request<{ doc?: RawDoc }>(`/api/admin/docs/${encodeURIComponent(docId)}`, {
    method: "PATCH",
    body: patch,
  });
}

export async function deleteDoc(docId: string): Promise<void> {
  await request<null>(`/api/admin/docs/${encodeURIComponent(docId)}`, {
    method: "DELETE",
  });
}

// ── Playlists ────────────────────────────────────────────────────────────────

export async function listPlaylists(): Promise<Playlist[]> {
  const body = await request<{ playlists?: RawPlaylist[] }>("/api/admin/playlists");
  return (body?.playlists ?? []).map(adaptPlaylist);
}

export async function createPlaylist(p: {
  title: string;
  doc_ids: string[];
  is_public: number;
}): Promise<Playlist> {
  const body = await request<{ playlist?: RawPlaylist }>("/api/admin/playlists", {
    method: "POST",
    body: p,
  });
  if (!body?.playlist) throw makeError("create playlist failed");
  return adaptPlaylist(body.playlist);
}

export async function patchPlaylist(
  id: string,
  patch: { title?: string; doc_ids?: string[]; is_public?: number },
): Promise<void> {
  await request<{ playlist?: RawPlaylist }>(
    `/api/admin/playlists/${encodeURIComponent(id)}`,
    { method: "PATCH", body: patch },
  );
}

export async function deletePlaylist(id: string): Promise<void> {
  await request<null>(`/api/admin/playlists/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ── Edit metadata ────────────────────────────────────────────────────────────

export interface EditData {
  presentation_date?: string;
  title?: string;
  unit_report?: string[];
}

export async function getEditData(docId: string): Promise<EditData> {
  const body = await request<EditData | null>(
    `/api/edit/${encodeURIComponent(docId)}`,
  );
  return body ?? {};
}

export async function saveEditData(
  docId: string,
  payload: { presentation_date: string; title: string; unit_report: string[] },
): Promise<void> {
  await request<unknown>(`/api/edit/${encodeURIComponent(docId)}`, {
    method: "POST",
    body: payload,
  });
}

// ── Error classification (Traditional Chinese) ───────────────────────────────

export function classifyError(err: unknown): { title: string; msg: string } {
  if (!err) {
    return { title: "操作失敗", msg: "請稍候再試。" };
  }
  const e = err as HttpError;
  const status = typeof e.status === "number" ? e.status : undefined;

  // Status 0 (set above on fetch() rejection) or no status at all + a
  // network-y Error → treat as offline.
  if (status === 0) {
    return { title: "網路連線異常", msg: "請檢查網路後再試一次。" };
  }
  if (status === 401 || status === 403) {
    return { title: "權限不足", msg: "請聯絡系統管理員。" };
  }
  if (status === 404) {
    return { title: "找不到資源", msg: "資料可能已被刪除。" };
  }
  if (status === 409) {
    return { title: "資料衝突", msg: "請重新整理後再試。" };
  }
  if (status === 413) {
    return { title: "資料量過大", msg: "請聯絡管理員。" };
  }
  if (status === 429) {
    return { title: "請求過於頻繁", msg: "請稍候再試。" };
  }
  if (typeof status === "number" && status >= 500 && status <= 599) {
    return {
      title: "伺服器錯誤",
      msg: "請稍候再試，若持續發生請通知管理員。",
    };
  }
  const fallbackMsg = e.message && e.message.length > 0 ? e.message : "請稍候再試。";
  return { title: "操作失敗", msg: fallbackMsg };
}
