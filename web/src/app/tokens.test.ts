// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// AC-4: every listed pair meets WCAG AA in both themes, read straight from globals.css.
const css = readFileSync(
  fileURLToPath(new URL("./globals.css", import.meta.url)),
  "utf8",
);

type Theme = Readonly<Record<string, string>>;

const readColors = (block: string): Theme =>
  Object.fromEntries(
    [...block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(
      ([, name, hex]) => [name, hex.toLowerCase()],
    ),
  );

const blockAfter = (marker: RegExp): string => {
  const start = css.search(marker);
  if (start < 0) throw new Error(`globals.css has no block matching ${marker}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") depth -= 1;
    if (depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed block for ${marker}`);
};

const light = readColors(blockAfter(/@theme static/));
const dark = readColors(blockAfter(/:root\[data-theme="dark"\]/));

const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const TOKENS = [
  "canvas",
  "surface",
  "sunken",
  "ink",
  "ink-muted",
  "on-ink",
  "line",
  "control",
  "brand",
  "brand-soft",
  "on-brand",
  "saved",
  "unsaved",
  "unsaved-border",
  "warning-ink",
  "danger",
  "focus",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
] as const;

type Pair = readonly [foreground: string, background: string];

const TEXT_PAIRS: readonly Pair[] = [
  ["ink", "canvas"],
  ["ink", "surface"],
  ["ink", "unsaved"],
  ["ink-muted", "canvas"],
  ["ink-muted", "surface"],
  ["ink-muted", "sunken"],
  ["ink-muted", "unsaved"],
  ["on-ink", "ink"],
  ["warning-ink", "unsaved"],
  ["danger", "surface"],
  ["danger", "canvas"],
  ["danger", "unsaved"],
  ["saved", "surface"],
  ["saved", "canvas"],
  ["saved", "unsaved"],
  ["on-brand", "brand"],
  ["brand", "surface"],
  ["brand", "canvas"],
  ["brand", "brand-soft"],
  ["ink", "brand-soft"],
  ["ink", "sunken"],
];

const BOUNDARY_PAIRS: readonly Pair[] = [
  ["control", "surface"],
  ["control", "sunken"],
  ["control", "canvas"],
  ["unsaved-border", "surface"],
  ["unsaved-border", "canvas"],
  ["unsaved-border", "unsaved"],
  ["focus", "canvas"],
  ["focus", "surface"],
  ["focus", "sunken"],
  ["focus", "unsaved"],
  ["focus", "brand-soft"],
];

describe.each([
  ["light", light],
  ["dark", dark],
] as const)("%s theme", (_name, theme) => {
  it("defines every token as a hex value", () => {
    expect(Object.keys(theme).sort()).toEqual([...TOKENS].sort());
  });

  it.each(TEXT_PAIRS)("text %s on %s reaches 4.5:1", (fg, bg) => {
    expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(BOUNDARY_PAIRS)("boundary %s on %s reaches 3:1", (fg, bg) => {
    expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(3);
  });
});

it("stays light even when the system is dark", () => {
  expect(css).toMatch(/color-scheme:\s*light;/);
  expect(css).not.toMatch(/prefers-color-scheme/);
});
