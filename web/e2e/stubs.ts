import type { BrowserContext, Page, Route } from "@playwright/test";

import { sampleDetail, summary } from "@/test/experiments";

// Every /api call the pages make, answered in the browser (spec 0010, AC-13).
// Anything else is a 404 with the API's error shape, so a new call fails loud.
const TRIALS = {
  trials: [1, 2, 3].map((number) => ({
    id: number,
    number,
    cells: sampleDetail.variables.slice(0, 2).map((variable, i) => ({
      variable_id: variable.id,
      value: 40 + number * 5 + i,
      said_text: null,
      saved_at: "2026-10-29T12:00:00Z",
    })),
  })),
  recent: [],
};

const RESULTS = {
  variables: sampleDetail.variables.map((variable, i) => ({
    variable_id: variable.id,
    count: i < 2 ? 3 : 0,
    min: i < 2 ? 45 + i : null,
    max: i < 2 ? 55 + i : null,
    mean: i < 2 ? 50 + i : null,
    min_trials: i < 2 ? [1] : [],
    max_trials: i < 2 ? [3] : [],
  })),
};

const answers: Readonly<Record<string, unknown>> = {
  "/api/health": { status: "ok", env: "test" },
  "/api/access": { holder: "ana" },
  "/api/experiments": [
    summary(7, { title: sampleDetail.title, trial_count: 3 }),
    summary(8),
  ],
  "/api/experiments/7": sampleDetail,
  "/api/experiments/7/trials": TRIALS,
  "/api/experiments/7/results": RESULTS,
  "/api/experiments/7/proposal": null,
};

const answer = (route: Route) => {
  const { pathname } = new URL(route.request().url());
  return pathname in answers
    ? route.fulfill({ json: answers[pathname] })
    : route.fulfill({
        status: 404,
        json: { code: "not_found", message: "No existe en los stubs." },
      });
};

// The proxy only checks that a session cookie is there (spec 0001).
export const signIn = async (context: BrowserContext): Promise<void> => {
  await context.addCookies([
    { name: "labflow_session", value: "e2e", url: "http://localhost:3100" },
  ]);
  await context.route("**/api/**", answer);
};

// Nothing scrolls sideways and nothing hides under the tab bar (AC-11).
export const layoutProblems = (page: Page) =>
  page.evaluate(() => {
    const problems: string[] = [];
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    if (overflow > 0) problems.push(`sideways scroll of ${overflow}px`);
    const bar = document.querySelector('nav[aria-label="Principal"]');
    const main = document.querySelector("main");
    if (bar && main) {
      const reserved = parseFloat(getComputedStyle(main).paddingBottom);
      const height = bar.getBoundingClientRect().height;
      if (reserved < height)
        problems.push(`main reserves ${reserved}px for a ${height}px tab bar`);
    }
    return problems;
  });
