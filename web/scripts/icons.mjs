// Renders the install icons in public/icons from public/brand/icon.svg and the
// brand tokens in globals.css (spec 0010, AC-10). Run `pnpm icons` after either
// changes; the PNGs are committed, so builds never need sharp.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

const css = readFileSync(root("src/app/globals.css"), "utf8");
const theme = css.slice(css.indexOf("@theme static"));
const token = (name) => {
  const match = theme.match(
    new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"),
  );
  if (!match) throw new Error(`--color-${name} missing from @theme static`);
  return match[1];
};
const brand = token("brand");
const onBrand = token("on-brand");

const glyph = readFileSync(root("public/brand/icon.svg"), "utf8")
  .replace(/<!--.*?-->/gs, "")
  .match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];

// `glyph` is the flask's share of the icon; `radius` rounds the square (0 for
// a full bleed square the OS masks itself).
const icon = (size, { glyph: share, radius }) => {
  const g = size * share;
  const offset = (size - g) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * radius}" fill="${brand}"/>
  <svg x="${offset}" y="${offset}" width="${g}" height="${g}" viewBox="0 0 24 24" fill="none" stroke="${onBrand}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>
</svg>`);
};

const outputs = [
  ["icon-192.png", 192, { glyph: 0.56, radius: 0.22 }],
  ["icon-512.png", 512, { glyph: 0.56, radius: 0.22 }],
  // Android crops a maskable icon to any shape inside the center 80%.
  ["icon-maskable-512.png", 512, { glyph: 0.44, radius: 0 }],
  // iOS rounds the corners itself.
  ["apple-touch-icon.png", 180, { glyph: 0.56, radius: 0 }],
];

for (const [name, size, options] of outputs) {
  await sharp(icon(size, options))
    .png()
    .toFile(root(`public/icons/${name}`));
  console.log(`public/icons/${name}`);
}
