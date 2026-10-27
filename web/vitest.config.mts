import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    // Every jsdom worker imports Radix and Motion; starting one per core at once
    // times out worker startup on a busy machine. Four matches the CI runner.
    maxWorkers: 4,
  },
});
