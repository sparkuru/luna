import { expect, test } from "@playwright/test";

async function createWorkspace(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.locator("#workspace-form")).toBeVisible();
  await page.locator("#workspace-name").fill("Settings navigation household");
  await page.getByRole("button", { name: "Create local ledger" }).click();
  await expect(page.locator("#transaction-list-region")).toBeVisible();
}

async function expectNoHorizontalOverflow(
  page: import("@playwright/test").Page,
  viewportWidth: number,
) {
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(
    dimensions.content,
    `${viewportWidth}px settings surface should not overflow horizontally`,
  ).toBeLessThanOrEqual(dimensions.viewport);
}

test("settings overview owns the Web entry cards and subpages own secondary navigation", async ({
  page,
}) => {
  await createWorkspace(page);

  for (const viewportWidth of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width: viewportWidth, height: 800 });
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("navigation", { name: "Settings" })).toHaveCount(0);
    await expect(page.locator("#settings-group-workspace")).toBeVisible();
    await expect(page.locator("#settings-group-access")).toBeVisible();
    await expect(page.locator("#settings-group-data")).toBeVisible();
    await expect(page.locator('[data-settings-area="budget"]')).toBeVisible();
    await expectNoHorizontalOverflow(page, viewportWidth);
  }

  await page.setViewportSize({ width: 375, height: 800 });
  await page.getByRole("link", { name: /Preferences/ }).click();
  await expect(page).toHaveURL(/\/settings\/preferences$/);
  const settingsNavigation = page.getByRole("navigation", { name: "Settings" });
  await expect(settingsNavigation).toBeVisible();
  await page.locator("#settings-section-switcher summary").click();
  await expect(
    settingsNavigation.getByRole("button", { name: "Preferences", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#settings-language")).toBeVisible();
  await expectNoHorizontalOverflow(page, 375);

  await settingsNavigation.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
});
