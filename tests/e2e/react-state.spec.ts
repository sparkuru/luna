import { expect, test, type Page } from "@playwright/test";
async function ready(page: Page) {
  await page.goto("/");
  await page.locator("#workspace-name").fill("React state fixture");
  await page.locator('#workspace-form button[type="submit"]').click();
  await expect(page.locator("#transactions-title")).toBeVisible();
}
test("committed transaction is never replayed when its refresh fails", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => {
    const api = window.lunaLedger;
    const create = api.createTransaction.bind(api);
    const snapshot = api.getSnapshot.bind(api);
    let fail = false;
    api.createTransaction = async (draft) => {
      const result = await create(draft);
      fail = true;
      return result;
    };
    api.getSnapshot = async (month) => {
      if (fail) {
        fail = false;
        throw new Error("LUNA_ERROR:web-storage-unavailable");
      }
      return snapshot(month);
    };
  });
  await page.locator("#primary-record").click();
  await page.locator("#transaction-amount").fill("12.34");
  await page.locator("#transaction-category").fill("Saved once");
  await page.locator("#save-transaction").click();
  await expect(page.locator("#live-status")).toContainText(
    "Saved locally, but refreshing failed",
  );
  await expect(page.locator("#transaction-dialog")).not.toBeVisible();
  await page.reload();
  await expect(
    page.locator("#transaction-list-region .transaction-item"),
  ).toHaveCount(1);
  await expect(page.locator("#transaction-list-region")).toContainText(
    "Saved once",
  );
});
test("Radix dialogs retain keyboard focus without inline stylesheet CSP exceptions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { lunaViolations: string[] }).lunaViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { lunaViolations: string[] }).lunaViolations.push(
        event.violatedDirective,
      );
    });
  });
  await ready(page);
  await page.locator("#primary-record").click();
  await expect(page.locator("#transaction-amount")).toBeFocused();
  await page.locator("#choose-category").click();
  await expect(page.locator("#category-custom")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#choose-category")).toBeFocused();
  await page.locator("#choose-category").click();
  await page.locator("#category-custom").fill("Focus category");
  await page.locator("#use-category").click();
  await expect(page.locator("#choose-category")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#primary-record")).toBeFocused();
  expect(
    await page.evaluate(
      () => (window as unknown as { lunaViolations: string[] }).lunaViolations,
    ),
  ).toEqual([]);
});
test("validated month and type deep links leave free text filters out of history", async ({
  page,
}) => {
  await ready(page);
  await page.goto("/ledger?month=2026-03&type=income");
  await expect(page.locator("#month-picker")).toHaveValue("2026-03");
  await page.locator("#filter-details summary").click();
  await expect(page.locator("#filter-type")).toHaveValue("income");
  await page.locator("#filter-query").fill("private search sentinel");
  await page.locator("#filter-category").fill("private category sentinel");
  expect(page.url()).not.toContain("sentinel");
  await page.goto("/ledger?month=invalid&type=invalid");
  await expect(page.locator("#month-picker")).not.toHaveValue("invalid");
  await page.locator("#filter-details summary").click();
  await expect(page.locator("#filter-type")).toHaveValue("all");
  await page.goto("/ledger/menu/settings");
  await expect(page).toHaveURL(/\/settings\/preferences$/);
  await expect(page.locator("#settings-language")).toBeVisible();
  await page.goto("/ledger");
  await expect(page).toHaveURL(/\/ledger$/);
});

test("month navigation scopes the ledger to the selected month", async ({
  page,
}) => {
  await ready(page);
  const currentMonth = await page.locator("#month-picker").inputValue();
  const year = Number(currentMonth.slice(0, 4));
  const monthNumber = Number(currentMonth.slice(5, 7));
  const previousDate = new Date(year, monthNumber - 2, 15);
  const previousMonth = `${previousDate.getFullYear()}-${String(
    previousDate.getMonth() + 1,
  ).padStart(2, "0")}`;
  await page.evaluate(async ({ currentMonth, previousMonth }) => {
    await window.lunaLedger.createTransaction({
      type: "expense",
      amountMinor: "1200",
      date: `${currentMonth}-05`,
      splits: [{ category: "Current month record", amountMinor: "1200" }],
    });
    await window.lunaLedger.createTransaction({
      type: "expense",
      amountMinor: "3400",
      date: `${previousMonth}-15`,
      splits: [{ category: "Previous month record", amountMinor: "3400" }],
    });
  }, { currentMonth, previousMonth });
  await page.reload();
  await expect(page.locator("#transaction-list-region")).toContainText(
    "Current month record",
  );
  await expect(page.locator("#transaction-list-region")).not.toContainText(
    "Previous month record",
  );

  await page.locator("#previous-month").click();
  await expect(page.locator("#month-picker")).toHaveValue(previousMonth);
  await expect(page.locator("#transactions-title")).toBeVisible();
  await expect(page.locator("#transaction-list-region")).toContainText(
    "Previous month record",
  );
  await expect(page.locator("#transaction-list-region")).not.toContainText(
    "Current month record",
  );
});

test("empty regex mode keeps the unfiltered ledger visible", async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (const [category, amountMinor] of [['Regex one', '100'], ['Regex two', '200']] as const) {
      await window.lunaLedger.createTransaction({
        type: 'expense',
        amountMinor,
        date,
        splits: [{ category, amountMinor }],
      });
    }
  });
  await page.reload();
  await expect(page.locator('#transaction-list-region .transaction-item')).toHaveCount(2);
  await page.locator('#filter-details summary').click();
  await page.locator('#filter-regex').check();
  await expect(page.locator('#transaction-list-region .transaction-item')).toHaveCount(2);
  await expect(page.locator('[role="alert"]')).toHaveText('');
});

test("route blocker preserves a budget draft until the user discards it", async ({
  page,
}) => {
  await ready(page);
  await page.goto("/budget");
  await page.locator("#budget-input").fill("321.09");
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(page).toHaveURL(/\/budget$/);
  await expect(page.locator("#budget-input")).toHaveValue("321.09");
  page.once("dialog", (dialog) => void dialog.accept());
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.locator("#budget-input")).toHaveCount(0);
});

test("native back closes nested dialogs and follows menu parents before leaving the app", async ({
  page,
}) => {
  await ready(page);
  const back = () =>
    page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent("luna:navigate-back", { cancelable: true }),
      ),
    );
  await page.locator("#primary-record").click();
  await page.locator("#transaction-amount").fill("45.67");
  await page.locator("#choose-category").click();
  await expect(page.locator("#category-custom")).toBeFocused();
  expect(await back()).toBe(false);
  await expect(page.locator("#category-dialog")).not.toBeVisible();
  await expect(page.locator("#transaction-dialog")).toBeVisible();
  expect(await back()).toBe(false);
  await expect(page.locator("#transaction-dialog")).not.toBeVisible();
  await page.locator("#primary-record").click();
  await expect(page.locator("#transaction-amount")).toHaveValue("45.67");
  expect(await back()).toBe(false);
  await page.locator("#open-secondary-menu").click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("navigation", { name: "Settings" }).getByRole("button", { name: "Preferences", exact: true }).click();
  expect(await back()).toBe(false);
  await expect(page).toHaveURL(/\/settings$/);
  expect(await back()).toBe(false);
  await expect(page).toHaveURL(/\/ledger$/);
  expect(await back()).toBe(true);
});

test("an older settings query cannot overwrite a confirmed locale update", async ({
  page,
}) => {
  await ready(page);
  await page.goto("/settings/preferences");
  await expect(page.locator("#settings-language")).toBeVisible();
  await page.evaluate(async () => {
    const api = window.lunaLedger;
    const getSettings = api.getSettings.bind(api);
    const fixture = window as unknown as {
      oldSettingsStarted: boolean;
      releaseOldSettings?: () => void;
    };
    fixture.oldSettingsStarted = false;
    let first = true;
    api.getSettings = async () => {
      const result = await getSettings();
      if (first) {
        first = false;
        fixture.oldSettingsStarted = true;
        await new Promise<void>((resolve) => {
          fixture.releaseOldSettings = resolve;
        });
      }
      return result;
    };
    await api.updateSettings({ locale: "en" });
    // This accepted projection deliberately emits no extra notification: the
    // renderer must cancel the existing read when publishing the return value.
    api.updateSettings = async (input) => ({
      ...(await getSettings()),
      ...input,
    });
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { oldSettingsStarted: boolean })
            .oldSettingsStarted,
      ),
    )
    .toBe(true);
  await page.locator("#settings-language").selectOption("zh-CN");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  // Let the notification's refetch encounter the existing delayed request first.
  await page.waitForTimeout(150);
  await page.evaluate(() =>
    (
      window as unknown as { releaseOldSettings: () => void }
    ).releaseOldSettings(),
  );
  await page.waitForTimeout(50);
  await expect(page.locator("#settings-language")).toHaveValue("zh-CN");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});
