import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createApp } from '../../src/server/app';
import { setAccount } from '../../src/server/auth';
import { MemoryServerObjectStore } from '../../src/server/storage/object-store';
import { openTestDatabase } from '../server/support';

async function welcome(page: Page, locale: 'en' | 'zh-CN') {
  await page.goto('/');
  await expect(page.locator('#workspace-form')).toBeVisible();
  await page.evaluate(locale => window.lunaLedger.updateSettings({ locale }), locale);
  await page.reload();
  await expect(page.locator('#workspace-form')).toBeVisible();
}

async function createLedger(page: Page) {
  await page.locator('#workspace-name').fill('Mobile experience');
  await page.locator('#workspace-form button[type="submit"]').click();
  await expect(page.locator('#primary-record')).toBeVisible();
}

async function fullyInViewport(locator: Locator, width: number, height: number) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height);
}

for (const locale of ['en', 'zh-CN'] as const) {
  test(`${locale}: mobile preferences prioritize controls and retain keyboard section switching`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await welcome(page, locale);
    await createLedger(page);
    await page.locator('#open-secondary-menu').click();
    await page.locator('[data-settings-area="preferences"]').click();
    await expect(page).toHaveURL(/\/settings\/preferences$/);
    await fullyInViewport(page.locator('#settings-language'), 375, 800);
    await fullyInViewport(page.locator('label[for="hide-default"]'), 375, 800);
    const switcher = page.locator('#settings-section-switcher');
    await expect(switcher).not.toHaveAttribute('open', '');
    await expect(page.locator('.settings-navigation-desktop')).toBeHidden();
    const summary = switcher.locator('summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(switcher).toHaveAttribute('open', '');
    await expect(switcher.locator('[aria-current="page"]')).toHaveCount(1);
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(switcher).not.toHaveAttribute('open', '');
    await summary.press('Enter');
    await switcher.getByRole('button', { name: locale === 'en' ? 'Encrypted backup' : '加密备份', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/backup$/);
    await expect(switcher).not.toHaveAttribute('open', '');
    await page.goBack();
    await expect(page).toHaveURL(/\/settings\/preferences$/);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await fullyInViewport(page.locator('#settings-title'), 320, 568);
    await fullyInViewport(page.locator('#settings-language'), 320, 568);
    await page.locator('.settings-navigation-mobile > button').click();
    await expect(page).toHaveURL(/\/settings$/);
    const boxes = await page.locator('.primary-navigation-link:visible').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }));
    expect(boxes).toHaveLength(3);
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(box.width - boxes[0]!.width)).toBeLessThan(1);
    }
    await page.locator('[data-settings-area="preferences"]').click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('.settings-navigation-desktop')).toBeVisible();
    await expect(page.locator('.settings-navigation-mobile')).toBeHidden();
    await expect(page.locator('.settings-navigation-desktop [aria-current="page"]')).toHaveCount(1);
    expect(await page.locator('.settings-navigation-desktop .settings-navigation-group:visible').count()).toBeGreaterThan(1);
  });

  test(`${locale}: every statistics day is reachable through large controls and text details`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await welcome(page, locale);
    await createLedger(page);
    await page.locator('.primary-navigation-link').nth(1).click();
    await page.locator('#statistics-period-month').click();
    const select = page.locator('#statistics-bucket-select');
    await expect(select).toBeVisible();
    const days = await select.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(Boolean));
    expect(days.length).toBeGreaterThanOrEqual(28);
    for (const day of days) {
      await select.selectOption(day);
      await expect(select).toHaveValue(day);
      await expect(page.locator('#statistics-bucket-detail')).toBeVisible();
      await expect(page.locator(`.statistics-chart-button[aria-pressed="true"]`)).toHaveCount(1);
    }
    await expect(page.locator('#statistics-bucket-next')).toBeDisabled();
    await select.selectOption(days[0]!);
    await expect(page.locator('#statistics-bucket-previous')).toBeDisabled();
    await page.locator('#statistics-bucket-next').click();
    await expect(select).toHaveValue(days[1]!);
    await page.locator('#statistics-bucket-previous').click();
    await expect(select).toHaveValue(days[0]!);
    for (const id of ['statistics-bucket-select', 'statistics-bucket-previous', 'statistics-bucket-next']) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('#statistics-trend-details summary').click();
    await expect(page.locator('#statistics-trend-details')).toHaveAttribute('open', '');
    expect(await page.locator('#statistics-trend-details button').count()).toBe(days.length);
  });

  test(`${locale}: setup defaults precision by currency and keeps advanced precision editable`, async ({ page }) => {
    await welcome(page, locale);
    await expect(page.locator('#workspace-precision')).toBeHidden();
    await expect(page.locator('label[for="workspace-budget"]')).toContainText(locale === 'en' ? /optional/i : /可选/);
    for (const [currency, precision] of [['JPY', '0'], ['CNY', '2'], ['USD', '2'], ['EUR', '2']] as const) {
      await page.locator('#workspace-currency').selectOption(currency);
      await expect(page.locator('#workspace-precision')).toHaveValue(precision);
      await expect(page.locator('#setup-precision-summary')).toContainText(precision);
    }
    await page.locator('#setup-advanced summary').click();
    await page.locator('#workspace-precision').fill('3');
    await expect(page.locator('#setup-precision-summary')).toContainText('3');
    await page.locator('#workspace-currency').selectOption('JPY');
    await createLedger(page);
    const workspace = await page.evaluate(async () => (await window.lunaLedger.getSnapshot('2026-09')).workspace);
    expect(workspace).toMatchObject({ currency: 'JPY', precision: 0 });
  });

  test(`${locale}: account secrets start hidden, toggle accessibly and clear after real login`, async ({ page, baseURL }) => {
    const database = await openTestDatabase();
    const username = `mobile_${randomUUID().slice(0, 8)}`;
    const password = 'synthetic-mobile-password-123';
    await setAccount(database, username, password);
    const app = await createApp({ database, objectStore: new MemoryServerObjectStore(), origins: [new URL(baseURL!).origin] });
    const apiUrl = await app.listen({ host: '127.0.0.1', port: 0 });
    try {
      await welcome(page, locale);
      await page.locator('#setup-connect').click();
      await expect(page.locator('#server-connection-help')).not.toHaveAttribute('open', '');
      await expect(page.locator('#server-session-help')).not.toHaveAttribute('open', '');
      await expect(page.locator('#server-sync-guide')).toHaveCount(0);
      const field = page.locator('#server-login-password');
      const toggle = page.locator('#server-login-password-visibility');
      await expect(field).toHaveAttribute('type', 'password');
      await expect(toggle).toHaveAttribute('aria-controls', 'server-login-password');
      await page.locator('#server-url').fill(apiUrl);
      await page.locator('#server-username').fill(username);
      await field.fill(password);
      await toggle.click();
      await expect(field).toHaveAttribute('type', 'text');
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await page.locator('#server-login').click();
      await expect(page.locator('#server-account-name')).toHaveText(username);
      expect(await page.locator('input[data-secret="true"]').evaluateAll(inputs => inputs.every(input => (input as HTMLInputElement).value === ''))).toBe(true);
      await expect(page.locator('#server-sync-guide')).not.toHaveAttribute('open', '');
      await page.locator('#server-logout').click();
      await expect(field).toHaveValue('');
      await expect(field).toHaveAttribute('type', 'password');
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await app.close();
      database.close();
    }
  });
}
