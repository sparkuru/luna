import { expect, test, type Page } from "@playwright/test";

async function seedLedger(page: Page, locale: "en" | "zh-CN"): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#workspace-form")).toBeVisible();
  await page.evaluate(async (requestedLocale) => {
    await window.lunaLedger.updateSettings({ locale: requestedLocale });
    await window.lunaLedger.createWorkspace({
      name: "Narrow Web statistics fixture",
      currency: "CNY",
      precision: 2,
      monthlyBudgetMinor: null,
    });
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    for (const [merchant, amountMinor] of [
      ["Lunch", "3500"],
      ["Commute", "600"],
      ["Groceries", "3500"],
    ] as const) {
      await window.lunaLedger.createTransaction({
        type: "expense",
        date,
        amountMinor,
        splits: [{ category: "expense:0", amountMinor }],
        merchant,
        notes: "",
      });
    }
  }, locale);
  await page.reload();
  await expect(page.locator(".primary-navigation-link")).toHaveCount(3);
  await page.locator(".primary-navigation-link").nth(1).click();
  await expect(page.locator(".statistics-page")).toBeVisible();
}

async function expectViewportGutters(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => {
    const selectors = [
      ".statistics-page > .section-heading",
      ".statistics-page > .statistics-toolbar",
      ".statistics-page > .statistics-grid",
      ".statistics-grid > .statistics-card",
    ];
    const viewportWidth = document.documentElement.clientWidth;
    return selectors.map((selector) => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null) throw new Error(`Missing statistics region: ${selector}`);
      const box = node.getBoundingClientRect();
      return { left: box.left, right: viewportWidth - box.right };
    });
  });

  for (const gutter of geometry) {
    expect(gutter.left).toBeGreaterThanOrEqual(24);
    expect(gutter.right).toBeGreaterThanOrEqual(24);
    expect(Math.abs(gutter.left - gutter.right)).toBeLessThanOrEqual(1);
  }
  for (const edge of ["left", "right"] as const) {
    const values = geometry.map((gutter) => gutter[edge]);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  }
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`${locale}: narrow Web statistics keep aligned 24px gutters`, async ({ page }, testInfo) => {
    await seedLedger(page, locale);

    for (const width of [320, 375, 457]) {
      await page.setViewportSize({ width, height: 999 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expectViewportGutters(page);

      const targets = await page
        .locator("#statistics-previous-period, #statistics-next-period, #statistics-anchor")
        .evaluateAll((nodes) => nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { width: box.width, height: box.height };
        }));
      for (const target of targets) {
        expect(target.width).toBeGreaterThanOrEqual(48);
        expect(target.height).toBeGreaterThanOrEqual(48);
      }

      if (width === 457) {
        const screenshot = await page.screenshot({
          path: `captures/narrow-web-statistics-${locale}.png`,
          fullPage: true,
        });
        await testInfo.attach("narrow-web-statistics", {
          body: screenshot,
          contentType: "image/png",
        });
      }
    }
  });
}
