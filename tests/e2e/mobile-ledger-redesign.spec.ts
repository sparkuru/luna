import { expect, test, type Page } from "@playwright/test";

// These tests select native presentation on the browser host. They verify the
// fixed renderer event contract, not Android dispatch or the real system IME.
async function mobileLedger(page: Page, locale: "en" | "zh-CN") {
  await page.goto("/");
  await expect(page.locator("#workspace-form")).toBeVisible();
  await page.evaluate((locale) => window.lunaLedger.updateSettings({ locale }), locale);
  await page.reload();
  await page.locator("#workspace-name").fill("Mobile redesign fixture");
  await page.locator("#workspace-form button[type=submit]").click();
  await expect(page.locator("#transactions-title")).toBeVisible();
  await page.evaluate(async () => {
    const date = new Date();
    const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const snapshot = await window.lunaLedger.getSnapshot(today.slice(0, 7));
    const category = snapshot.categories!.find((item) => item.type === "expense" && item.enabled)!;
    for (const [merchant, amount] of [["Lunch", "3500"], ["Commute", "600"], ["Groceries", "2000"]] as const) {
      await window.lunaLedger.createTransaction({
        type: "expense", date: today, amountMinor: amount,
        splits: [{ category: category.id, amountMinor: amount }],
        merchant, paymentMethod: "", notes: merchant === "Lunch" ? "Lunch" : "",
      });
    }
  });
  await page.reload();
  await expect(page.locator(".transaction-item")).toHaveCount(3);
  await page.evaluate(() => { document.documentElement.dataset.clientSurface = "mobile"; });
  await page.locator("#primary-record").click();
  await page.locator("#close-transaction").click();
  await expect(page.locator("#transaction-dialog")).toBeHidden();
}

async function back(page: Page): Promise<boolean> {
  return page.evaluate(() => window.dispatchEvent(new CustomEvent("luna:navigate-back", { cancelable: true })));
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`${locale}: compact ledger keeps records, private summaries and short navigation usable`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 457, height: 999 });
    await mobileLedger(page, locale);
    await expect(page.locator("#open-secondary-menu")).toHaveCount(1);
    await expect(page.locator(".topbar #open-secondary-menu")).toHaveCount(0);
    await expect(page.locator(".primary-navigation-link")).toHaveCount(4);
    const hidden = await page.locator("#summary-grid").innerText();
    expect(hidden).toContain("••••");
    expect(hidden).not.toMatch(/61\.00/);
    await expect(page.locator(".transaction-item").filter({ hasText: "Lunch" })).toContainText("35.00");
    await expect(page.locator(".transaction-item").filter({ hasText: "Lunch" }).locator(".transaction-secondary-text")).not.toContainText("Lunch");
    for (const width of [320, 375, 457]) {
      await page.setViewportSize({ width, height: 999 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const frame = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll(".transaction-item")).slice(0, 2);
        const nav = document.querySelector(".primary-navigation")!.getBoundingClientRect();
        return { rows: rows.map((row) => row.getBoundingClientRect().bottom), navTop: nav.top,
          targets: Array.from(document.querySelectorAll(".primary-navigation button")).map((button) => {
            const box = button.getBoundingClientRect(); return { width: box.width, height: box.height, top: box.top };
          }) };
      });
      expect(frame.rows).toHaveLength(2);
      for (const bottom of frame.rows) expect(bottom).toBeLessThan(frame.navTop);
      expect(new Set(frame.targets.map((target) => Math.round(target.top))).size).toBe(1);
      for (const target of frame.targets) {
        expect(target.width).toBeGreaterThanOrEqual(48);
        expect(target.height).toBeGreaterThanOrEqual(48);
      }
      const before = await page.locator("#summary-grid").boundingBox();
      await page.locator("#toggle-expense-amounts").click();
      await expect(page.locator("#expense-total")).toContainText("61.00");
      await expect(page.locator("#income-total")).toHaveText("••••");
      expect((await page.locator("#summary-grid").boundingBox())!.height).toBe(before!.height);
      await page.locator("#toggle-expense-amounts").click();
    }
    await testInfo.attach("mobile-ledger", { body: await page.screenshot({ path: `captures/mobile-redesign-browser/${locale}-ledger.png` }), contentType: "image/png" });
  });

  test(`${locale}: separate filter panel preserves results and closes before home fallback`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await mobileLedger(page, locale);
    await page.locator("#filter-details").click();
    await expect(page.locator("#filter-dialog")).toBeVisible();
    await expect(page.locator("#filter-query")).not.toBeFocused();
    await page.locator("#filter-query").fill("Lunch");
    await expect(page.locator(".mobile-filter-footer button")).toContainText("1");
    expect(await back(page)).toBe(false);
    await expect(page.locator("#filter-dialog")).toBeHidden();
    await expect(page.locator(".transaction-item")).toHaveCount(1);
    await page.locator("#filter-details").click();
    await expect(page.locator("#filter-query")).toHaveValue("Lunch");
    await page.locator("#filter-regex").click();
    await page.locator("#filter-query").fill("(");
    await expect(page.locator(".mobile-filter-footer button")).toBeDisabled();
    await expect(page.locator("#filter-dialog [role=alert]")).not.toBeEmpty();
    await page.locator("#filter-form button[type=reset]").click();
    await expect(page.locator(".mobile-filter-footer button")).toContainText("3");
    await page.locator(".mobile-filter-footer button").click();
    await expect(page.locator(".transaction-item")).toHaveCount(3);
    expect(await back(page)).toBe(true);
  });

  test(`${locale}: mobile editing identifies and retains a disabled category`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await mobileLedger(page, locale);
    const original = await page.evaluate(async () => {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const snapshot = await window.lunaLedger.getSnapshot(month);
      const transaction = snapshot.transactions.find((item) => item.merchant === "Lunch")!;
      const category = snapshot.categories!.find((item) => item.id === transaction.splits[0]!.category)!;
      await window.lunaLedger.updateCategory(category.id, { enabled: false }, snapshot.categoryHeadIds);
      return { transaction, category };
    });
    await page.reload();
    await page.evaluate(() => { document.documentElement.dataset.clientSurface = "mobile"; });
    await page.locator(`#transaction-details-${original.transaction.id}`).click();
    await page.locator("#transaction-detail-edit").click();
    await expect(page.locator("#category-helper")).toContainText(original.category.name);
    await expect(page.locator("#category-helper")).toContainText(locale === "en" ? "disabled" : "已停用");
    await expect(page.locator(".mobile-category-grid button").filter({ hasText: original.category.name })).toHaveCount(0);
    await page.locator("#save-transaction").click();
    await expect(page.locator("#transaction-dialog")).toBeHidden();
    const saved = await page.evaluate(async (transaction) =>
      (await window.lunaLedger.getSnapshot(transaction.date.slice(0, 7)))
        .transactions.find((item) => item.id === transaction.id)!, original.transaction);
    expect(saved.splits).toEqual(original.transaction.splits);
    expect(saved.amountMinor).toBe(original.transaction.amountMinor);
    expect(saved.revision).toBeGreaterThan(original.transaction.revision);
  });
}

test("mobile navigation yields to a reduced text viewport and returns after landscape resizing", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mobileLedger(page, "en");
  await page.locator("#filter-details").click();
  await page.locator("#filter-query").focus();
  await page.setViewportSize({ width: 375, height: 500 });
  await expect(page.locator("html")).toHaveAttribute("data-mobile-ime", "true");
  await expect(page.locator(".primary-navigation")).toBeHidden();
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(page.locator("html")).toHaveAttribute("data-mobile-ime", "false");
  await page.setViewportSize({ width: 800, height: 375 });
  await expect(page.locator("html")).toHaveAttribute("data-mobile-ime", "false");
  // This models renderer resize signals only, not a physical keyboard or rotation.
  expect(await back(page)).toBe(false);
  await expect(page.locator(".primary-navigation")).toBeVisible();
});

test("renderer BACK closes visible details and images once; closed portals do not consume home", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 457, height: 999 });
  await mobileLedger(page, "en");
  const detailOpener = page.locator(".transaction-item").filter({ hasText: "Commute" }).locator(".transaction-main-button");
  await detailOpener.click();
  await expect(page.locator("#transaction-detail-dialog")).toBeVisible();
  await expect(page.locator("#transaction-detail-notes")).toHaveCount(0);
  expect(await back(page)).toBe(false);
  await expect(page.locator("#transaction-detail-dialog")).toBeHidden();
  await expect(detailOpener).toBeFocused();
  expect(await back(page)).toBe(true);
  await page.locator("#primary-record").click();
  await page.locator("#transaction-amount").fill("8.50");
  await page.locator(".mobile-category-grid button").first().click();
  await expect(page.locator(".mobile-category-grid button").first()).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.locator(".mobile-category-grid button").evaluateAll((buttons) => {
    const appearances = buttons.map((button) => {
      const style = getComputedStyle(button);
      return [style.backgroundColor, style.borderColor, style.color].join("|");
    });
    return appearances[0] !== appearances[1];
  })).toBe(true);
  await testInfo.attach("mobile-entry", { body: await page.screenshot({ path: "captures/mobile-redesign-browser/en-entry.png" }), contentType: "image/png" });
  await page.locator("#transaction-images").setInputFiles({
    name: "fixture.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.locator(".attachment-preview")).toHaveCount(1);
  await page.locator("#save-transaction").click();
  await expect(page.locator("#transaction-dialog")).toBeHidden();
  await page.locator(".transaction-item").filter({ has: page.locator('[id^="view-images-"]') }).locator(".transaction-main-button").click();
  await page.locator("#transaction-detail-images").click();
  await expect(page.locator("#transaction-image-dialog")).toBeVisible();
  expect(await back(page)).toBe(false);
  await expect(page.locator("#transaction-image-dialog")).toBeHidden();
  await expect(page.locator("#transaction-detail-dialog")).toBeVisible();
  expect(await back(page)).toBe(false);
  await expect(page.locator("#transaction-detail-dialog")).toBeHidden();
  expect(await back(page)).toBe(true);
});

test("detail closure restores its opener while editing keeps focus in the entry", async ({ page }) => {
  await mobileLedger(page, "en");
  await page.evaluate(() => { document.documentElement.dataset.clientSurface = "web"; });
  const opener = page.locator(".transaction-item").filter({ hasText: "Commute" }).locator(".transaction-main-button");
  await opener.click();
  await page.locator("#close-transaction-detail").click();
  await expect(page.locator("#transaction-detail-dialog")).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#transaction-detail-dialog")).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await page.locator("#transaction-detail-edit").click();
  await expect(page.locator("#transaction-dialog")).toBeVisible();
  await expect(page.locator("#transaction-amount")).toBeFocused();
});
