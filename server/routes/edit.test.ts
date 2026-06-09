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

test("handlePostEdit: rejects calendar-invalid date (Feb 30)", async () => {
  // Date ctor silently normalises 2026-02-30 → 2026-03-02; the round-trip
  // check in validate() must catch this before composeFirstSlide throws.
  const res = await handlePostEdit("__fake_id", {
    presentation_date: "2026-02-30",
    title: "T",
    unit_report: ["A"],
  });
  expect(res.status).toBe(422);
  expect((await res.json()).error).toBe("presentation_date_invalid");
});

test("handlePostEdit: rejects calendar-invalid date (month 13)", async () => {
  const res = await handlePostEdit("__fake_id", {
    presentation_date: "2026-13-01",
    title: "T",
    unit_report: ["A"],
  });
  expect(res.status).toBe(422);
  expect((await res.json()).error).toBe("presentation_date_invalid");
});

test("handlePostEdit: rejects non-array unit_report", async () => {
  const res = await handlePostEdit("__fake_id", {
    presentation_date: "2026-06-09",
    title: "T",
    unit_report: "A" as never,
  });
  expect(res.status).toBe(422);
  expect((await res.json()).error).toBe("unit_report_required");
});

test("handlePostEdit: rejects unit_report entries that are not strings", async () => {
  const res = await handlePostEdit("__fake_id", {
    presentation_date: "2026-06-09",
    title: "T",
    unit_report: [null as never, 123 as never],
  });
  expect(res.status).toBe(422);
  expect((await res.json()).error).toBe("unit_report_required");
});

test("handlePostEdit: rejects non-string title", async () => {
  const res = await handlePostEdit("__fake_id", {
    presentation_date: "2026-06-09",
    title: 42 as never,
    unit_report: ["A"],
  });
  expect(res.status).toBe(422);
  expect((await res.json()).error).toBe("title_required");
});
