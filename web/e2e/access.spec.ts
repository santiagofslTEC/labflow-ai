import { expect, test } from "@playwright/test";

// Spec 0014, AC-11: the sign in pages on the phone, with no session.
for (const path of [
  "/access",
  "/access/crear",
  "/access/recuperar",
  "/access/nueva-contrasena",
])
  test(`${path} fits the phone`, async ({ page }) => {
    await page.route("**/api/access/options", (route) =>
      route.fulfill({ json: { codes: true, accounts: true } }),
    );
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBe(0);
    const size = await page
      .getByRole("textbox")
      .first()
      .evaluate((field) => getComputedStyle(field).fontSize);
    expect(size).toBe("16px");
  });

test("the sign in page offers Google, email, and a code", async ({ page }) => {
  await page.route("**/api/access/options", (route) =>
    route.fulfill({ json: { codes: true, accounts: true } }),
  );
  await page.goto("/access");
  await expect(
    page.getByRole("button", { name: "Continuar con Google" }),
  ).toBeVisible();
  await expect(page.getByLabel("Correo")).toBeVisible();
  await page.getByRole("button", { name: "Tengo un código de acceso" }).click();
  await expect(page.getByLabel("Código de acceso")).toBeVisible();
});

test("a page with no session goes to the sign in page", async ({ page }) => {
  await page.route("**/api/access/options", (route) =>
    route.fulfill({ json: { codes: true, accounts: true } }),
  );
  await page.goto("/cuadernos/7");
  await expect(page).toHaveURL("/access?next=%2Fcuadernos%2F7");
});
