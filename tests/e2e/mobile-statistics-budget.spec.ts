import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { previousMonth } from "../../src/shared/domain";

// Select only the native presentation on a real browser host. These are not
// evidence of Android month dialogs, system BACK, or its on-screen keyboard.
async function ready(page: Page, locale: "en" | "zh-CN") {
  await page.goto("/");
  await expect(page.locator("#workspace-form")).toBeVisible();
  const month = await page.evaluate(async (locale) => {
    await window.lunaLedger.updateSettings({ locale });
    await window.lunaLedger.createWorkspace({
      name: "Statistics and budget fixture",
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
    return date.slice(0, 7);
  }, locale);
  await page.reload();
  await expect(page.locator(".transaction-item")).toHaveCount(3);
  await page.evaluate(() => {
    document.documentElement.dataset.clientSurface = "mobile";
  });
  await page.locator("#primary-record").click();
  await page.locator("#close-transaction").click();
  await expect(page.locator(".primary-navigation-link")).toHaveCount(4);
  return month;
}

async function route(page: Page, path: "/statistics" | "/budget" | "/luna") {
  await page
    .locator(".primary-navigation-link")
    .nth(path === "/luna" ? 0 : path === "/statistics" ? 1 : 2)
    .click();
}

async function openEditor(page: Page) {
  await page.locator("#open-budget-editor").click();
  await expect(page.locator("#budget-input")).toBeVisible();
}

async function expectStatisticsSideGutters(page: Page) {
  const geometry = await page.evaluate(() => {
    const section = document.querySelector<HTMLElement>(".statistics-page")!;
    const selectors = [
      ".statistics-page > .section-heading",
      ".statistics-page > .statistics-toolbar",
      ".statistics-page > .statistics-grid",
      ".statistics-grid > .statistics-card",
    ];
    const sectionBox = section.getBoundingClientRect();
    return selectors.map((selector) => {
      const box = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      return {
        left: box.left - sectionBox.left,
        right: sectionBox.right - box.right,
      };
    });
  });
  for (const gutter of geometry) {
    expect(gutter.left).toBeGreaterThanOrEqual(15);
    expect(gutter.right).toBeGreaterThanOrEqual(15);
    expect(Math.abs(gutter.left - gutter.right)).toBeLessThanOrEqual(1);
  }
  for (const edge of ["left", "right"] as const) {
    const values = geometry.map((gutter) => gutter[edge]);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  }
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`${locale}: each invalid budget submit restores focus without a background refresh stealing it`, async ({
    page,
  }) => {
    const month = await ready(page, locale);
    await route(page, "/budget");
    await openEditor(page);
    await page.locator("#budget-input").fill("12.345");
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.locator("#save-budget").click();
      await expect(page.locator("#budget-alert")).not.toBeEmpty();
      await expect(page.locator("#budget-input")).toBeFocused();
      await expect(page.locator("#budget-input")).toHaveValue("12.345");
    }
    await page.locator("#month-picker").focus();
    const committed = await page.evaluate(async (month) => {
      const before = await window.lunaLedger.getSnapshot(month);
      await window.lunaLedger.setMonthlyBudget(
        month,
        "20000",
        before.budgetHeadIds,
      );
      return window.lunaLedger.getSnapshot(month);
    }, month);
    await expect(page.locator("#budget-status")).toContainText("200.00");
    await expect(page.locator("#month-picker")).toBeFocused();
    await expect(page.locator("#budget-input")).toHaveValue("12.345");
    await page.locator("#budget-input").fill("123.45");
    await page.locator("#save-budget").click();
    await expect(page.locator("#budget-alert")).not.toBeEmpty();
    await expect(page.locator("#budget-input")).toBeEnabled();
    await expect(page.locator("#budget-input")).toBeFocused();
    await expect(page.locator("#budget-input")).toHaveValue("123.45");
    const after = await page.evaluate(
      (month) => window.lunaLedger.getSnapshot(month),
      month,
    );
    expect(after.budgetHeadIds).toEqual(committed.budgetHeadIds);
    expect(after.summary?.budgetMinor).toBe("20000");
  });

  test(`${locale}: mobile statistics start with compact true totals and categories, keeping all days selectable`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 457, height: 999 });
    const month = await ready(page, locale);
    await route(page, "/statistics");
    await expectStatisticsSideGutters(page);
    await expect(page.locator("#statistics-anchor")).toHaveAttribute(
      "type",
      "month",
    );
    await expect(page.locator(".statistics-total")).toContainText("76.00");
    await expect(page.locator("#statistics-trend-details")).not.toHaveAttribute(
      "open",
      "",
    );
    const frame = await page.evaluate(() => ({
      categoryBottom: document
        .querySelector(".statistics-category-row")!
        .getBoundingClientRect().bottom,
      navigationTop: document
        .querySelector(".primary-navigation")!
        .getBoundingClientRect().top,
    }));
    expect(frame.categoryBottom).toBeLessThan(frame.navigationTop);
    await page.screenshot({
      path: `captures/mobile-redesign-browser/statistics-${locale}-457.png`,
      fullPage: true,
    });
    await writeFile(
      `captures/mobile-redesign-browser/statistics-${locale}-geometry.json`,
      JSON.stringify(frame),
    );
    await testInfo.attach("category-first-screen", {
      body: JSON.stringify(frame),
      contentType: "application/json",
    });
    const days = await page
      .locator("#statistics-bucket-select option")
      .evaluateAll((options) =>
        options.slice(1).map((option) => (option as HTMLOptionElement).value),
      );
    expect(days).toHaveLength(
      new Date(
        Number(month.slice(0, 4)),
        Number(month.slice(5, 7)),
        0,
      ).getDate(),
    );
    for (const day of days) {
      await page.locator("#statistics-bucket-select").selectOption(day);
      await expect(page.locator("#statistics-bucket-detail")).toBeVisible();
      await expect(
        page.locator(".statistics-chart-button[aria-pressed=true]"),
      ).toHaveCount(1);
    }
    await expect(page.locator("#statistics-bucket-next")).toBeDisabled();
    await page.locator("#statistics-bucket-select").selectOption(days[0]!);
    await expect(page.locator("#statistics-bucket-previous")).toBeDisabled();
    await page.locator("#statistics-bucket-next").click();
    await expect(page.locator("#statistics-bucket-select")).toHaveValue(
      days[1]!,
    );
    await page.locator("#statistics-trend-details > summary").click();
    await expect(page.locator("#statistics-trend-details button")).toHaveCount(
      days.length,
    );
    for (const id of [
      "statistics-bucket-select",
      "statistics-bucket-previous",
      "statistics-bucket-next",
    ]) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(48);
      expect(box!.height).toBeGreaterThanOrEqual(48);
    }
    await page.locator("#statistics-period-week").click();
    await expect(page.locator("#statistics-anchor")).toHaveAttribute(
      "type",
      "date",
    );
    await expect(page.locator('label[for="statistics-anchor"]')).toContainText(
      locale === "en" ? "week" : "周",
    );
    await expect(page.locator(".statistics-chart-button")).toHaveCount(7);
    await page.locator("#statistics-period-year").click();
    await expect(page.locator('label[for="statistics-anchor"]')).toContainText(
      locale === "en" ? "year" : "年份",
    );
    await expect(page.locator(".statistics-chart-button")).toHaveCount(12);
    await page.locator("#statistics-type-income").click();
    await expect(page.locator(".statistics-total")).toContainText("0.00");
    await expect(
      page.locator(".statistics-card").first().locator(".empty-state"),
    ).toBeVisible();
    await expect(page.locator(".statistics-chart-button")).toHaveCount(0);
    await expect(page.locator("#statistics-bucket-select option")).toHaveCount(
      13,
    );
  });

  test(`${locale}: mobile category drilldown counts a split transaction once and keeps rankings, views and narrow layouts`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 457, height: 999 });
    const month = await ready(page, locale);
    await page.evaluate(async (month) => {
      await window.lunaLedger.createTransaction({
        type: "expense",
        date: `${month}-01`,
        amountMinor: "1000",
        splits: [
          { category: "expense:0", amountMinor: "300" },
          { category: "expense:1", amountMinor: "700" },
        ],
        merchant: "Split fixture",
      });
      for (let index = 2; index < 7; index++) {
        await window.lunaLedger.createTransaction({
          type: "expense",
          date: `${month}-01`,
          amountMinor: "100",
          splits: [{ category: `expense:${index}`, amountMinor: "100" }],
          merchant: `Rank ${index}`,
        });
      }
    }, month);
    await route(page, "/statistics");
    // Fetch newly committed fixtures through the existing host refresh path.
    await route(page, "/luna");
    await page.reload();
    await expect(page.locator(".transaction-item")).toHaveCount(9);
    await page.evaluate(() => {
      document.documentElement.dataset.clientSurface = "mobile";
    });
    await route(page, "/statistics");
    await expect(page.locator(".statistics-category-row")).toHaveCount(5);
    await page.locator("#statistics-categories-toggle").click();
    await expect(page.locator(".statistics-category-row")).toHaveCount(7);
    await page.locator(".statistics-category-button").first().click();
    await expect(page.locator(".statistics-drilldown-row")).toHaveCount(4);
    await expect(
      page
        .locator(".statistics-drilldown-row")
        .filter({ hasText: "Split fixture" }),
    ).toContainText("3.00");
    await page.locator("#statistics-sort-date").click();
    await expect(page.locator("#statistics-sort-date")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.locator("#statistics-category-view-ring").click();
    await expect(page.locator(".statistics-donut")).toBeVisible();
    await page.locator("#statistics-category-view-bars").click();
    await expect(page.locator(".statistics-category-track")).toHaveCount(7);
    await expect(page.locator(".largest-expense-row")).toHaveCount(5);
    await page.locator("#statistics-largest-toggle").click();
    await expect(page.locator(".largest-expense-row")).toHaveCount(9);
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [320, 375, 457]) {
      await page.setViewportSize({ width, height: 999 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });

  test(`${locale}: mobile budget has real unset, remaining and over-budget states with protected page-local month changes`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    const month = await ready(page, locale);
    await route(page, "/budget");
    await expect(page.locator("#month-picker")).toHaveAttribute(
      "type",
      "month",
    );
    await expect(page.locator("#month-picker")).toHaveValue(month);
    await expect(page.locator(".mobile-budget-amount")).toContainText("76.00");
    await expect(page.locator("#budget-progress")).toHaveCount(0);
    await expect(page.locator("#budget-input")).toBeHidden();
    await page.screenshot({
      path: `captures/mobile-redesign-browser/budget-unset-${locale}-375.png`,
      fullPage: true,
    });
    await openEditor(page);
    await expect(page.locator("#budget-input")).toBeFocused();
    await page.locator("#budget-input").fill("321.09");
    page.once("dialog", (dialog) => void dialog.dismiss());
    await page.locator("#previous-month").click();
    await expect(page.locator("#month-picker")).toHaveValue(month);
    await expect(page.locator("#budget-input")).toHaveValue("321.09");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.locator("#previous-month").click();
    await expect(page.locator("#month-picker")).toHaveValue(
      previousMonth(month),
    );
    await expect(page.locator("#budget-input")).toBeHidden();
    await openEditor(page);
    await expect(page.locator("#budget-input")).toHaveValue("");
    await page.locator("#next-month").click();
    await expect(page.locator("#month-picker")).toHaveValue(month);
    await openEditor(page);
    await page.locator("#budget-input").fill("12.34");
    page.once("dialog", (dialog) => void dialog.dismiss());
    await page.locator("#month-picker").fill(previousMonth(month));
    await expect(page.locator("#month-picker")).toHaveValue(month);
    await expect(page.locator("#budget-input")).toHaveValue("12.34");
    await page.locator("#budget-input").fill("100.00");
    await page.locator("#save-budget").click();
    await expect(page.locator("#budget-input")).toBeHidden();
    await expect(page.locator(".mobile-budget-remaining")).toContainText(
      "24.00",
    );
    await expect(page.locator("#budget-progress")).toHaveAttribute(
      "value",
      "76",
    );
    await openEditor(page);
    await page.locator("#budget-input").fill("50.00");
    await page.locator("#save-budget").click();
    await expect(
      page.locator(".mobile-budget-remaining.over-budget"),
    ).toContainText("26.00");
    await expect(page.locator("#budget-progress")).toHaveAttribute(
      "value",
      "100",
    );
    await page.screenshot({
      path: `captures/mobile-redesign-browser/budget-over-${locale}-375.png`,
      fullPage: true,
    });
    await openEditor(page);
    await page.locator("#budget-input").fill("");
    await page.locator("#save-budget").click();
    await expect(page.locator("#budget-progress")).toHaveCount(0);
    expect(
      (
        await page.evaluate(
          (month) => window.lunaLedger.getSnapshot(month),
          month,
        )
      ).summary?.budgetMinor,
    ).toBeNull();
  });

  test(`${locale}: mobile statistics and budget reflow long amounts and text at 320, 375 and 457`, async ({
    page,
  }) => {
    const month = await ready(page, locale);
    await page.evaluate(async (month) => {
      const category = await window.lunaLedger.createCategory({
        type: "expense",
        name: "A deliberately long category name",
      });
      await window.lunaLedger.createTransaction({
        type: "expense",
        date: `${month}-01`,
        amountMinor: "987654321234",
        splits: [{ category: category.id, amountMinor: "987654321234" }],
        merchant: "A long merchant name for an accessible narrow layout",
      });
    }, month);
    await page.reload();
    await expect(page.locator(".transaction-item")).toHaveCount(4);
    await page.evaluate(() => {
      document.documentElement.dataset.clientSurface = "mobile";
    });
    await page.locator("#primary-record").click();
    await page.locator("#close-transaction").click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const path of ["/statistics", "/budget"] as const) {
      await route(page, path);
      for (const width of [320, 375, 457]) {
        await page.setViewportSize({ width, height: 999 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (path === "/statistics") await expectStatisticsSideGutters(page);
        if (path === "/statistics" && width === 320) {
          const name = await page
            .locator(".statistics-category-button strong")
            .first()
            .boundingBox();
          const merchant = await page
            .locator(".largest-expense-copy")
            .first()
            .boundingBox();
          expect(name!.width).toBeGreaterThanOrEqual(180);
          expect(merchant!.width).toBeGreaterThanOrEqual(180);
        }
        await page.screenshot({
          path: `captures/mobile-redesign-browser/${path.slice(1)}-long-${locale}-${width}.png`,
          fullPage: true,
        });
      }
    }
  });
}

test("mobile budget pending disables month changes, refresh failure closes a committed draft without replay", async ({
  page,
}) => {
  const month = await ready(page, "en");
  await route(page, "/budget");
  await openEditor(page);
  await page.evaluate(() => {
    const api = window.lunaLedger;
    const write = api.setMonthlyBudget.bind(api);
    const read = api.getSnapshot.bind(api);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let committed = false;
    const fixture = { calls: 0, release };
    (window as unknown as { budgetFixture: typeof fixture }).budgetFixture =
      fixture;
    api.setMonthlyBudget = async (...args) => {
      fixture.calls++;
      await pending;
      const result = await write(...args);
      committed = true;
      return result;
    };
    api.getSnapshot = async (month) => {
      if (committed) {
        committed = false;
        throw new Error("LUNA_ERROR:web-storage-unavailable");
      }
      return read(month);
    };
  });
  await page.locator("#budget-input").fill("100");
  await page.locator("#save-budget").click();
  for (const id of [
    "month-picker",
    "previous-month",
    "next-month",
    "save-budget",
  ])
    await expect(page.locator(`#${id}`)).toBeDisabled();
  await page.evaluate(() =>
    (
      window as unknown as { budgetFixture: { release(): void } }
    ).budgetFixture.release(),
  );
  await expect(page.locator("#live-status")).toContainText(
    "Saved locally, but refreshing failed",
  );
  await expect(page.locator("#budget-input")).toBeHidden();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { budgetFixture: { calls: number } })
          .budgetFixture.calls,
    ),
  ).toBe(1);
  expect(
    (
      await page.evaluate(
        (month) => window.lunaLedger.getSnapshot(month),
        month,
      )
    ).summary?.budgetMinor,
  ).toBe("10000");
});

test("mobile budget retains observed heads after a separate window saves and a rejected write keeps its draft", async ({
  page,
  context,
}) => {
  const month = await ready(page, "en");
  await route(page, "/budget");
  await openEditor(page);
  await page.locator("#budget-input").fill("123.45");
  const second = await context.newPage();
  try {
    await second.goto(`/budget?month=${month}`);
    await expect(second.locator("#budget-input")).toBeVisible();
    await second.locator("#budget-input").fill("200.00");
    await second.locator("#save-budget").click();
    await expect
      .poll(
        async () =>
          (
            await second.evaluate(
              (month) => window.lunaLedger.getSnapshot(month),
              month,
            )
          ).summary?.budgetMinor,
      )
      .toBe("20000");
    const committed = await second.evaluate(
      (month) => window.lunaLedger.getSnapshot(month),
      month,
    );
    await expect(
      page.locator(".mobile-budget-summary #budget-status"),
    ).toContainText("200.00");
    await expect(page.locator("#budget-input")).toHaveValue("123.45");
    await page.locator("#save-budget").click();
    await expect(page.locator("#budget-alert")).not.toBeEmpty();
    await expect(page.locator("#budget-input")).toHaveValue("123.45");
    await expect(page.locator("#budget-input")).toBeFocused();
    const after = await page.evaluate(
      (month) => window.lunaLedger.getSnapshot(month),
      month,
    );
    expect(after.budgetHeadIds).toEqual(committed.budgetHeadIds);
    expect(after.summary?.budgetMinor).toBe("20000");
  } finally {
    await second.close();
  }
});

test("mobile budget month loading and failure never show old amounts under the requested month", async ({
  page,
}) => {
  const month = await ready(page, "en");
  await route(page, "/budget");
  const target = previousMonth(month);
  await page.evaluate((target) => {
    const api = window.lunaLedger;
    const read = api.getSnapshot.bind(api);
    let reject = true;
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    (window as unknown as { releaseBudgetRead(): void }).releaseBudgetRead =
      release;
    api.getSnapshot = async (month) => {
      if (month === target) {
        if (reject) {
          reject = false;
          throw new Error("LUNA_ERROR:web-storage-unavailable");
        }
        await wait;
      }
      return read(month);
    };
  }, target);
  await page.locator("#previous-month").click();
  await expect(page.locator(".month-loading-state [role=alert]")).toBeVisible();
  await expect(page.locator(".budget-panel")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`month=${target}`));
  await page.locator(".month-loading-state button").click();
  await expect(page.locator(".month-loading-state")).toBeVisible();
  await expect(page.locator(".mobile-budget-amount")).toHaveCount(0);
  await page.evaluate(() =>
    (window as unknown as { releaseBudgetRead(): void }).releaseBudgetRead(),
  );
  await expect(page.locator("#month-picker")).toHaveValue(target);
  await expect(page.locator(".mobile-budget-amount")).toContainText("0.00");
});
