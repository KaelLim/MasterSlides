import {
  findDocByDocId,
  insertDoc,
  updateDoc,
  deleteImage,
  uploadHtmlFile,
  fetchPublicFile,
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

// Body HTML is stored as a Drust public file, NOT in the row. /records/docs
// PATCH was hitting a 413 once paginated HTML for image-heavy decks crossed
// the Drust body-size ceiling. Keeping the row metadata-only sidesteps the
// limit entirely; the file URL is cacheable, the row is small.
//
// Legacy records (pre-2026-06-09) still have html in the row and no
// html_file_id; reads fall back to row html until they're re-saved
// through the edit page.
export async function upsertDoc(input: UpsertDocInput): Promise<DocRecord> {
  const existing = await findDocByDocId(input.doc_id);

  // Upload the new HTML body first. If this fails (network, Drust outage)
  // we haven't touched the record yet — the old html_file_id keeps
  // serving stale-but-correct content.
  const htmlFile = await uploadHtmlFile(input.html, input.doc_id);

  if (existing) {
    // Best-effort delete of old images + old html file. Orphans are
    // tolerated (logged, not thrown) — leaking a file is preferable to
    // failing the save when the record write would have succeeded.
    for (const oldId of existing.image_ids ?? []) {
      try {
        await deleteImage(oldId);
      } catch (err) {
        console.warn(`[storage] failed to delete old image ${oldId}:`, err);
      }
    }
    if (existing.html_file_id) {
      try {
        await deleteImage(existing.html_file_id);
      } catch (err) {
        console.warn(`[storage] failed to delete old html file ${existing.html_file_id}:`, err);
      }
    }
    await updateDoc(existing.id, {
      title: input.title,
      html: null,
      html_file_id: htmlFile.id,
      image_ids: input.image_ids,
      presentation_date: input.presentation_date,
      unit_report: input.unit_report,
    });
    const refreshed = await findDocByDocId(input.doc_id);
    if (!refreshed) throw new Error(`[storage] record vanished after update: ${input.doc_id}`);
    return refreshed;
  }

  return insertDoc({
    doc_id: input.doc_id,
    title: input.title,
    html: null,
    html_file_id: htmlFile.id,
    image_ids: input.image_ids,
    presentation_date: input.presentation_date,
    unit_report: input.unit_report,
  });
}

export async function getDocHtml(docId: string): Promise<string | null> {
  const record = await findDocByDocId(docId);
  if (!record) return null;
  if (record.html_file_id) {
    const body = await fetchPublicFile(record.html_file_id);
    if (body !== null) return body;
    // File got deleted out from under us; fall through to legacy column.
  }
  return record.html ?? null;
}
