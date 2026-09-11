import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createApp } from "../../src/server/app";
import { setAccount } from "../../src/server/auth";
import { MemoryServerObjectStore } from "../../src/server/storage/object-store";
import { openTestDatabase } from "../server/support";
const accountPassword = "synthetic-account-password-123";
const ledgerPassword = "synthetic-ledger-password-456";
const preferencePassword = "synthetic-preference-password-789";
async function account(page: Page) {
  await page.locator("#open-secondary-menu").click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Account", exact: true })
    .click();
  await expect(page.locator("#server-account-title")).toBeVisible();
}
async function login(
  page: Page,
  baseUrl: string,
  username: string,
  device: string,
) {
  await page.locator("#server-url").fill(baseUrl);
  await page.locator("#server-username").fill(username);
  await page.locator("#server-login-password").fill(accountPassword);
  await page.locator("#server-device").fill(device);
  await page.locator("#server-login").click();
  await expect(page.locator("#server-account-name")).toHaveText(username);
}
test("real server login, encrypted copy, second-device restore and offline profile recovery", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const database = await openTestDatabase();
  const username = `ui_${randomUUID().slice(0, 8)}`;
  await setAccount(database, username, accountPassword);
  const objectStore = new MemoryServerObjectStore();
  const app = await createApp({
    database,
    objectStore,
    origins: [new URL(baseURL!).origin],
  });
  const apiUrl = await app.listen({ host: "127.0.0.1", port: 0 });
  const secondContext = await browser.newContext({
    baseURL: baseURL!,
    locale: "en-US",
  });
  try {
    await page.goto("/");
    await page.locator("#workspace-name").fill("Original offline family");
    await page.locator("#workspace-form button").click();
    await expect(page.locator("#transactions-title")).toBeVisible();
    await page.locator("#record-expense").click();
    await page.locator("#transaction-amount").fill("12.50");
    await page.locator("#transaction-category").fill("Private meal");
    await page.locator("#save-transaction").click();
    await expect(page.locator("#transaction-list-region")).toContainText(
      "Private meal",
    );
    const original = await page.evaluate(() =>
      window.lunaLedger.getLedgerDocument(),
    );
    await page.locator("#record-expense").click();
    await page.locator("#transaction-amount").fill("25.60");
    await page.locator("#transaction-category").fill("Retained login draft");
    await page.locator("#close-transaction").click();
    await account(page);
    await login(page, apiUrl, username, "First browser");
    await expect(page.locator("#transaction-amount")).toHaveValue("25.60");
    expect(
      (
        database.sqlite
          .prepare(
            "SELECT count(*) AS count FROM ledgers WHERE owner_user_id = (SELECT id FROM users WHERE username = ?)",
          )
          .get(username) as { count: number }
      ).count,
    ).toBe(0);
    expect(
      (await page.evaluate(() => window.lunaLedger.server!.status())).profile
        .id,
    ).toBe("legacy-local");
    await page.locator("#server-source").selectOption("legacy-local");
    await page.locator("#server-ledger-password").fill(ledgerPassword);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.locator("#server-connect").click();
    await expect(page.locator("#server-sync-now")).toBeEnabled();
    await expect(page.locator("#server-sync-status")).toContainText(
      "synchronized",
    );
    expect(
      await page.evaluate(() => window.lunaLedger.getLedgerDocument()),
    ).toEqual(original);
    const binding = (await page.evaluate(() => window.lunaLedger.server!.status())).profile.binding!;
    const object = await objectStore.get(`ledger/${binding.ledgerId}/v1.enc.json`);
    expect(object).not.toBeNull();
    for (const secret of [accountPassword, ledgerPassword, "Private meal"])
      expect(object!.body.toString("utf8")).not.toContain(secret);
    // The Web host keeps the short-lived account and ledger session in its
    // same-origin SharedWorker, so a normal reload should not ask the user to
    // log in or unlock the ledger again.
    await page.reload();
    await expect(page.locator("#server-account-name")).toHaveText(username);
    await expect(page.locator("#server-sync-now")).toBeEnabled();
    await expect(page.locator("#server-sync-status")).toContainText(
      "synchronized",
    );
    await page.locator("#server-preferences-password").fill(preferencePassword);
    await page.locator("#server-preferences-enable").click();
    await expect(page.locator("#server-preferences-sync")).toBeEnabled();
    await page.locator("#server-preferences-sync").click();
    await expect(page.locator("#server-preferences-status")).toContainText(
      /sync/i,
    );
    const second = await secondContext.newPage();
    await second.goto("/");
    const startupPicker = second.locator("#local-ledger-start");
    await expect
      .poll(async () =>
        (await startupPicker.count()) +
        (await second.locator("#workspace-name").count()),
      )
      .toBeGreaterThan(0);
    if (await startupPicker.count())
      await startupPicker.getByRole("button", { name: "Currently open" }).click();
    await expect(second.locator("#workspace-name")).toBeVisible();
    await account(second);
    await login(second, apiUrl, username, "Second browser");
    await second.locator("#server-ledger-password").fill(ledgerPassword);
    await second.locator("#server-connect").click();
    await expect(second.locator("#server-sync-now")).toBeEnabled();
    await expect(second.locator("#transaction-list-region")).toContainText(
      "Private meal",
    );
    await page.locator("#server-sessions-refresh").click();
    await expect(
      page.locator("#server-sessions-title").locator(".."),
    ).toContainText("Second browser");
    await page
      .locator("#server-sessions-title")
      .locator("..")
      .locator("li")
      .filter({ hasText: "Second browser" })
      .getByRole("button")
      .click();
    await second.locator("#server-sync-now").click();
    await expect(second.locator("#server-account-state")).toContainText(
      "Signed out",
    );
    await expect(second.locator("#server-account-name")).toHaveCount(0);
    await login(second, apiUrl, username, "Second browser renewed");
    await expect(second.locator("#transaction-list-region")).toContainText(
      "Private meal",
    );
    await page.locator("#server-logout").click();
    await expect(page.locator("#server-account-state")).toContainText(
      "Signed out",
    );
    await expect(page.locator("#server-account-name")).toHaveCount(0);
    await page.context().setOffline(true);
    await page.locator("#close-secondary-menu").click();
    await expect(page.locator("#transaction-list-region")).toContainText(
      "Private meal",
    );
    await account(page);
    const originalRow = page
      .locator("#server-profiles-title")
      .locator("..")
      .locator("li")
      .filter({ hasText: "Original local ledger" });
    await originalRow.getByRole("button", { name: "Open local copy" }).click();
    await expect
      .poll(
        async () => {
          try {
            return (
              await page.evaluate(() => window.lunaLedger.server!.status())
            ).profile.id;
          } catch {
            return null;
          }
        },
      )
      .toBe("legacy-local");
    expect(
      await page.evaluate(() => window.lunaLedger.getLedgerDocument()),
    ).toEqual(original);
    const local = await page.evaluate(() =>
      JSON.stringify({ ...localStorage }),
    );
    for (const secret of [accountPassword, ledgerPassword, preferencePassword])
      expect(local).not.toContain(secret);
    await page.context().setOffline(false);
    await page.reload();
    await expect(page.locator("#transaction-list-region")).toContainText(
      "Private meal",
    );
  } finally {
    await page.context().setOffline(false);
    await secondContext.close();
    await app.close();
    database.close();
  }
});
