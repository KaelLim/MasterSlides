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
  presentation_date?: string | null;
  unit_report?: string[] | null;
}

export async function upsertDoc(input: UpsertDocInput): Promise<DocRecord> {
  const existing = await findDocByDocId(input.doc_id);

  if (existing) {
    // Best-effort delete of old images. Orphans are tolerated (logged, not thrown).
    for (const oldId of existing.image_ids ?? []) {
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
      presentation_date: input.presentation_date,
      unit_report: input.unit_report,
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
