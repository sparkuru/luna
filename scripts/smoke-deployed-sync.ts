import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, expect as baseExpect, type Page } from "@playwright/test";
import { decryptLedgerDocument } from "../src/shared/ledger-crypto";
import type { LedgerDocument } from "../src/shared/ledger-sync";

const expect = baseExpect.configure({ timeout: 60_000 });

// Deliberately separate from fixture-based Playwright tests: this writes to an
// explicitly supplied disposable account on a real, trusted HTTPS deployment.
async function main(): Promise<void> {
  const base = process.env.LUNA_DEPLOYED_URL;
  const credentialFile = process.env.LUNA_DEPLOYED_CREDENTIALS;
  assert(process.env.LUNA_DEPLOYED_DISPOSABLE === "1", "Explicit disposable-account opt-in required");
  assert(base && credentialFile, "Set LUNA_DEPLOYED_URL and LUNA_DEPLOYED_CREDENTIALS");
  const url = new URL(base);
  assert(url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash, "A bare HTTPS origin is required");
  const info = await stat(credentialFile);
  assert(info.isFile() && (info.mode & 0o077) === 0 && info.uid === process.getuid?.(), "Credentials must be an owner-only file owned by this user");
  const credentials: unknown = JSON.parse(await readFile(credentialFile, "utf8"));
  assert(credentials && typeof credentials === "object", "Invalid credential object");
  const { username, password, ledgerPassword } = credentials as Record<string, unknown>;
  assert(typeof username === "string" && username.length > 0 && typeof password === "string" && password.length > 0 && typeof ledgerPassword === "string" && ledgerPassword.length >= 12, "Invalid credential fields");
  const canonicalUsername = username.normalize("NFKC").trim().toLowerCase();
  assert(/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(canonicalUsername), "Invalid account name");
  const output = process.env.LUNA_DEPLOYED_OUTPUT ?? `/tmp/luna-deployed-smoke-${randomUUID()}`;
  await mkdir(output, { mode: 0o700 });
  const browser = await chromium.launch({ channel: "chrome" });
  const checks: string[] = [];
  let stage = "startup";
  let activePage: Page | undefined;
  const check = (name: string) => { checks.push(name); console.log(`PASS ${name}`); };
  try {
    const firstContext = await browser.newContext({ baseURL: url.origin, locale: "en-US" });
    const secondContext = await browser.newContext({ baseURL: url.origin, locale: "en-US" });
    for (const context of [firstContext, secondContext]) context.setDefaultTimeout(120_000);
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    activePage = first;
    for (const page of [first, second]) {
      page.on("response", (response) => {
        if (new URL(response.url()).pathname === "/api/v1/auth/sessions")
          console.log(`AUTH_HTTP_STATUS ${response.status()}`);
      });
    }
    async function ready(page: Page, connectExisting = false): Promise<void> {
      await page.goto("/");
      await resume(page);
      if (connectExisting && await page.locator("#workspace-name").isVisible()) {
        await page.locator("#setup-connect").click();
        await expect(page.locator("#server-account-title")).toBeVisible();
      }
    }
    async function resume(page: Page): Promise<void> {
      await expect.poll(async () => (await page.locator("#local-ledger-start").count()) + (await page.locator("#workspace-name").count()) + (await page.locator("#transactions-title").count()), { timeout: 120_000 }).toBeGreaterThan(0);
      if (await page.locator("#local-ledger-start").count()) await page.locator("#local-ledger-start button[aria-current=true]").click();
    }
    async function account(page: Page): Promise<void> {
      if (!(await page.locator("#server-account-title").isVisible())) {
        await page.locator("#open-secondary-menu").click();
        await page.locator('[data-settings-area="account"]').click();
      }
    }
    async function closeAccount(page: Page): Promise<void> {
      if (await page.locator("#server-account-title").isVisible()) await page.locator(".brand").click();
    }
    async function login(page: Page, device: string): Promise<void> {
      stage = "login:open-account";
      await account(page);
      stage = "login:fill-server";
      await page.locator("#server-url").fill(url.origin);
      await page.locator("#server-username").fill(username as string);
      await page.locator("#server-login-password").fill(password as string);
      await page.locator("#server-device").fill(device);
      stage = "login:submit";
      await page.locator("#server-login").click();
      stage = "login:confirm-account";
      await expect(page.locator("#server-account-name")).toHaveText(canonicalUsername);
      await expect(page.locator("#server-alert")).toBeEmpty();
    }
    async function manual(page: Page): Promise<void> {
      stage = "sync-mode:select-manual";
      await account(page);
      await page.locator("#server-sync-mode").selectOption("manual");
      stage = "sync-mode:confirm-manual";
      await expect.poll(() => page.evaluate(async () => (await window.lunaLedger.server!.status()).syncMode), { timeout: 30_000 }).toBe("manual");
    }
    async function record(page: Page, merchant: string): Promise<void> {
      await closeAccount(page);
      await page.locator("#primary-record").click();
      await expect(page.locator("#transaction-dialog")).toBeVisible();
      await page.locator("#transaction-amount").fill("12.50");
      await page.locator("#choose-category").click();
      await page.getByRole("button", { name: "Food", exact: true }).click();
      await page.locator("#transaction-advanced-details summary").click();
      await page.locator("#transaction-merchant").fill(merchant);
      await page.locator("#save-transaction").click();
      await expect(page.locator("#transaction-list-region")).toContainText(merchant);
    }
    async function sync(page: Page): Promise<void> {
      await account(page);
      await page.locator("#server-sync-now").click();
      await expect(page.locator("#server-sync-now")).toBeEnabled();
      await expect(page.locator("#server-sync-status")).toContainText("synchronized");
    }
    const document = async (page: Page): Promise<LedgerDocument> =>
      decryptLedgerDocument(
        await page.evaluate(
          (passphrase) => window.lunaLedger.exportLedgerBackup(passphrase),
          ledgerPassword as string,
        ),
        ledgerPassword as string,
      );
    stage = "HTTPS headers and local workspace";
    const home = await firstContext.request.get("/");
    assert.equal(home.status(), 200);
    assert.equal(home.headers()["cross-origin-opener-policy"], "same-origin");
    assert.equal(home.headers()["cross-origin-embedder-policy"], "require-corp");
    const meta = await firstContext.request.get("/api/v1/meta", { headers: { Origin: url.origin } });
    assert.equal(meta.status(), 200);
    assert.match(meta.headers()["cache-control"] ?? "", /no-store/);
    assert.equal(meta.headers()["access-control-allow-origin"], url.origin);
    await ready(first);
    await first.locator("#workspace-name").fill("Synthetic HTTPS household");
    await first.locator("#workspace-form button").click();
    await record(first, "Synthetic online meal");
    const original = await document(first);
    const sourceId = await first.evaluate(async () => (await window.lunaLedger.server!.status()).profile.id);
    await first.waitForFunction(() => navigator.serviceWorker.controller !== null);
    assert(await first.evaluate(async () => isSecureContext && crossOriginIsolated && !!(await navigator.storage.getDirectory())));
    check("trusted-https-headers-secure-context-opfs-service-worker");
    stage = "first UI login and upload";
    await login(first, "Synthetic first browser");
    await first.locator("#server-source").selectOption(sourceId);
    await first.locator("#server-ledger-password").fill(ledgerPassword as string);
    first.once("dialog", (dialog) => void dialog.accept());
    await first.locator("#server-connect").click();
    await expect(first.locator("#server-sync-now")).toBeEnabled();
    await expect(first.locator("#server-sync-status")).toContainText("synchronized");
    await manual(first);
    assert.deepEqual(await document(first), original);
    check("first-ui-login-bind-upload");
    stage = "second UI login and download";
    activePage = second;
    await ready(second, true);
    await login(second, "Synthetic second browser");
    await second.locator("#server-ledger-password").fill(ledgerPassword as string);
    await second.locator("#server-connect").click();
    await expect(second.locator("#server-sync-now")).toBeEnabled();
    await expect.poll(() => document(second)).toEqual(original);
    await manual(second);
    check("independent-second-ui-login-download");
    stage = "offline write and manual sync boundary";
    await firstContext.setOffline(true);
    await record(first, "Synthetic offline meal");
    const offline = await document(first);
    assert.notDeepEqual(offline, original);
    await first.reload();
    await resume(first);
    await expect(first.locator("#transaction-list-region")).toContainText("Synthetic offline meal");
    assert.deepEqual(await document(first), offline);
    await sync(second);
    assert.deepEqual(await document(second), original);
    await firstContext.setOffline(false);
    await sync(second);
    assert.deepEqual(await document(second), original);
    check("offline-write-reload-manual-no-upload");
    stage = "manual convergence";
    await account(first);
    if (await first.locator("#server-login").isVisible()) await login(first, "Synthetic first browser renewed");
    if (await first.locator("#server-unlock-password").isVisible()) {
      await first.locator("#server-unlock-password").fill(ledgerPassword as string);
      await first.locator("#server-unlock").click();
    }
    await sync(first);
    await sync(second);
    await expect.poll(() => document(second)).toEqual(offline);
    check("manual-upload-second-download-convergence");
    stage = "second offline cold page and evidence";
    await closeAccount(second);
    await second.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await second.close();
    await secondContext.setOffline(true);
    const cold = await secondContext.newPage();
    await ready(cold);
    await expect(cold.locator("#transaction-list-region")).toContainText("Synthetic offline meal");
    assert.deepEqual(await document(cold), offline);
    await cold.screenshot({ path: join(output, "second-offline.png"), fullPage: true });
    await closeAccount(first);
    await first.screenshot({ path: join(output, "first-converged.png"), fullPage: true });
    check("second-offline-cold-page-persistence");
    await writeFile(join(output, "result.json"), JSON.stringify({ passed: true, origin: url.origin, browser: browser.version(), checks, timestamp: new Date().toISOString() }, null, 2), { mode: 0o600 });
    console.log(`LUNA_DEPLOYED_SYNC_OK ${output}`);
  } catch {
    // Playwright errors can contain filled values. Do not print raw errors or traces.
    console.error(`LUNA_DEPLOYED_SYNC_FAILED stage=${stage}`);
    if (activePage && !activePage.isClosed()) {
      try {
        const diagnostic = await activePage.evaluate(() => {
          const alert = document.querySelector("#server-alert")?.textContent ?? "";
          return {
            accountCount: document.querySelectorAll("#server-account-name").length,
            loginCount: document.querySelectorAll("#server-login").length,
            alertKind: alert.includes("different workspace") ? "workspace-mismatch" : alert.trim() ? "present" : "none",
          };
        });
        console.error(`UI_DIAGNOSTIC route=${new URL(activePage.url()).pathname} accountCount=${diagnostic.accountCount} loginCount=${diagnostic.loginCount} alertKind=${diagnostic.alertKind}`);
      } catch {
        console.error("UI_DIAGNOSTIC unavailable");
      }
    }
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
void main().catch(() => { console.error("LUNA_DEPLOYED_SYNC_FAILED configuration-or-launch"); process.exitCode = 1; });
