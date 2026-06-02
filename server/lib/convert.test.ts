import { test, expect } from "bun:test";
import { extractTitle } from "./convert";

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
