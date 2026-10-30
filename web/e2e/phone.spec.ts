import { expect, test } from "@playwright/test";

import { layoutProblems, signIn } from "./stubs";

// Spec 0010, AC-11 and AC-13: the phone layout, checked where jsdom cannot.
test.beforeEach(async ({ context }) => {
  await signIn(context);
});

const PAGES = [
  "/",
  "/cuadernos",
  "/cuadernos/7",
  "/cuadernos/7?vista=ensayos",
  "/cuadernos/7?vista=variables",
  "/cuadernos/7/resultados",
  "/cuadernos/nuevo",
  "/configuracion",
];

for (const path of PAGES) {
  test(`${path} fits the phone`, async ({ page }) => {
    await page.goto(path);
    await expect(
      page.getByRole("navigation", { name: "Principal" }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await layoutProblems(page)).toEqual([]);
  });
}

test("the tab bar navigates and marks the current tab", async ({ page }) => {
  await page.goto("/");
  const bar = page.getByRole("navigation", { name: "Principal" });
  await bar.getByRole("link", { name: "Cuadernos" }).click();
  await expect(page).toHaveURL("/cuadernos");
  await expect(bar.getByRole("link", { name: "Cuadernos" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await bar.getByRole("link", { name: "Nuevo" }).click();
  await expect(page).toHaveURL("/cuadernos/nuevo");
});

test("the notebook views switch and survive a reload", async ({ page }) => {
  await page.goto("/cuadernos/7");
  const views = page.getByRole("group", { name: "Vistas del cuaderno" });
  await expect(page.getByLabel("Escribe una medición")).toBeVisible();
  await views.getByRole("button", { name: "Ensayos" }).click();
  await expect(page).toHaveURL("/cuadernos/7?vista=ensayos");
  await expect(page.getByLabel("Escribe una medición")).toBeHidden();
  await expect(page.getByRole("region", { name: "Ensayos" })).toBeVisible();
  await page.reload();
  await expect(views.getByRole("button", { name: "Ensayos" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("Tabla completa fills the screen and the back gesture closes it", async ({
  page,
}) => {
  await page.goto("/cuadernos/7?vista=ensayos");
  await page.getByRole("button", { name: "Tabla completa" }).click();
  const sheet = page.getByRole("dialog", { name: /Ensayos ·/ });
  await expect(sheet).toBeVisible();
  // Measure after the slide in, and go back only once the sheet owns its
  // history entry (both happen just after it shows).
  await sheet.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  await page.waitForFunction(() => {
    const state: unknown = window.history.state;
    return (
      typeof state === "object" && state !== null && "labflowSheet" in state
    );
  });
  const box = await sheet.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.width).toBe(viewport?.width);
  expect(box?.height).toBe(viewport?.height);
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL("/cuadernos/7?vista=ensayos");
});

test("text fields are 16px, so iOS does not zoom in", async ({ page }) => {
  await page.goto("/cuadernos/7");
  const size = await page
    .getByLabel("Escribe una medición")
    .evaluate((field) => getComputedStyle(field).fontSize);
  expect(size).toBe("16px");
});

test("the manifest's icons load without a session", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  const icons: { src: string }[] = manifest.icons;
  for (const { src } of [...icons, { src: "/icons/apple-touch-icon.png" }]) {
    const response = await request.get(src);
    expect(response.status(), src).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
  }
});

test.describe("in landscape (AC-11)", () => {
  test.use({ viewport: { width: 667, height: 375 } });

  for (const path of ["/", "/cuadernos/7", "/cuadernos/7/resultados"])
    test(`${path} fits`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await layoutProblems(page)).toEqual([]);
    });
});

// A touch swipe to the bottom stays there, with the last content clear of the
// tab bar (AC-11). Swipes repeat until the page stops moving; then it must
// not move back on its own.
for (const path of [
  "/cuadernos",
  "/cuadernos/7?vista=ensayos",
  "/cuadernos/7?vista=variables",
  "/cuadernos/7/resultados",
  "/cuadernos/nuevo",
])
  test(`${path} scrolls to the bottom and stays`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const cdp = await page.context().newCDPSession(page);
    const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
    const positions: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      await cdp.send("Input.synthesizeScrollGesture", {
        x: 180,
        y: 400,
        yDistance: -700,
        speed: 2000,
        gestureSourceType: "touch",
      });
      positions.push(await scrollY());
      if (i > 0 && positions[i] === positions[i - 1]) break;
    }
    const reached = positions.at(-1) ?? 0;
    await page.waitForTimeout(1000);
    const end = await page.evaluate(() => {
      const bar = document
        .querySelector('nav[aria-label="Principal"].fixed')
        ?.getBoundingClientRect();
      const last = document
        .querySelector("main")
        ?.lastElementChild?.getBoundingClientRect();
      return {
        y: Math.round(window.scrollY),
        bottom: document.documentElement.scrollHeight - window.innerHeight,
        lastBottom: Math.round(last?.bottom ?? 0),
        barTop: Math.round(bar?.top ?? window.innerHeight),
      };
    });
    const story = `swipes ${positions.join(" → ")}, then ${JSON.stringify(end)}`;
    expect(
      Math.abs(reached - end.bottom),
      `reaches the bottom: ${story}`,
    ).toBeLessThanOrEqual(1);
    expect(end.y, `stays there: ${story}`).toBe(reached);
    expect(end.lastBottom, `clears the tab bar: ${story}`).toBeLessThanOrEqual(
      end.barTop,
    );
  });
