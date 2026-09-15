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

      await expect(page.locator('#workspace-currency option[value="CNY"]')).toHaveCount(1);
      await expect(page.locator('.setup-note')).toContainText('saved on this device');
      await page.getByLabel('Workspace name').fill('Centered welcome household');
      await page.getByRole('button', { name: 'Create local workspace' }).click();
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
    await expect(page.locator('#workspace-precision')).toBeVisible();
    await expect(page.locator('#workspace-budget')).toBeVisible();
  });
});
