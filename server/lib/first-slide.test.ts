import { test, expect } from "bun:test";
import { dateToChinese, composeFirstSlide } from "./first-slide";

// ── dateToChinese ──────────────────────────────────────────────

test("dateToChinese: 2026-06-09 → 二〇二六年六月九日（星期二）", () => {
  expect(dateToChinese("2026-06-09")).toBe("二〇二六年六月九日（星期二）");
  // Sanity: the zero must be U+3007 (圈圈零), not Latin uppercase O (U+004F).
  expect(dateToChinese("2026-06-09")).toContain("〇");
  expect(dateToChinese("2026-06-09")).not.toContain("O");
});

test("dateToChinese: single-digit month and day with no zero-padding", () => {
  expect(dateToChinese("2030-01-01")).toBe("二〇三〇年一月一日（星期二）");
  expect(dateToChinese("2024-09-08")).toBe("二〇二四年九月八日（星期日）");
});

test("dateToChinese: double-digit day uses Chinese tens", () => {
  // 2026-06-10 is a Wednesday
  expect(dateToChinese("2026-06-10")).toBe("二〇二六年六月十日（星期三）");
  // 2026-06-21 is a Sunday
  expect(dateToChinese("2026-06-21")).toBe("二〇二六年六月二十一日（星期日）");
  // 2026-12-31 is a Thursday
  expect(dateToChinese("2026-12-31")).toBe("二〇二六年十二月三十一日（星期四）");
});

test("dateToChinese: weekday mapping — all 7", () => {
  // Use the week starting 2026-06-07 (Sunday).
  expect(dateToChinese("2026-06-07")).toContain("（星期日）");
  expect(dateToChinese("2026-06-08")).toContain("（星期一）");
  expect(dateToChinese("2026-06-09")).toContain("（星期二）");
  expect(dateToChinese("2026-06-10")).toContain("（星期三）");
  expect(dateToChinese("2026-06-11")).toContain("（星期四）");
  expect(dateToChinese("2026-06-12")).toContain("（星期五）");
  expect(dateToChinese("2026-06-13")).toContain("（星期六）");
});

test("dateToChinese: year with multiple zeros → multiple 〇", () => {
  expect(dateToChinese("2000-03-15")).toBe("二〇〇〇年三月十五日（星期三）");
});

test("dateToChinese: throws on malformed input", () => {
  expect(() => dateToChinese("not-a-date")).toThrow();
  expect(() => dateToChinese("2026/06/09")).toThrow();
  expect(() => dateToChinese("2026-13-01")).toThrow();
});

// ── composeFirstSlide ──────────────────────────────────────────

test("composeFirstSlide: emits .first-slide div + trailing <hr>", () => {
  const out = composeFirstSlide({
    presentation_date: "2026-06-09",
    title: "六月共修",
    unit_report: ["陳老師", "林老師"],
  });
  expect(out).toContain('class="first-slide"');
  expect(out).toContain('class="first-slide-date">二〇二六年六月九日（星期二）<');
  expect(out).toContain('class="first-slide-title">六月共修<');
  expect(out).toContain('<div>陳老師</div>');
  expect(out).toContain('<div>林老師</div>');
  expect(out).not.toContain("<ol>");
  expect(out).not.toContain("<li>");
  expect(out.trimEnd().endsWith("<hr>")).toBe(true);
});

test("composeFirstSlide: single reporter renders one <div>, no list markup", () => {
  const out = composeFirstSlide({
    presentation_date: "2026-06-09",
    title: "T",
    unit_report: ["陳老師"],
  });
  expect(out).toContain('<div>陳老師</div>');
  expect(out).not.toContain("<ol>");
  expect(out).not.toContain("<li>");
});

test("composeFirstSlide: escapes HTML in title and reporter names", () => {
  const out = composeFirstSlide({
    presentation_date: "2026-06-09",
    title: "<script>alert(1)</script>",
    unit_report: ["\"o'r\""],
  });
  expect(out).not.toContain("<script>");
  expect(out).toContain("&lt;script&gt;");
  expect(out).toContain("&quot;o&#39;r&quot;");
});
