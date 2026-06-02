import { test, expect } from "bun:test";
import { upsertDoc, getDocHtml } from "./storage";
import { findDocByDocId, deleteDoc, uploadImage, deleteImage } from "./drust";

test("upsertDoc inserts on first call, updates and cleans old images on second", async () => {
  const docId = "__upsert_" + Date.now();
  const img1 = await uploadImage(new Uint8Array([1, 2, 3]), "a.png", "image/png");
  const img2 = await uploadImage(new Uint8Array([4, 5, 6]), "b.png", "image/png");

  try {
    const r1 = await upsertDoc({
      doc_id: docId,
      title: "v1",
      html: "<p>v1</p>",
      image_ids: [img1.id],
    });
    expect(r1.doc_id).toBe(docId);
    expect(r1.title).toBe("v1");

    // Second call — update; upsertDoc deletes img1 before storing img2
    const r2 = await upsertDoc({
      doc_id: docId,
      title: "v2",
      html: "<p>v2</p>",
      image_ids: [img2.id],
    });
    expect(r2.id).toBe(r1.id);
    expect(r2.title).toBe("v2");

    const html = await getDocHtml(docId);
    expect(html).toBe("<p>v2</p>");

    const img1Check = await fetch(img1.public_url);
    expect(img1Check.status).toBe(404);

    const img2Check = await fetch(img2.public_url);
    expect(img2Check.ok).toBe(true);
  } finally {
    // Cleanup is idempotent (deleteImage tolerates 404, deleteDoc only runs if record exists).
    const final = await findDocByDocId(docId);
    if (final) await deleteDoc(final.id);
    await deleteImage(img1.id);
    await deleteImage(img2.id);
  }
});

test("getDocHtml returns null for unknown doc", async () => {
  const result = await getDocHtml("__nonexistent_" + Date.now());
  expect(result).toBeNull();
});

test("upsertDoc: same doc_id overwrites and reclaims orphaned image_ids", async () => {
  const docId = `__upsert_reclaim_${Date.now()}`;

  try {
    // V1 with two fake image ids
    await upsertDoc({
      doc_id: docId,
      title: "v1",
      html: "<p>v1</p>",
      image_ids: ["__test_img_a", "__test_img_b"],
    });
    const v1 = await findDocByDocId(docId);
    expect(v1?.image_ids).toEqual(["__test_img_a", "__test_img_b"]);

    // V2 keeps b, drops a, adds c
    await upsertDoc({
      doc_id: docId,
      title: "v2",
      html: "<p>v2</p>",
      image_ids: ["__test_img_b", "__test_img_c"],
    });
    const v2 = await findDocByDocId(docId);
    expect(v2?.image_ids).toEqual(["__test_img_b", "__test_img_c"]);
    expect(v2?.html).toBe("<p>v2</p>");
    expect(v2?.title).toBe("v2");
  } finally {
    const final = await findDocByDocId(docId);
    if (final) await deleteDoc(final.id);
  }
});
