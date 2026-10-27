// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// AC-1: components use token classes only. globals.css holds the values and
// manifest.ts repeats two of them because a manifest cannot read CSS.
const SRC = fileURLToPath(new URL("..", import.meta.url));
const ROOTS = ["app", "components"].map((dir) => join(SRC, dir));
const ALLOWED = new Set(["app/globals.css", "app/manifest.ts"]);
const SCANNED = /\.(tsx?|css)$/;

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white";
const UTILITY =
  "bg|text|border|border-[trblxyse]|ring|ring-offset|outline|fill|stroke|from|via|to|divide|shadow|decoration|accent|caret|placeholder";

const RULES: readonly (readonly [label: string, pattern: RegExp])[] = [
  ["hex color", /#[0-9a-f]{3,8}\b/i],
  ["color function", /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/i],
  [
    "palette class",
    new RegExp(`(?<![\\w-])(?:${UTILITY})-(?:${PALETTE})(?:-\\d{2,3})?\\b`),
  ],
];

const walk = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const files = ROOTS.flatMap(walk)
  .map((path) => relative(SRC, path))
  .filter((path) => SCANNED.test(path) && !path.endsWith(".test.ts"))
  .filter((path) => !path.endsWith(".test.tsx") && !ALLOWED.has(path));

describe("no raw colors in components", () => {
  it("scans some files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s uses tokens only", (path) => {
    const source = readFileSync(join(SRC, path), "utf8");
    const hits = RULES.flatMap(([label, pattern]) => {
      const match = source.match(pattern);
      return match ? [`${label}: ${match[0]}`] : [];
    });
    expect(hits).toEqual([]);
  });
});
