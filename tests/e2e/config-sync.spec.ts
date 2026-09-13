import { expect, test, type Page } from '@playwright/test';
import { decryptRemoteConfig, encryptRemoteConfig } from '../../src/main/config-crypto';
import { applySettingsUpdate, createDefaultSettings, remotePayloadFromSettings } from '../../src/shared/settings';
import { startObjectServer } from './helpers/s3-object-server';
import { readLedgerDocument } from './helpers/public-ledger';

const ACCESS = 'CONFIG_BROWSER_ACCESS_SENTINEL';
const SECRET = 'CONFIG_BROWSER_SECRET_SENTINEL';
const PASSWORD = 'config browser interoperability passphrase';
const OBJECT = '/config-browser-tests/portable/config/v1/settings.enc.json';
function input(endpoint: string, passphrase = PASSWORD) {
  return { connection: { endpoint, region: 'us-east-1', bucket: 'config-browser-tests', prefix: 'portable', forcePathStyle: true },
    credentials: { accessKeyId: ACCESS, secretAccessKey: SECRET, passphrase }, rememberSecrets: false };
}
async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('#workspace-name')).toBeVisible();
  await page.locator('#workspace-name').fill('Portable settings household');
  await page.getByRole('button', { name: 'Create local workspace' }).click();
  await expect(page.locator('#transaction-dialog')).not.toBeVisible();
}
async function configureUI(page: Page, endpoint: string, passphrase = PASSWORD) {
  if (await page.locator('#transaction-dialog').isVisible()) await page.locator('#close-transaction').click();
  if (!new URL(page.url()).pathname.endsWith('/settings/sync/advanced')) {
    await page.locator('#open-secondary-menu').click();
    await page.getByRole('link', { name: /Advanced sync settings|高级同步设置/ }).click();
  }
  if (!(await page.locator('#config-sync-details').evaluate((element) => element instanceof HTMLDetailsElement && element.open))) {
    await page.locator('#config-sync-details > summary').click();
  }
  await page.locator('#sync-endpoint').fill(endpoint);
  await page.locator('#sync-region').fill('us-east-1');
  await page.locator('#sync-bucket').fill('config-browser-tests');
  await page.locator('#sync-prefix').fill('portable');
  await page.locator('#sync-path-style').check();
  await page.locator('#sync-access-key').fill(ACCESS);
  await page.locator('#sync-secret-key').fill(SECRET);
  await page.locator('#sync-passphrase').fill(passphrase);
  await page.locator('#save-sync-connection').click();
  await expect(page.locator('#sync-passphrase')).toHaveValue('');
  await expect(page.locator('#sync-access-key')).toHaveValue('');
}
async function openConfigDetails(page: Page) {
  const details = page.locator('#config-sync-details');
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator('summary').click();
}
async function syncUI(page: Page) {
  await openConfigDetails(page);
  await page.locator('#sync-now').click();
  await expect.poll(async () => (await page.evaluate(() => window.lunaLedger.getSettings())).lastSync.code, { timeout: 30_000 }).toBe('synced');
  await expect(page.locator('#sync-now')).toBeEnabled();
}

test('actual browser v1 settings sync interoperates with Node and preserves financial drafts across configure, sync and clear', async ({ page, browser, baseURL }) => {
  test.setTimeout(90_000);
  await ready(page);
  const remote = await startObjectServer(new URL(page.url()).origin, OBJECT, ACCESS);
  const secondContext = await browser.newContext({ ...(baseURL === undefined ? {} : { baseURL }), locale: 'en-US' });
  try {
    const native = applySettingsUpdate(createDefaultSettings('native-private-device', 'en'), { locale: 'zh-CN', hideSensitiveAmountsByDefault: false }, '2026-01-01T00:00:00.000Z');
    remote.replace(new TextDecoder().decode(await encryptRemoteConfig(remotePayloadFromSettings(native), PASSWORD)));
    await page.locator('#record-expense').click();
    await page.locator('#transaction-amount').fill('25.60');
    await page.locator('#transaction-category').fill('Unsubmitted category');
    await page.locator('#transaction-advanced-details > summary').click();
    await page.locator('#transaction-notes').fill('Keep this draft');
    await page.locator('#close-transaction').click();
    await configureUI(page, remote.endpoint);
    await expect(page.locator('#transaction-notes')).toHaveValue('Keep this draft');
    await page.locator('#sync-all').check();
    await syncUI(page);
    await page.locator('.settings-navigation').getByRole('button', { name: /Preferences|偏好设置/, exact: true }).click();
    await expect(page.locator('#settings-language')).toHaveValue('zh-CN');
    await expect(page.locator('#hide-default')).not.toBeChecked();
    await expect(page.locator('#transaction-amount')).toHaveValue('25.60');
    await page.locator('#hide-default').check();
    await page.locator('.settings-navigation').getByRole('button', { name: /Advanced sync settings|高级同步设置/, exact: true }).click();
    remote.state.conflictOnce = true;
    await syncUI(page);
    expect(remote.state.conflicts).toBe(1);
    expect(remote.state.body).not.toBeNull();
    const nativeDecoded = await decryptRemoteConfig(new TextEncoder().encode(remote.state.body ?? ''), PASSWORD);
    expect(nativeDecoded.portable.hideSensitiveAmountsByDefault.value).toBe(true);
    expect(nativeDecoded.portable.locale.value).toBe('zh-CN');
    for (const forbidden of [PASSWORD, SECRET, ACCESS, 'Keep this draft', 'native-private-device', 'hideSensitiveAmountsByDefault']) {
      expect(remote.state.body).not.toContain(forbidden);
    }
    const second = await secondContext.newPage();
    await ready(second);
    await second.evaluate(async (configuration) => {
      await window.lunaLedger.configureConfigSync(configuration);
      await window.lunaLedger.updateSettings({ syncAllPortableSettings: true });
      await window.lunaLedger.syncConfigNow();
    }, input(remote.endpoint));
    expect((await second.evaluate(() => window.lunaLedger.getSettings())).locale).toBe('zh-CN');
    const ledger = await readLedgerDocument(second, PASSWORD);
    const storedState = await second.evaluate(async () => ({
      settings: await window.lunaLedger.getSettings(),
      legacy: localStorage.getItem('luna.web.state.v1'),
    }));
    const stored = JSON.stringify({ ledger, ...storedState });
    for (const secret of [ACCESS, SECRET, PASSWORD]) expect(stored).not.toContain(secret);
    await second.reload();
    expect((await second.evaluate(() => window.lunaLedger.getSettings())).hasConfigSyncSecrets).toBe(false);
    await page.locator('#sync-all').uncheck();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.lunaLedger.getSettings()))
            .syncAllPortableSettings,
      )
      .toBe(false);
    const calls = { gets: remote.state.gets, puts: remote.state.puts };
    expect((await page.evaluate(() => window.lunaLedger.syncConfigNow())).code).toBe('disabled');
    expect((await page.evaluate(() => window.lunaLedger.testConfigSync())).code).toBe('disabled');
    expect({ gets: remote.state.gets, puts: remote.state.puts }).toEqual(calls);
    page.once('dialog', (dialog) => void dialog.accept());
    await page.locator('#clear-sync-connection').click();
    await expect.poll(async () => (await page.evaluate(() => window.lunaLedger.getSettings())).hasConfigSyncSecrets).toBe(false);
    await page.getByRole('navigation', { name: /Primary navigation|主导航/ }).getByRole('button', { name: /Monthly spending limit|每月支出上限/, exact: true }).click();
    await page.locator('#budget-input').fill('321.45');
    await expect(page.locator('#transaction-notes')).toHaveValue('Keep this draft');
    await expect(page.locator('#budget-input')).toHaveValue('321.45');
    expect(remote.state.failures).toEqual([]);
    expect(remote.state.preflights).toBeGreaterThan(0);
    expect(remote.state.signedRequests).toBe(remote.state.gets + remote.state.puts);
  } finally { await secondContext.close(); await remote.close(); }
});

test('settings wrong-password and permission errors preserve local settings, ciphertext and active drafts', async ({ page }) => {
  test.setTimeout(60_000);
  await ready(page);
  const remote = await startObjectServer(new URL(page.url()).origin, OBJECT, ACCESS);
  try {
    remote.replace(new TextDecoder().decode(await encryptRemoteConfig(remotePayloadFromSettings(createDefaultSettings('native-private-device', 'zh-CN')), PASSWORD)));
    const original = remote.state.body;
    await page.locator('#record-expense').click();
    await page.locator('#transaction-advanced-details > summary').click();
    await page.locator('#transaction-notes').fill('Draft survives sync errors');
    await configureUI(page, remote.endpoint, 'wrong browser settings password');
    await page.locator('#sync-all').check();
    await page.locator('#sync-now').click();
    await expect.poll(async () => (await page.evaluate(() => window.lunaLedger.getSettings())).lastSync.code, { timeout: 30_000 }).toBe('wrong-password-or-tampered');
    await expect(page.locator('#sync-now')).toBeEnabled();
    await expect(page.locator('#transaction-notes')).toHaveValue('Draft survives sync errors');
    await page.locator('.settings-navigation').getByRole('button', { name: /Preferences|偏好设置/, exact: true }).click();
    await expect(page.locator('#settings-language')).toHaveValue('en');
    expect(remote.state.body).toBe(original); expect(remote.state.puts).toBe(0);
    remote.state.denyReads = true;
    await page.locator('.settings-navigation').getByRole('button', { name: /Advanced sync settings|高级同步设置/, exact: true }).click();
    await openConfigDetails(page);
    await page.locator('#test-sync-connection').click();
    await expect.poll(async () => (await page.evaluate(() => window.lunaLedger.getSettings())).lastSync.code).toBe('permission');
    await expect(page.locator('#test-sync-connection')).toBeEnabled();
    await expect(page.locator('#transaction-notes')).toHaveValue('Draft survives sync errors');
    expect(remote.state.body).toBe(original); expect(remote.state.puts).toBe(0);
  } finally { await remote.close(); }
});
