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
  return new URL(page.url()).pathname.split("/").pop() as string;
}

test.describe("Admin submissions", () => {
  test.beforeEach(async ({ page }) => {
    const draftId = await createDraft(page);
    await page.goto(`/admin/${draftId}`);
  });

  test("renders table headers and form actions", async ({ page }) => {
    await expect(page.getByText(/^Submitter$/)).toBeVisible();
    await expect(page.getByText(/^Status$/)).toBeVisible();
    await expect(page.getByText(/No submissions yet/i)).toBeVisible();
    await expect(page.getByText(/Form actions/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Edit form/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Delete form/i })).toBeVisible();
  });

  test("share actions remain available for copied links", async ({ page }) => {
    await expect(page.getByRole("button", { name: /^Copy$/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Open$/ })).toBeVisible();
  });

  test("export CSV button present", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Export CSV/i })).toBeVisible();
  });

  test("edit clones the current form into a fresh builder draft", async ({ page }) => {
    await expect(page.getByText(/Form actions/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Edit form/i }).click();
    await expect(page).toHaveURL(/\/builder\/draft-/);
    await expect(page.getByRole("heading", { name: /Compose a form/i })).toBeVisible();
  });

  test("delete removes the draft from the dashboard", async ({ page }) => {
    await expect(page.getByText(/Form actions/i)).toBeVisible({ timeout: 10_000 });
    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });
    await page.getByRole("button", { name: /Delete form/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
