import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// The phone suite (spec 0010, AC-13): a production build at an iPhone and an
// Android size, with every /api call answered by e2e/stubs.ts, so it needs no
// API, no database, and no model. Chromium plays both phones (layout is what
// is checked, and CI installs one browser).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "iphone",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // CI runs `pnpm build` in its own step just before this one.
    command: process.env.CI
      ? `pnpm start --port ${PORT}`
      : `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/access`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // The build needs an API_URL; the browser never reaches it.
    env: { API_URL: process.env.API_URL ?? "http://localhost:8000" },
  },
});
