import { test, expect } from "bun:test";
import { handleGetEdit, handlePostEdit } from "./edit";

test("handlePostEdit: rejects missing presentation_date", async () => {
  const res = await handlePostEdit("__fake_id", {
    title: "T",
    unit_report: ["A"],
  } as never);
  expect(res.status).toBe(422);
  const body = (await res.json()) as { error: string };
  expect(body.error).toBe("presentation_date_invalid");
});

test("handlePostEdit: rejects empty title", async () => {
  const res = await handlePostEdit("__fake_id", {
    presentation_date: "2026-06-09",
    title: "   ",
    unit_report: ["A"],
  });
  expect(res.status).toBe(422);
  expect((await res.json()).error).toBe("title_required");
});

test("handlePostEdit: rejects empty unit_report", async () => {
  const res = await handlePostEdit("__fake_id", {
    presentation_date: "2026-06-09",
    title: "T",
    unit_report: [],
  });
  expect(res.status).toBe(422);
  expect((await res.json()).error).toBe("unit_report_required");
});

test("handlePostEdit: rejects unit_report with only empty strings", async () => {
  const res = await handlePostEdit("__fake_id", {
    presentation_date: "2026-06-09",
    title: "T",
    unit_report: ["", "   "],
  });
  expect(res.status).toBe(422);
  expect((await res.json()).error).toBe("unit_report_required");
});

test("handlePostEdit: rejects malformed presentation_date", async () => {
  const res = await handlePostEdit("__fake_id", {
    presentation_date: "06/09/2026",
    title: "T",
    unit_report: ["A"],
  });
  expect(res.status).toBe(422);
  expect((await res.json()).error).toBe("presentation_date_invalid");
});
