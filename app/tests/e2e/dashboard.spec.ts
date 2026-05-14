import { expect, test, type Page } from "@playwright/test";

async function createDraft(page: Page, title = "Bug Reports") {
  await page.goto("/builder");
  await expect(page).toHaveURL(/\/builder\/draft-/);
  await page.getByPlaceholder("Untitled form").fill(title);
  await expect(page.getByPlaceholder("Untitled form")).toHaveValue(title);
  await page.waitForFunction((expectedTitle) => {
    try {
      const items = JSON.parse(localStorage.getItem("walrus.forms.localForms.v1") ?? "[]");
      return Array.isArray(items) && items.some((form) => form.title === expectedTitle);
    } catch {
      return false;
    }
  }, title);
}

test.describe("Dashboard + sidebar nav", () => {
  test.beforeEach(async ({ page }) => {
    await createDraft(page);
    await page.goto("/dashboard");
  });

  test("renders forms grid + new form CTA", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Your forms/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /New form/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Bug Reports/i })).toBeVisible();
  });

  test("sidebar Forms / Allowlists / Settings all routable", async ({ page }) => {
    await page.getByRole("link", { name: /^Allowlists$/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/allowlists$/);
    await expect(page.getByRole("heading", { name: /^Allowlists$/ })).toBeVisible();

    await page.getByRole("link", { name: /^Settings$/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
    await expect(page.getByRole("heading", { name: /^Settings$/ })).toBeVisible();

    await page.getByRole("link", { name: /^Forms$/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("clicking a form card opens the builder draft", async ({ page }) => {
    await page.getByRole("link", { name: /Bug Reports/i }).click();
    await expect(page).toHaveURL(/\/builder\/draft-/);
    await expect(page.getByRole("heading", { name: /Compose a form/i })).toBeVisible();
  });

  test("topbar New form button goes to builder", async ({ page }) => {
    await page.getByRole("link", { name: /^New form$/ }).click();
    await expect(page).toHaveURL(/\/builder/);
  });
});
