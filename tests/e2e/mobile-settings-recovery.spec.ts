import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/server/app";
import { setAccount } from "../../src/server/auth";
import { MemoryServerObjectStore } from "../../src/server/storage/object-store";
import { openTestDatabase } from "../server/support";
import { decodeFullBackup } from "../../src/shared/full-backup";
import { encryptLedgerDocument, decryptLedgerDocument } from "../../src/shared/ledger-crypto";
import { appendLedgerRevision, mergeLedgerDocuments } from "../../src/shared/ledger-sync";
import { reviseTransaction } from "../../src/shared/domain";
import { storedTransactionToTransaction, isStoredTransaction } from "../../src/shared/ledger-record";
import { readLedgerDocument } from "./helpers/public-ledger";

type Locale = "en" | "zh-CN";
const phrase = "synthetic mobile backup password";

// These exercise native presentation on the browser host, not Android IME,
// system BACK, SAF, or its WebView credential lifecycle.
async function ready(page: Page, locale: Locale, workspace = true) {
  await page.setViewportSize({ width: 457, height: 999 });
  await page.goto("/");
  await expect(page.locator("#workspace-form")).toBeVisible();
  await page.evaluate(async ({ locale, workspace }) => {
    await window.lunaLedger.updateSettings({ locale });
    if (workspace) await window.lunaLedger.createWorkspace({ name: "Mobile settings fixture", currency: "CNY", precision: 2, monthlyBudgetMinor: null });
  }, { locale, workspace });
  await page.reload();
  await expect(page.locator(workspace ? "#primary-record" : "#setup-connect")).toBeVisible();
  await page.evaluate(() => { document.documentElement.dataset.clientSurface = "mobile"; });
  if (workspace) {
    await page.locator("#primary-record").click();
    await page.locator("#close-transaction").click();
  } else {
    await page.locator("#setup-connect").click();
    await page.locator("#setup-back").click();
  }
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`${locale}: category usage ignores late reads and errors after BACK or unmount`, async ({ page }) => {
    await ready(page, locale);
    const categoryIds = await page.evaluate(async () => {
      const date = new Date().toISOString().slice(0, 10);
      const categories = (await window.lunaLedger.getSnapshot(date.slice(0, 7))).categories!.filter(category => category.type === "expense");
      for (const [index, category] of categories.slice(0, 2).entries()) {
        await window.lunaLedger.createTransaction({ type: "expense", date, amountMinor: "100", splits: [{ category: category.id, amountMinor: "100" }], merchant: index === 0 ? "Previous category record" : "Current category record", notes: "" });
      }
      const original = window.lunaLedger.getCategoryUsage;
      const requests: { rows: Awaited<ReturnType<typeof original>>; resolve(rows: Awaited<ReturnType<typeof original>>): void; reject(error: Error): void }[] = [];
      window.lunaLedger.getCategoryUsage = async (id) => {
        const rows = await original(id);
        return new Promise((resolve, reject) => { requests.push({ rows, resolve, reject }); });
      };
      Object.assign(window, { mobileUsageGate: {
        count: () => requests.length,
        settle: async (index: number, fail: boolean) => {
          const request = requests[index]!;
          if (fail) request.reject(new Error("LUNA_ERROR:ledger-network"));
          else request.resolve(request.rows);
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        },
      } });
      return categories.slice(0, 2).map(category => category.id);
    });
    await settings(page, "categories");
    const openUsage = async (id: string) => {
      const row = page.locator(`[data-category-id="${id}"]`);
      if (await row.locator("details").getAttribute("open") === null) await row.locator("summary").click();
      await page.locator(`[id="category-open-usage-${id}"]`).click();
    };
    const gateCount = () => page.evaluate(() => (window as unknown as { mobileUsageGate: { count(): number } }).mobileUsageGate.count());
    const settle = (index: number, fail: boolean) => page.evaluate(({ index, fail }) => (window as unknown as { mobileUsageGate: { settle(index: number, fail: boolean): Promise<void> } }).mobileUsageGate.settle(index, fail), { index, fail });
    const dialog = page.locator("#category-usage-dialog");
    for (const [iteration, lateError] of [false, true].entries()) {
      await openUsage(categoryIds[0]!);
      await expect.poll(gateCount).toBe(iteration * 2 + 1);
      expect(await back(page)).toBe(false);
      await expect(dialog).toBeHidden();
      await openUsage(categoryIds[1]!);
      await expect.poll(gateCount).toBe(iteration * 2 + 2);
      await settle(iteration * 2, lateError);
      await expect(dialog.getByRole("status")).toHaveText(locale === "en" ? "Loading records…" : "正在加载记录…");
      await expect(dialog.locator(".category-usage-row")).toHaveCount(0);
      await expect(dialog.locator(".form-alert")).toBeEmpty();
      await settle(iteration * 2 + 1, false);
      await expect(dialog.locator(".category-usage-row")).toHaveCount(1);
      await expect(dialog.locator(".category-usage-row")).toContainText("Current category record");
      await expect(dialog).not.toContainText("Previous category record");
      expect(await back(page)).toBe(false);
      await expect(dialog).toBeHidden();
    }
    await openUsage(categoryIds[0]!);
    await expect.poll(gateCount).toBe(5);
    expect(await back(page)).toBe(false);
    await expect(dialog).toBeHidden();
    expect(await back(page)).toBe(false);
    await expect(page).toHaveURL(/\/settings(?:\?.*)?$/);
    await settle(4, true);
    await expect(page.locator(".settings-overview")).toBeVisible();
    await expect(page.locator("#category-usage-dialog")).toHaveCount(0);
  });

  test(`${locale}: usage replacement retains observed catalog heads and transaction revisions`, async ({ page }) => {
    await ready(page, locale);
    const fixture = await page.evaluate(async () => {
      const date = new Date().toISOString().slice(0, 10);
      const snapshot = await window.lunaLedger.getSnapshot(date.slice(0, 7));
      const categories = snapshot.categories!.filter(category => category.type === "expense");
      const transaction = await window.lunaLedger.createTransaction({ type: "expense", date, amountMinor: "100", splits: [{ category: categories[0]!.id, amountMinor: "100" }], merchant: "Original usage revision", notes: "" });
      const reassign = window.lunaLedger.reassignCategory;
      const writes: Parameters<typeof reassign>[0][] = [];
      window.lunaLedger.reassignCategory = async input => { writes.push(input); return reassign(input); };
      Object.assign(window, { mobileUsageWrites: writes });
      return { sourceId: categories[0]!.id, targetId: categories[1]!.id, heads: snapshot.categoryHeadIds, transaction, month: date.slice(0, 7) };
    });
    await settings(page, "categories");
    const sourceRow = page.locator(`[data-category-id="${fixture.sourceId}"]`);
    await sourceRow.locator("summary").click();
    const usageButton = page.locator(`[id="category-open-usage-${fixture.sourceId}"]`);
    await usageButton.click();
    const dialog = page.locator("#category-usage-dialog");
    await expect(dialog.locator(".category-usage-row")).toHaveCount(1);
    await page.evaluate(async ({ targetId, heads }) => { await window.lunaLedger.updateCategory(targetId, { name: "Background catalog update" }, heads); }, fixture);
    await expect(page.locator("#category-batch-target option").filter({ hasText: "Background catalog update" })).toHaveCount(1);
    const afterCatalogUpdate = await readLedgerDocument(page, phrase);
    await page.locator("#category-usage-select-all").check();
    await page.locator("#category-batch-target").selectOption(fixture.targetId);
    await dialog.locator(".category-usage-toolbar button").click();
    await expect(dialog.locator(".form-alert")).toContainText(locale === "en" ? "category list changed" : "分类列表已变化");
    const writes = await page.evaluate(() => (window as unknown as { mobileUsageWrites: { expectedHeadIds: string[]; expectedRevisions: Record<string, number> }[] }).mobileUsageWrites);
    expect(writes[0]!.expectedHeadIds).toEqual(fixture.heads);
    expect(writes[0]!.expectedRevisions).toEqual({ [fixture.transaction.id]: fixture.transaction.revision });
    expect(await readLedgerDocument(page, phrase)).toEqual(afterCatalogUpdate);
    await expect(page.locator("#category-usage-select-all")).toBeChecked();
    await expect(page.locator("#category-batch-target")).toHaveValue(fixture.targetId);
    expect(await back(page)).toBe(false);
    await expect(dialog).toBeHidden();
    await usageButton.click();
    await expect(dialog.locator(".category-usage-row")).toHaveCount(1);
    await page.evaluate(async ({ transaction }) => {
      await window.lunaLedger.updateTransaction(transaction.id, { type: transaction.type, date: transaction.date, amountMinor: "100", splits: [{ category: transaction.splits[0]!.category, amountMinor: "100" }], merchant: transaction.merchant, notes: "Background transaction update" }, transaction.revision);
    }, fixture);
    const afterTransactionUpdate = await readLedgerDocument(page, phrase);
    await page.locator("#category-usage-select-all").check();
    await page.locator("#category-batch-target").selectOption(fixture.targetId);
    await dialog.locator(".category-usage-toolbar button").click();
    await expect(dialog.locator(".form-alert")).toContainText(locale === "en" ? "changed in another window" : "另一窗口已修改");
    expect(await readLedgerDocument(page, phrase)).toEqual(afterTransactionUpdate);
    const revisions = await page.evaluate(() => (window as unknown as { mobileUsageWrites: { expectedRevisions: Record<string, number> }[] }).mobileUsageWrites.at(-1)!.expectedRevisions);
    expect(revisions).toEqual({ [fixture.transaction.id]: fixture.transaction.revision });
    expect(await back(page)).toBe(false);
    await expect(dialog).toBeHidden();
    await usageButton.click();
    await expect(dialog.locator(".category-usage-row")).toContainText("Original usage revision");
    await page.locator("#category-usage-select-all").check();
    await page.locator("#category-batch-target").selectOption(fixture.targetId);
    await dialog.locator(".category-usage-toolbar button").click();
    await expect(dialog.locator(".category-usage-row")).toHaveCount(0);
    const after = await page.evaluate(({ month, transaction }) => window.lunaLedger.getSnapshot(month).then(snapshot => snapshot.transactions.find(item => item.id === transaction.id)), fixture);
    expect(after!.splits).toEqual([{ category: fixture.targetId, amountMinor: "-100" }]);
    expect(after!.notes).toBe("Background transaction update");
    expect(after!.revision).toBe(fixture.transaction.revision + 2);
  });
}
async function settings(page: Page, area?: string) {
  await page.locator("#open-secondary-menu").click();
  if (area) await page.locator(`[data-settings-area="${area}"]`).click();
}
async function back(page: Page) {
  return page.evaluate(() => window.dispatchEvent(new CustomEvent("luna:navigate-back", { cancelable: true })));
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
}
for (const locale of ["en", "zh-CN"] as const) {
  test(`${locale}: grouped settings and every registered module remain reachable at mobile widths`, async ({ page }) => {
    await ready(page, locale);
    await settings(page);
    await expect(page.locator(".settings-navigation")).toHaveCount(0);
    await expect(page.locator(".settings-overview-card")).toHaveCount(7);
    await expect(page.locator('[data-settings-area="advanced"]')).toHaveCount(0);
    for (const width of [320, 375, 457]) {
      await page.setViewportSize({ width, height: 999 });
      await noOverflow(page);
      await page.screenshot({ path: `captures/mobile-redesign-browser/settings-${locale}-${width}.png`, fullPage: true });
    }
    for (const area of ["ledgers", "categories", "preferences", "account", "sync", "backup", "conflicts"]) {
      await page.locator(`[data-settings-area="${area}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/settings/${area}(?:\\?.*)?$`));
      await expect(page.locator("#settings-back")).toBeVisible();
      await expect(page.locator(".settings-navigation")).toHaveCount(0);
      for (const width of [320, 375, 457]) {
        await page.setViewportSize({ width, height: 999 });
        await noOverflow(page);
      }
      await page.screenshot({ path: `captures/mobile-redesign-browser/settings-${area}-${locale}-457.png`, fullPage: true });
      expect(await back(page)).toBe(false);
      await expect(page).toHaveURL(/\/settings(?:\?.*)?$/);
    }
    await page.locator('[data-settings-area="sync"]').click();
    await expect(page.locator("#sync-go-to-account")).toBeVisible();
    await expect(page.locator("#server-sync-mode")).toHaveValue("automatic");
    await page.locator("#server-sync-advanced summary").click();
    await page.locator('a[href="/settings/sync/advanced"]').click();
    await expect(page.locator("#settings-title")).toContainText(locale === "en" ? "Advanced" : "高级");
    await page.locator("#config-sync-details summary").click();
    await expect(page.locator("#sync-endpoint")).toBeVisible();
    for (const width of [320, 375, 457]) {
      await page.setViewportSize({ width, height: 999 });
      await noOverflow(page);
    }
    await page.screenshot({ path: `captures/mobile-redesign-browser/settings-advanced-${locale}-457.png`, fullPage: true });
  });

  test(`${locale}: mobile category menu keeps protected deletion, loading errors and reassignment usable`, async ({ page }) => {
    await ready(page, locale);
    const { categoryId, targetId, transactionId, month } = await page.evaluate(async () => {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const snapshot = await window.lunaLedger.getSnapshot(date.slice(0, 7));
      const expense = snapshot.categories!.filter(item => item.type === "expense" && item.enabled);
      const transaction = await window.lunaLedger.createTransaction({ type: "expense", date, amountMinor: "500", splits: [{ category: expense[0]!.id, amountMinor: "500" }], merchant: "Usage fixture", notes: "" });
      return { categoryId: expense[0]!.id, targetId: expense[1]!.id, transactionId: transaction.id, month: date.slice(0, 7) };
    });
    await settings(page, "categories");
    await expect(page.locator("#category-name")).toBeHidden();
    await page.locator("#category-create-details summary").click();
    await page.locator("#category-name").fill("New expense fixture");
    await page.locator("#save-category").click();
    await expect(page.locator(".category-settings-item").filter({ hasText: "New expense fixture" })).toBeVisible();
    await page.locator("#category-tab-income").click();
    await expect(page.locator(".category-settings-item").filter({ hasText: "New expense fixture" })).toHaveCount(0);
    await page.locator("#category-name").fill("New income fixture");
    await page.locator("#save-category").click();
    await expect(page.locator(".category-settings-item").filter({ hasText: "New income fixture" })).toBeVisible();
    await page.locator("#category-tab-expense").click();
    const addedRow = page.locator(".category-settings-item").filter({ hasText: "New expense fixture" });
    await addedRow.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(addedRow.locator("details")).toHaveAttribute("open", "");
    page.once("dialog", dialog => dialog.accept("Renamed expense fixture"));
    await addedRow.getByRole("button", { name: locale === "en" ? "Rename" : "重命名", exact: true }).click();
    const renamedRow = page.locator(".category-settings-item").filter({ hasText: "Renamed expense fixture" });
    await renamedRow.getByRole("button", { name: locale === "en" ? "Disable" : "停用", exact: true }).click();
    await expect(renamedRow).toHaveClass(/is-disabled/);
    await renamedRow.getByRole("button", { name: locale === "en" ? "Enable" : "启用", exact: true }).click();
    await expect(renamedRow).not.toHaveClass(/is-disabled/);
    const row = page.locator(`[data-category-id="${categoryId}"]`);
    await row.locator("summary").click();
    await expect(renamedRow.locator("details")).not.toHaveAttribute("open", "");
    const usageButton = row.getByRole("button", { name: locale === "en" ? "View usage" : "查看使用情况", exact: true });
    await usageButton.click();
    await expect(page.locator("#category-usage-dialog")).toBeVisible();
    await expect(page.locator(".category-usage-row")).toHaveCount(1);
    expect(await back(page)).toBe(false);
    await expect(page.locator("#category-usage-dialog")).toBeHidden();
    await expect(usageButton).toBeFocused();
    await expect(page).toHaveURL(/\/settings\/categories/);
    await page.evaluate(() => {
      Object.assign(window, { mobileOriginalUsageRead: window.lunaLedger.getCategoryUsage });
      window.lunaLedger.getCategoryUsage = async () => { throw new Error("LUNA_ERROR:ledger-network"); };
    });
    await usageButton.click();
    await expect(page.locator("#category-usage-dialog")).toBeVisible();
    await expect(page.locator("#category-usage-dialog").getByRole("button", { name: locale === "en" ? "Try again" : "重试", exact: true })).toBeVisible();
    await expect(page.locator("#category-usage-dialog").getByRole("button", { name: locale === "en" ? "Delete" : "删除", exact: true })).toHaveCount(0);
    await page.evaluate(() => { window.lunaLedger.getCategoryUsage = (window as unknown as { mobileOriginalUsageRead: typeof window.lunaLedger.getCategoryUsage }).mobileOriginalUsageRead; });
    await page.locator("#category-usage-dialog").getByRole("button", { name: locale === "en" ? "Try again" : "重试", exact: true }).click();
    await expect(page.locator(".category-usage-row")).toHaveCount(1);
    expect(await back(page)).toBe(false);
    await expect(page.locator("#category-usage-dialog")).toBeHidden();
    page.once("dialog", dialog => dialog.accept());
    await row.getByRole("button", { name: locale === "en" ? "Delete" : "删除", exact: true }).click();
    await expect(page.locator("#category-usage-dialog")).toBeVisible();
    await expect(row).toHaveCount(1);
    await page.locator("#category-usage-select-all").check();
    await page.locator("#category-batch-target").selectOption(targetId);
    await page.locator(".category-usage-toolbar button").click();
    await expect(page.locator(".category-usage-row")).toHaveCount(0);
    const after = await page.evaluate(({ transactionId, month }) => window.lunaLedger.getSnapshot(month).then(snapshot => snapshot.transactions.find(item => item.id === transactionId)), { transactionId, month });
    expect(after!.amountMinor).toBe("-500");
    expect(after!.splits[0]!.category).toBe(targetId);
    expect(await back(page)).toBe(false);
    await expect(page.locator("#category-usage-dialog")).toBeHidden();
    await usageButton.click();
    await expect(page.locator(".category-usage-row")).toHaveCount(0);
    const usageDelete = page.locator("#category-usage-dialog").getByRole("button", { name: locale === "en" ? "Delete" : "删除", exact: true });
    await expect(usageDelete).toBeVisible();
    page.once("dialog", dialog => dialog.dismiss());
    await usageDelete.click();
    await expect(page.locator("#category-usage-dialog")).toBeVisible();
    await expect(row).toHaveCount(1);
    page.once("dialog", dialog => dialog.accept());
    await usageDelete.click();
    await expect(page.locator("#category-usage-dialog")).toBeHidden();
    await expect(row).toHaveCount(0);
    await expect(page.locator("#transaction-dialog")).toBeHidden();
    expect(await back(page)).toBe(false);
    await expect(page).toHaveURL(/\/settings(?:\?.*)?$/);
    expect(await back(page)).toBe(false);
    await expect(page).toHaveURL(/\/luna(?:\?.*)?$/);
    expect(await back(page)).toBe(true);
  });

  test(`${locale}: backup choices retain drafts and restore encrypted images into an empty mobile surface`, async ({ page, browser }) => {
    await ready(page, locale);
    await page.evaluate(async () => {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const image = await window.lunaLedger.stageTransactionImage("mobile-backup-fixture", Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), char => char.charCodeAt(0)), "image/png", 1, 1);
      await window.lunaLedger.createTransaction({ type: "expense", date, amountMinor: "100", splits: [{ category: "expense:0", amountMinor: "100" }], merchant: "Mobile encrypted image", notes: "", attachments: [{ draftToken: image.draftToken }] });
    });
    await settings(page, "backup");
    await expect(page.locator("#ledger-export-form")).toBeHidden();
    await expect(page.locator("#ledger-import-form")).toBeHidden();
    await page.locator("#backup-choose-save").click();
    await page.locator("#ledger-export-password").fill("short");
    await page.locator("#ledger-export-submit").click();
    await expect(page.locator("#ledger-export-password")).toBeFocused();
    await page.locator("#ledger-export-password").fill(phrase);
    await page.locator("#backup-choose-import").click();
    await page.locator("#ledger-import-password").fill("retained import password");
    await page.locator("#backup-choose-save").click();
    await expect(page.locator("#ledger-export-password")).toHaveValue(phrase);
    await expect(page.locator("#ledger-import-password")).toHaveValue("retained import password");
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#ledger-export-submit").click();
    const file = await (await downloadPromise).path();
    const raw = await readFile(file!);
    const decoded = await decodeFullBackup(new Uint8Array(raw), phrase);
    expect(decoded.attachments).toHaveLength(1);
    await expect(page.locator("#ledger-export-password")).toHaveValue("");
    page.once("dialog", dialog => dialog.dismiss());
    await page.locator("#settings-back").click();
    await expect(page).toHaveURL(/\/settings\/backup/);
    await expect(page.locator("#ledger-import-password")).toHaveValue("retained import password");
    const context = await browser.newContext();
    try {
      const restored = await context.newPage();
      await ready(restored, locale, false);
      await restored.locator("#setup-restore").click();
      await expect(restored.locator("#backup-choose-save")).toHaveCount(0);
      await expect(restored.locator("#ledger-import-form")).toBeVisible();
      await restored.locator("#ledger-import-file").setInputFiles({ name: "mobile.luna-backup", mimeType: "application/octet-stream", buffer: raw });
      await restored.locator("#ledger-import-password").fill("synthetic wrong password");
      await restored.locator("#ledger-import-confirm").check();
      await restored.locator("#ledger-import-submit").click();
      await expect(restored.locator("#ledger-tools-alert")).toContainText(locale === "en" ? "password" : "密码");
      expect((await restored.evaluate(() => window.lunaLedger.getSnapshot(new Date().toISOString().slice(0, 7)))).workspace).toBeNull();
      await restored.locator("#ledger-import-password").fill(phrase);
      await restored.locator("#ledger-import-submit").click();
      await expect(restored.locator("#ledger-import-password")).toHaveValue("");
      expect(await readLedgerDocument(restored, phrase)).toEqual(decoded.graph);
      await restored.reload();
      await restored.locator(".brand").click();
      await expect(restored.locator(".transaction-item")).toContainText("Mobile encrypted image");
      expect((await restored.evaluate(async () => (await window.lunaLedger.getSnapshot(new Date().toISOString().slice(0, 7))).transactions[0]!.attachments?.length))).toBe(1);
    } finally { await context.close(); }
  });

  test(`${locale}: mobile welcome creates with currency defaults and opens invalid advanced budget`, async ({ page }) => {
    await ready(page, locale, false);
    await expect(page.locator("#workspace-budget")).toBeHidden();
    for (const width of [320, 375, 457]) {
      await page.setViewportSize({ width, height: 999 });
      await noOverflow(page);
      await page.screenshot({ path: `captures/mobile-redesign-browser/welcome-${locale}-${width}.png`, fullPage: true });
    }
    await page.locator("#setup-advanced summary").click();
    await page.locator("#workspace-budget").fill("bad-budget");
    await page.locator("#setup-advanced summary").click();
    await page.locator("#workspace-name").fill("Welcome currency fixture");
    await page.locator("#workspace-form button[type=submit]").click();
    await expect(page.locator("#workspace-budget")).toBeFocused();
    await page.locator("#workspace-budget").fill("");
    await page.locator("#workspace-currency").selectOption("JPY");
    await expect(page.locator("#workspace-precision")).toHaveValue("0");
    await page.locator("#workspace-form button[type=submit]").click();
    await expect(page.locator("#transactions-title")).toBeVisible();
    const snapshot = await page.evaluate(() => window.lunaLedger.getSnapshot(new Date().toISOString().slice(0, 7)));
    expect(snapshot.workspace!.currency).toBe("JPY");
    expect(snapshot.workspace!.precision).toBe(0);
    expect(snapshot.summary!.budgetMinor).toBeNull();
  });
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`${locale}: mobile sign-in, bound unlock and offline retry preserve secrets and local history`, async ({ page, baseURL }) => {
    test.setTimeout(60_000);
    const database = await openTestDatabase();
    const username = `mobile_${randomUUID().replaceAll("-", "")}_${"x".repeat(24)}`;
    const accountPassword = "synthetic mobile account password";
    await setAccount(database, username, accountPassword);
    const service = await createApp({ database, objectStore: new MemoryServerObjectStore(), origins: [new URL(baseURL!).origin] });
    const address = await service.listen({ host: "127.0.0.1", port: 0 });
    try {
      await ready(page, locale);
      await settings(page, "sync");
      await page.locator("#sync-go-to-account").click();
      await expect(page.locator("#server-url")).toHaveValue("");
      await expect(page.locator("#server-device")).toBeHidden();
      await page.locator("#server-url").fill(address);
      await page.locator("#server-username").fill(username);
      await page.locator("#server-login-password").fill(accountPassword);
      await page.locator("#server-login-password-visibility").click();
      await expect(page.locator("#server-login-password")).toHaveAttribute("type", "text");
      await page.locator("#server-login").click();
      await expect(page.locator("#server-account-name")).toHaveText(username);
      await expect(page.locator("#server-login-password")).toHaveCount(0);
      await page.locator("#server-source").selectOption("legacy-local");
      await page.locator("#server-ledger-password").fill(phrase);
      await page.locator("#server-connect").click();
      await expect(page.locator("#server-sync-now")).toBeEnabled();
      // Connecting selects a new profile with its own local settings defaults.
      // Select the intended locale in that profile before claiming its coverage.
      await page.evaluate(locale => window.lunaLedger.updateSettings({ locale }), locale);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      const graph = await readLedgerDocument(page, phrase);
      for (const width of [320, 375, 457]) {
        await page.setViewportSize({ width, height: 999 });
        await noOverflow(page);
      }
      await page.screenshot({ path: `captures/mobile-redesign-browser/account-bound-${locale}.png`, fullPage: true });
      await page.evaluate(() => { Object.assign(window, { mobileAccountNavigationToken: "same-mounted-session" }); });
      await page.locator("#server-sync-advanced summary").click();
      await page.locator('a[href="/settings/sync/advanced"]').click();
      await expect(page.locator("#settings-title")).toContainText(locale === "en" ? "Advanced" : "高级");
      expect(await page.evaluate(() => (window as unknown as { mobileAccountNavigationToken?: string }).mobileAccountNavigationToken)).toBe("same-mounted-session");
      await page.locator("#settings-back").click();
      await page.locator('[data-settings-area="account"]').click();
      await expect(page.locator("#server-account-name")).toHaveText(username);
      await expect(page.locator("#server-sync-now")).toBeEnabled();
      await page.locator("#server-disconnect").click();
      await expect(page.locator("#server-unlock-password")).toBeVisible();
      await page.screenshot({ path: `captures/mobile-redesign-browser/account-unlock-${locale}.png`, fullPage: true });
      await page.locator("#server-unlock-password").fill(phrase);
      await page.locator("#server-unlock-password-visibility").click();
      await page.locator("#server-unlock").click();
      await expect(page.locator("#server-sync-now")).toBeEnabled();
      await expect(page.locator("#server-unlock-password")).toHaveCount(0);
      await expect(page.locator("#server-sync-mode")).toHaveValue("automatic");
      await page.context().setOffline(true);
      await expect(page.locator("#server-sync-now")).toBeDisabled();
      expect(await readLedgerDocument(page, phrase)).toEqual(graph);
      await page.context().setOffline(false);
      await expect(page.locator("#server-sync-now")).toBeEnabled();
      await page.locator("#server-logout").click();
      await expect(page.locator("#server-login-password")).toHaveValue("");
      await expect(page.locator("#server-login-password")).toHaveAttribute("type", "password");
    } finally {
      await page.context().setOffline(false);
      await service.close();
      database.close();
    }
  });

  test(`${locale}: mobile conflict query failure stays distinct from empty and explicit candidates`, async ({ page }) => {
    await ready(page, locale);
    await page.evaluate(async () => {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      await window.lunaLedger.createTransaction({ type: "expense", date, amountMinor: "250", splits: [{ category: "expense:0", amountMinor: "250" }], merchant: "Conflict fixture", notes: "" });
    });
    const graph = (await readLedgerDocument(page, phrase))!;
    const original = graph.revisions.find(item => item.kind === "transaction")!;
    if (original.kind !== "transaction") throw new Error("Missing fixture transaction");
    const transaction = isStoredTransaction(original.value) ? storedTransactionToTransaction(original.value) : original.value;
    const branch = (id: string, notes: string) => appendLedgerRevision(graph, { id, kind: "transaction", entityId: transaction.id,
      value: reviseTransaction(transaction, { type: transaction.type, date: transaction.date, amountMinor: "250", splits: [{ category: "expense:0", amountMinor: "250" }], merchant: transaction.merchant, notes }, graph.workspace.precision, new Date().toISOString()) });
    const conflicted = mergeLedgerDocuments(branch("mobile-left", "Chosen safe version"), branch("mobile-right", "Other safe version"));
    await page.evaluate(({ raw, phrase }) => window.lunaLedger.importLedgerBackup(raw, phrase), { raw: await encryptLedgerDocument(conflicted, phrase), phrase });
    await page.evaluate(() => {
      const originalRead = window.lunaLedger.getLedgerConflicts;
      window.lunaLedger.getLedgerConflicts = async () => { throw new Error("LUNA_ERROR:ledger-network"); };
      Object.assign(window, { mobileOriginalConflictRead: originalRead });
    });
    await settings(page, "conflicts");
    await expect(page.locator("#ledger-conflicts-retry")).toBeVisible();
    await expect(page.locator("#ledger-conflicts-empty")).toHaveCount(0);
    await page.evaluate(() => { window.lunaLedger.getLedgerConflicts = (window as unknown as { mobileOriginalConflictRead: typeof window.lunaLedger.getLedgerConflicts }).mobileOriginalConflictRead; });
    await page.locator("#ledger-conflicts-retry").click();
    await expect(page.locator(".ledger-conflict-candidate")).toHaveCount(2);
    await noOverflow(page);
    await page.screenshot({ path: `captures/mobile-redesign-browser/conflict-candidates-${locale}.png`, fullPage: true });
    await page.locator(".ledger-conflict-candidate").filter({ hasText: "Chosen safe version" }).getByRole("button").click();
    await expect(page.locator("#ledger-conflicts-empty")).toBeVisible();
    const resolved = (await readLedgerDocument(page, phrase))!;
    expect(resolved.revisions.filter(item => item.kind === "transaction")).toHaveLength(4);
    const resolution = resolved.revisions.find(item => !conflicted.revisions.some(previous => previous.id === item.id))!;
    expect(resolution.parents).toEqual(expect.arrayContaining(["mobile-left", "mobile-right"]));
  });

  test(`${locale}: ledger, statistics and budget share a centered native period without extra visible titles`, async ({ page }) => {
    await ready(page, locale);
    for (const width of [320, 375, 457]) {
      await page.setViewportSize({ width, height: 999 });
      const positions: { x: number; y: number; width: number; height: number }[] = [];
      for (const index of [0, 1, 2]) {
        const navigation = page.locator(".primary-navigation-link").nth(index);
        await navigation.click();
        await expect(page).toHaveURL(new RegExp(`/${["luna", "statistics", "budget"][index]}(?:\\?.*)?$`));
        await expect(navigation).toHaveAttribute("aria-current", "page");
        await expect(navigation).toHaveClass(/is-active/);
        // Avoid preserving the previous navigation item's pointer hover in a
        // diagnostic screenshot after the Router has selected the next page.
        await page.mouse.move(width - 1, 0);
        const period = page.locator(index === 1 ? "#statistics-anchor" : "#month-picker");
        const box = (await period.boundingBox())!;
        positions.push(box);
        expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
        if (index !== 0) {
          const title = page.locator(index === 1 ? "#category-title" : "#budget-editor-title");
          await expect(title).toHaveClass("visually-hidden");
        }
        await noOverflow(page);
        await page.screenshot({ path: `captures/mobile-redesign-browser/period-${index}-${locale}-${width}.png`, fullPage: true, animations: "disabled" });
      }
      expect(Math.max(...positions.map(box => box.y)) - Math.min(...positions.map(box => box.y))).toBeLessThan(2);
    }
  });
}
