import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createApp } from "../../src/server/app";
import { setAccount } from "../../src/server/auth";
import { MemoryServerObjectStore } from "../../src/server/storage/object-store";
import { openTestDatabase } from "../server/support";
import { readLedgerDocument } from "./helpers/public-ledger";
const accountPassword = "synthetic-account-password-123";
const ledgerPassword = "synthetic-ledger-password-456";
const preferencePassword = "synthetic-preference-password-789";
const PNG_1X1 = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
  0, 0, 0, 0,
];
async function account(page: Page) {
  await page.locator("#open-secondary-menu").click();
  await page.locator('[data-settings-area="account"]').click();
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

async function chooseCategory(page: Page, name = "Food") {
  await page.locator("#choose-category").click();
  await page.getByRole("button", { name, exact: true }).click();
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
    await page.locator("#primary-record").click();
    await page.locator("#transaction-amount").fill("12.50");
    await chooseCategory(page);
    await page.locator("#transaction-advanced-details summary").click();
    await page.locator("#transaction-merchant").fill("Private meal");
    await page.locator("#save-transaction").click();
    await expect(page.locator("#transaction-list-region")).toContainText(
      "Private meal",
    );
    const imageTransaction = await page.evaluate(async (bytes) => {
      const staged = await window.lunaLedger.stageTransactionImage(
        "server-image-draft",
        new Uint8Array(bytes),
        "image/png",
        1,
        1,
      );
      const transaction = await window.lunaLedger.createTransaction({
        type: "expense",
        amountMinor: "980",
        date: "2026-09-05",
        splits: [{ category: "expense:0", amountMinor: "980" }],
        merchant: "Receipt with image",
        notes: "Encrypted HTTP attachment",
        attachments: [{ draftToken: staged.draftToken }],
      });
      const loaded = await window.lunaLedger.readTransactionImage(
        transaction.id,
        staged.metadata.id,
      );
      const result = {
        transactionId: transaction.id,
        attachmentId: staged.metadata.id,
        bytes: Array.from(loaded.bytes),
        mime: loaded.mime,
        width: loaded.width,
        height: loaded.height,
      };
      loaded.bytes.fill(0);
      return result;
    }, PNG_1X1);
    expect(imageTransaction).toEqual({
      transactionId: expect.any(String),
      attachmentId: expect.any(String),
      bytes: PNG_1X1,
      mime: "image/png",
      width: 1,
      height: 1,
    });
    const original = await readLedgerDocument(page, ledgerPassword);
    await page.locator("#primary-record").click();
    await page.locator("#transaction-amount").fill("25.60");
    await chooseCategory(page);
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
    const linkedProfileId = (
      await page.evaluate(() => window.lunaLedger.server!.status())
    ).profile.id;
    await page.locator("#server-disconnect").click();
    await expect(page.locator("#server-unlock-form")).toBeVisible();
    await expect(page.locator("#server-unlock-password")).toHaveAttribute("type", "password");
    await page.locator("#server-unlock-password").fill(ledgerPassword);
    await page.locator("#server-unlock-password-visibility").click();
    await expect(page.locator("#server-unlock-password")).toHaveAttribute("type", "text");
    await page.locator("#server-unlock").click();
    await expect(page.locator("#server-sync-now")).toBeEnabled();
    await expect(page.locator("#server-unlock-form")).toHaveCount(0);
    await expect(page.locator("#server-sync-status")).toContainText(
      "synchronized",
    );
    expect(
      await readLedgerDocument(page, ledgerPassword),
    ).toEqual(original);
    const firstImage = await page.evaluate(
      async ({ transactionId, attachmentId }) => {
        const result = await window.lunaLedger.readTransactionImage(
          transactionId,
          attachmentId,
        );
        const value = {
          bytes: Array.from(result.bytes),
          mime: result.mime,
          width: result.width,
          height: result.height,
        };
        result.bytes.fill(0);
        return value;
      },
      imageTransaction,
    );
    expect(firstImage).toEqual({
      bytes: PNG_1X1,
      mime: "image/png",
      width: 1,
      height: 1,
    });
    const binding = (await page.evaluate(() => window.lunaLedger.server!.status())).profile.binding!;
    const object = await objectStore.get(`ledger/${binding.ledgerId}/v1.enc.json`);
    expect(object).not.toBeNull();
    for (const secret of [accountPassword, ledgerPassword, "Private meal"])
      expect(object!.body.toString("utf8")).not.toContain(secret);
    const attachmentRow = database.sqlite
      .prepare(
        "SELECT object_key FROM attachments WHERE ledger_id = ? AND attachment_id = ?",
      )
      .get(binding.ledgerId, imageTransaction.attachmentId) as {
      object_key: string;
    };
    const attachmentObject = await objectStore.get(attachmentRow.object_key);
    expect(attachmentObject).not.toBeNull();
    expect(attachmentObject!.body.equals(Buffer.from(PNG_1X1))).toBe(false);
    expect(attachmentObject!.body.byteLength).toBe(PNG_1X1.length + 16);
    // The Web host keeps the short-lived account and ledger session in its
    // same-origin SharedWorker, so a normal reload should not ask the user to
    // log in or unlock the ledger again.
    await page.reload();
    await expect(page.locator("#local-ledger-start")).toBeVisible();
    await expect(page.locator("#local-ledger-start li")).toHaveCount(2);
    await expect(
      page.locator('#local-ledger-start button[aria-current="true"]'),
    ).toHaveText("Currently open");
    await page
      .locator('#local-ledger-start button[aria-current="true"]')
      .click();
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
    await second.locator("#setup-connect").click();
    await expect(second.locator("#workspace-form")).toHaveCount(0);
    expect(await readLedgerDocument(second, ledgerPassword)).toBeNull();
    await secondContext.setOffline(true);
    await expect(second.locator("#server-login")).toBeDisabled();
    expect(await readLedgerDocument(second, ledgerPassword)).toBeNull();
    await secondContext.setOffline(false);
    await login(second, apiUrl, username, "Second browser");
    await second.locator("#server-ledger-password").fill("incorrect ledger passphrase");
    await second.locator("#server-connect").click();
    await expect(second.locator("#server-alert")).not.toBeEmpty();
    await expect(second.locator("#server-connect")).toBeEnabled();
    expect(await readLedgerDocument(second, ledgerPassword)).toBeNull();
    await second.locator("#server-ledger-password").fill(ledgerPassword);
    await second.locator("#server-connect").click();
    await expect(second.locator("#server-sync-now")).toBeEnabled();
    await second.locator(".brand").click();
    await expect(second.locator("#transaction-list-region")).toContainText(
      "Private meal",
    );
    const secondImage = await second.evaluate(
      async ({ transactionId, attachmentId }) => {
        const result = await window.lunaLedger.readTransactionImage(
          transactionId,
          attachmentId,
        );
        const value = {
          bytes: Array.from(result.bytes),
          mime: result.mime,
          width: result.width,
          height: result.height,
        };
        result.bytes.fill(0);
        return value;
      },
      imageTransaction,
    );
    expect(secondImage).toEqual(firstImage);
    await second.reload();
    await expect(second.locator("#local-ledger-start")).toBeVisible();
    await second
      .locator('#local-ledger-start button[aria-current="true"]')
      .click();
    await second.waitForFunction(
      () => typeof window.lunaLedger?.readTransactionImage === "function",
    );
    const secondAfterRestart = await second.evaluate(
      async ({ transactionId, attachmentId }) => {
        const result = await window.lunaLedger.readTransactionImage(
          transactionId,
          attachmentId,
        );
        const value = {
          bytes: Array.from(result.bytes),
          mime: result.mime,
          width: result.width,
          height: result.height,
        };
        result.bytes.fill(0);
        return value;
      },
      imageTransaction,
    );
    expect(secondAfterRestart).toEqual(firstImage);
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
    await account(second);
    await second.locator("#server-sync-now").click();
    await expect(second.locator("#server-account-state")).toContainText(
      "Signed out",
    );
    await expect(second.locator("#server-account-name")).toHaveCount(0);
    await login(second, apiUrl, username, "Second browser renewed");
    await second.locator(".brand").click();
    await expect(second.locator("#transaction-list-region")).toContainText(
      "Private meal",
    );
    await page.locator("#server-logout").click();
    await expect(page.locator("#server-account-state")).toContainText(
      "Signed out",
    );
    await expect(page.locator("#server-account-name")).toHaveCount(0);
    await page.context().setOffline(true);
    await page.locator(".brand").click();
    await expect(page.locator("#transaction-list-region")).toContainText(
      "Private meal",
    );
    await account(page);
    await page.locator("#server-local-copies > summary").click();
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
      await readLedgerDocument(page, ledgerPassword),
    ).toEqual(original);
    const local = await page.evaluate(() =>
      JSON.stringify({ ...localStorage }),
    );
    for (const secret of [accountPassword, ledgerPassword, preferencePassword])
      expect(local).not.toContain(secret);
    await page.context().setOffline(false);
    await page.reload();
    const startupPicker = page.locator("#local-ledger-start");
    await expect(startupPicker).toBeVisible();
    await expect(startupPicker.locator('button[aria-current="true"]')).toHaveText(
      "Currently open",
    );
    await startupPicker.getByRole("button", { name: "Open local copy" }).click();
    await expect
      .poll(async () => {
        try {
          return (
            await page.evaluate(() => window.lunaLedger.server!.status())
          ).profile.id;
        } catch {
          return null;
        }
      })
      .toBe(linkedProfileId);
    await page.evaluate(() =>
      window.lunaLedger.createTransaction({
        type: "expense",
        amountMinor: "321",
        date: "2026-09-05",
        splits: [{ category: "expense:0", amountMinor: "321" }],
        merchant: "Linked copy only",
      }),
    );
    expect(await readLedgerDocument(page, ledgerPassword)).not.toEqual(original);
    await page.locator("#server-local-copies > summary").click();
    await page
      .locator("#server-profiles-title")
      .locator("..")
      .locator("li")
      .filter({ hasText: "Original local ledger" })
      .getByRole("button", { name: "Open local copy" })
      .click();
    await expect
      .poll(async () => {
        try {
          return (
            await page.evaluate(() => window.lunaLedger.server!.status())
          ).profile.id;
        } catch {
          return null;
        }
      })
      .toBe("legacy-local");
    expect(await readLedgerDocument(page, ledgerPassword)).toEqual(original);
    await page.locator(".brand").click();
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
