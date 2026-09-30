import { expect, test, type Locator, type Page } from "@playwright/test";

// The board's 1920x1080 display and WebView CDP report this landscape CSS
// viewport at a device pixel ratio of 1.75.
test.use({
  viewport: { width: 1098, height: 578 },
  deviceScaleFactor: 1.75,
});

async function createLedger(page: Page, locale: "en" | "zh-CN" = "en"): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#workspace-form")).toBeVisible();
  await page.evaluate((locale) => window.lunaLedger.updateSettings({ locale }), locale);
  await page.reload();
  await page.locator("#workspace-name").fill("Wide landscape entry");
  await page.locator("#workspace-form button[type=submit]").click();
  await expect(page.locator("#transactions-title")).toBeVisible();
}

async function useMobilePresentation(page: Page): Promise<void> {
  // Browser coverage exercises shared rendering, not native IME or BACK.
  await page.evaluate(() => {
    document.documentElement.dataset.clientSurface = "mobile";
  });
  await page.locator("#primary-record").click();
  await expect(page.locator("#transaction-dialog")).toBeVisible();
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

async function expectMobileCategoryTargets(page: Page): Promise<void> {
  for (const selector of ["#category-search", "#close-category", ".category-option"]) {
    const control = page.locator(selector).first();
    await expect(control).toBeVisible();
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(48);
    expect(box.height).toBeGreaterThanOrEqual(48);
  }
}

test("Android mobile entry controls remain reachable in wide landscape", async ({ page }) => {
  await createLedger(page);
  await useMobilePresentation(page);

  const summaryTargets = await page.locator("[data-summary-visibility-toggle]").evaluateAll((buttons) =>
    buttons.map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
  );
  expect(summaryTargets).toHaveLength(3);
  for (const target of summaryTargets) {
    expect(target.width).toBeGreaterThanOrEqual(48);
    expect(target.height).toBeGreaterThanOrEqual(48);
  }

  const dialog = page.locator("#transaction-dialog");
  const fields = dialog.locator(".quick-core-fields");
  await expect(dialog).toBeVisible();
  await expect.poll(() => gridColumnCount(fields)).toBe(1);
  await expect(dialog.locator("div.calculator")).toBeVisible();
  await expect(dialog.locator(".calculator .calculator-grid button")).toHaveCount(18);
  await expect(dialog.locator("#transaction-amount")).toHaveAttribute("inputmode", "none");
  const coreAndCalculator = await dialog.evaluate((element) => {
    const core = element.querySelector(".quick-core-fields")!.getBoundingClientRect();
    const calculator = element.querySelector(".calculator")!.getBoundingClientRect();
    return { coreBottom: core.bottom, calculatorTop: calculator.top };
  });
  expect(coreAndCalculator.coreBottom).toBeLessThanOrEqual(coreAndCalculator.calculatorTop);
  const dialogMetrics = await dialog.evaluate((element) => ({
    clientHeight: element.clientHeight,
    height: element.getBoundingClientRect().height,
    maxHeight: getComputedStyle(element).maxHeight,
    scrollHeight: element.querySelector("#transaction-form")!.scrollHeight,
    formHeight: element.querySelector("#transaction-form")!.clientHeight,
    viewportHeight: window.innerHeight,
  }));
  expect(dialogMetrics.maxHeight).not.toBe("none");
  expect(dialogMetrics.height).toBeLessThanOrEqual(dialogMetrics.viewportHeight);
  expect(dialogMetrics.scrollHeight).toBeGreaterThan(dialogMetrics.formHeight);

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
  expect(fallbackMetrics.maxHeight).toBeCloseTo(fallbackMetrics.viewportHeight);
  expect(fallbackMetrics.height).toBeLessThanOrEqual(fallbackMetrics.viewportHeight);
  for (const selector of ["#choose-category", "#transaction-date", "#save-transaction"]) {
    await expectReachableWithinDialog(dialog, dialog.locator(selector));
  }
  await dialog.locator("#choose-category").click();
  await expectMobileCategoryTargets(page);
  await page.keyboard.press("Escape");
  await expect(dialog.locator("#choose-category")).toBeFocused();
});

test("wide Web entry keeps its three-column core form", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await createLedger(page);
  await page.locator("#primary-record").click();

  const fields = page.locator("#transaction-dialog .quick-core-fields");
  await expect(page.locator("#transaction-dialog")).toBeVisible();
  await expect.poll(() => gridColumnCount(fields)).toBe(3);
  await expect(page.locator("#transaction-amount")).toHaveAttribute("inputmode", "decimal");
  await expect(page.locator("#transaction-dialog details.calculator")).not.toHaveAttribute("open", "");
  await expect(page.locator(".date-picker-mobile-value")).toBeHidden();
});

for (const locale of ["en", "zh-CN"] as const) {
  test(`${locale}: Android transaction date uses a fixed visible year-first format`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 457, height: 999 });
    await createLedger(page, locale);
    await useMobilePresentation(page);

    const dialog = page.locator("#transaction-dialog");
    const date = dialog.locator("#transaction-date");
    await date.fill("2026-09-28");
    await expect(date).toHaveValue("2026-09-28");
    const projection = dialog.locator(".date-picker-mobile-value");
    await expect(projection).toBeVisible();
    await expect(projection).toHaveText("2026/09/28");
    await expect(projection).toHaveAttribute("aria-hidden", "true");
    const dateLayers = await dialog.evaluate((element) => {
      const input = element.querySelector<HTMLInputElement>("#transaction-date")!;
      const projection = element.querySelector<HTMLElement>(".date-picker-mobile-value")!;
      return {
        inputZIndex: Number.parseInt(getComputedStyle(input).zIndex, 10),
        projectionZIndex: Number.parseInt(getComputedStyle(projection).zIndex, 10),
        projectionPointerEvents: getComputedStyle(projection).pointerEvents,
      };
    });
    expect(dateLayers.projectionZIndex).toBeGreaterThan(dateLayers.inputZIndex);
    expect(dateLayers.projectionPointerEvents).toBe("none");
    await date.evaluate((input) => input.blur());
    await page.screenshot({ path: testInfo.outputPath("mobile-entry-date-and-close.png") });

    const close = dialog.locator("#close-transaction");
    await expect(close).toHaveAccessibleName(locale === "en" ? "Close" : "关闭");
    await expect(close.locator("svg")).toHaveAttribute("aria-hidden", "true");
    await expect(close).toHaveText("");
    const closeBox = (await close.boundingBox())!;
    expect(closeBox.width).toBe(48);
    expect(closeBox.height).toBe(48);
    const titleBox = (await dialog.locator("#transaction-form-title").boundingBox())!;
    expect(Math.abs((titleBox.y + titleBox.height / 2) - (closeBox.y + closeBox.height / 2))).toBeLessThanOrEqual(1);

    await close.click();
    await expect(dialog).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath("mobile-empty-month.png") });
    await page.locator("#primary-record").click();
    await expect(date).toHaveValue("2026-09-28");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await page.locator("#primary-record").click();
    await expect(dialog.locator(".date-picker-mobile-value")).toHaveText("2026/09/28");

    await dialog.locator("#transaction-amount").fill("14.75");
    await dialog.locator(".mobile-category-grid button").first().click();
    await dialog.locator("#save-transaction").click();
    await expect(dialog).toBeHidden();
    const savedDates = await page.evaluate(async () =>
      (await window.lunaLedger.getSnapshot("2026-09")).transactions.map((transaction) => transaction.date),
    );
    expect(savedDates).toContain("2026-09-28");
  });
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`${locale}: narrow Web entry date is year-first with an aligned square close`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 457, height: 999 });
    await createLedger(page, locale);
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
    await testInfo.attach("narrow-web-entry-date-and-close", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    const close = dialog.locator("#close-transaction");
    await expect(close).toHaveAccessibleName(locale === "en" ? "Close" : "关闭");
    const closeBox = (await close.boundingBox())!;
    const titleBox = (await dialog.locator("#transaction-form-title").boundingBox())!;
    expect(closeBox.width).toBe(48);
    expect(closeBox.height).toBe(48);
    expect(Math.abs((titleBox.y + titleBox.height / 2) - (closeBox.y + closeBox.height / 2))).toBeLessThanOrEqual(1);
    await close.click();
  });
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`${locale}: mobile core inputs, arithmetic and retained drafts fit narrow screens`, async ({ page }) => {
    await page.setViewportSize({ width: 457, height: 999 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await createLedger(page, locale);
    await useMobilePresentation(page);
    const dialog = page.locator("#transaction-dialog");
    const amount = dialog.locator("#transaction-amount");
    await expect(amount).toBeFocused();
    expect(await dialog.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(dialog.locator(".calculator")).toHaveCount(1);
    await expect(amount).toHaveAttribute("inputmode", "none");

    for (const width of [320, 375, 457]) {
      await page.setViewportSize({ width, height: 800 });
      const geometry = await dialog.evaluate((element) => ({
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
        keys: Array.from(element.querySelectorAll(".calculator-grid button")).map((key) => {
          const box = key.getBoundingClientRect();
          return { width: box.width, height: box.height };
        }),
      }));
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
      for (const key of geometry.keys) {
        expect(key.width).toBeGreaterThanOrEqual(48);
        expect(key.height).toBeGreaterThanOrEqual(48);
      }
      for (const selector of ["#choose-category", "#transaction-amount", "#transaction-date", "#save-transaction"]) {
        const control = dialog.locator(selector);
        await expectReachableWithinDialog(dialog, control);
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(48);
      }
    }

    await dialog.locator("#save-transaction").click();
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(amount).toBeFocused();
    await page.keyboard.type("10/3");
    await page.keyboard.press("=");
    await expect(amount).toHaveValue("3.33(3)");
    await expect(amount).toHaveAttribute("aria-invalid", "false");
    await dialog.locator("#choose-category").click();
    await expect(page.locator("#close-category")).toBeFocused();
    await expect(page.locator("#category-search")).not.toBeFocused();
    await expectMobileCategoryTargets(page);
    await page.keyboard.press("Escape");
    await expect(dialog.locator("#choose-category")).toBeFocused();
    await dialog.locator("#choose-category").click();
    await page.getByRole("button", { name: locale === "en" ? "Food" : "餐饮", exact: true }).click();
    await expect(dialog.locator("#choose-category")).toBeFocused();
    await dialog.locator("#transaction-advanced-details summary").click();
    const notes = dialog.locator("#transaction-notes");
    await expect(notes).not.toHaveAttribute("inputmode", "none");
    await notes.fill("Retained mobile draft");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await page.locator("#primary-record").click();
    await expect(amount).toHaveValue("3.33(3)");
    await expect(notes).toHaveValue("Retained mobile draft");
    await dialog.locator("#save-transaction").click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("#transaction-list-region")).toContainText("Retained mobile draft");
    await page.reload();
    await expect(page.locator("#transaction-list-region")).toContainText("3.33");
  });
}

test("mobile image staging protects the save action and commits attachments after readiness", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await createLedger(page);
  await useMobilePresentation(page);
  await page.locator("#transaction-amount").fill("8.50");
  await page.locator("#choose-category").click();
  await page.getByRole("button", { name: "Food", exact: true }).click();
  await page.evaluate(() => {
    const api = window.lunaLedger;
    const stage = api.stageTransactionImage.bind(api);
    const ready = new Promise<void>((resolve) => {
      document.addEventListener("luna:test-image-ready", () => resolve(), { once: true });
    });
    api.stageTransactionImage = async (...args) => {
      await ready;
      return stage(...args);
    };
  });
  await page.locator("#transaction-images").setInputFiles({
    name: "synthetic-pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.locator("#save-transaction")).toBeDisabled();
  await expect(page.locator(".calculator-grid button").first()).toBeDisabled();
  await page.evaluate(() => {
    const form = document.getElementById("transaction-form");
    if (!(form instanceof HTMLFormElement)) throw new Error("Transaction form is missing");
    form.requestSubmit();
  });
  await expect(page.locator("#transaction-dialog")).toBeVisible();
  expect(await page.evaluate(async () => {
    const date = document.getElementById("transaction-date");
    if (!(date instanceof HTMLInputElement)) throw new Error("Transaction date is missing");
    return (await window.lunaLedger.getSnapshot(date.value.slice(0, 7))).transactions.length;
  })).toBe(0);
  await page.evaluate(() => document.dispatchEvent(new Event("luna:test-image-ready")));
  await expect(page.locator(".attachment-preview")).toHaveCount(1);
  await expect(page.locator("#save-transaction")).toBeEnabled();
  await page.locator("#save-transaction").click();
  await expect(page.locator("#transaction-dialog")).toBeHidden();
  await expect(page.locator('[id^="view-images-"]')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('[id^="view-images-"]')).toHaveCount(1);
});
