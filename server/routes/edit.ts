import { fetchMarkdown } from "../lib/google-docs";
import { convertDocument, extractTitle } from "../lib/convert";
import { composeFirstSlide } from "../lib/first-slide";
import { upsertDoc } from "../lib/storage";
import { findDocByDocId } from "../lib/drust";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface EditPayload {
  presentation_date: string;
  title: string;
  unit_report: string[];
}

export interface SeedResponse {
  doc_id: string;
  title: string;
  presentation_date: string; // today if no stored value
  unit_report: string[]; // [] if no stored value
  source: "stored" | "fresh";
}

function todayIsoUtc(): string {
  // YYYY-MM-DD in UTC.
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function handleGetEdit(doc_id: string): Promise<Response> {
  const stored = await findDocByDocId(doc_id);
  if (stored) {
    const body: SeedResponse = {
      doc_id,
      title: stored.title ?? "",
      presentation_date: stored.presentation_date ?? todayIsoUtc(),
      unit_report: stored.unit_report ?? [],
      source: "stored",
    };
    return Response.json(body);
  }
  // No stored record — fetch the Google Doc just to seed the title.
  // If Google fetch fails, fall back to empty title; the user can fill it in.
  let title = "";
  try {
    const markdown = await fetchMarkdown(doc_id);
    title = extractTitle(markdown) ?? "";
  } catch {
    title = "";
  }
  const body: SeedResponse = {
    doc_id,
    title,
    presentation_date: todayIsoUtc(),
    unit_report: [],
    source: "fresh",
  };
  return Response.json(body);
}

function validate(payload: EditPayload): string | null {
  if (typeof payload.presentation_date !== "string" || !DATE_RE.test(payload.presentation_date)) {
    return "presentation_date_invalid";
  }
  const d = new Date(`${payload.presentation_date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "presentation_date_invalid";
  if (typeof payload.title !== "string" || payload.title.trim().length === 0) {
    return "title_required";
  }
  if (!Array.isArray(payload.unit_report)) return "unit_report_required";
  const cleaned = payload.unit_report
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
  if (cleaned.length === 0) return "unit_report_required";
  return null;
}

export async function handlePostEdit(
  doc_id: string,
  payload: EditPayload,
): Promise<Response> {
  const err = validate(payload);
  if (err) {
    return Response.json({ error: err }, { status: 422 });
  }
  const unit_report = payload.unit_report.map((s) => s.trim()).filter((s) => s.length > 0);
  const title = payload.title.trim();
  const presentation_date = payload.presentation_date;

  const markdown = await fetchMarkdown(doc_id);
  const { html: bodyHtml, imageIds } = await convertDocument(markdown);
  const firstSlide = composeFirstSlide({ presentation_date, title, unit_report });
  // Insert first-slide HTML inside the article wrapper so paginator iterates it.
  const finalHtml = bodyHtml.replace(
    /^<article class="slide-content">\n?/,
    (m) => `${m}${firstSlide}\n`,
  );

  await upsertDoc({
    doc_id,
    title,
    html: finalHtml,
    image_ids: imageIds,
    presentation_date,
    unit_report,
  });

  return Response.json({ ok: true });
}
