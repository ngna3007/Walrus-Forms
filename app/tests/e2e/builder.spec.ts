import { expect, test } from "@playwright/test";

test.describe("Form builder", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/builder");
  });

  test("renders editor + live preview", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Compose a form/i })).toBeVisible();
    await expect(page.getByPlaceholder("Untitled form")).toBeVisible();
    await expect(page.getByText(/Live preview/i)).toBeVisible();
  });

  test("title edit reflects in preview", async ({ page }) => {
    const title = page.getByPlaceholder("Untitled form");
    await title.fill("My new form");
    // Preview h2 (FormRenderer renders schema.title)
    await expect(page.locator("form h2", { hasText: "My new form" })).toBeVisible();
  });

  test("add a field via builder", async ({ page }) => {
    await page.getByRole("button", { name: /Add field/i }).click();
    const labelInputs = page.getByPlaceholder("Field label");
    await expect(labelInputs.last()).toBeVisible();
  });

  test("policy radio cards switch encryption details", async ({ page }) => {
    await page.getByText(/Only listed addresses can decrypt/i).click();
    await expect(page.getByText(/^Allowlist object id$/i)).toBeVisible();

    await page.getByText(/Decrypts after a set time/i).click();
    await expect(page.locator('input[type="datetime-local"]')).toBeVisible();
  });

  test("preview mobile/desktop toggle", async ({ page }) => {
    await page.getByRole("button", { name: /^mobile$/ }).click();
    await page.getByRole("button", { name: /^desktop$/ }).click();
  });
});
