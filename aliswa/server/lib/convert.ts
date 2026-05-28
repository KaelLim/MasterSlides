import { marked } from "marked";
import { uploadImage } from "./drust";

export interface ConvertResult {
  html: string;
  imageCount: number;
  imageIds: string[];
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

export async function convertDocument(markdown: string): Promise<ConvertResult> {
  const { markdown: processed, imageCount, imageIds } = await processImages(markdown);

  marked.setOptions({ breaks: true, gfm: true });
  const rawHtml = marked.parse(processed) as string;
  const cleanHtml = cleanImageStyles(rawHtml);
  const html = `<article class="slide-content">\n${cleanHtml}\n</article>`;

  return { html, imageCount, imageIds };
}
