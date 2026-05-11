import { expect, test } from "@playwright/test";

test.describe("Public submit page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/f/demo123");
  });

  test("renders policy badge + form title", async ({ page }) => {
    await expect(page.getByText(/Public|Encrypted with Seal/i).first()).toBeVisible();
    await expect(page.locator("form h2")).toBeVisible();
  });

  test("required field validation surfaces error", async ({ page }) => {
    await page.getByRole("button", { name: /^Submit$/ }).click();
    await expect(page.getByText(/^Required:/i)).toBeVisible();
  });

  test("filling required fields and submitting clears the error", async ({ page }) => {
    const longText = page.getByPlaceholder("").or(page.locator("textarea")).first();
    await longText.fill("Demo feedback E2E");
    await page.getByRole("button", { name: /^Submit$/ }).click();
    await expect(page.getByText(/^Required:/i)).not.toBeVisible();
  });
});
