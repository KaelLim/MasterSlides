import { test, expect } from "bun:test";
import {
  findDocByDocId,
  insertDoc,
  updateDoc,
  deleteDoc,
  uploadImage,
  deleteImage,
} from "./drust";

test("findDocByDocId returns null when nothing matches", async () => {
  const result = await findDocByDocId("__nonexistent_" + Date.now());
  expect(result).toBeNull();
});

test("doc record round-trip: insert → find → update → delete", async () => {
  const docId = "__roundtrip_" + Date.now();
  const inserted = await insertDoc({
    doc_id: docId,
    title: "round-trip",
    html: "<p>v1</p>",
    image_ids: [],
  });
  expect(inserted.doc_id).toBe(docId);
  expect(inserted.id).toBeGreaterThan(0);

  const found = await findDocByDocId(docId);
  expect(found?.id).toBe(inserted.id);

  await updateDoc(inserted.id, { title: "updated", html: "<p>v2</p>" });
  const refetched = await findDocByDocId(docId);
  expect(refetched?.title).toBe("updated");
  expect(refetched?.html).toBe("<p>v2</p>");

  await deleteDoc(inserted.id);
  const afterDelete = await findDocByDocId(docId);
  expect(afterDelete).toBeNull();
});

test("image upload + public fetch + delete", async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic
  const f = await uploadImage(bytes, "probe.png", "image/png");
  expect(f.id).toMatch(/[0-9a-f-]{36}/i);
  expect(f.public_url).toMatch(/^https?:\/\//);

  const fetched = await fetch(f.public_url);
  expect(fetched.ok).toBe(true);

  await deleteImage(f.id);
  const after = await fetch(f.public_url);
  expect(after.status).toBe(404);
});
