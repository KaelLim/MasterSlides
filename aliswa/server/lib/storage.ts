import { join } from "path";
import { readdir, mkdir } from "fs/promises";

const DATA_DIR = join(import.meta.dir, "../../data");

export interface DocMeta {
  doc_id: string;
  title: string;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export function docDir(docId: string): string {
  return join(DATA_DIR, docId);
}

export function imagesDir(docId: string): string {
  return join(DATA_DIR, docId, "images");
}

export async function ensureDocDir(docId: string): Promise<void> {
  await mkdir(imagesDir(docId), { recursive: true });
}

export async function readMeta(docId: string): Promise<DocMeta | null> {
  const file = Bun.file(join(docDir(docId), "meta.json"));
  if (!(await file.exists())) return null;
  return file.json();
}

export async function writeMeta(meta: DocMeta): Promise<void> {
  const path = join(docDir(meta.doc_id), "meta.json");
  await Bun.write(path, JSON.stringify(meta, null, 2));
}

export async function nextVersion(docId: string): Promise<number> {
  const meta = await readMeta(docId);
  return meta ? meta.current_version + 1 : 1;
}

export async function readDocHtml(docId: string): Promise<string | null> {
  const meta = await readMeta(docId);
  if (!meta) return null;
  const file = Bun.file(join(docDir(docId), `${meta.current_version}.html`));
  if (!(await file.exists())) return null;
  return file.text();
}

export async function writeDocHtml(docId: string, version: number, html: string): Promise<void> {
  const path = join(docDir(docId), `${version}.html`);
  await Bun.write(path, html);
}

export async function writeImage(docId: string, filename: string, data: Uint8Array): Promise<void> {
  const path = join(imagesDir(docId), filename);
  await Bun.write(path, data);
}

export async function listDocs(): Promise<DocMeta[]> {
  const docs: DocMeta[] = [];
  try {
    const entries = await readdir(DATA_DIR);
    for (const entry of entries) {
      const meta = await readMeta(entry);
      if (meta) docs.push(meta);
    }
  } catch {
    // data/ doesn't exist yet
  }
  return docs;
}

export function resolveDataPath(pathname: string): string {
  // pathname like "/data/abc123/images/img_1.png"
  return join(DATA_DIR, pathname.replace(/^\/data\//, ""));
}
