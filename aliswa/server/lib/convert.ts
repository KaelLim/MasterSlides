import { marked } from "marked";
import { writeImage } from "./storage.ts";

export interface ConvertResult {
  html: string;
  imageCount: number;
}

export async function processImages(
  markdown: string,
  docId: string
): Promise<{ markdown: string; imageCount: number }> {
  const lines = markdown.split("\n");
  const processedLines: string[] = [];
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
      const imgFilename = `img_${imageCount}.${ext}`;
      const cleanBase64 = base64Data.replace(/[\r\n\s]/g, "");

      try {
        const binary = atob(cleanBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        await writeImage(docId, imgFilename, bytes);
        processedLines.push(`[${refName}]: /data/${docId}/images/${imgFilename}`);
      } catch (err) {
        console.error(`Image processing failed for ${refName}:`, err);
        processedLines.push(line);
      }
    } else {
      processedLines.push(line);
    }
  }

  return { markdown: processedLines.join("\n"), imageCount };
}

function cleanImageStyles(html: string): string {
  return html.replace(/<img([^>]*)\s+style="[^"]*"([^>]*)>/gi, "<img$1$2>");
}

export async function convertDocument(
  markdown: string,
  docId: string
): Promise<ConvertResult> {
  const { markdown: processed, imageCount } = await processImages(markdown, docId);

  marked.setOptions({ breaks: true, gfm: true });
  const rawHtml = await marked.parse(processed);
  const cleanHtml = cleanImageStyles(rawHtml);
  const html = `<article class="slide-content">\n${cleanHtml}\n</article>`;

  return { html, imageCount };
}
