import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Workspace name").fill("Entry form polish");
  await page.getByRole("button", { name: "Create local workspace" }).click();
  await expect(page.locator("#transactions-title")).toBeVisible();
}

async function chooseCategory(page: Page, name: string): Promise<void> {
  await page.locator("#choose-category").click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("calculator shows extra repeating precision before saving at ledger precision", async ({ page }) => {
  await setup(page);
  await page.locator("#primary-record").click();
  await page.locator("#transaction-amount").fill("10/3");
  await chooseCategory(page, "Food");
  const calculator = page.locator(".calculator");
  await calculator.locator("summary").click();
  await expect(calculator.locator(".calculator-grid").getByRole("button", { name: "×" })).toBeVisible();
  await expect(calculator.locator(".calculator-grid").getByRole("button", { name: "÷" })).toBeVisible();
  await calculator.locator(".calculator-grid").getByRole("button", { name: "Evaluate" }).click();
  await expect(page.locator("#transaction-amount")).toHaveValue("3.33");
  await expect(calculator.locator(".calculator-result")).toContainText("3.333(3)");
  await page.locator("#save-transaction").click();
  await expect(page.locator("#transaction-list-region")).toContainText("3.33");
});

test("category settings rename and usage flow keep new entries on the saved directory", async ({ page }) => {
  await setup(page);
  await page.goto("/settings/categories");
  const source = () => page.locator('article[data-category-id="expense:0"]');
  await expect(source()).toContainText("Food");
  page.once("dialog", (dialog) => void dialog.accept("Meals"));
  await source().getByRole("button", { name: "Rename", exact: true }).click();
  await expect(source()).toContainText("Meals");

  await page.goto("/ledger");
  await page.locator("#primary-record").click();
  await page.locator("#transaction-amount").fill("10.00");
  await chooseCategory(page, "Meals");
  await page.locator("#transaction-advanced-details summary").click();
  await page.locator("#transaction-merchant").fill("Category migration item");
  await page.locator("#save-transaction").click();
  await expect(page.locator("#transaction-list-region")).toContainText("Category migration item");

  await page.goto("/settings/categories");
  page.once("dialog", (dialog) => void dialog.accept());
  await source().getByRole("button", { name: "Delete", exact: true }).click();
  const usage = page.locator("#category-usage-dialog");
  await expect(usage).toContainText("1 transaction uses this category");
  await usage.locator("#category-usage-select-all").check();
  await usage.locator("#category-batch-target").selectOption("expense:1");
  await usage.locator(".category-usage-toolbar").getByRole("button", { name: "Replace selected", exact: true }).click();
  await expect(usage).toContainText("0 transactions use this category");
  await usage.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(source()).toHaveCount(0);

  await page.goto("/ledger");
  await page.locator("#primary-record").click();
  await page.locator("#transaction-amount").fill("1.00");
  await page.locator("#choose-category").click();
  await expect(page.getByRole("button", { name: "Meals", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Transport", exact: true })).toBeVisible();
});
