// Synthesize the first slide of every presentation from structured
// metadata. Pure functions — no I/O, no DOM. Output is plain HTML that
// the existing paginator treats as one slide-page worth of content
// followed by an HR page-break.

export interface FirstSlideMetadata {
  presentation_date: string; // ISO YYYY-MM-DD
  title: string;
  unit_report: string[];
}

const DIGIT_MAP: Record<string, string> = {
  "0": "〇", // U+3007 IDEOGRAPHIC NUMBER ZERO — the proper Chinese zero.
  "1": "一",
  "2": "二",
  "3": "三",
  "4": "四",
  "5": "五",
  "6": "六",
  "7": "七",
  "8": "八",
  "9": "九",
};

const ONES = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

function chineseTwoDigit(n: number): string {
  // 1–10 → 一…十; 11–19 → 十一…十九; 20/30 → 二十/三十; 21–39 → 二十一 … 三十九.
  // Months max 12, days max 31, so we never exceed 39.
  if (n < 1 || n > 39 || !Number.isInteger(n)) {
    throw new Error(`chineseTwoDigit out of range: ${n}`);
  }
  if (n < 10) return ONES[n];
  if (n === 10) return "十";
  if (n < 20) return "十" + ONES[n - 10];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ONES[tens] + "十" + (ones === 0 ? "" : ONES[ones]);
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function dateToChinese(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`dateToChinese: invalid ISO date "${iso}"`);
  const [, y, m, d] = match;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`dateToChinese: invalid date "${iso}"`);
  }
  // Round-trip check: rejects e.g. 2026-13-01 which the Date ctor
  // normalises to 2027-01-01.
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() + 1 !== Number(m) ||
    date.getUTCDate() !== Number(d)
  ) {
    throw new Error(`dateToChinese: out-of-range date "${iso}"`);
  }
  const yearCh = y.split("").map((c) => DIGIT_MAP[c]).join("");
  const monthCh = chineseTwoDigit(Number(m));
  const dayCh = chineseTwoDigit(Number(d));
  const weekdayCh = WEEKDAYS[date.getUTCDay()];
  return `${yearCh}年${monthCh}月${dayCh}日（星期${weekdayCh}）`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function composeFirstSlide(meta: FirstSlideMetadata): string {
  const dateText = dateToChinese(meta.presentation_date);
  const title = escapeHtml(meta.title);
  const reporters = meta.unit_report
    .map((r) => `<div>${escapeHtml(r)}</div>`)
    .join("");
  return (
    `<div class="first-slide">\n` +
    `  <div class="first-slide-date">${dateText}</div>\n` +
    `  <div class="first-slide-title">${title}</div>\n` +
    `  <div class="first-slide-reporters">${reporters}</div>\n` +
    `</div>\n` +
    `<hr>`
  );
}
