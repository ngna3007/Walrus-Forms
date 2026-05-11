import { expect, test } from "@playwright/test";

test.describe("Allowlists page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/allowlists");
  });

  test("renders list and detail panels", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /^Allowlists$/ })).toBeVisible();
    await expect(page.getByText("Bug triagers")).toBeVisible();
  });

  test("create new list", async ({ page }) => {
    await page.getByRole("button", { name: /^New list$/ }).click();
    await expect(page.getByText(/New list \d+/)).toBeVisible();
  });

  test("add member by typing address", async ({ page }) => {
    const input = page.getByPlaceholder(/0x…/);
    await input.fill("0x1234567890abcdef1234567890abcdef12345678");
    await page.getByRole("button", { name: /^Add$/ }).click();
    await expect(page.getByText(/0x12345678…345678/)).toBeVisible();
  });
});
