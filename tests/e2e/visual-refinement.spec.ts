import { expect, test, type Page } from "@playwright/test";

async function createLedger(page: Page, locale: "en" | "zh-CN") {
  await page.clock.install({ time: new Date("2026-10-05T12:00:00Z") });
  await page.goto("/");
  await expect(page.locator("#workspace-form")).toBeVisible();
  await page.evaluate((locale) => window.lunaLedger.updateSettings({ locale }), locale);
  await page.reload();
  await page.locator("#workspace-name").fill("Luna craft fixture");
  await page.locator("#workspace-form button[type=submit]").click();
  await expect(page.locator("#transactions-title")).toBeVisible();
  await page.evaluate(async () => {
    const snapshot = await window.lunaLedger.getSnapshot("2026-10");
    const expense = snapshot.categories!.find((category) => category.type === "expense" && category.enabled)!;
    const income = snapshot.categories!.find((category) => category.type === "income" && category.enabled)!;
    for (const [date, amountMinor, type, category, merchant] of [
      ["2026-10-02", "4000", "expense", expense.id, "Coffee"],
      ["2026-10-03", "1000", "expense", expense.id, "Train"],
      ["2026-10-03", "12345678901", "income", income.id, "Long income amount"],
    ] as const) {
      await window.lunaLedger.createTransaction({
        date, amountMinor, type, splits: [{ category, amountMinor }],
        merchant, paymentMethod: "", notes: "",
      });
    }
  });
  await page.reload();
  await expect(page.locator(".transaction-item")).toHaveCount(3);
}

async function expectNoOverflow(page: Page) {
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    contentWidth: document.documentElement.scrollWidth,
    outside: Array.from(document.querySelectorAll("main *, aside *, nav *")).filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.right > innerWidth + 1;
    }).slice(0, 12).map((element) => `${element.tagName}.${element.className}`),
  }));
  expect(layout.contentWidth, `${page.url()}: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.width);
}

async function expectReadableAccountAction(page: Page) {
  const action = page.locator("#sync-go-to-account");
  await expect(action).toBeVisible();
  const contrast = await action.evaluate((element) => {
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (!channels || channels.length !== 3) throw new Error(`Unsupported computed color: ${color}`);
      const linear = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
    };
    const style = getComputedStyle(element);
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`${locale}: long summaries keep their geometry and privacy across responsive breakpoints`, async ({ page }) => {
    await createLedger(page, locale);
    for (const width of [320, 375, 457, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const before = await page.locator("#summary-grid").boundingBox();
      await expect(page.locator("#income-total")).toHaveText("••••");
      await page.locator("#toggle-income-amounts").click();
      await expect(page.locator("#income-total")).toContainText("123,456,789.01");
      await expectNoOverflow(page);
      const after = await page.locator("#summary-grid").boundingBox();
      expect(after?.height).toBe(before?.height);
      const overlap = await page.evaluate(() => {
        const amount = document.querySelector("#income-total")!.getBoundingClientRect();
        const note = document.querySelector(".summary-card.income .subtext")!.getBoundingClientRect();
        return innerWidth >= 768 && amount.bottom > note.top;
      });
      expect(overlap).toBe(false);
      await page.locator("#toggle-income-amounts").click();
      await expect(page.locator("#income-total")).not.toContainText("123,456,789.01");
    }
  });

  test(`${locale}: narrow statistics prioritizes actual data and keeps all bucket actions accessible`, async ({ page }) => {
    await createLedger(page, locale);
    await page.goto("/statistics?month=2026-10&anchor=2026-10-05");
    const bars = page.locator(".statistics-chart-bar");
    await expect(bars).toHaveCount(31);
    await expect(bars.nth(0)).toHaveAttribute("value", "0");
    await expect(bars.nth(1)).toHaveAttribute("value", "100");
    await expect(bars.nth(2)).toHaveAttribute("value", "25");
    await expect(bars.nth(5)).toHaveAttribute("value", "0");
    expect(await bars.nth(0).evaluate((bar) => getComputedStyle(bar).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    for (const width of [320, 375, 457]) {
      await page.setViewportSize({ width, height: 800 });
      const groups = await page.locator(".statistics-toolbar > .segmented-control").evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      }));
      expect(groups[0]!.bottom).toBeLessThanOrEqual(groups[1]!.top);
      expect(groups[1]!.top).toBe(groups[2]!.top);
      const sizes = await page.locator(".statistics-toolbar button").evaluateAll((buttons) => buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        const label = document.createRange();
        label.selectNodeContents(button);
        const text = label.getBoundingClientRect();
        return { width: rect.width, height: rect.height, textFits: text.left >= rect.left && text.right <= rect.right && text.bottom <= rect.bottom };
      }));
      for (const size of sizes) {
        expect(size.width).toBeGreaterThanOrEqual(44);
        expect(size.height).toBeGreaterThanOrEqual(44);
        expect(size.textFits).toBe(true);
      }
      await expectNoOverflow(page);
    }
    await page.locator("#statistics-bucket-select").selectOption("2026-10-02");
    await expect(page.locator("#statistics-bucket-detail")).toContainText("Coffee");
    await page.locator("#statistics-bucket-next").click();
    await expect(page.locator("#statistics-bucket-detail")).toContainText("Train");
    await page.locator("#statistics-trend-details summary").click();
    await expect(page.locator("#statistics-trend-details")).toHaveAttribute("open", "");
    await page.setViewportSize({ width: 800, height: 375 });
    await expectNoOverflow(page);
  });

  test(`${locale}: reduced motion keeps entry focus and dismissal stable`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await createLedger(page, locale);
    await page.locator("#primary-record").click();
    await expect(page.locator("#transaction-amount")).toBeFocused();
    const motion = await page.locator("#transaction-dialog").evaluate((dialog) => ({
      animation: getComputedStyle(dialog).animationName,
      translate: getComputedStyle(dialog).translate,
    }));
    expect(motion.animation).toBe("none");
    expect(motion.translate).toBe("none");
    expect(await page.locator('[data-slot="dialog-overlay"]').evaluate((overlay) => getComputedStyle(overlay).animationName)).toBe("none");
    await page.keyboard.press("Escape");
    await expect(page.locator("#transaction-dialog")).toBeHidden();
    await expect(page.locator("#primary-record")).toBeFocused();
    await expectNoOverflow(page);
  });

  test(`${locale}: every Web route has a clear page title and remains usable with enlarged text`, async ({ page }) => {
    await createLedger(page, locale);
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const route of ["/luna", "/statistics", "/budget", "/settings", "/settings/preferences", "/settings/account", "/settings/sync", "/settings/backup", "/settings/conflicts", "/settings/categories", "/settings/ledgers", "/settings/sync/advanced"]) {
      await page.goto(route);
      const title = page.locator("main h1:visible");
      await expect(title).toHaveCount(1);
      expect(await title.evaluate((heading) => parseFloat(getComputedStyle(heading).fontSize))).toBeGreaterThanOrEqual(26);
      await expectNoOverflow(page);
      if (route === "/settings/sync") await expectReadableAccountAction(page);
    }
    await page.setViewportSize({ width: 375, height: 800 });
    for (const route of ["/luna", "/statistics", "/settings/preferences", "/settings/account", "/settings/sync"]) {
      await page.goto(route);
      await expect(page.locator("main h1")).toHaveCount(1);
      await page.evaluate(() => document.documentElement.style.fontSize = "200%");
      await expectNoOverflow(page);
      const navigationLabelsFit = await page.locator(".web-sidebar .primary-navigation-link").evaluateAll((buttons) => buttons.every((button) => {
        const rect = button.getBoundingClientRect();
        const label = document.createRange();
        label.selectNodeContents(button.querySelector("span")!);
        const text = label.getBoundingClientRect();
        return text.left >= rect.left && text.right <= rect.right && text.bottom <= rect.bottom;
      }));
      expect(navigationLabelsFit).toBe(true);
      if (route === "/settings/sync") await expectReadableAccountAction(page);
    }
  });
}
