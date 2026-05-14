import { expect, test } from "@playwright/test";

test.describe("Public submit page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/f/not-a-form-id");
  });

  test("rejects invalid form links instead of loading seeded data", async ({ page }) => {
    await expect(page.getByText(/not a valid published Sui Form object id/i)).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
  });

  test("surfaces zkLogin and sponsored gas submitter path", async ({ page }) => {
    await expect(page.getByText(/Sponsored gas/i).first()).toBeVisible();
    await expect(page.getByText(/zkLogin/i).first()).toBeVisible();
  });
});
