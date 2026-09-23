import { expect, test, type Page } from "@playwright/test";

type Locale = "en" | "zh-CN";

function expectedConfirmation(locale: Locale, categoryName: string): string {
  return locale === "en"
    ? `Delete “${categoryName}”? Cancel keeps it. Continue deletes it if unused; if used, you can review and reassign its records first. Deleted categories remain in history.`
    : `删除“${categoryName}”？取消会保留它。继续后，未被使用的分类会直接删除；若有交易引用，可先查看并重新分配交易，再删除分类。删除后的分类仍保留在历史记录中。`;
}

async function createLedger(page: Page, locale: Locale): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#workspace-form")).toBeVisible();
  await page.evaluate(async (selectedLocale) => {
    await window.lunaLedger.updateSettings({ locale: selectedLocale });
  }, locale);
  await page.reload();
  await expect(page.locator("#workspace-form")).toBeVisible();
  await page.locator("#workspace-name").fill("Category confirmation fixture");
  await page.locator("#workspace-form button[type='submit']").click();
  await expect(page.locator("#primary-record")).toBeVisible();
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`${locale}: category deletion names its target and reports cancel and accept effects`, async ({ page }) => {
    const categoryName = locale === "en" ? "Synthetic delete target" : "待删除合成分类";
    const expectedMessage = expectedConfirmation(locale, categoryName);
    const deleteLabel = locale === "en" ? "Delete" : "删除";

    await createLedger(page, locale);
    await page.goto("/settings/categories");
    await page.locator("#category-name").fill(categoryName);
    await page.locator("#save-category").click();

    const categoryRows = page.locator(".category-settings-item");
    const target = categoryRows.filter({ hasText: categoryName });
    await expect(target).toHaveCount(1);
    const targetId = await target.getAttribute("data-category-id");
    expect(targetId).not.toBeNull();
    const initialCategoryIds = await categoryRows.evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-category-id")),
    );

    let cancelledMessage: string | undefined;
    page.once("dialog", async (dialog) => {
      cancelledMessage = dialog.message();
      await dialog.dismiss();
    });
    await target.getByRole("button", { name: deleteLabel, exact: true }).click();
    await expect.poll(() => cancelledMessage).toBe(expectedMessage);
    await expect(target).toBeVisible();
    expect(await categoryRows.evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-category-id")),
    )).toEqual(initialCategoryIds);

    let acceptedMessage: string | undefined;
    page.once("dialog", async (dialog) => {
      acceptedMessage = dialog.message();
      await dialog.accept();
    });
    await target.getByRole("button", { name: deleteLabel, exact: true }).click();
    await expect.poll(() => acceptedMessage).toBe(expectedMessage);
    await expect(target).toHaveCount(0);

    const remainingCategoryIds = await categoryRows.evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-category-id")),
    );
    expect(remainingCategoryIds).toEqual(
      initialCategoryIds.filter((id) => id !== targetId),
    );
  });
}
