import { expect, test } from '@playwright/test';

test.describe('workspace setup visual polish', () => {
  test.describe('desktop welcome layout', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('centers the welcome copy above the setup card and creates a workspace', async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.locator('#workspace-form')).toBeVisible();

      const geometry = await page.evaluate(() => {
        const readBox = (selector: string) => {
          const element = document.querySelector(selector);
          if (!(element instanceof HTMLElement)) return null;
          const rect = element.getBoundingClientRect();
          return {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            width: rect.width,
          };
        };
        return {
          viewportWidth: window.innerWidth,
          copy: readBox('.setup-copy'),
          card: readBox('.setup-card'),
        };
      });

      expect(geometry.copy).not.toBeNull();
      expect(geometry.card).not.toBeNull();
      expect(geometry.copy?.bottom ?? 0).toBeLessThanOrEqual(
        geometry.card?.top ?? -1,
      );
      expect(
        Math.abs(
          ((geometry.copy?.left ?? 0) + (geometry.copy?.right ?? 0)) / 2 -
            ((geometry.card?.left ?? 0) + (geometry.card?.right ?? 0)) / 2,
        ),
      ).toBeLessThanOrEqual(1);
      expect(geometry.card?.width ?? geometry.viewportWidth + 1).toBeLessThanOrEqual(
        672,
      );
      const submitBox = await page.locator('#workspace-form button[type="submit"]').boundingBox();
      const noteBox = await page.locator('.setup-note').boundingBox();
      expect((noteBox?.y ?? 0) - ((submitBox?.y ?? 0) + (submitBox?.height ?? 0)))
        .toBeGreaterThanOrEqual(16);

      await expect(page.locator('#workspace-currency option[value="CNY"]')).toHaveCount(1);
      await expect(page.locator('.setup-note')).toContainText('saved on this device');
      await page.getByLabel('Ledger name').fill('Centered welcome household');
      await page.getByRole('button', { name: 'Create local ledger' }).click();
      await expect(page.locator('#transactions-title')).toHaveText('Recent ledger');
    });
  });

  test('keeps the setup form single-column and free of horizontal overflow at 375px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    await expect(page.locator('#workspace-form')).toBeVisible();

    const dimensions = await page.evaluate(() => {
      const card = document.querySelector('.setup-card')?.getBoundingClientRect();
      const shell = document.querySelector('.setup-shell')?.getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        cardLeft: card?.left ?? -1,
        cardRight: card?.right ?? Number.POSITIVE_INFINITY,
        shellWidth: shell?.width ?? Number.POSITIVE_INFINITY,
      };
    });

    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    expect(dimensions.cardLeft).toBeGreaterThanOrEqual(0);
    expect(dimensions.cardRight).toBeLessThanOrEqual(dimensions.clientWidth);
    expect(dimensions.shellWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await expect(page.locator('#workspace-currency')).toBeVisible();
    await expect(page.locator('#workspace-precision')).toBeHidden();
    await page.locator('#setup-advanced summary').click();
    await expect(page.locator('#workspace-precision')).toBeVisible();
    await expect(page.locator('#workspace-budget')).toBeVisible();
  });

  test('offers recovery actions without a dead Settings control before a workspace exists', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#workspace-form')).toBeVisible();
    await expect(page.locator('#open-secondary-menu')).toHaveCount(0);
    await expect(page.locator('#setup-restore')).toBeVisible();
    await expect(page.locator('#setup-connect')).toBeVisible();
    await expect(page.locator('.setup-note')).toContainText('actions above');

    await page.locator('#setup-restore').click();
    await expect(page.locator('#setup-back')).toBeVisible();
    await expect(page.locator('#open-secondary-menu')).toHaveCount(0);
    await page.locator('#setup-back').click();
    await expect(page.locator('#workspace-form')).toBeVisible();

    await page.locator('#setup-connect').click();
    await expect(page.locator('#server-login-form')).toBeVisible();
    await expect(page.locator('#workspace-form')).toHaveCount(0);
    await page.locator('#setup-back').click();
    await expect(page.locator('#workspace-form')).toBeVisible();

    await page.evaluate(() => window.lunaLedger.updateSettings({ locale: 'zh-CN' }));
    await page.reload();
    await expect(page.locator('#open-secondary-menu')).toHaveCount(0);
    await expect(page.locator('#setup-restore')).toBeVisible();
    await expect(page.locator('#setup-connect')).toBeVisible();
    await expect(page.locator('.setup-note')).toContainText('上方入口');
  });
});

test('invalid advanced precision reopens its control and a corrected custom precision is saved', async ({ page }) => {
  await page.goto('/');
  await page.locator('#workspace-name').fill('Custom precision');
  await page.locator('#setup-advanced summary').click();
  await page.locator('#workspace-precision').fill('5');
  await page.locator('#setup-advanced summary').click();
  await page.locator('#workspace-form button[type="submit"]').click();
  await expect(page.locator('#setup-advanced')).toHaveAttribute('open', '');
  await expect(page.locator('#workspace-precision')).toBeFocused();
  await expect(page.locator('#workspace-precision')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#workspace-precision').fill('3');
  await expect(page.locator('#setup-alert')).toBeEmpty();
  await page.locator('#workspace-form button[type="submit"]').click();
  await expect(page.locator('#primary-record')).toBeVisible();
  const workspace = await page.evaluate(async () => (await window.lunaLedger.getSnapshot(new Date().toISOString().slice(0, 7))).workspace);
  expect(workspace?.precision).toBe(3);
});
