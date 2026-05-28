import {
  findDocByDocId,
  insertDoc,
  updateDoc,
  deleteImage,
  type DocRecord,
} from "./drust";

export interface UpsertDocInput {
  doc_id: string;
  title: string | null;
  html: string;
  image_ids: string[];
}

export async function upsertDoc(input: UpsertDocInput): Promise<DocRecord> {
  const existing = await findDocByDocId(input.doc_id);

  if (existing) {
    // Best-effort delete of old images. Orphans are tolerated (logged, not thrown).
    // Note: Drust stores image_ids as a JSON string in a TEXT column.
    const oldIds = existing.image_ids
      ? typeof existing.image_ids === "string"
        ? JSON.parse(existing.image_ids)
        : existing.image_ids
      : [];
    for (const oldId of oldIds) {
      try {
        await deleteImage(oldId);
      } catch (err) {
        console.warn(`[storage] failed to delete old image ${oldId}:`, err);
      }
    }
    await updateDoc(existing.id, {
      title: input.title,
      html: input.html,
      image_ids: input.image_ids,
    });
    // Re-fetch to return the updated record (PATCH returns no body in our wrapper).
    const refreshed = await findDocByDocId(input.doc_id);
    if (!refreshed) throw new Error(`[storage] record vanished after update: ${input.doc_id}`);
    return refreshed;
  }

  return insertDoc(input);
}

export async function getDocHtml(docId: string): Promise<string | null> {
  const record = await findDocByDocId(docId);
  if (!record || !record.html) return null;
  return record.html;
}
