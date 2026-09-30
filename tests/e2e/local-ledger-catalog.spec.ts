import { expect, test } from "@playwright/test";

const ledgerPassword = "catalog-fixture-passphrase";

async function account(page: import("@playwright/test").Page) {
  await page.locator("#open-secondary-menu").click();
  await page.locator('[data-settings-area="account"]').click();
  await expect(page.locator("#server-account-title")).toBeVisible();
}

async function activeProfileId(page: import("@playwright/test").Page) {
  try {
    return await page.evaluate(async () => (await window.lunaLedger.server!.status()).profile.id);
  } catch {
    return null;
  }
}

async function profileRow(page: import("@playwright/test").Page, name: string) {
  await page.locator("#server-local-copies > summary").click();
  return page
    .locator("#server-profiles-title")
    .locator("..")
    .locator("li")
    .filter({ hasText: name });
}

test("local catalog creates isolated ledgers and restores a backup into a fresh one", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.locator("#workspace-name").fill("Primary ledger");
  await page.locator("#workspace-form button[type=submit]").click();
  await expect(page.locator("#transactions-title")).toBeVisible();

  const originalId = await page.evaluate(async () =>
    (await window.lunaLedger.server!.status()).profile.id,
  );
  const backup = await page.evaluate(
    (password) => window.lunaLedger.exportLedgerBackup(password),
    ledgerPassword,
  );
  await account(page);

  let originalRow = await profileRow(page, "Primary ledger");
  await expect(originalRow).toContainText("Browser SQLite (OPFS)");
  await expect(originalRow).toContainText("Last opened");
  await expect(originalRow).toContainText("Local only");
  await page.locator("#create-local-ledger").click();
  await expect.poll(() => activeProfileId(page)).toMatch(/^local-/);
  await page.locator("#setup-back").click();
  await page.locator("#workspace-name").fill("Separate ledger");
  await page.locator("#workspace-form button[type=submit]").click();
  await expect(page.locator("#transactions-title")).toBeVisible();
  const separateId = await page.evaluate(async () =>
    (await window.lunaLedger.server!.status()).profile.id,
  );
  expect(separateId).not.toBe(originalId);

  await account(page);
  originalRow = await profileRow(page, "Original local ledger");
  await originalRow.getByRole("button", { name: "Open local copy" }).click();
  await expect.poll(() => activeProfileId(page)).toBe(originalId);
  expect(
    (await page.evaluate(() => window.lunaLedger.getSnapshot("2026-09"))).workspace?.name,
  ).toBe("Primary ledger");

  await account(page);
  await page.locator("#server-local-copies > summary").click();
  await page.locator("#import-backup-into-new-ledger").click();
  await expect(page.locator("#ledger-import-file")).toBeVisible();
  const importedId = await page.evaluate(async () =>
    (await window.lunaLedger.server!.status()).profile.id,
  );
  expect(importedId).not.toBe(originalId);
  expect(importedId).not.toBe(separateId);
  await page.locator("#ledger-import-file").setInputFiles({
    name: "primary-ledger.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await page.locator("#ledger-import-password").fill(ledgerPassword);
  await page.locator("#ledger-import-confirm").check();
  await page.locator("#ledger-import-submit").click();
  await expect
    .poll(async () => (await page.evaluate(() => window.lunaLedger.getSnapshot("2026-09"))).workspace?.name)
    .toBe("Primary ledger");

  await account(page);
  const separateRow = await profileRow(page, "Separate ledger");
  await separateRow.getByRole("button", { name: "Open local copy" }).click();
  await expect.poll(() => activeProfileId(page)).toBe(separateId);
  expect(
    (await page.evaluate(() => window.lunaLedger.getSnapshot("2026-09"))).workspace?.name,
  ).toBe("Separate ledger");

  await account(page);
  originalRow = await profileRow(page, "Original local ledger");
  await originalRow.getByRole("button", { name: "Open local copy" }).click();
  await expect.poll(() => activeProfileId(page)).toBe(originalId);
  expect(
    (await page.evaluate(() => window.lunaLedger.getSnapshot("2026-09"))).workspace?.name,
  ).toBe("Primary ledger");
});

test("OPFS catalog marks a missing inactive ledger unavailable without recreating it", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#workspace-name").fill("Preserved original");
  await page.locator("#workspace-form button[type=submit]").click();
  await expect(page.locator("#transactions-title")).toBeVisible();
  const originalId = await activeProfileId(page);
  expect(originalId).toBe("legacy-local");

  await account(page);
  await profileRow(page, "Preserved original");
  await page.locator("#create-local-ledger").click();
  await expect.poll(() => activeProfileId(page)).toMatch(/^local-/);
  const missingId = await activeProfileId(page);
  expect(missingId).toMatch(/^local-/);
  await page.locator("#setup-back").click();
  await page.locator("#workspace-name").fill("Missing local copy");
  await page.locator("#workspace-form button[type=submit]").click();
  await expect(page.locator("#transactions-title")).toBeVisible();

  await account(page);
  const originalRow = await profileRow(page, "Preserved original");
  await originalRow.getByRole("button", { name: "Open local copy" }).click();
  await expect.poll(() => activeProfileId(page)).toBe(originalId);
  await page.reload();
  await expect(page.locator("#local-ledger-start")).toBeVisible();
  await page.locator('#local-ledger-start button[aria-current="true"]').click();

  const removed = await page.evaluate(async (profileId) => {
    const name = `luna-ledger-${profileId.replace(/[^A-Za-z0-9_-]/g, "-")}`;
    const root = await navigator.storage.getDirectory();
    try {
      await root.removeEntry(`${name}.sqlite3`);
      return true;
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError")
        throw error;
    }
    try {
      const pool = await root.getDirectoryHandle(".luna-sqlite");
      await pool.removeEntry(name, { recursive: true });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError")
        return false;
      throw error;
    }
  }, missingId);
  expect(removed).toBe(true);

  await account(page);
  const missingRow = await profileRow(page, "Missing local copy");
  await expect(missingRow).toContainText("This local ledger is missing from this device.");
  await expect(missingRow.getByRole("button", { name: "Open local copy" })).toBeDisabled();
  const selectionError = await page.evaluate(async (id) => {
    try {
      await window.lunaLedger.server!.selectProfile(id);
      return "opened";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, missingId);
  expect(selectionError).toContain("server-not-found");
  expect(await activeProfileId(page)).toBe(originalId);
  const recreated = await page.evaluate(async (profileId) => {
    const name = `luna-ledger-${profileId.replace(/[^A-Za-z0-9_-]/g, "-")}`;
    const root = await navigator.storage.getDirectory();
    try {
      await root.getFileHandle(`${name}.sqlite3`);
      return true;
    } catch {
      return false;
    }
  }, missingId);
  expect(recreated).toBe(false);
});
