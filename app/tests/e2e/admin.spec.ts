import { expect, test } from "@playwright/test";

test.describe("Admin submissions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/demo");
  });

  test("renders table headers and rows", async ({ page }) => {
    await expect(page.getByText(/^Submitter$/)).toBeVisible();
    await expect(page.getByText(/^Status$/)).toBeVisible();

    await expect(page.getByText(/Wallet popup blocked on Safari iOS/i)).toBeVisible();
    await expect(page.getByText(/CSV export drops/i)).toBeVisible();
  });

  test("status filter narrows rows", async ({ page }) => {
    await page.getByRole("combobox").first().selectOption("3");
    await expect(page.getByText(/Move publish gas estimate/i)).toBeVisible();
    await expect(page.getByText(/Wallet popup blocked/i)).not.toBeVisible();
  });

  test("locked row shows Decrypt action", async ({ page }) => {
    await expect(page.getByRole("button", { name: /^Decrypt$/i })).toBeVisible();
  });

  test("row click expands triage drawer", async ({ page }) => {
    await page.getByText(/Wallet popup blocked on Safari iOS/i).click();
    await expect(page.getByText(/^Triage$/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Mark resolved/i })).toBeVisible();
    await expect(page.getByText(/Audit log/i)).toBeVisible();
  });

  test("export CSV button present", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Export CSV/i })).toBeVisible();
  });
});
