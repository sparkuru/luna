import { expect, test, type Page } from "@playwright/test";
async function ready(page: Page) {
  await page.goto("/");
  await page.locator("#workspace-name").fill("React state fixture");
  await page.locator('#workspace-form button[type="submit"]').click();
  await expect(page.locator("#transactions-title")).toBeVisible();
}

async function selectedMonth(page: Page): Promise<string> {
  const value = await page.locator("#month-picker").getAttribute("data-month");
  if (value === null) throw new Error("Month picker value is missing");
  return value;
}

async function chooseCategory(page: Page, name = "Food") {
  await page.locator("#choose-category").click();
  await page.getByRole("button", { name, exact: true }).click();
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
  await chooseCategory(page);
  await page.locator("#transaction-advanced-details summary").click();
  await page.locator("#transaction-merchant").fill("Saved once");
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
  await expect(page.locator("#category-search")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#choose-category")).toBeFocused();
  await chooseCategory(page);
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
  await page.goto("/luna?month=2026-03&type=income");
  await expect(page.locator(".web-page-topbar")).toHaveCount(0);
  await expect(page.locator("#month-picker")).toHaveAttribute("type", "button");
  await expect(page.locator("#month-picker")).toHaveAttribute("data-month", "2026-03");
  await expect(page.locator("#month-picker .month-picker-trigger-icon")).toHaveCount(0);
  await page.locator("#month-picker").click();
  await expect(page.locator("#month-picker-panel")).toBeVisible();
  await expect(
    page.locator('#month-picker-panel [data-month="2026-03"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator('#month-picker-panel [data-month="2026-04"]').click();
  await expect(page.locator("#month-picker")).toHaveAttribute("data-month", "2026-04");
  await expect(page.locator("#month-picker-panel")).not.toBeVisible();
  await page.locator("#month-picker").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#month-picker-panel")).not.toBeVisible();
  await expect(page.locator("#month-picker")).toBeFocused();
  await page.locator("#filter-details > summary").click();
  await expect(page.locator("#filter-type")).toHaveValue("income");
  await page.locator("#filter-query").fill("private search sentinel");
  await expect(page.locator("#filter-category")).toHaveCount(0);
  expect(page.url()).not.toContain("sentinel");
  await page.goto("/luna?month=invalid&type=invalid");
  await expect(page.locator("#month-picker")).not.toHaveAttribute("data-month", "invalid");
  await page.locator("#filter-details > summary").click();
  await expect(page.locator("#filter-type")).toHaveValue("all");
  await page.goto("/settings/preferences");
  await expect(page).toHaveURL(/\/settings\/preferences$/);
  await expect(page.locator("#settings-language")).toBeVisible();
  await expect(page.locator(".web-page-topbar")).toHaveCount(0);
  await page.goto("/statistics");
  await expect(page.locator("#category-title")).toBeVisible();
  await expect(page.locator(".web-page-topbar")).toHaveCount(0);
  await page.goto("/budget");
  await expect(page.locator("#budget-month-label")).toBeVisible();
  await expect(page.locator(".web-page-topbar")).toHaveCount(0);
  await page.goto("/luna");
  await expect(page).toHaveURL(/\/luna$/);
});

test("Web statistics uses a month-only picker for monthly periods", async ({
  page,
}) => {
  await ready(page);
  const month = await selectedMonth(page);
  const [year, monthNumber] = month.split("-").map(Number);
  const targetMonth = `${year}-${String(monthNumber === 6 ? 7 : 6).padStart(2, "0")}`;

  await page.goto(
    `/statistics?month=${month}&anchor=${month}-01&period=month&type=all`,
  );
  await expect(page.locator("#category-title")).toHaveCount(1);
  await expect(page.locator(".statistics-page > .section-heading > .kicker")).toHaveCount(0);
  await expect(page.locator("#month-picker")).toHaveAttribute("type", "button");
  await expect(page.locator("#month-picker")).toHaveAttribute("data-month", month);
  await expect(page.locator("#statistics-anchor")).toHaveCount(0);

  await page.locator("#month-picker").click();
  await expect(page.locator("#month-picker-panel")).toBeVisible();
  await expect(
    page.locator(`#month-picker-panel [data-month="${month}"]`),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator(`#month-picker-panel [data-month="${targetMonth}"]`).click();
  await expect(page.locator("#month-picker-panel")).not.toBeVisible();
  await expect(page.locator("#month-picker")).toHaveAttribute(
    "data-month",
    targetMonth,
  );
  expect(
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      return {
        pathname: url.pathname,
        month: url.searchParams.get("month"),
        anchor: url.searchParams.get("anchor"),
        period: url.searchParams.get("period"),
        type: url.searchParams.get("type"),
      };
    }),
  ).toEqual({
    pathname: "/statistics",
    month: targetMonth,
    anchor: `${targetMonth}-01`,
    period: "month",
    type: "all",
  });

  for (const period of ["week", "year"] as const) {
    await page.goto(
      `/statistics?month=${month}&anchor=${month}-01&period=${period}&type=all`,
    );
    await expect(page.locator("#statistics-anchor")).toHaveAttribute(
      "type",
      "date",
    );
    await expect(page.locator("#statistics-anchor")).toHaveValue(`${month}-01`);
    await expect(page.locator("#month-picker")).toHaveCount(0);
  }
});

test("old ledger URLs are not rendered as compatibility routes", async ({ page }) => {
  await ready(page);
  await page.goto("/ledger");
  await expect(page.locator("#transactions-title")).toHaveCount(0);
  await page.goto("/ledger/menu/settings");
  await expect(page.locator("#settings-language")).toHaveCount(0);
});

test("ledger filters use labeled categories, combine criteria, and expose invalid states", async ({
  page,
}) => {
  await ready(page);
  const month = await selectedMonth(page);
  const currentDate = `${month}-05`;
  await page.evaluate(async (date) => {
    await window.lunaLedger.createTransaction({
      type: "income",
      amountMinor: "10000",
      date,
      splits: [{ category: "income:0", amountMinor: "10000" }],
      merchant: "Employer",
      paymentMethod: "Bank transfer",
    });
    await window.lunaLedger.createTransaction({
      type: "expense",
      amountMinor: "2500",
      date: date.replace("-05", "-06"),
      splits: [{ category: "expense:0", amountMinor: "2500" }],
      merchant: "Market",
      notes: "Weekly groceries",
    });
    await window.lunaLedger.createTransaction({
      type: "expense",
      amountMinor: "500",
      date: date.replace("-05", "-15"),
      splits: [{ category: "expense:1", amountMinor: "500" }],
      merchant: "Bus fare",
    });
  }, currentDate);
  await page.reload();
  await expect(page.locator("#transaction-list-region .transaction-item")).toHaveCount(3);

  await page.locator("#filter-details > summary").click();
  await expect(page.locator("#filter-category")).toHaveCount(0);
  const filterFieldWidths = await page.evaluate(() => {
    const typeField = document.querySelector(".filter-type-field");
    const searchField = document.querySelector(".filter-search-field");
    if (!(typeField instanceof HTMLElement) || !(searchField instanceof HTMLElement)) {
      throw new Error("filter fields are missing");
    }
    return {
      type: typeField.getBoundingClientRect().width,
      search: searchField.getBoundingClientRect().width,
    };
  });
  expect(filterFieldWidths.type).toBeGreaterThanOrEqual(filterFieldWidths.search - 1);
  await expect(page.locator(".filter-category-group-title")).toHaveText([
    "Spending categories",
    "Income categories",
  ]);
  const food = page.locator(".filter-category-option").filter({ hasText: "Food" });
  await food.locator("input").check();
  await expect(page.locator("#transaction-list-region .transaction-item")).toHaveCount(1);
  await expect(page.locator("#transaction-list-region")).toContainText("Market");
  await expect(page.locator("#filter-details .filter-disclosure-meta")).toContainText(
    "1 active filter",
  );

  await page.locator("#filter-type").scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const type = document.getElementById("filter-type");
    if (type === null) throw new Error("filter type is missing");
    window.scrollTo(0, Math.max(0, window.scrollY + type.getBoundingClientRect().top - 160));
  });
  const scrollBeforeTypeChange = await page.evaluate(() => window.scrollY);
  await page.locator("#filter-type").selectOption("income");
  await expect(page.locator("#transaction-list-region .transaction-item")).toHaveCount(0);
  await expect(page.locator("#filter-details")).toHaveAttribute("open", "");
  await expect(page.locator("#filter-type")).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeTypeChange);
  await expect(page.locator(".filter-category-group-title")).toHaveText([
    "Income categories",
  ]);
  await expect(page.locator("#filter-chips")).toContainText("Category: Food");
  await page.locator("#filter-type").selectOption("all");
  await expect(page.locator("#transaction-list-region .transaction-item")).toHaveCount(1);
  await page.locator("#filter-type").selectOption("expense");
  await expect(page.locator(".filter-category-group-title")).toHaveText([
    "Spending categories",
  ]);
  await expect(
    page.locator(".filter-category-option").filter({ hasText: "Salary" }),
  ).toHaveCount(0);
  await page.locator("#filter-type").selectOption("all");
  await expect(page.locator("#transaction-list-region .transaction-item")).toHaveCount(1);

  await page.locator("#filter-query").fill("Market");
  await page.locator("#filter-advanced > summary").click();
  await page.locator("#filter-minimum").fill("25.00");
  await page.locator("#filter-maximum").fill("25.00");
  await page.locator("#filter-date-from").fill(`${month}-06`);
  await page.locator("#filter-date-to").fill(`${month}-06`);
  await expect(page.locator("#transaction-list-region .transaction-item")).toHaveCount(1);
  await expect(page.locator("#filter-chips .filter-chip")).toHaveCount(6);

  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.locator("#transaction-list-region .transaction-item")).toHaveCount(3);
  await expect(page.locator("#filter-chips .filter-chip")).toHaveCount(0);

  await page.locator("#filter-minimum").fill("-1");
  await expect(page.locator('[role="alert"]')).toContainText(
    "valid non-negative amount",
  );
  await expect(page.locator("#transaction-list-region")).toHaveAttribute(
    "data-filter-evaluation",
    "invalid",
  );
  await expect(page.locator("#transaction-list-region .transaction-item")).toHaveCount(3);
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();

  await page.locator("#filter-minimum").fill("30.00");
  await page.locator("#filter-maximum").fill("25.00");
  await expect(page.locator("#filter-minimum")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#filter-maximum")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator('[role="alert"]')).toContainText("minimum amount");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();

  const outsideMonth = await page.evaluate((selectedMonth) => {
    const [year, monthNumber] = selectedMonth.split("-").map(Number);
    const date = new Date(year!, monthNumber! - 2, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
  }, month);
  await page.locator("#filter-date-from").fill(outsideMonth);
  await expect(page.locator('[role="alert"]')).toContainText("within");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();

  await page.locator("#filter-date-from").fill(`${month}-20`);
  await page.locator("#filter-date-to").fill(`${month}-10`);
  await expect(page.locator('[role="alert"]')).toContainText("start date");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();

  await page.locator("#filter-regex").click();
  await expect(page.locator("#filter-regex")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#filter-query").fill("[");
  await expect(page.locator('[role="alert"]')).toContainText(
    "regular expression is invalid",
  );
  await expect(page.locator("#transaction-list-region .transaction-item")).toHaveCount(3);
  await page.setViewportSize({ width: 320, height: 800 });
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("ledger filters retain results and recover when the regex Worker is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    Object.defineProperty(window, "Worker", {
      configurable: true,
      value: new Proxy(NativeWorker, {
        construct(target, args) {
          if (String(args[0]).includes("search.worker")) {
            throw new Error("Injected search Worker construction failure");
          }
          return Reflect.construct(target, args);
        },
      }),
    });
  });
  await ready(page);
  const month = await selectedMonth(page);
  await page.evaluate(async (date) => {
    await window.lunaLedger.createTransaction({
      type: "expense", amountMinor: "1200", date,
      splits: [{ category: "expense:0", amountMinor: "1200" }], merchant: "Worker fixture",
    });
  }, `${month}-05`);
  await page.reload();
  await page.locator("#filter-details > summary").click();
  await page.locator("#filter-query").fill("Worker fixture");
  await expect(page.locator("#filter-result-summary")).toContainText("1 shown");
  await page.locator("#filter-regex").click();
  await expect(page.locator("#transaction-list-region")).toHaveAttribute("data-filter-evaluation", "failed");
  await expect(page.locator('#filter-error[role="alert"]')).toContainText("unavailable");
  await expect(page.locator("#transaction-list-region .transaction-item")).toHaveCount(1);
  await expect(page.locator("#filter-result-summary")).toHaveCount(0);
  await page.locator("#filter-regex").click();
  await expect(page.locator("#transaction-list-region")).toHaveAttribute("data-filter-evaluation", "ready");
  await expect(page.locator("#filter-result-summary")).toContainText("1 shown");
});

test("ledger filters retain results and recover after regex Worker timeout", async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    Object.defineProperty(window, "Worker", {
      configurable: true,
      value: new Proxy(NativeWorker, {
        construct(target, args) {
          if (String(args[0]).includes("search.worker")) {
            return {
              onmessage: null,
              onerror: null,
              postMessage() {},
              terminate() {},
            };
          }
          return Reflect.construct(target, args);
        },
      }),
    });
  });
  await ready(page);
  const month = await selectedMonth(page);
  await page.evaluate(async (date) => {
    await window.lunaLedger.createTransaction({
      type: "expense", amountMinor: "1200", date,
      splits: [{ category: "expense:0", amountMinor: "1200" }], merchant: "Timeout fixture",
    });
  }, `${month}-05`);
  await page.reload();
  await page.locator("#filter-details > summary").click();
  await page.locator("#filter-query").fill("Timeout fixture");
  await expect(page.locator("#filter-result-summary")).toContainText("1 shown");
  await page.locator("#filter-regex").click();
  await expect(page.locator("#transaction-list-region")).toHaveAttribute("data-filter-evaluation", "working");
  await expect(page.locator('#filter-search-status[role="status"]')).toContainText("Applying filters");
  await expect(page.locator("#transaction-list-region .transaction-item")).toHaveCount(1);
  await expect(page.locator("#transaction-list-region")).toHaveAttribute(
    "data-filter-evaluation", "failed", { timeout: 8_000 },
  );
  await expect(page.locator('#filter-error[role="alert"]')).toContainText("took too long");
  await expect(page.locator("#transaction-list-region .transaction-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.locator("#transaction-list-region")).toHaveAttribute("data-filter-evaluation", "ready");
  await expect(page.locator("#filter-regex")).toHaveAttribute("aria-pressed", "false");
});

test("ledger filter controls can be operated with a keyboard and keep visible focus", async ({ page }) => {
  await ready(page);
  const month = await selectedMonth(page);
  await page.evaluate(async (date) => {
    await window.lunaLedger.createTransaction({
      type: "expense", amountMinor: "1200", date,
      splits: [{ category: "expense:0", amountMinor: "1200" }], merchant: "Keyboard fixture",
    });
  }, `${month}-05`);
  await page.reload();

  const disclosure = page.locator("#filter-details > summary");
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#filter-details")).toHaveAttribute("open", "");
  await page.keyboard.press("Tab");
  await expect(page.locator("#filter-query")).toBeFocused();
  await page.keyboard.type("Keyboard fixture");
  await page.keyboard.press("Tab");
  await expect(page.locator("#filter-regex")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.locator("#filter-regex")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(page.locator("#filter-regex")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Tab");
  await expect(page.locator("#filter-type")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#filter-type")).toHaveValue("income");
  await expect(page.locator("#filter-type")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#filter-type")).toHaveValue("expense");

  const food = page.locator(".filter-category-option").filter({ hasText: "Food" }).locator("input");
  await food.focus();
  await page.keyboard.press("Space");
  await expect(food).toBeChecked();
  await expect(page.locator("#filter-chips")).toContainText("Category: Food");

  const advanced = page.locator("#filter-advanced > summary");
  await advanced.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#filter-advanced")).toHaveAttribute("open", "");
  await page.locator("#filter-minimum").focus();
  await page.keyboard.type("12");
  await expect(page.locator("#filter-minimum")).toHaveValue("12");
  await page.locator("#filter-date-from").focus();
  await expect(page.locator("#filter-date-from")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#filter-date-from")).toBeFocused();

  const chip = page.getByRole("button", { name: "Clear filters: Category: Food" });
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#filter-chips")).not.toContainText("Category: Food");
  const clear = page.getByRole("button", { name: "Clear filters", exact: true });
  await clear.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(clear).toBeFocused();
  const focusStyle = await clear.evaluate((button) => ({
    outlineStyle: getComputedStyle(button).outlineStyle,
    outlineWidth: getComputedStyle(button).outlineWidth,
  }));
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.outlineWidth).not.toBe("0px");
  await page.keyboard.press("Enter");
  await expect(page.locator("#filter-query")).toHaveValue("");
  await expect(page.locator("#filter-type")).toHaveValue("all");
  await expect(page.locator("#filter-regex")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#filter-chips")).toHaveCount(0);
  await expect(page.locator("#transaction-list-region")).toHaveAttribute("data-filter-evaluation", "ready");
});

test("filter date fields use showPicker without losing the native fallback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as unknown as { filterDatePickerCalls: string[] };
    state.filterDatePickerCalls = [];
    Object.defineProperty(HTMLInputElement.prototype, "showPicker", {
      configurable: true,
      value(this: HTMLInputElement) {
        if (this.id === "filter-date-from" || this.id === "filter-date-to") {
          state.filterDatePickerCalls.push(this.id);
        }
      },
    });
  });
  await ready(page);
  await page.locator("#filter-details > summary").click();
  await page.locator("#filter-advanced > summary").click();
  await expect(page.locator("#filter-date-from")).toHaveAttribute("data-empty", "true");
  await expect(page.locator("#filter-date-to")).toHaveAttribute("data-empty", "true");
  const emptyDatePresentation = await page.locator("#filter-date-from").evaluate((input) => ({
    textColor: getComputedStyle(input, "::-webkit-datetime-edit").color,
    calendarDisplay: getComputedStyle(input, "::-webkit-calendar-picker-indicator").display,
  }));
  expect(emptyDatePresentation.textColor).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(emptyDatePresentation.calendarDisplay).not.toBe("none");

  await page.locator("#filter-date-from").click();
  await page.locator("#filter-date-to").click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { filterDatePickerCalls: string[] }).filterDatePickerCalls,
      ),
    )
    .toEqual(["filter-date-from", "filter-date-to"]);

  await page.locator("#filter-date-from").fill("2026-01-02");
  await expect(page.locator("#filter-date-from")).toHaveValue("2026-01-02");
  await expect(page.locator("#filter-date-from")).toHaveAttribute("data-empty", "false");

  await page.evaluate(() => {
    Object.defineProperty(HTMLInputElement.prototype, "showPicker", {
      configurable: true,
      value: undefined,
    });
  });
  await page.locator("#filter-date-from").click();
  await expect(page.locator("#filter-date-from")).toBeFocused();
});

test("filter categories remain readable and contained with a full catalog fixture", async ({
  page,
}) => {
  await ready(page);
  const month = await selectedMonth(page);
  const categoryIds = [
    ...Array.from({ length: 8 }, (_, index) => `expense:${index}`),
    ...Array.from({ length: 7 }, (_, index) => `income:${index}`),
  ];
  await page.evaluate(async ({ categoryIds, month }) => {
    for (const [index, category] of categoryIds.entries()) {
      const type = category.startsWith("income:") ? "income" : "expense";
      await window.lunaLedger.createTransaction({
        type,
        amountMinor: "100",
        date: `${month}-${String(index + 1).padStart(2, "0")}`,
        splits: [{ category, amountMinor: "100" }],
      });
    }
  }, { categoryIds, month });
  await page.reload();
  await page.locator("#filter-details > summary").click();
  await expect(page.locator(".filter-category-option")).toHaveCount(categoryIds.length);
  await expect(page.locator(".filter-category-group-title")).toHaveText([
    "Spending categories",
    "Income categories",
  ]);

  const layout = await page.evaluate(() => {
    const region = document.querySelector("#filter-category-options");
    if (!(region instanceof HTMLElement)) throw new Error("category region is missing");
    const regionBox = region.getBoundingClientRect();
    const optionBoxes = Array.from(
      region.querySelectorAll<HTMLElement>(".filter-category-option"),
    )
      .map((option) => option.getBoundingClientRect());
    return {
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      regionRight: regionBox.right,
      maxOptionRight: Math.max(...optionBoxes.map((box) => box.right)),
    };
  });
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.maxOptionRight).toBeLessThanOrEqual(layout.regionRight + 1);
});

test("month navigation scopes the ledger to the selected month", async ({
  page,
}) => {
  await ready(page);
  const currentMonth = await selectedMonth(page);
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
      splits: [{ category: "expense:0", amountMinor: "1200" }],
      merchant: "Current month record",
    });
    await window.lunaLedger.createTransaction({
      type: "expense",
      amountMinor: "3400",
      date: `${previousMonth}-15`,
      splits: [{ category: "expense:0", amountMinor: "3400" }],
      merchant: "Previous month record",
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
  await expect(page.locator("#month-picker")).toHaveAttribute("data-month", previousMonth);
  await expect(page.locator("#transactions-title")).toBeVisible();
  await expect(page.locator("#transaction-list-region")).toContainText(
    "Previous month record",
  );
  await expect(page.locator("#transaction-list-region")).not.toContainText(
    "Current month record",
  );
});

test("month loading keeps the ledger frame stable and isolates the old month", async ({
  page,
}) => {
  await ready(page);
  const currentMonth = await selectedMonth(page);
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
      splits: [{ category: "expense:0", amountMinor: "1200" }],
      merchant: "Loading current sentinel",
    });
    await window.lunaLedger.createTransaction({
      type: "expense",
      amountMinor: "3400",
      date: `${previousMonth}-15`,
      splits: [{ category: "expense:0", amountMinor: "3400" }],
      merchant: "Loading previous sentinel",
    });
  }, { currentMonth, previousMonth });
  await page.reload();
  await expect(page.locator("#transaction-list-region")).toContainText(
    "Loading current sentinel",
  );
  const readFrame = () =>
    page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) return null;
        const rect = element.getBoundingClientRect();
        return { top: rect.top, height: rect.height };
      };
      return {
        hero: read(".dashboard-hero"),
        summary: read("#summary-grid"),
        transactions: read(".transactions-panel"),
      };
    });
  const readyFrame = await readFrame();

  await page.evaluate((targetMonth) => {
    const api = window.lunaLedger;
    const getSnapshot = api.getSnapshot.bind(api);
    const state = window as unknown as {
      monthSnapshotStarted: boolean;
      releaseMonthSnapshot: (() => void) | undefined;
    };
    state.monthSnapshotStarted = false;
    state.releaseMonthSnapshot = undefined;
    api.getSnapshot = async (month) => {
      if (month === targetMonth) {
        state.monthSnapshotStarted = true;
        await new Promise<void>((resolve) => {
          state.releaseMonthSnapshot = resolve;
        });
      }
      return getSnapshot(month);
    };
  }, previousMonth);

  await page.locator("#previous-month").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { monthSnapshotStarted: boolean })
            .monthSnapshotStarted,
      ),
    )
    .toBe(true);
  await expect(page.locator('[data-ledger-state="loading"]')).toBeVisible();
  await expect(page.locator(".dashboard-hero")).toHaveCount(1);
  await expect(page.locator("#summary-grid.month-loading-summary")).toHaveCount(1);
  await expect(page.locator(".month-loading-transactions")).toHaveCount(1);
  const loadingFrame = await readFrame();
  for (const key of ["hero", "summary", "transactions"] as const) {
    expect(readyFrame[key]).not.toBeNull();
    expect(loadingFrame[key]).not.toBeNull();
    expect(Math.abs(
      (loadingFrame[key]?.top ?? 0) - (readyFrame[key]?.top ?? 0),
    )).toBeLessThanOrEqual(1);
  }
  await expect(page.locator("#transaction-list-region")).not.toContainText(
    "Loading current sentinel",
  );
  await expect(page.locator("#transaction-list-region")).not.toContainText(
    "1200",
  );

  await page.evaluate(() => {
    const state = window as unknown as {
      releaseMonthSnapshot: (() => void) | undefined;
    };
    state.releaseMonthSnapshot?.();
  });
  await expect(page.locator("#transaction-list-region")).toContainText(
    "Loading previous sentinel",
  );
});

test("month loading keeps its frame and retries a failed snapshot", async ({
  page,
}) => {
  await ready(page);
  const currentMonth = await selectedMonth(page);
  const year = Number(currentMonth.slice(0, 4));
  const monthNumber = Number(currentMonth.slice(5, 7));
  const previousDate = new Date(year, monthNumber - 2, 15);
  const previousMonth = `${previousDate.getFullYear()}-${String(
    previousDate.getMonth() + 1,
  ).padStart(2, "0")}`;
  await page.evaluate(async (date) => {
    await window.lunaLedger.createTransaction({
      type: "expense",
      amountMinor: "3400",
      date,
      splits: [{ category: "expense:0", amountMinor: "3400" }],
      merchant: "Retry target sentinel",
    });
  }, `${previousMonth}-15`);
  await page.reload();

  await page.evaluate((targetMonth) => {
    const api = window.lunaLedger;
    const getSnapshot = api.getSnapshot.bind(api);
    let failures = 0;
    api.getSnapshot = async (month) => {
      if (month === targetMonth && failures++ === 0) {
        throw new Error("LUNA_ERROR:web-storage-unavailable");
      }
      return getSnapshot(month);
    };
  }, previousMonth);
  await page.locator("#previous-month").click();
  await expect(page.locator('[data-ledger-state="loading"]')).toBeVisible();
  await expect(page.locator("#month-loading-error")).toBeVisible();
  await expect(page.locator(".month-loading-transactions")).not.toContainText(
    "Retry target sentinel",
  );
  await page.locator("#month-loading-error button").click();
  await expect(page.locator("#transaction-list-region")).toContainText(
    "Retry target sentinel",
  );
});

test("new transactions use today from a historical month and edits keep their original date", async ({
  page,
}) => {
  await ready(page);
  const currentMonth = await selectedMonth(page);
  const year = Number(currentMonth.slice(0, 4));
  const monthNumber = Number(currentMonth.slice(5, 7));
  const previousDate = new Date(year, monthNumber - 2, 15);
  const previousMonth = `${previousDate.getFullYear()}-${String(
    previousDate.getMonth() + 1,
  ).padStart(2, "0")}`;
  const originalDate = `${previousMonth}-15`;
  const today = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`;
  });
  await page.evaluate(async (date) => {
    await window.lunaLedger.createTransaction({
      type: "expense",
      amountMinor: "3400",
      date,
      merchant: "Historical date record",
      splits: [{ category: "expense:0", amountMinor: "3400" }],
    });
  }, originalDate);
  await page.goto(`/luna?month=${previousMonth}`);
  await expect(page.locator("#transaction-list-region")).toContainText(
    "Historical date record",
  );

  await page.locator("#primary-record").click();
  await expect(page.locator("#transaction-date")).toHaveValue(today);
  await page.locator("#close-transaction").click();

  const row = page.locator(".transaction-item").filter({
    hasText: "Historical date record",
  });
  const trigger = row.locator(".transaction-actions-trigger");
  if (await trigger.isVisible()) await trigger.click();
  await row
    .getByRole("button", { name: "Edit Historical date record", exact: true })
    .click();
  await expect(page.locator("#transaction-date")).toHaveValue(originalDate);
});

test("empty regex mode keeps the unfiltered ledger visible", async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (const [merchant, amountMinor] of [['Regex one', '100'], ['Regex two', '200']] as const) {
      await window.lunaLedger.createTransaction({
        type: 'expense',
        amountMinor,
        date,
        splits: [{ category: 'expense:0', amountMinor }],
        merchant,
      });
    }
  });
  await page.reload();
  await expect(page.locator('#transaction-list-region .transaction-item')).toHaveCount(2);
  await page.locator('#filter-details > summary').click();
  await page.locator('#filter-regex').click();
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
  await expect(page.locator("#category-search")).toBeFocused();
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
  await page.getByRole("link", { name: /Preferences|偏好设置/ }).click();
  await expect(page).toHaveURL(/\/settings\/preferences$/);
  expect(await back()).toBe(false);
  await expect(page).toHaveURL(/\/settings$/);
  expect(await back()).toBe(false);
  await expect(page).toHaveURL(/\/luna$/);
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
