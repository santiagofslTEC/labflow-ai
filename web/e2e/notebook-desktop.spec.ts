import { expect, test } from "@playwright/test";

import { signIn } from "./stubs";

// The notebook on a laptop (2026-10-30): a long thread and a tall card under
// review stay inside the chat box. Only the chat scrolls; the page never
// grows past the window, and the text field stays on screen.
test.use({
  viewport: { width: 1440, height: 900 },
  isMobile: false,
  hasTouch: false,
});

const value = (id: number) => ({
  variable_id: id,
  name: `Temperatura platos ${id}C`,
  unit: "°C",
  value: 20 + id,
  previous: null,
  said_text: `${20 + id}`,
  interpreted: false,
  flags: [],
  checked: false,
});

const CARD = {
  id: 10,
  trial_number: 1,
  target_trial_id: null,
  values: Array.from({ length: 11 }, (_, i) => value(i + 1)),
  phrase: "La temperatura de 10 en el plato 12",
  source: "voice",
  flagged: false,
  question: { reason: "ready", text: "¿Lo guardo?" },
  can_confirm: true,
};

const TURNS = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  role: i % 2 === 0 ? "user" : "assistant",
  text:
    i % 2 === 0
      ? `Ensayo ${i / 2 + 1}: temperatura de reflujo 30 grados.`
      : "Guardé la temperatura de reflujo: 30 °C.",
  source: i % 2 === 0 ? "voice" : null,
  created_at: new Date().toISOString(),
  readings: [],
}));

test.beforeEach(async ({ context, page }, testInfo) => {
  // One desktop run is enough; the projects are the two phones.
  test.skip(testInfo.project.name !== "android", "desktop runs once");
  await signIn(context);
  // Page routes win over the context's stubs.
  await page.route("**/api/experiments/7/proposal", (route) =>
    route.fulfill({ json: CARD }),
  );
  await page.route("**/api/experiments/7/turns", (route) =>
    route.fulfill({ json: TURNS }),
  );
});

test("a tall card stays inside the chat and the page does not scroll", async ({
  page,
}) => {
  await page.goto("/cuadernos/7");
  const card = page.getByText("Ensayo 1", { exact: true }).last();
  await expect(card).toBeVisible();

  const layout = await page.evaluate(() => {
    const field = document.getElementById("capture-text");
    const scrollBox = field?.closest<HTMLElement>(
      ".overflow-y-auto, [class*='lg:overflow-y-auto']",
    );
    return {
      pageScroll: document.documentElement.scrollHeight - window.innerHeight,
      fieldBottom: field?.getBoundingClientRect().bottom ?? Infinity,
      boxBottom: scrollBox?.getBoundingClientRect().bottom ?? Infinity,
      boxScrolls: scrollBox
        ? scrollBox.scrollHeight > scrollBox.clientHeight
        : false,
      windowHeight: window.innerHeight,
    };
  });
  expect(layout.pageScroll).toBeLessThanOrEqual(1);
  expect(layout.fieldBottom).toBeLessThanOrEqual(layout.windowHeight);
  expect(layout.boxBottom).toBeLessThanOrEqual(layout.windowHeight);
  // The card and the thread are in the box that scrolls, not the page.
  expect(layout.boxScrolls).toBe(true);

  if (process.env.NOTEBOOK_SHOT)
    await page.screenshot({ path: process.env.NOTEBOOK_SHOT });
});

test("the project context opens from Ver contexto del proyecto", async ({
  page,
}) => {
  await page.goto("/cuadernos/7");
  const toggle = page.getByText("Ver contexto del proyecto");
  await expect(toggle).toBeVisible();
  await expect(page.getByText(/Creado por/)).toBeHidden();
  await toggle.click();
  await expect(page.getByText(/Creado por/)).toBeVisible();
  await expect(page.getByText("Ocultar contexto")).toBeVisible();
});
