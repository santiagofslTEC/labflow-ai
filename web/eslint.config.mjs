import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // Named exports only (AGENTS.md); Next.js files that need a default are allowed below.
      "import/no-default-export": "error",
    },
  },
  {
    files: [
      "src/app/**/{page,layout,template,loading,error,global-error,not-found,default,route}.tsx",
      "src/app/**/route.ts",
      "src/app/**/{opengraph-image,icon,apple-icon,sitemap,robots,manifest}.{ts,tsx}",
      "*.config.{ts,mjs}",
    ],
    rules: { "import/no-default-export": "off" },
  },
  // Turns off style rules that Prettier owns; keep it last.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
