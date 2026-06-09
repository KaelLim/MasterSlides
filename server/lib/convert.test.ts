import { test, expect } from "bun:test";
import {
  convertDocument,
  extractDriveId,
  extractTitle,
  extractYouTubeId,
  minifyHtml,
  transformVideoEmbeds,
  wrapHeadingTablePairs,
} from "./convert";

test("extractTitle: takes the first H1", () => {
  expect(extractTitle("# Hello\n## World\nbody")).toBe("Hello");
});

test("extractTitle: trims trailing # marks and whitespace", () => {
  expect(extractTitle("#   Hello   ###  \nbody")).toBe("Hello");
});

test("extractTitle: returns null when no H1 present", () => {
  expect(extractTitle("## H2 only\nbody")).toBeNull();
  expect(extractTitle("plain text only")).toBeNull();
});

test("extractTitle: ignores '# ' inside fenced code blocks", () => {
  const md = "```\n# not a heading\n```\n# Real Title\nbody";
  expect(extractTitle(md)).toBe("Real Title");
});

test("extractTitle: ignores leading blank lines", () => {
  expect(extractTitle("\n\n\n# Hello\nbody")).toBe("Hello");
});

// ── Video URL extraction ────────────────────────────────────────────────

test("extractYouTubeId: recognises watch / youtu.be / shorts / embed / live", () => {
  expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe("dQw4w9WgXcQ");
  expect(extractYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(extractYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(extractYouTubeId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
});

test("extractYouTubeId: ignores extra params before/after v=", () => {
  expect(
    extractYouTubeId("https://www.youtube.com/watch?si=AbCd&v=dQw4w9WgXcQ&feature=youtu.be"),
  ).toBe("dQw4w9WgXcQ");
});

test("extractYouTubeId: returns null for non-YouTube URLs", () => {
  expect(extractYouTubeId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  expect(extractYouTubeId("https://vimeo.com/12345")).toBeNull();
});

test("extractDriveId: recognises /file/d/ and open/uc?id= forms", () => {
  expect(
    extractDriveId("https://drive.google.com/file/d/1abc_DEF-ghi23456789/view?usp=sharing"),
  ).toBe("1abc_DEF-ghi23456789");
  expect(extractDriveId("https://drive.google.com/open?id=1abc_DEF-ghi23456789")).toBe(
    "1abc_DEF-ghi23456789",
  );
  expect(
    extractDriveId("https://drive.google.com/uc?export=download&id=1abc_DEF-ghi23456789"),
  ).toBe("1abc_DEF-ghi23456789");
});

test("extractDriveId: returns null for unrelated URLs", () => {
  expect(extractDriveId("https://docs.google.com/document/d/abc/edit")).toBeNull();
});

// ── transformVideoEmbeds: HTML-level rewrite ────────────────────────────

test("transformVideoEmbeds: <p><a YouTube></a></p> → iframe wrapper", () => {
  const html =
    '<p><a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">https://www.youtube.com/watch?v=dQw4w9WgXcQ</a></p>';
  const out = transformVideoEmbeds(html);
  expect(out).toContain('class="video-embed"');
  expect(out).toContain('data-provider="youtube"');
  expect(out).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
  expect(out).toContain('class="video-fallback"');
});

test("transformVideoEmbeds: <p><a Drive></a></p> → iframe preview", () => {
  const html =
    '<p><a href="https://drive.google.com/file/d/1abc_DEF-ghi23456789/view">影片</a></p>';
  const out = transformVideoEmbeds(html);
  expect(out).toContain('data-provider="drive"');
  expect(out).toContain('src="https://drive.google.com/file/d/1abc_DEF-ghi23456789/preview"');
});

test("transformVideoEmbeds: iframes opt into fullscreen via allow + allowfullscreen", () => {
  const yt = transformVideoEmbeds(
    '<p><a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">x</a></p>',
  );
  expect(yt).toMatch(/allow="[^"]*\bfullscreen\b[^"]*"/);
  expect(yt).toContain("allowfullscreen");
  const drv = transformVideoEmbeds(
    '<p><a href="https://drive.google.com/file/d/1abc_DEF-ghi23456789/view">x</a></p>',
  );
  expect(drv).toMatch(/allow="[^"]*\bfullscreen\b[^"]*"/);
  expect(drv).toContain("allowfullscreen");
});

test("transformVideoEmbeds: inline link inside paragraph text is left alone", () => {
  const html =
    '<p>觀看 <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">這個影片</a> 然後思考。</p>';
  expect(transformVideoEmbeds(html)).toBe(html);
});

test("transformVideoEmbeds: paragraph with <br> after link is left alone", () => {
  const html =
    '<p><a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">video</a><br>下一行說明</p>';
  expect(transformVideoEmbeds(html)).toBe(html);
});

test("transformVideoEmbeds: unrelated link stays as link", () => {
  const html = '<p><a href="https://example.com/article">read more</a></p>';
  expect(transformVideoEmbeds(html)).toBe(html);
});

// ── wrapHeadingTablePairs: heading + table → atomic horizontal group ────

test("wrapHeadingTablePairs: h2 immediately before table is wrapped", () => {
  const html = "<h2>名單</h2>\n<table><tr><td>a</td></tr></table>";
  const out = wrapHeadingTablePairs(html);
  expect(out).toBe(
    '<div class="heading-table"><h2>名單</h2><table><tr><td>a</td></tr></table></div>',
  );
});

test("wrapHeadingTablePairs: works for h1–h4", () => {
  for (const level of [1, 2, 3, 4]) {
    const html = `<h${level}>T</h${level}>\n<table></table>`;
    expect(wrapHeadingTablePairs(html)).toContain('class="heading-table"');
  }
});

test("wrapHeadingTablePairs: paragraph between heading and table breaks the pair", () => {
  const html = "<h2>T</h2>\n<p>說明</p>\n<table></table>";
  expect(wrapHeadingTablePairs(html)).toBe(html);
});

test("wrapHeadingTablePairs: standalone table is left alone", () => {
  const html = "<p>before</p><table><tr><td>x</td></tr></table>";
  expect(wrapHeadingTablePairs(html)).toBe(html);
});

// ── minifyHtml: collapse between-tag whitespace, preserve content ──────

test("minifyHtml: collapses newlines between block tags", () => {
  expect(minifyHtml("<p>a</p>\n<p>b</p>")).toBe("<p>a</p><p>b</p>");
  expect(minifyHtml("<ul>\n<li>a</li>\n<li>b</li>\n</ul>")).toBe(
    "<ul><li>a</li><li>b</li></ul>",
  );
});

test("minifyHtml: preserves whitespace inside text content", () => {
  // The space after "hello" lives between a text char and `<`, not between `>` and `<`.
  expect(minifyHtml("<p>hello <strong>world</strong></p>")).toBe(
    "<p>hello <strong>world</strong></p>",
  );
  expect(minifyHtml("<p>foo bar baz</p>")).toBe("<p>foo bar baz</p>");
});

test("minifyHtml: preserves whitespace inside <pre>/<code> bodies", () => {
  // Newlines inside the code body are text content; the regex never sees them
  // as `>\s+<` because `foo` and `bar` sit between the tags.
  const code = "<pre><code>foo\n  bar\n  baz\n</code></pre>";
  expect(minifyHtml(code)).toBe(code);
});

test("minifyHtml: end-to-end shrinks marked output", async () => {
  const md = "# T\n\nFirst paragraph.\n\nSecond paragraph.\n\n- one\n- two\n- three\n";
  const { html } = await convertDocument(md);
  // No `>\n<` sequences should survive minification.
  expect(html).not.toMatch(/>\s+</);
});

test("convertDocument end-to-end: YouTube paragraph becomes iframe", async () => {
  const md =
    "# 影片教學\n\n第一段內文。\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n\n後面繼續。\n";
  const { html, title } = await convertDocument(md);
  expect(title).toBe("影片教學");
  expect(html).toContain('class="video-embed"');
  expect(html).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
});
