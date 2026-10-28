import type { MetadataRoute } from "next";

// A manifest cannot read CSS, so these repeat the light --color-canvas and
// --color-ink from globals.css; manifest.test.ts keeps them in sync.
const CANVAS = "#fbfaf8";
const INK = "#1f1b16";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LabFlow AI",
    short_name: "LabFlow",
    description: "Cuaderno de laboratorio por voz",
    lang: "es",
    start_url: "/",
    display: "standalone",
    background_color: CANVAS,
    theme_color: INK,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
