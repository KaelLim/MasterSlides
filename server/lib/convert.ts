import { marked } from "marked";
import { uploadImage } from "./drust";

export interface ConvertResult {
  html: string;
  imageCount: number;
  imageIds: string[];
  title: string | null;
}

// First level-1 ATX heading ("# Title") in the document — that's what
// Google Docs renders as the doc's H1. Returns null if absent so callers
// can fall back to doc_id or an explicit override.
export function extractTitle(markdown: string): string | null {
  let inFence = false;
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line || line.startsWith("[")) continue;
    const m = line.match(/^#\s+(.+?)\s*#*$/);
    if (m) {
      const t = m[1].trim();
      return t || null;
    }
  }
  return null;
}

export async function processImages(
  markdown: string
): Promise<{ markdown: string; imageCount: number; imageIds: string[] }> {
  const lines = markdown.split("\n");
  const processedLines: string[] = [];
  const imageIds: string[] = [];
  let imageCount = 0;

  for (const line of lines) {
    // Skip "分頁 N" markers
    if (/^#*\s*分頁\s*\d+\s*$/.test(line.trim())) {
      continue;
    }

    // Match image reference definitions: [image1]: <data:image/...;base64,...>
    const refMatch = line.match(
      /^\[([^\]]+)\]:\s*<data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)>$/
    );

    if (refMatch) {
      const [, refName, format, base64Data] = refMatch;
      imageCount++;

      const ext = format === "jpeg" ? "jpg" : format;
      const filename = `img_${imageCount}.${ext}`;
      const contentType = `image/${format === "jpg" ? "jpeg" : format}`;
      const cleanBase64 = base64Data.replace(/[\r\n\s]/g, "");

      try {
        const binary = atob(cleanBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const uploaded = await uploadImage(bytes, filename, contentType);
        imageIds.push(uploaded.id);
        // Reference via same-origin Bun proxy (/img/<id>) instead of direct Drust URL —
        // html2canvas can't render cross-origin images, and the spec says the frontend
        // should not see Drust URLs.
        processedLines.push(`[${refName}]: /img/${uploaded.id}`);
      } catch (err) {
        console.error(`Image upload failed for ${refName}:`, err);
        processedLines.push(line);
      }
    } else {
      processedLines.push(line);
    }
  }

  return { markdown: processedLines.join("\n"), imageCount, imageIds };
}

function cleanImageStyles(html: string): string {
  return html.replace(/<img([^>]*)\s+style="[^"]*"([^>]*)>/gi, "<img$1$2>");
}

// ── Video embeds ────────────────────────────────────────────────────────
// Single-link-per-paragraph YouTube/Drive URLs become responsive iframes.
// A URL surrounded by other text in the same paragraph stays a clickable
// link — Notion/Obsidian-style heuristic.

export function extractYouTubeId(url: string): string | null {
  // youtu.be/<id>, youtube.com/{watch?v=, embed/, shorts/, live/}<id>.
  // Video IDs are exactly 11 chars from [A-Za-z0-9_-].
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:[^"\s]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})\b/,
  );
  return m ? m[1] : null;
}

export function extractDriveId(url: string): string | null {
  let m = url.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  m = url.match(/drive\.google\.com\/(?:open|uc)\?(?:[^"\s]*&)?id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

// Replace `<p><a href="…">…</a></p>` where the <a> is the paragraph's only
// content. Inline links (text + link + more text) are left alone.
export function transformVideoEmbeds(html: string): string {
  return html.replace(
    /<p>\s*<a\s+href="([^"]+)"(?:\s+[^>]*)?>([^<]*)<\/a>\s*<\/p>/g,
    (whole, href: string) => {
      const yt = extractYouTubeId(href);
      if (yt) {
        return (
          `<div class="video-embed" data-provider="youtube">` +
          `<iframe src="https://www.youtube.com/embed/${yt}" loading="lazy" ` +
          // `fullscreen` in allow= is what modern browsers actually gate on;
          // `allowfullscreen` is kept as the legacy fallback for older UAs.
          `allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share" ` +
          `allowfullscreen></iframe>` +
          `<a class="video-fallback" href="${href}" target="_blank" rel="noopener">${href}</a>` +
          `</div>`
        );
      }
      const drv = extractDriveId(href);
      if (drv) {
        return (
          `<div class="video-embed" data-provider="drive">` +
          `<iframe src="https://drive.google.com/file/d/${drv}/preview" loading="lazy" ` +
          `allow="autoplay; fullscreen" allowfullscreen></iframe>` +
          `<a class="video-fallback" href="${href}" target="_blank" rel="noopener">${href}</a>` +
          `</div>`
        );
      }
      return whole;
    },
  );
}

export async function convertDocument(markdown: string): Promise<ConvertResult> {
  const title = extractTitle(markdown);
  const { markdown: processed, imageCount, imageIds } = await processImages(markdown);

  marked.setOptions({ breaks: true, gfm: true });
  const rawHtml = marked.parse(processed) as string;
  const withVideos = transformVideoEmbeds(rawHtml);
  const cleanHtml = cleanImageStyles(withVideos);
  const html = `<article class="slide-content">\n${cleanHtml}\n</article>`;

  return { html, imageCount, imageIds, title };
}
