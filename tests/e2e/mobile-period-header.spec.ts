import { expect, test, type Page } from "@playwright/test";
import { formatDate, formatMonth } from "../../src/renderer/i18n";

type Locale = "en" | "zh-CN";

// Browser geometry and native-input semantics only. Android picker and actual
// WebView painting are verified separately on the installed APK.
async function ready(page: Page, locale: Locale) {
  await page.goto("/");
  await expect(page.locator("#workspace-form")).toBeVisible();
  await page.evaluate(async (locale) => {
    await window.lunaLedger.updateSettings({ locale });
    await window.lunaLedger.createWorkspace({ name: "Native period fixture", currency: "CNY", precision: 2, monthlyBudgetMinor: null });
  }, locale);
  await page.reload();
  await expect(page.locator("#primary-record")).toBeVisible();
  await page.evaluate(() => { document.documentElement.dataset.clientSurface = "mobile"; });
  await page.locator("#primary-record").click();
  await page.locator("#close-transaction").click();
}

async function checkPeriod(page: Page, id: string, locale: Locale) {
  const input = page.locator(`#${id}`);
  const projection = page.locator(".native-period-value");
  const type = await input.getAttribute("type");
  const value = await input.inputValue();
  await expect(projection).toHaveText(type === "month" ? formatMonth(locale, value) : formatDate(locale, value));
  await expect(projection).toHaveAttribute("aria-hidden", "true");
  expect(await input.evaluate(element => {
    const input = element as HTMLInputElement;
    const box = input.getBoundingClientRect();
    const wrapper = input.parentElement!;
    const painted = wrapper.querySelector(".native-period-value")!;
    const range = document.createRange();
    range.selectNodeContents(painted);
    const text = range.getBoundingClientRect();
    const marker = wrapper.querySelector(".native-period-indicator")!.getBoundingClientRect();
    return { width: box.width, height: box.height,
      centered: Math.abs(text.x + text.width / 2 - (box.x + box.width / 2)),
      hitCenter: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === input,
      hitIndicator: document.elementFromPoint(marker.x + marker.width / 2, marker.y + marker.height / 2) === input,
      opacity: getComputedStyle(input).opacity,
      overflow: document.documentElement.scrollWidth > innerWidth };
  })).toMatchObject({ centered: expect.any(Number), hitCenter: true, hitIndicator: true, opacity: "0", overflow: false });
  const box = (await input.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(box.height).toBeGreaterThanOrEqual(48);
  expect(Math.abs(box.x + box.width / 2 - (page.viewportSize()!.width / 2))).toBeLessThan(2);
  const textCenter = await input.evaluate(element => {
    const span = element.parentElement!.querySelector(".native-period-value")!;
    const range = document.createRange(); range.selectNodeContents(span);
    const text = range.getBoundingClientRect();
    const input = element.getBoundingClientRect();
    return Math.abs(text.x + text.width / 2 - input.x - input.width / 2);
  });
  expect(textCenter).toBeLessThan(2);
  await input.focus();
  await expect(input).toBeFocused();
  expect(await input.evaluate(element => getComputedStyle(element.parentElement!).outlineStyle)).toBe("solid");
  return box.y;
}

async function checkArrows(page: Page, statistics: boolean, locale: Locale, period: "month" | "week" | "year" = "month") {
  const previous = page.locator(statistics ? "#statistics-previous-period" : "#previous-month");
  const next = page.locator(statistics ? "#statistics-next-period" : "#next-month");
  const labels: Record<"month" | "week" | "year", readonly [string, string]> = locale === "en"
    ? { month: ["Previous month", "Next month"], week: ["Previous week", "Next week"], year: ["Previous year", "Next year"] }
    : { month: ["上个月", "下个月"], week: ["上一周", "下一周"], year: ["上一年", "下一年"] };
  await expect(previous).toHaveAccessibleName(labels[period][0]);
  await expect(next).toHaveAccessibleName(labels[period][1]);
  const input = (await page.locator(statistics ? "#statistics-anchor" : "#month-picker").boundingBox())!;
  const geometry = [];
  for (const arrow of [previous, next]) {
    await expect(arrow).toBeVisible();
    await expect(arrow).toBeEnabled();
    const box = (await arrow.boundingBox())!;
    expect(box.width).toBe(48);
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(Math.abs(box.y + box.height / 2 - input.y - input.height / 2)).toBeLessThan(2);
    const icon = (await arrow.locator("svg").boundingBox())!;
    expect(Math.abs(icon.x + icon.width / 2 - box.x - box.width / 2)).toBeLessThan(2);
    expect(Math.abs(icon.y + icon.height / 2 - box.y - box.height / 2)).toBeLessThan(2);
    geometry.push({ x: box.x, y: box.y, iconWidth: icon.width, iconHeight: icon.height });
  }
  return geometry;
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`${locale}: native period value is centered independently of input internals and retains full picker hit area`, async ({ page }) => {
    await ready(page, locale);
    for (const width of [320, 375, 457]) {
      await page.setViewportSize({ width, height: 999 });
      const tops: number[] = [];
      const arrows = [];
      for (const index of [0, 1, 2]) {
        await page.locator(".primary-navigation-link").nth(index).click();
        const id = index === 1 ? "statistics-anchor" : "month-picker";
        await expect(page.locator(`#${id}`)).toHaveAccessibleName(locale === "en" ? "Selected month" : "所选月份");
        tops.push(await checkPeriod(page, id, locale));
        arrows.push(await checkArrows(page, index === 1, locale));
        await page.screenshot({ path: `captures/mobile-redesign-browser/native-period-${index}-${locale}-${width}.png` });
      }
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
      expect(arrows[1]).toEqual(arrows[0]);
      expect(arrows[2]).toEqual(arrows[0]);
      await page.locator(".primary-navigation-link").nth(1).click();
      for (const period of ["week", "year"] as const) {
        await page.locator(`#statistics-period-${period}`).click();
        await expect(page.locator("#statistics-anchor")).toHaveAttribute("type", "date");
        await checkPeriod(page, "statistics-anchor", locale);
        await checkArrows(page, true, locale, period);
      }
      await page.locator("#statistics-period-month").click();
    }
  });

  test(`${locale}: statistics period arrows keep Router month, week and clamped leap-year dates aligned with native inputs`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 999 });
    await ready(page, locale);
    await page.locator(".primary-navigation-link").nth(1).click();
    const anchor = page.locator("#statistics-anchor");
    const previous = page.locator("#statistics-previous-period");
    const next = page.locator("#statistics-next-period");
    async function expectRoute(value: string, period: "month" | "week" | "year") {
      await expect(anchor).toHaveValue(value);
      const search = new URL(page.url()).searchParams;
      expect(search.get("month")).toBe(value.slice(0, 7));
      expect(search.get("anchor")).toBe(period === "month" ? `${value}-01` : value);
      if (period !== "month") expect(search.get("period")).toBe(period);
      await checkPeriod(page, "statistics-anchor", locale);
    }
    await anchor.fill("2025-12");
    await next.click();
    await expectRoute("2026-01", "month");
    await previous.click();
    await expectRoute("2025-12", "month");
    await previous.click();
    await expectRoute("2025-11", "month");
    for (const index of [0, 2]) {
      await page.locator(".primary-navigation-link").nth(index).click();
      await expect(page.locator("#month-picker")).toHaveValue("2025-11");
    }
    await page.locator(".primary-navigation-link").nth(1).click();
    await expect(anchor).toHaveValue("2025-11");

    await page.locator("#statistics-period-week").click();
    await anchor.fill("2026-01-02");
    await previous.click();
    await expectRoute("2025-12-26", "week");
    await next.click();
    await expectRoute("2026-01-02", "week");
    await next.click();
    await expectRoute("2026-01-09", "week");
    await checkArrows(page, true, locale, "week");

    await page.locator("#statistics-period-year").click();
    await anchor.fill("2024-02-29");
    await previous.click();
    await expectRoute("2023-02-28", "year");
    await next.click();
    await expectRoute("2024-02-28", "year");
    await anchor.fill("2024-02-29");
    await next.click();
    await expectRoute("2025-02-28", "year");
    await checkArrows(page, true, locale, "year");
    await expect(page.locator("#statistics-anchor")).toHaveAttribute("type", "date");
  });
}
