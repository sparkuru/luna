import { expect, test, type Locator, type Page } from "@playwright/test";

// The board's 1920x1080 display and WebView CDP report this landscape CSS
// viewport at a device pixel ratio of 1.75.
test.use({
  viewport: { width: 1098, height: 578 },
  deviceScaleFactor: 1.75,
});

async function createLedger(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Ledger name").fill("Wide landscape entry");
  await page.getByRole("button", { name: "Create local ledger" }).click();
  await expect(page.locator("#transactions-title")).toBeVisible();
}

async function createLedgerInLocale(page: Page, locale: "en" | "zh-CN"): Promise<void> {
  await createLedger(page);
  if (locale === "en") return;
  await page.evaluate((locale) => window.lunaLedger.updateSettings({ locale }), locale);
  await page.reload();
}

async function expectReachableWithinDialog(
  dialog: Locator,
  control: Locator,
): Promise<void> {
  await expect(control).toBeVisible();
  await control.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      control.evaluate((element) => {
        const panel = element.closest<HTMLElement>(".transaction-dialog-panel");
        if (panel === null) return false;
        const controlRect = element.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const visibleTop = panelRect.top + panel.clientTop;
        const visibleBottom = visibleTop + panel.clientHeight;
        return (
          controlRect.top >= visibleTop - 1 &&
          controlRect.bottom <= visibleBottom + 1 &&
          controlRect.left >= panelRect.left + panel.clientLeft - 1 &&
          controlRect.right <= panelRect.left + panel.clientLeft + panel.clientWidth + 1
        );
      }),
    )
    .toBe(true);
  await expect(dialog).toBeVisible();
}

async function gridColumnCount(grid: Locator): Promise<number> {
  return grid.evaluate((element) => {
    const tracks = getComputedStyle(element).gridTemplateColumns;
    return tracks.match(/\d+(?:\.\d+)?px/g)?.length ?? 0;
  });
}

test("Android mobile entry controls remain reachable in wide landscape", async ({ page }) => {
  await createLedger(page);
  await page.evaluate(() => {
    document.documentElement.dataset.clientSurface = "mobile";
    document.querySelector(".app-shell")?.classList.remove("client-surface-web");
  });
  await page.locator("#primary-record").click();

  const dialog = page.locator("#transaction-dialog");
  const fields = dialog.locator(".quick-core-fields");
  await expect(dialog).toBeVisible();
  await expect.poll(() => gridColumnCount(fields)).toBe(1);
  await expect(dialog.locator("div.calculator")).toBeVisible();
  await expect(dialog.locator(".calculator .calculator-grid button")).toHaveCount(18);
  const dialogMetrics = await dialog.evaluate((element) => ({
    clientHeight: element.clientHeight,
    height: element.getBoundingClientRect().height,
    maxHeight: getComputedStyle(element).maxHeight,
    scrollHeight: element.scrollHeight,
    viewportHeight: window.innerHeight,
  }));
  expect(dialogMetrics.maxHeight).not.toBe("none");
  expect(dialogMetrics.height).toBeLessThanOrEqual(dialogMetrics.viewportHeight);
  expect(dialogMetrics.scrollHeight).toBeGreaterThan(dialogMetrics.clientHeight);

  for (const selector of [
    "#transaction-amount",
    "#choose-category",
    "#transaction-date",
    "#save-transaction",
  ]) {
    await expectReachableWithinDialog(dialog, dialog.locator(selector));
  }

  // Removing the supported dvh rule matches the cascade on Android WebViews
  // that cannot parse 100dvh; the vh baseline must still constrain scrolling.
  const removedDynamicViewportRules = await page.evaluate(() => {
    let removed = 0;
    for (const sheet of Array.from(document.styleSheets)) {
      for (let index = sheet.cssRules.length - 1; index >= 0; index -= 1) {
        const rule = sheet.cssRules[index];
        if (rule instanceof CSSSupportsRule && rule.conditionText.includes("100dvh")) {
          sheet.deleteRule(index);
          removed += 1;
        }
      }
    }
    return removed;
  });
  expect(removedDynamicViewportRules).toBeGreaterThan(0);
  const fallbackMetrics = await dialog.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    maxHeight: Number.parseFloat(getComputedStyle(element).maxHeight),
    viewportHeight: window.innerHeight,
  }));
  expect(fallbackMetrics.maxHeight).toBeCloseTo(fallbackMetrics.viewportHeight - 32);
  expect(fallbackMetrics.height).toBeLessThanOrEqual(fallbackMetrics.viewportHeight);
  for (const selector of ["#choose-category", "#transaction-date", "#save-transaction"]) {
    await expectReachableWithinDialog(dialog, dialog.locator(selector));
  }
});

test("wide Web entry keeps its three-column core form", async ({ page }) => {
  await createLedger(page);
  await page.locator("#primary-record").click();

  const fields = page.locator("#transaction-dialog .quick-core-fields");
  await expect(page.locator("#transaction-dialog")).toBeVisible();
  await expect.poll(() => gridColumnCount(fields)).toBe(3);
});

for (const locale of ["en", "zh-CN"] as const) {
  test(`${locale}: narrow Web entry date is year-first with an aligned square close`, async ({ page }) => {
    await page.setViewportSize({ width: 457, height: 999 });
    await createLedgerInLocale(page, locale);
    await page.locator("#primary-record").click();

    const dialog = page.locator("#transaction-dialog");
    const date = dialog.locator("#transaction-date");
    await date.fill("2026-09-28");
    await expect(date).toHaveValue("2026-09-28");
    const projection = dialog.locator(".date-picker-mobile-value");
    await expect(projection).toBeVisible();
    await expect(projection).toHaveText("2026/09/28");
    await expect(projection).toHaveAttribute("aria-hidden", "true");
    await date.evaluate((input) => input.blur());

    const close = dialog.locator("#close-transaction");
    await expect(close).toHaveAccessibleName(locale === "en" ? "Close" : "关闭");
    const closeBox = (await close.boundingBox())!;
    const titleBox = (await dialog.locator("#transaction-form-title").boundingBox())!;
    expect(closeBox.width).toBe(48);
    expect(closeBox.height).toBe(48);
    expect(Math.abs((titleBox.y + titleBox.height / 2) - (closeBox.y + closeBox.height / 2))).toBeLessThanOrEqual(1);
    await close.click();
    await expect(dialog).toBeHidden();
  });
}
