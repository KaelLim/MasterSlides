// Read env at call-time, not module-load. Workers/Pages Functions inject
// secrets via the per-request `context.env`; the Function entrypoint
// shims globalThis.process so this code path works there too. Bun reads
// directly from its native process.env.
//
// Auth: anon token. Drust enforces what anon can do per-collection via
// `anon_caps` (must include select/insert/update/delete on `docs` and
// `playlists`). Service token only flows through routes/publish.ts for
// broadcast publish — never via drust.ts.
function drustConfig(): { tenantBase: string; auth: { Authorization: string } } {
  const base = process.env.DRUST_BASE_URL;
  const tenant = process.env.DRUST_TENANT_ID;
  const token = process.env.DRUST_ANON_TOKEN;
  if (!base || !tenant || !token) {
    throw new Error("DRUST_BASE_URL / DRUST_TENANT_ID / DRUST_ANON_TOKEN must be set");
  }
  return {
    tenantBase: `${base}/drust/t/${tenant}`,
    auth: { Authorization: `Bearer ${token}` },
  };
}

async function drustFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { tenantBase, auth } = drustConfig();
  const res = await fetch(`${tenantBase}${path}`, {
    ...init,
    headers: { ...auth, ...(init.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Drust ${init.method || "GET"} ${path} → ${res.status}: ${body}`);
  }
  return res;
}

async function drustJson<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  return (await drustFetch(path, init)).json() as Promise<T>;
}

export interface DocRecord {
  id: number;
  doc_id: string;
  title: string | null;
  html: string | null;
  image_ids: string[] | null;
  presentation_date: string | null;  // NEW — ISO YYYY-MM-DD
  unit_report: string[] | null;       // NEW — JSON array of strings
  is_public: number;  // 0 = draft (URL-only), 1 = listed
  created_at: string;
  updated_at: string;
}

export interface DocFields {
  doc_id: string;
  title: string | null;
  html: string;
  image_ids: string[];
  presentation_date?: string | null;  // NEW
  unit_report?: string[] | null;       // NEW
  is_public?: number;
}

export interface UploadedFile {
  id: string;
  public_url: string;
}

// Drust serializes json-typed columns as strings on the wire (e.g. image_ids = '["abc"]').
// Normalize to the declared `string[] | null` shape so callers see what the type says.
function normalizeRecord(raw: any): DocRecord {
  let image_ids: string[] | null = null;
  if (raw.image_ids != null) {
    if (typeof raw.image_ids === "string") {
      try { image_ids = JSON.parse(raw.image_ids); } catch { image_ids = []; }
    } else if (Array.isArray(raw.image_ids)) {
      image_ids = raw.image_ids;
    }
  }
  let unit_report: string[] | null = null;
  if (raw.unit_report != null) {
    if (typeof raw.unit_report === "string") {
      try { unit_report = JSON.parse(raw.unit_report); } catch { unit_report = []; }
    } else if (Array.isArray(raw.unit_report)) {
      unit_report = raw.unit_report;
    }
  }
  return { ...raw, image_ids, unit_report };
}

export async function findDocByDocId(docId: string): Promise<DocRecord | null> {
  const res = await drustJson<{ records: DocRecord[] }>(
    `/collections/docs/list`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filter: { doc_id: docId }, per_page: 1 }),
    }
  );
  const first = res.records[0];
  return first ? normalizeRecord(first) : null;
}

export async function insertDoc(data: DocFields): Promise<DocRecord> {
  const payload: Record<string, unknown> = {
    doc_id: data.doc_id,
    title: data.title,
    html: data.html,
    image_ids: data.image_ids,
    is_public: data.is_public ?? 0,
  };
  if (data.presentation_date !== undefined) {
    payload.presentation_date = data.presentation_date;
  }
  if (data.unit_report !== undefined) {
    payload.unit_report =
      data.unit_report === null ? null : JSON.stringify(data.unit_report);
  }
  const res = await drustJson<{ id: number; record: DocRecord }>(
    `/records/docs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: payload }),
    },
  );
  return normalizeRecord(res.record);
}

export async function updateDoc(
  id: number,
  data: Partial<Pick<DocFields, "title" | "html" | "image_ids" | "presentation_date" | "unit_report" | "is_public">>,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.html !== undefined) patch.html = data.html;
  if (data.image_ids !== undefined) patch.image_ids = data.image_ids;
  if (data.presentation_date !== undefined) patch.presentation_date = data.presentation_date;
  if (data.unit_report !== undefined) {
    patch.unit_report =
      data.unit_report === null ? null : JSON.stringify(data.unit_report);
  }
  if (data.is_public !== undefined) patch.is_public = data.is_public;
  await drustFetch(`/records/docs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: patch }),
  });
}

// Admin: full list for dashboard, sorted by created_at desc.
export async function listAllDocs(): Promise<DocRecord[]> {
  const res = await drustJson<{ records: DocRecord[] }>(
    `/collections/docs/list`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sort: { field: "created_at", desc: true },
        per_page: 200,
      }),
    }
  );
  return res.records.map(normalizeRecord);
}

export async function deleteDoc(id: number): Promise<void> {
  await drustFetch(`/records/docs/${id}`, { method: "DELETE" });
}

export async function uploadImage(
  bytes: Uint8Array,
  filename: string,
  contentType: string
): Promise<UploadedFile> {
  const form = new FormData();
  // `bytes as BlobPart` works around TS6 strict typing of Uint8Array<ArrayBufferLike>
  form.append("file", new Blob([bytes as BlobPart], { type: contentType }), filename);
  form.append("visibility", "public");

  const res = await drustJson<{ id: string; url: string }>(`/files`, {
    method: "POST",
    body: form,
  });
  return { id: res.id, public_url: res.url };
}

// ── Playlists ────────────────────────────────────────────────────

export interface PlaylistRecord {
  id: number;
  title: string;
  doc_ids: string[];
  is_public: number;
  created_at: string;
  updated_at: string;
}

export interface PlaylistFields {
  title: string;
  doc_ids: string[];
  is_public?: number;
}

function normalizePlaylist(raw: any): PlaylistRecord {
  let doc_ids: string[] = [];
  if (raw.doc_ids != null) {
    if (typeof raw.doc_ids === "string") {
      try { doc_ids = JSON.parse(raw.doc_ids); } catch { doc_ids = []; }
    } else if (Array.isArray(raw.doc_ids)) {
      doc_ids = raw.doc_ids;
    }
  }
  return { ...raw, doc_ids };
}

export async function listAllPlaylists(): Promise<PlaylistRecord[]> {
  const res = await drustJson<{ records: PlaylistRecord[] }>(
    `/collections/playlists/list`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sort: { field: "created_at", desc: true },
        per_page: 200,
      }),
    },
  );
  return res.records.map(normalizePlaylist);
}

export async function findPlaylist(id: number): Promise<PlaylistRecord | null> {
  try {
    // GET /records/playlists/:id returns { record: { ... } } — unwrap.
    const raw = await drustJson<{ record: PlaylistRecord }>(`/records/playlists/${id}`);
    return normalizePlaylist(raw.record);
  } catch (err: any) {
    if (/→ 404/.test(err.message)) return null;
    throw err;
  }
}

export async function insertPlaylist(
  data: PlaylistFields,
): Promise<PlaylistRecord> {
  const res = await drustJson<{ id: number; record: PlaylistRecord }>(
    `/records/playlists`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          ...data,
          // Drust expects doc_ids as a JSON-encoded string in the TEXT column.
          doc_ids: JSON.stringify(data.doc_ids ?? []),
          is_public: data.is_public ?? 0,
        },
      }),
    },
  );
  return normalizePlaylist(res.record);
}

export async function updatePlaylist(
  id: number,
  data: Partial<PlaylistFields>,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.doc_ids !== undefined) patch.doc_ids = JSON.stringify(data.doc_ids);
  if (data.is_public !== undefined) patch.is_public = data.is_public;
  if (Object.keys(patch).length === 0) return;
  await drustFetch(`/records/playlists/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: patch }),
  });
}

export async function deletePlaylist(id: number): Promise<void> {
  await drustFetch(`/records/playlists/${id}`, { method: "DELETE" });
}

// ── Files ────────────────────────────────────────────────────────

export async function deleteImage(fileId: string): Promise<void> {
  try {
    await drustFetch(`/files/${fileId}`, { method: "DELETE" });
  } catch (err: any) {
    // 404 means already gone — tolerate
    if (!/→ 404/.test(err.message)) throw err;
  }
}
