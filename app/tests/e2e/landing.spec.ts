import { expect, test } from "@playwright/test";

test.describe("Landing page", () => {
  test("renders hero, features, footer", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("verifiable");
    await expect(page.getByText("Forms stored on Walrus")).toBeVisible();

    await expect(page.getByRole("link", { name: /Walrus docs/i }).first()).toBeVisible();

    await expect(page.getByRole("heading", { name: /Walrus-native by design/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Encrypted with Seal/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /On-chain triage/i })).toBeVisible();
  });

  test("CTA navigates to dashboard", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Start building/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: /Your forms/i })).toBeVisible();
  });

  test("scroll indicator and bento bottom card present", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Stake WAL\. Reward great feedback\./i)).toBeVisible();
    await expect(page.getByText(/Built for builders\./i)).toBeVisible();
  });
});
