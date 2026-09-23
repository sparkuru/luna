import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Ledger name").fill("Entry form polish");
  await page.getByRole("button", { name: "Create local ledger" }).click();
  await expect(page.locator("#transactions-title")).toBeVisible();
}

async function chooseCategory(page: Page, name: string): Promise<void> {
  await page.locator("#choose-category").click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("calculator shows direct repeating precision before saving at ledger precision", async ({ page }) => {
  await setup(page);
  await page.locator("#primary-record").click();
  await page.locator("#transaction-amount").fill("10/3");
  await chooseCategory(page, "Food");
  const calculator = page.locator(".calculator");
  await calculator.locator("summary").click();
  await expect(calculator.locator(".calculator-grid").getByRole("button", { name: "×" })).toBeVisible();
  await expect(calculator.locator(".calculator-grid").getByRole("button", { name: "÷" })).toBeVisible();
  await calculator.locator(".calculator-grid").getByRole("button", { name: "Evaluate" }).click();
  await expect(page.locator("#transaction-amount")).toHaveValue("3.33");
  await expect(calculator.locator(".calculator-display")).toHaveText("3.33(3)");
  await expect(calculator.locator(".calculator-title .calculator-display")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Exact preview");
  await expect(page.locator("body")).not.toContainText("精确预览");
  await page.locator("#save-transaction").click();
  await expect(page.locator("#transaction-list-region")).toContainText("3.33");
});

test("calculator keeps keyboard input on the LCD until it is evaluated", async ({ page }) => {
  await setup(page);
  await page.locator("#primary-record").click();
  const calculator = page.locator(".calculator");
  const amount = page.locator("#transaction-amount");
  await calculator.locator("summary").click();
  await expect(calculator).toHaveAttribute("open", "");
  await amount.focus();

  await page.keyboard.type("10/3");
  await expect(calculator.locator(".calculator-display")).toHaveText("10÷3");
  await expect(amount).toHaveValue("");

  await page.keyboard.press("=");
  await expect(calculator.locator(".calculator-display")).toHaveText("3.33(3)");
  await expect(amount).toHaveValue("3.33");

  await calculator
    .locator(".calculator-grid")
    .getByRole("button", { name: "Clear calculator", exact: true })
    .click();
  await calculator.locator("summary").focus();
  await page.keyboard.type("2+1");
  await expect(calculator.locator(".calculator-display")).toHaveText("2+1");
  await expect(amount).toHaveValue("3.33");
  await page.locator("#transaction-advanced-details summary").click();
  const merchant = page.locator("#transaction-merchant");
  await merchant.focus();
  await page.keyboard.type("123");
  await expect(merchant).toHaveValue("123");
  await calculator.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(calculator.locator(".calculator-display")).toHaveText("3.00");
  await expect(amount).toHaveValue("3.00");
});

test("calculator keypad keeps mouse input on the LCD until equals", async ({ page }) => {
  await setup(page);
  await page.locator("#primary-record").click();
  const calculator = page.locator(".calculator");
  const amount = page.locator("#transaction-amount");
  await calculator.locator("summary").click();

  await calculator.locator(".calculator-grid").getByRole("button", { name: "7", exact: true }).click();
  await calculator.locator(".calculator-grid").getByRole("button", { name: "+", exact: true }).click();
  await calculator.locator(".calculator-grid").getByRole("button", { name: "2", exact: true }).click();
  await expect(calculator.locator(".calculator-display")).toHaveText("7+2");
  await expect(amount).toHaveValue("");

  await calculator.locator(".calculator-grid").getByRole("button", { name: "Evaluate" }).click();
  await expect(amount).toHaveValue("9.00");
});

test("calculator uses the requested keypad order and prominent equals action", async ({ page }) => {
  await setup(page);
  await page.locator("#primary-record").click();
  const calculator = page.locator(".calculator");
  await calculator.locator("summary").click();

  await expect(calculator.locator(".calculator-grid button")).toHaveCount(18);
  await expect
    .poll(() =>
      calculator.locator(".calculator-grid button").evaluateAll((buttons) =>
        buttons.map((button) => button.textContent?.trim() ?? ""),
      ),
    )
    .toEqual(["7", "8", "9", "+", "4", "5", "6", "-", "1", "2", "3", "×", ".", "0", "C", "÷", "=", "⌫"]);

  const buttonMetrics = await calculator.locator(".calculator-grid").evaluate((grid) => {
    const buttons = Array.from(grid.querySelectorAll("button"));
    const normal = buttons.find((button) => button.textContent?.trim() === "7");
    const equals = buttons.find((button) => button.textContent?.trim() === "=");
    if (normal === undefined || equals === undefined) throw new Error("Calculator buttons are incomplete");
    const normalBox = normal.getBoundingClientRect();
    const equalsBox = equals.getBoundingClientRect();
    const normalStyle = getComputedStyle(normal);
    const operator = buttons.find((button) => button.textContent?.trim() === "+");
    if (operator === undefined) throw new Error("Calculator operators are incomplete");
    const operatorStyle = getComputedStyle(operator);
    return {
      normalWidth: normalBox.width,
      normalHeight: normalBox.height,
      equalsWidth: equalsBox.width,
      equalsHeight: equalsBox.height,
      normalRadius: normalStyle.borderRadius,
      normalShadow: normalStyle.boxShadow,
      normalBackground: normalStyle.backgroundImage,
      operatorBackground: operatorStyle.backgroundImage,
    };
  });
  expect(buttonMetrics.equalsWidth).toBeGreaterThan(buttonMetrics.normalWidth * 2);
  expect(buttonMetrics.equalsHeight).toBeGreaterThan(buttonMetrics.normalHeight);
  expect(Number.parseFloat(buttonMetrics.normalRadius)).toBeGreaterThanOrEqual(16);
  expect(buttonMetrics.normalShadow).not.toBe("none");
  expect(buttonMetrics.normalBackground).toContain("linear-gradient");
  expect(buttonMetrics.operatorBackground).toContain("linear-gradient");
  expect(buttonMetrics.operatorBackground).not.toBe(buttonMetrics.normalBackground);
});

test("date field opens the native picker from the whole surface and preserves saved ISO values", async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { datePickerCalls: number };
    state.datePickerCalls = 0;
    Object.defineProperty(HTMLInputElement.prototype, "showPicker", {
      configurable: true,
      value(this: HTMLInputElement) {
        if (this.id === "transaction-date") state.datePickerCalls += 1;
      },
    });
  });
  await setup(page);
  await page.locator("#primary-record").click();

  const date = page.locator("#transaction-date");
  const box = await date.boundingBox();
  expect(box).not.toBeNull();
  for (const fraction of [0.15, 0.5, 0.85]) {
    await page.mouse.click(
      (box?.x ?? 0) + (box?.width ?? 0) * fraction,
      (box?.y ?? 0) + (box?.height ?? 0) / 2,
    );
  }
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { datePickerCalls: number }).datePickerCalls))
    .toBe(3);

  const selectedDate = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`;
  });
  await date.fill(selectedDate);
  await expect(date).toHaveValue(selectedDate);
  await page.locator("#transaction-amount").fill("12.34");
  await chooseCategory(page, "Food");
  await page.locator("#save-transaction").click();
  await expect(page.locator("#transaction-list-region")).toContainText("12.34");
  await expect
    .poll(() =>
      page.evaluate(async (month) => {
        const snapshot = await window.lunaLedger.getSnapshot(month);
        return snapshot.transactions.map((transaction) => transaction.date);
      }, selectedDate.slice(0, 7)),
    )
    .toContain(selectedDate);
});

test("entry dialog calculator and date controls stay within a 375px viewport", async ({ page }) => {
  await setup(page);
  await page.locator("#primary-record").click();
  await page.locator("#transaction-amount").fill("10/3");
  await chooseCategory(page, "Food");
  const calculator = page.locator(".calculator");
  await calculator.locator("summary").click();
  await calculator.locator(".calculator-grid").getByRole("button", { name: "Evaluate" }).click();
  await expect(calculator.locator(".calculator-display")).toHaveText("3.33(3)");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  const resultMetrics = await calculator.locator(".calculator-display").evaluate((element) => {
    const textRange = document.createRange();
    textRange.selectNodeContents(element);
    const style = getComputedStyle(element);
    return {
      surfaceWidth: element.getBoundingClientRect().width,
      textWidth: textRange.getBoundingClientRect().width,
      horizontalPadding:
        Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight),
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
      fontFamily: style.fontFamily,
      fontSize: Number.parseFloat(style.fontSize),
    };
  });
  const calculatorBox = await calculator.boundingBox();
  expect(calculatorBox).not.toBeNull();
  expect(resultMetrics.surfaceWidth).toBeLessThanOrEqual((calculatorBox?.width ?? 0) + 1);
  expect(resultMetrics.surfaceWidth).toBeGreaterThan(resultMetrics.textWidth + resultMetrics.horizontalPadding);
  expect(resultMetrics.backgroundImage).toContain("linear-gradient");
  expect(resultMetrics.boxShadow).toContain("inset");
  expect(resultMetrics.fontFamily).toContain("monospace");
  expect(resultMetrics.fontSize).toBeGreaterThanOrEqual(24);
  const titleBox = await calculator.locator(".calculator-title").boundingBox();
  const resultBox = await calculator.locator(".calculator-display").boundingBox();
  expect(titleBox).not.toBeNull();
  expect(resultBox).not.toBeNull();
  expect((resultBox?.x ?? 0) + (resultBox?.width ?? 0)).toBeLessThanOrEqual(
    (titleBox?.x ?? 0) + (titleBox?.width ?? 0) + 1,
  );
});

test("category selection uses a button-only field", async ({ page }) => {
  await setup(page);
  await page.locator("#primary-record").click();
  const categoryControl = page.locator(".category-control");
  await expect(categoryControl.locator("input")).toHaveCount(0);
  const trigger = page.locator("#choose-category");
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Food", exact: true })).toBeVisible();
});

test("category settings rename and usage flow keep new entries on the saved directory", async ({ page }) => {
  await setup(page);
  await page.goto("/settings/categories");
  const source = () => page.locator('article[data-category-id="expense:0"]');
  await expect(source()).toContainText("Food");
  page.once("dialog", (dialog) => void dialog.accept("Meals"));
  await source().getByRole("button", { name: "Rename", exact: true }).click();
  await expect(source()).toContainText("Meals");

  await page.goto("/luna");
  await page.locator("#primary-record").click();
  await page.locator("#transaction-amount").fill("10.00");
  await chooseCategory(page, "Meals");
  await page.locator("#transaction-advanced-details summary").click();
  await page.locator("#transaction-merchant").fill("Category migration item");
  await page.locator("#save-transaction").click();
  await expect(page.locator("#transaction-list-region")).toContainText("Category migration item");

  await page.goto("/settings/categories");
  page.once("dialog", (dialog) => void dialog.accept());
  await source().getByRole("button", { name: "Delete", exact: true }).click();
  const usage = page.locator("#category-usage-dialog");
  await expect(usage).toContainText("1 transaction uses this category");
  await usage.locator("#category-usage-select-all").check();
  await usage.locator("#category-batch-target").selectOption("expense:1");
  await usage.locator(".category-usage-toolbar").getByRole("button", { name: "Replace selected", exact: true }).click();
  await expect(usage).toContainText("0 transactions use this category");
  await usage.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(source()).toHaveCount(0);

  await page.goto("/luna");
  await page.locator("#primary-record").click();
  await page.locator("#transaction-amount").fill("1.00");
  await page.locator("#choose-category").click();
  await expect(page.getByRole("button", { name: "Meals", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Transport", exact: true })).toBeVisible();
});
