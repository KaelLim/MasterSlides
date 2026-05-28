const BASE   = process.env.DRUST_BASE_URL;
const TENANT = process.env.DRUST_TENANT_ID;
const TOKEN  = process.env.DRUST_SERVICE_TOKEN;

if (!BASE || !TENANT || !TOKEN) {
  throw new Error("DRUST_BASE_URL / DRUST_TENANT_ID / DRUST_SERVICE_TOKEN must be set");
}

const TENANT_BASE = `${BASE}/drust/t/${TENANT}`;
const AUTH = { Authorization: `Bearer ${TOKEN}` };

async function drustFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${TENANT_BASE}${path}`, {
    ...init,
    headers: { ...AUTH, ...(init.headers || {}) },
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
  created_at: string;
  updated_at: string;
}

export interface DocFields {
  doc_id: string;
  title: string | null;
  html: string;
  image_ids: string[];
}

export interface UploadedFile {
  id: string;
  public_url: string;
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
  return res.records[0] ?? null;
}

export async function insertDoc(data: DocFields): Promise<DocRecord> {
  const res = await drustJson<{ id: number; record: DocRecord }>(
    `/records/docs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    }
  );
  return res.record;
}

export async function updateDoc(
  id: number,
  data: Partial<Pick<DocFields, "title" | "html" | "image_ids">>
): Promise<void> {
  await drustFetch(`/records/docs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
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

export async function deleteImage(fileId: string): Promise<void> {
  try {
    await drustFetch(`/files/${fileId}`, { method: "DELETE" });
  } catch (err: any) {
    // 404 means already gone — tolerate
    if (!/→ 404/.test(err.message)) throw err;
  }
}
