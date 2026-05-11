import { expect, test } from "@playwright/test";

test.describe("Dashboard + sidebar nav", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
  });

  test("renders forms grid + new form CTA", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Your forms/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /New form/i }).first()).toBeVisible();

    for (const title of ["Bug Reports", "Q2 NPS Survey", "Sealed Roadmap Vote", "Grants Application"]) {
      await expect(page.getByText(title, { exact: false })).toBeVisible();
    }
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

  test("clicking a form card navigates to admin", async ({ page }) => {
    await page.getByText("Bug Reports").click();
    await expect(page).toHaveURL(/\/admin\//);
    await expect(page.getByRole("heading", { name: /Bug Reports/i })).toBeVisible();
  });

  test("topbar New form button goes to builder", async ({ page }) => {
    await page.getByRole("button", { name: /^New form$/ }).click();
    await expect(page).toHaveURL(/\/builder/);
  });
});
