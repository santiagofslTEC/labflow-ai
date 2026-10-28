// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import manifest from "./manifest";

const css = readFileSync(
  fileURLToPath(new URL("./globals.css", import.meta.url)),
  "utf8",
);

const lightToken = (name: string): string => {
  const theme = css.slice(css.indexOf("@theme static"));
  const match = theme.match(
    new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"),
  );
  if (!match) throw new Error(`--color-${name} missing from @theme static`);
  return match[1].toLowerCase();
};

describe("manifest", () => {
  const result = manifest();

  it("names the app in Spanish and opens standalone at /", () => {
    expect(result).toMatchObject({
      name: "LabFlow AI",
      short_name: "LabFlow",
      lang: "es",
      start_url: "/",
      display: "standalone",
    });
  });

  it("uses the light canvas and ink tokens for its colors", () => {
    expect(result.background_color).toBe(lightToken("canvas"));
    expect(result.theme_color).toBe(lightToken("ink"));
  });

  it("points to the three icons with their purposes", () => {
    expect(result.icons?.map(({ src, purpose }) => [src, purpose])).toEqual([
      ["/icons/icon-192.png", "any"],
      ["/icons/icon-512.png", "any"],
      ["/icons/icon-maskable-512.png", "maskable"],
    ]);
  });
});
