import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { _android, expect as playwrightExpect, type AndroidDevice, type Page } from '@playwright/test';
import { decryptLedgerDocument, encryptLedgerDocument } from '../src/shared/ledger-crypto';
import { appendLedgerRevision } from '../src/shared/ledger-sync';
import { createTransaction } from '../src/shared/domain';
import { verifyAndroidBackup } from './android-backup-smoke';
import { verifyAndroidSettings } from './android-settings-smoke';

const appId = 'majo.im.luna';
const expect = playwrightExpect.configure({ timeout: 30_000 });

/** Send actual Android BACK input, not a synthetic DOM keyboard event. */
async function verifyHardwareBack(page: Page, device: AndroidDevice): Promise<Page> {
  const imeShown = async () => {
    const dump = (await device.shell('dumpsys input_method')).toString();
    const matches = [...dump.matchAll(/^\s*mInputShown=(true|false)\s*$/gm)];
    assert.equal(matches.length, 1, 'Expected one current IME service visibility value');
    // mIsInputViewShown can remain true after the actual keyboard is dismissed.
    return matches[0]?.[1] === 'true';
  };
  const pressBack = async () => {
    await expect.poll(async () => (await device.shell('dumpsys window')).toString()
      .split('\n').find((line) => line.includes('mCurrentFocus')) ?? 'No focused native window',
    { timeout: 10_000, message: 'Hardware BACK requires Luna focus, not an Android system dialog' }).toContain(appId);
    await device.shell('input keyevent KEYCODE_BACK');
  };
  const back = async () => {
    // Every reopened text editor can show the keyboard again.
    if (await imeShown()) {
      const previousUrl = page.url();
      let activeDialog: string | undefined;
      for (const selector of ['#category-dialog', '#transaction-dialog', '#secondary-menu-dialog']) {
        if (await page.locator(selector).isVisible()) { activeDialog = selector; break; }
      }
      await pressBack();
      await expect.poll(imeShown).toBe(false);
      await expect(page).toHaveURL(previousUrl);
      if (activeDialog) await expect(page.locator(activeDialog)).toBeVisible();
    }
    await pressBack();
  };
  await page.locator('#open-secondary-menu').click();
  await expect(page).toHaveURL(/#\/ledger\/menu$/);
  await page.locator('#secondary-menu-dialog nav').getByRole('button', { name: 'Monthly spending limit', exact: true }).click();
  await expect(page).toHaveURL(/#\/ledger\/menu\/budget$/);
  await back();
  await expect(page).toHaveURL(/#\/ledger\/menu$/);
  await back();
  await expect(page.locator('#secondary-menu-dialog')).not.toBeVisible();
  await expect(page).toHaveURL(/#\/ledger$/);
  await page.locator('#record-expense').click();
  await page.locator('#transaction-amount').fill('42.00');
  await page.locator('#choose-category').click();
  await expect(page.locator('#category-dialog')).toBeVisible();
  await back();
  await expect(page.locator('#category-dialog')).not.toBeVisible();
  await expect(page.locator('#transaction-dialog')).toBeVisible();
  await expect(page.locator('#transaction-amount')).toHaveValue('42.00');
  await back();
  await expect(page.locator('#transaction-dialog')).not.toBeVisible();
  await expect(page.locator('#record-expense')).toBeFocused();
  await page.locator('#record-expense').click();
  await expect(page.locator('#transaction-amount')).toHaveValue('42.00');
  await back();
  await expect(page.locator('#transaction-dialog')).not.toBeVisible();
  // BACK retains the draft; changing entry type is the actual discard trigger.
  await switchEntryWithNativeConfirmation(page, device, false);
  await page.locator('#record-expense').click();
  await expect(page.locator('#transaction-dialog')).toBeVisible();
  await expect(page.locator('#transaction-amount')).toHaveValue('42.00');
  await back();
  await expect(page.locator('#transaction-dialog')).not.toBeVisible();
  await switchEntryWithNativeConfirmation(page, device, true);
  await expect(page.locator('#transaction-type')).toHaveValue('income');
  await expect(page.locator('#transaction-amount')).toHaveValue('');
  await back();
  await expect(page.locator('#transaction-dialog')).not.toBeVisible();
  await expect(page.locator('#record-income')).toBeFocused();
  await back();
  await expect.poll(async () => (await device.shell('dumpsys activity activities')).toString())
    .not.toMatch(/(?:mResumedActivity|topResumedActivity)[^\n]*io\.luna\.ledger/);
  // AndroidWebView caches a closed Page when Activity recreation keeps its PID.
  // A fresh process also verifies durable data after the native exit assertion.
  await device.shell(`am force-stop ${appId}`);
  const reopened = await openApp(device);
  await expect(reopened.locator('#transaction-list-region')).toContainText('Android offline market');
  return reopened;
}

async function switchEntryWithNativeConfirmation(page: Page, device: AndroidDevice, accept: boolean): Promise<void> {
  // Without a listener Playwright auto-dismisses JS dialogs before native taps.
  const nativeDialog = () => {};
  page.on('dialog', nativeDialog);
  try {
    await Promise.all([
      page.locator('#record-income').click(), answerNativeConfirmation(device, accept),
    ]);
  } finally {
    page.off('dialog', nativeDialog);
  }
}

/** Capacitor owns JS confirm as an Android AlertDialog, outside the WebView DOM. */
async function answerNativeConfirmation(device: AndroidDevice, accept: boolean): Promise<void> {
  const dumpPath = `/data/local/tmp/luna-back-${randomUUID()}.xml`;
  try {
    let button: string | undefined;
    await expect.poll(async () => {
      await device.shell(`uiautomator dump ${dumpPath}`);
      const xml = (await device.shell(`cat ${dumpPath}`)).toString();
      button = xml.match(/<node\b[^>]*>/g)?.find((node) =>
        node.includes(`package="${appId}"`) && node.includes(`resource-id="android:id/button${accept ? 1 : 2}"`),
      );
      return button !== undefined;
    }, { timeout: 30_000 }).toBe(true);
    const bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(button ?? '');
    assert.ok(bounds);
    const x = Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2);
    const y = Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2);
    await device.shell(`input tap ${x} ${y}`);
  } finally {
    await device.shell(`rm -f ${dumpPath}`).catch(() => console.error('ANDROID_SMOKE_CLEANUP_FAILED: native dialog dump'));
  }
}

/** Actual WebView crypto/SDK against a DevTools-contained HTTPS protocol fixture. */
async function verifyEncryptedSync(page: Page, device: AndroidDevice): Promise<void> {
  await device.shell('svc wifi enable');
  await expect.poll(() => page.evaluate(() => navigator.onLine), { timeout: 30_000 }).toBe(true);
  let body: string | null = null;
  let revision = 0;
  let gets = 0;
  let puts = 0;
  let routeFailure: unknown;
  await page.route('https://luna-smoke.invalid/**', async (route) => {
    const request = route.request();
    const headers = { 'access-control-allow-origin': 'https://localhost',
      'access-control-allow-methods': 'GET,PUT,OPTIONS',
      'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '*',
      'access-control-expose-headers': 'ETag', 'content-type': 'application/json' };
    try {
      if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
      assert.match(await request.headerValue('authorization') ?? '', /^AWS4-HMAC-SHA256 /);
      if (request.method() === 'GET') {
        gets++;
        await route.fulfill({ status: body === null ? 404 : 200, headers: { ...headers, ETag: `"v${revision}"` },
          body: body ?? '<Error><Code>NoSuchKey</Code></Error>' });
      } else {
        assert.equal(request.method(), 'PUT');
        puts++;
        if ((await request.headerValue('if-none-match') === '*' && body !== null) ||
            (await request.headerValue('if-match') !== null && await request.headerValue('if-match') !== `"v${revision}"`)) {
          await route.fulfill({ status: 412, headers, body: '<Error><Code>PreconditionFailed</Code></Error>' }); return;
        }
        body = request.postData();
        assert.ok(body);
        revision++;
        await route.fulfill({ status: 200, headers: { ...headers, ETag: `"v${revision}"` }, body: '' });
      }
    } catch (error) {
      routeFailure = error;
      await route.fulfill({ status: 500, headers, body: '' });
    }
  });
  const password = 'synthetic android ledger phrase';
  await page.evaluate(async (passphrase) => {
    await window.lunaLedger.configureLedgerSync({
      connection: { endpoint: 'https://luna-smoke.invalid', region: 'us-east-1', bucket: 'luna-smoke', prefix: 'android', forcePathStyle: true },
      credentials: { accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret', passphrase }, rememberSecrets: false,
    });
    await window.lunaLedger.syncLedgerNow();
  }, password);
  if (routeFailure !== undefined) throw routeFailure;
  assert.ok(body);
  const document = await decryptLedgerDocument(body, password);
  const original = document.revisions.find((item) => item.kind === 'transaction');
  assert.ok(original?.kind === 'transaction');
  const incoming = createTransaction('node-income', { type: 'income', amountMinor: '2500', date: original.value.date,
    splits: [{ category: 'Transfer', amountMinor: '2500' }], merchant: 'Node remote income' }, document.workspace.precision, new Date().toISOString());
  body = await encryptLedgerDocument(appendLedgerRevision(document, { id: 'node-income-revision', kind: 'transaction', entityId: incoming.id, value: incoming }), password);
  revision++;
  assert.equal((await page.evaluate(() => window.lunaLedger.syncLedgerNow())).code, 'synced');
  assert.equal((await page.evaluate(() => window.lunaLedger.getLedgerDocument()))?.revisions.some((item) => item.kind === 'transaction' && item.entityId === 'node-income'), true);
  assert.ok(gets >= 2 && puts >= 1);
  await page.evaluate(() => window.lunaLedger.clearLedgerSync());
  await page.unroute('https://luna-smoke.invalid/**');
}

async function openApp(device: AndroidDevice): Promise<Page> {
  await device.shell(`am start -n ${appId}/.MainActivity`);
  let pid = 0;
  await expect.poll(async () => {
    pid = Number((await device.shell(`pidof ${appId}`)).toString().trim());
    return Number.isInteger(pid) && pid > 0;
  }, { timeout: 30_000 }).toBe(true);
  assert.ok(Number.isInteger(pid) && pid > 0);
  // The Android driver discovers sockets asynchronously; a killed process's
  // cached WebView can briefly still match by package immediately after launch.
  await expect.poll(() => device.webViews().some((view) => view.pkg() === appId && view.pid() === pid), { timeout: 60_000 }).toBe(true);
  const webview = device.webViews().find((view) => view.pkg() === appId && view.pid() === pid);
  assert.ok(webview);
  const page = await webview.page();
  page.setDefaultTimeout(30_000);
  await page.waitForURL('https://localhost/**');
  return page;
}

async function main(): Promise<void> {
  const devices = await _android.devices({
    host: process.env['LUNA_ADB_HOST'] ?? '127.0.0.1',
    port: Number(process.env['LUNA_ADB_PORT'] ?? '5038'),
    omitDriverInstall: true,
  });
  assert.equal(devices.length, 1, 'Expected exactly one isolated Luna emulator.');
  const device = devices[0];
  assert.ok(device);
  let verifiedEmulator = false;
  let failed = false;
  try {
    assert.match(device.serial(), /^emulator-\d+$/, 'Refusing a physical Android device.');
    const avdName = (await device.shell('getprop ro.boot.qemu.avd_name')).toString().trim();
    assert.equal(avdName, 'luna-smoke', 'Refusing an emulator not created for Luna smoke.');
    verifiedEmulator = true;
    console.log('ANDROID_SMOKE_STAGE isolated-emulator-verified');
    const apk = resolve(process.env['LUNA_APK_PATH'] ?? 'artifacts/android/luna-debug.apk');
    const artifacts = resolve(process.env['LUNA_ANDROID_ARTIFACT_DIR'] ?? '/tmp/luna-android-smoke');
    await mkdir(artifacts, { recursive: true });
    const apkBytes = await readFile(apk);
    await device.installApk(apkBytes);
    console.log('ANDROID_SMOKE_STAGE apk-installed');
    // Only this explicitly identified disposable emulator is reset.
    assert.match((await device.shell(`pm clear ${appId}`)).toString(), /Success/);
    await device.shell('svc wifi disable');
    await device.shell('svc data disable');
    await expect.poll(async () => (await device.shell('dumpsys connectivity')).toString(), { timeout: 30_000 })
      .toMatch(/Active default network: (?:none|null)/);
    let page = await openApp(device);
    assert.equal(await page.evaluate(() => isSecureContext), true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await expect(page.locator('#workspace-name')).toBeVisible();
    await page.locator('#workspace-name').fill('Android offline household');
    await page.locator('#workspace-currency').selectOption('CNY');
    await page.locator('#workspace-form button[type="submit"]').click();
    await expect(page.locator('#summary-grid')).toBeVisible();
    await page.locator('#record-expense').click();
    await page.locator('#transaction-type').selectOption('expense');
    await page.locator('#transaction-amount').fill('12.50');
    await page.locator('#transaction-category').fill('Groceries');
    await page.locator('#transaction-advanced-details summary').click();
    await expect(page.locator('#transaction-merchant')).toBeVisible();
    await page.locator('#transaction-merchant').fill('Android offline market');
    await page.locator('#transaction-form button[type="submit"]').click();
    await expect(page.locator('#transaction-list-region')).toContainText('12.50');
    // WebView's compositor repeats viewport tiles for CDP full-page captures.
    await page.screenshot({ path: resolve(artifacts, 'android-offline-created.png') });
    await device.shell(`am force-stop ${appId}`);
    page = await openApp(device);
    await expect(page.locator('#transaction-list-region')).toContainText('Android offline market');
    await expect(page.locator('#transaction-list-region')).toContainText('12.50');
    await expect(page.locator('#expense-total')).toHaveText('••••');
    assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      contentWidth: document.documentElement.scrollWidth,
    }));
    assert.ok(dimensions.contentWidth <= dimensions.width, 'Android WebView has horizontal overflow.');
    await expect(page.locator('#page-title')).toHaveCount(1);
    await page.screenshot({ path: resolve(artifacts, 'android-offline-restarted.png') });
    console.log('ANDROID_SMOKE_STAGE offline-create-restart-passed');
    page = await verifyHardwareBack(page, device);
    console.log('ANDROID_SMOKE_STAGE hardware-back-passed');
    await verifyEncryptedSync(page, device);
    console.log('ANDROID_SMOKE_STAGE encrypted-ledger-sync-passed');
    await device.shell('svc wifi disable');
    await device.shell('svc data disable');
    await device.shell(`am force-stop ${appId}`);
    page = await openApp(device);
    await expect(page.locator('#transaction-list-region')).toContainText('Node remote income');
    await expect(page.locator('#transaction-list-region')).toContainText('Android offline market');
    await verifyAndroidBackup(device, page);
    console.log('ANDROID_SMOKE_STAGE native-backup-passed');
    await verifyAndroidSettings(device, page);
    await device.shell('svc wifi disable');
    await device.shell('svc data disable');
    await device.shell(`am force-stop ${appId}`);
    page = await openApp(device);
    const portable = await page.evaluate(() => window.lunaLedger.getSettings());
    assert.equal(portable.locale, 'zh-CN');
    assert.equal(portable.hideSensitiveAmountsByDefault, false);
    assert.equal(portable.hasConfigSyncSecrets, false);
    await expect(page.locator('#transaction-list-region')).toContainText('Node remote income');
    await page.screenshot({ path: resolve(artifacts, 'android-synced-restarted.png') });
    console.log(JSON.stringify({
      result: 'passed', appId, avdName, secureOrigin: page.url(),
      apkSha256: createHash('sha256').update(apkBytes).digest('hex'),
      webView: await page.evaluate(() => navigator.userAgent),
      android: (await device.shell('getprop ro.build.version.release')).toString().trim(),
      checks: ['offline-first-launch', 'offline-write', 'process-restart-persistence', 'summary-privacy', 'no-service-worker', 'viewport',
        'webview-sdk-https-protocol-fixture', 'android-to-node-decrypt', 'node-to-android-merge', 'synced-offline-restart',
        'native-backup-cancel', 'native-backup-file-decrypt', 'settings-v1-node-android-interchange', 'settings-offline-restart',
        'hardware-back-menu-parent', 'hardware-back-category-entry', 'hardware-back-draft-retain-discard', 'hardware-back-native-home-fallback'],
      artifacts,
    }));
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    let cleanupFailed = false;
    if (verifiedEmulator) {
      const results = await Promise.allSettled([
        device.shell('svc wifi enable'), device.shell('svc data enable'),
      ]);
      cleanupFailed = results.some((result) => result.status === 'rejected');
    }
    const closed = await Promise.allSettled([device.close()]);
    cleanupFailed ||= closed.some((result) => result.status === 'rejected');
    if (cleanupFailed) {
      console.error('ANDROID_SMOKE_CLEANUP_FAILED: emulator radio/connection cleanup failed');
      if (!failed) throw new Error('Android smoke cleanup failed');
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
