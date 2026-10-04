import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

// Real deployed acceptance, deliberately separate from fixture-based tests.
// Never capture browser traces, raw errors or request headers with credentials.
const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 120_000 });
const origin = 'https://luna.majo.im';
const mode = process.argv[2];
const work = resolve(process.env.LUNA_A07_WORK ?? '/task');
const resultFile = join(work, 'client-result.json');
const stateFile = join(work, 'client-state.json');
const fixture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNwaDjwHwAFBAKAPJ4DgAAAAABJRU5ErkJggg==', 'base64');
const hash = value => createHash('sha256').update(value).digest('hex');
let stage = 'configuration';
const contexts = [];
let cdp;
let result;
let state;
let credentials;
let progress;
let activePage;

async function save() {
  await writeFile(resultFile, JSON.stringify(result, null, 2), { mode: 0o600 });
  if (state) await writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
}
async function check(name, evidence = {}) {
  result.checks.push({ mode, name, timestamp: new Date().toISOString(), ...evidence });
  await save();
  console.log(`PASS ${name}`);
}
async function ready(page) {
  await expect.poll(async () => (await page.locator('#local-ledger-start').count()) + (await page.locator('#workspace-name').count()) + (await page.locator('#transactions-title').count()) + (await page.locator('#server-account-title').count()), { timeout: 120_000 }).toBeGreaterThan(0);
  if (await page.locator('#local-ledger-start').count()) {
    await page.locator('#local-ledger-start button[aria-current=true]').click();
  }
}
async function account(page) {
  if (await page.locator('#server-account-title').isVisible()) return;
  if (await page.locator('#workspace-name').isVisible()) {
    await page.locator('#setup-connect').click();
  } else {
    await page.locator('#open-secondary-menu').click();
    await page.locator('[data-settings-area="account"]').click();
  }
  await expect(page.locator('#server-account-title')).toBeVisible();
}
async function auditSecrets(page) {
  const secretsFile = join(work, 'audit-secrets.json');
  let known = [];
  try { known = JSON.parse(await readFile(secretsFile, 'utf8')); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  assert(Array.isArray(known));
  const token = await page.evaluate(username => {
    const raw = sessionStorage.getItem('luna.session.v1');
    if (!raw) return null;
    const account = JSON.parse(raw).account;
    if (account?.username !== username || account.baseUrl !== 'https://luna.majo.im') return null;
    return typeof account.token === 'string' ? account.token : null;
  }, credentials.username);
  const values = [credentials.password, credentials.ledgerPassword, ...(token ? [token] : [])];
  await writeFile(secretsFile, JSON.stringify([...new Set([...known, ...values])]), { mode: 0o600 });
}
async function login(page, label) {
  stage = 'ui-login-open-account';
  await account(page);
  stage = 'ui-login-wait-form-or-identity';
  await expect.poll(async () => Number(await page.locator('#server-login').isVisible()) + Number(await page.locator('#server-account-name').isVisible())).toBeGreaterThan(0);
  if (await page.locator('#server-login').isVisible()) {
    stage = 'ui-login-fill-fields';
    await page.locator('#server-url').fill(origin);
    await page.locator('#server-username').fill(credentials.username);
    await page.locator('#server-login-password').fill(credentials.password);
    if (!await page.locator('#server-device').isVisible()) {
      await page.locator('#server-device-details summary').click();
    }
    await page.locator('#server-device').fill(label);
    stage = 'ui-login-submit';
    await page.locator('#server-login').click();
  }
  stage = 'ui-login-confirm-account';
  await expect(page.locator('#server-account-name')).toHaveText(credentials.username);
  stage = 'ui-login-confirm-no-error';
  await expect(page.locator('#server-alert')).toBeEmpty();
  await auditSecrets(page);
}
async function connect(page, source = null) {
  stage = 'ui-connect';
  if (source) await page.locator('#server-source').selectOption(source);
  await page.locator('#server-ledger-password').fill(credentials.ledgerPassword);
  page.once('dialog', dialog => void dialog.accept());
  await page.locator('#server-connect').click();
  stage = 'ui-connect-host-completion';
  await expect.poll(() => page.evaluate(async () => (await window.lunaLedger.server.status()).connected)).toBe(true);
  // A no-workspace welcome connection may route to /luna after activation.
  // Return through the actual account controls before checking their state.
  stage = 'ui-connect-return-account';
  await account(page);
  await expect(page.locator('#server-sync-now')).toBeEnabled();
  stage = 'ui-connect-sync-state';
  await expect.poll(() => page.evaluate(async () => (await window.lunaLedger.server.status()).sync.code)).toBe('synced');
  stage = 'ui-connect-set-manual';
  await page.locator('#server-sync-mode').selectOption('manual');
  await expect.poll(() => page.evaluate(async () => (await window.lunaLedger.server.status()).syncMode)).toBe('manual');
}
async function unlock(page) {
  await account(page);
  if (await page.locator('#server-unlock-password').isVisible()) {
    await page.locator('#server-unlock-password').fill(credentials.ledgerPassword);
    await page.locator('#server-unlock').click();
  }
}
async function sync(page) {
  stage = 'ui-sync';
  await account(page);
  await page.locator('#server-sync-now').click();
  await expect(page.locator('#server-sync-now')).toBeEnabled();
  await expect.poll(() => page.evaluate(async () => (await window.lunaLedger.server.status()).sync.code)).toBe('synced');
  await expect(page.locator('#server-alert')).toBeEmpty();
}
async function home(page) {
  if (await page.locator('#server-account-title').isVisible()) await page.locator('.brand').click();
  await expect(page.locator('#transactions-title')).toBeVisible();
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const date = new Date();
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const value = await window.lunaLedger.getSnapshot(month);
    return { workspace: value.workspace, transactions: value.transactions };
  });
}
async function image(page, transactionId, attachmentId) {
  const value = await page.evaluate(async ({ transactionId, attachmentId }) => {
    const loaded = await window.lunaLedger.readTransactionImage(transactionId, attachmentId);
    const receipt = { bytes: Array.from(loaded.bytes), mime: loaded.mime, width: loaded.width, height: loaded.height };
    loaded.bytes.fill(0);
    return receipt;
  }, { transactionId, attachmentId });
  return { sha256: hash(Buffer.from(value.bytes)), length: value.bytes.length, mime: value.mime, width: value.width, height: value.height };
}
async function recordWeb(page, merchant) {
  stage = 'ui-transaction-image';
  await home(page);
  await page.locator('#primary-record').click();
  await page.locator('#transaction-amount').fill('12.50');
  await page.locator('#choose-category').click();
  await page.locator('#category-options .category-option').first().click();
  await page.locator('#transaction-advanced-details summary').click();
  await page.locator('#transaction-merchant').fill(merchant);
  await page.locator('#transaction-images').setInputFiles({ name: 'synthetic-a07.png', mimeType: 'image/png', buffer: fixture });
  await expect(page.locator('.attachment-preview img')).toBeVisible();
  await page.locator('#save-transaction').click();
  await expect(page.locator('#transaction-dialog')).not.toBeVisible();
  await expect(page.locator('#transaction-list-region')).toContainText(merchant);
  const value = (await snapshot(page)).transactions.find(tx => tx.merchant === merchant);
  assert(value && value.attachments?.length === 1);
  const receipt = await image(page, value.id, value.attachments[0].id);
  assert.equal(receipt.mime, 'image/png');
  assert.equal(receipt.width, 1);
  assert.equal(receipt.height, 1);
  assert(receipt.length > 0);
  state.images.push({ transactionId: value.id, attachmentId: value.attachments[0].id, ...receipt });
  await save();
}
async function verify(page) {
  stage = 'verify-snapshot';
  const current = await snapshot(page);
  assert.deepEqual(current, state.snapshot);
  stage = 'verify-binding';
  const status = await page.evaluate(() => window.lunaLedger.server.status());
  assert.deepEqual(status.profile.binding, state.binding);
  for (const item of state.images) {
    stage = 'verify-image-bytes';
    assert.deepEqual(await image(page, item.transactionId, item.attachmentId), {
      sha256: item.sha256, length: item.length, mime: item.mime, width: item.width, height: item.height,
    });
  }
  stage = 'verify-return-home';
  await home(page);
  stage = 'verify-image-viewer-open';
  const imageButton = page.locator('.transaction-image-button').first();
  if (!await imageButton.isVisible()) {
    await imageButton.locator('xpath=ancestor::details[1]').locator('summary').click();
  }
  await imageButton.click();
  await expect(page.locator('#transaction-image-dialog img')).toBeVisible();
  assert(await page.locator('#transaction-image-dialog img').evaluate(img => img.complete && img.naturalWidth > 0));
  stage = 'verify-image-viewer-close';
  await page.locator('#transaction-image-dialog .dialog-header button').click();
}
async function browser(index, fresh) {
  const directory = join(work, `chrome-${index}`);
  if (fresh) {
    await assert.rejects(stat(directory), { code: 'ENOENT' });
    await mkdir(directory, { mode: 0o700 });
  } else {
    assert((await stat(directory)).isDirectory());
  }
  const context = await chromium.launchPersistentContext(directory, {
    channel: 'chrome', headless: true, locale: 'en-US', baseURL: origin,
    viewport: index === 2 ? { width: 375, height: 800 } : { width: 1280, height: 900 },
  });
  contexts.push(context);
  context.setDefaultTimeout(120_000);
  const page = context.pages()[0] ?? await context.newPage();
  activePage = page;
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/api/v1/auth/sessions') {
      result.authHttpStatuses ??= [];
      result.authHttpStatuses.push({ mode, status: response.status(), timestamp: new Date().toISOString() });
      console.log(`A07_AUTH_HTTP_STATUS ${response.status()}`);
    }
  });
  await page.goto('/');
  await ready(page);
  return { page, context };
}
async function main() {
  assert(process.env.LUNA_A07_DISPOSABLE === '1', 'Explicit disposable-account opt-in required');
  assert(['chrome-init', 'chrome-init-resume', 'chrome-restart', 'android-recover', 'android-recover-resume', 'android-service-restart', 'android-restart', 'chrome-after-android', 'chrome-first-after-android'].includes(mode));
  assert((await stat(work)).isDirectory());
  const path = process.env.LUNA_A07_CREDENTIALS;
  assert(path);
  const info = await stat(path);
  assert(info.isFile() && info.uid === process.getuid() && (info.mode & 0o077) === 0);
  credentials = JSON.parse(await readFile(path, 'utf8'));
  assert(/^a07_[a-z0-9_-]+$/.test(credentials.username), 'A07-owned disposable account required');
  assert(typeof credentials.password === 'string' && credentials.password.length >= 12);
  assert(typeof credentials.ledgerPassword === 'string' && credentials.ledgerPassword.length >= 12);
  progress = setInterval(() => console.log(`A07_STAGE mode=${mode} stage=${stage}`), 15_000);
  progress.unref();
  try { result = JSON.parse(await readFile(resultFile, 'utf8')); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; result = { date: '2026-10-05', origin, trust: 'default browser/system trust; no certificate bypass', checks: [], failures: [] }; }
  if (mode !== 'chrome-init') state = JSON.parse(await readFile(stateFile, 'utf8'));
  if (mode === 'chrome-init') {
    state = { images: [] };
    const first = await browser(1, true);
    const second = await browser(2, true);
    stage = 'trusted-https-headers';
    const response = await first.context.request.get('/');
    assert.equal(response.status(), 200);
    assert.equal(response.headers()['cross-origin-opener-policy'], 'same-origin');
    assert.equal(response.headers()['cross-origin-embedder-policy'], 'require-corp');
    const meta = await first.context.request.get('/api/v1/meta', { headers: { Origin: origin } });
    assert.equal(meta.status(), 200);
    assert.match(meta.headers()['cache-control'] ?? '', /no-store/);
    assert.equal(meta.headers()['access-control-allow-origin'], origin);
    for (const page of [first.page, second.page]) {
      assert(await page.evaluate(() => isSecureContext && crossOriginIsolated && typeof navigator.storage.getDirectory === 'function'));
    }
    result.browser = first.context.browser()?.version();
    await check('two-fresh-chrome-profiles-trusted-https-headers');
    await first.page.locator('#workspace-name').fill('A07 synthetic household');
    await first.page.locator('#workspace-currency').selectOption('USD');
    await first.page.locator('#workspace-form button[type=submit]').click();
    await recordWeb(first.page, 'A07 synthetic browser receipt');
    const source = await first.page.evaluate(async () => (await window.lunaLedger.server.status()).profile.id);
    await login(first.page, 'A07 first Chrome');
    await connect(first.page, source);
    state.snapshot = await snapshot(first.page);
    state.binding = await first.page.evaluate(async () => (await window.lunaLedger.server.status()).profile.binding);
    await verify(first.page);
    await check('first-ui-create-login-bind-transaction-image-upload', { image: state.images[0], transactions: state.snapshot.transactions.length });
    await login(second.page, 'A07 fresh narrow Chrome');
    await connect(second.page);
    await verify(second.page);
    assert(await second.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await check('second-fresh-ui-recover-transaction-image-download');
    await first.page.reload();
    await ready(first.page);
    await verify(first.page);
    assert((await first.page.evaluate(() => window.lunaLedger.server.status())).account);
    await check('first-tab-reload-preserves-session-binding-and-image');
  } else if (mode === 'chrome-init-resume') {
    // Preserve the original successful upload and second recovered local copy.
    // This mode repairs an interrupted harness run; it never claims new profiles.
    for (let index = 1; index <= 2; index++) {
      const { page } = await browser(index, false);
      await verify(page);
      await login(page, `A07 initial recovery resumed ${index}`);
      await unlock(page);
      await sync(page);
      await verify(page);
      if (index === 2) await check('second-original-fresh-ui-recovery-readback-after-harness-navigation-fix');
      if (index === 1) {
        await page.reload();
        await ready(page);
        await verify(page);
        assert((await page.evaluate(() => window.lunaLedger.server.status())).account);
        await check('first-tab-reload-preserves-session-binding-and-image');
      }
    }
  } else if (mode === 'chrome-restart') {
    assert(process.env.LUNA_A07_SERVICE_RESTART_VERIFIED === '1', 'Main must confirm service restart');
    for (let index = 1; index <= 2; index++) {
      const { page } = await browser(index, false);
      await verify(page);
      const coldStatus = await page.evaluate(() => window.lunaLedger.server.status());
      assert.equal(coldStatus.account, null);
      assert.equal(coldStatus.connected, false);
      assert.equal(coldStatus.sync.configured, false);
      await login(page, `A07 cold Chrome ${index}`);
      await unlock(page);
      await sync(page);
      await verify(page);
      await check(`chrome-${index}-cold-relaunch-after-service-restart-local-remote-image-stable`, { accountSessionCleared: true, encryptedRemoteSessionCleared: true, durableBindingRetained: true });
    }
  } else if (mode === 'chrome-after-android' || mode === 'chrome-first-after-android') {
    const index = mode === 'chrome-first-after-android' ? 1 : 2;
    const { page } = await browser(index, false);
    await login(page, 'A07 after Android Chrome');
    await unlock(page);
    await sync(page);
    await verify(page);
    await check(`chrome-${index}-downloads-android-upload-exact-image-after-native-restart`);
  } else {
    assert(process.env.LUNA_A07_CDP === 'http://127.0.0.1:19225', 'Explicit owned Android CDP forward required');
    stage = 'android-cdp-connect';
    cdp = await chromium.connectOverCDP(process.env.LUNA_A07_CDP, { noDefaults: true });
    stage = 'android-target-validation';
    const pages = cdp.contexts().flatMap(context => context.pages());
    assert.equal(pages.length, 1);
    const page = pages[0];
    activePage = page;
    assert.equal(new URL(page.url()).origin, 'https://localhost');
    page.setDefaultTimeout(120_000);
    await ready(page);
    if (mode === 'android-recover' || mode === 'android-recover-resume') {
      if (mode === 'android-recover') {
        assert(await page.locator('#workspace-name').isVisible(), 'Fresh isolated package required');
        await login(page, 'A07 physical Android');
        await connect(page);
      } else {
        assert.equal(state.images.length, 1, 'Resume must precede the unique Android upload');
        await login(page, 'A07 physical Android retained session');
        await unlock(page);
        await page.locator('#server-sync-mode').selectOption('manual');
        await sync(page);
      }
      await verify(page);
      await check('physical-android-ui-login-recover-browser-image-system-trust');
      stage = 'android-public-host-image-upload';
      const uploaded = await page.evaluate(async bytes => {
        const staged = await window.lunaLedger.stageTransactionImage('a07-synthetic-native', new Uint8Array(bytes), 'image/png', 1, 1);
        const now = new Date();
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const transaction = await window.lunaLedger.createTransaction({ type: 'expense', amountMinor: '975', date, splits: [{ category: 'expense:0', amountMinor: '975' }], merchant: 'A07 synthetic Android receipt', attachments: [{ draftToken: staged.draftToken }] });
        return { transactionId: transaction.id, attachmentId: staged.metadata.id };
      }, Array.from(fixture));
      state.images.push({ ...uploaded, ...await image(page, uploaded.transactionId, uploaded.attachmentId) });
      await sync(page);
      state.snapshot = await snapshot(page);
      await verify(page);
      await check('physical-android-public-host-transaction-image-upload', { inputBoundary: 'public host API, not native DocumentsUI picker' });
    } else if (mode === 'android-service-restart') {
      assert(process.env.LUNA_A07_SERVICE_RESTART_VERIFIED === '1', 'Main must confirm the native-session service restart');
      const liveStatus = await page.evaluate(() => window.lunaLedger.server.status());
      assert.equal(liveStatus.account?.username, credentials.username);
      assert.equal(liveStatus.connected, true);
      assert.equal(liveStatus.sync.configured, true);
      await sync(page);
      await verify(page);
      await check('physical-android-live-session-survives-owned-service-restart-without-relogin');
    } else {
      await verify(page);
      const coldStatus = await page.evaluate(() => window.lunaLedger.server.status());
      assert.equal(coldStatus.account, null);
      assert.equal(coldStatus.connected, false);
      assert.equal(coldStatus.sync.configured, false);
      await login(page, 'A07 physical Android cold');
      await unlock(page);
      await sync(page);
      await verify(page);
      await check('physical-android-force-stop-relaunch-local-and-remote-image-stable', { accountSessionCleared: true, encryptedRemoteSessionCleared: true, durableBindingRetained: true });
    }
  }
  await save();
  console.log(`A07_CLIENT_MODE_OK ${mode}`);
}
try {
  await main();
} catch {
  // Playwright errors may include passwords or tokens; emit only the fixed stage.
  if (result) {
    const failure = { mode, stage, timestamp: new Date().toISOString() };
    if (activePage && !activePage.isClosed()) {
      try {
        failure.ui = await activePage.evaluate(() => {
          const alert = document.querySelector('#server-alert');
          const text = alert?.textContent?.trim() ?? '';
          const fixed = {
            'Sign-in failed or the session expired. Check your credentials and sign in again.': 'authentication',
            'The previous operation was cancelled.': 'cancelled',
            'Another account operation is running. Wait and try again.': 'busy',
            'The server is unavailable. Your local ledger is still usable.': 'unavailable',
            'Working…': 'working',
          };
          const visible = id => {
            const node = document.getElementById(id);
            return !!node && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
          };
          return { route: location.pathname, hash: location.hash, loginVisible: visible('server-login'), identityVisible: visible('server-account-name'), alertRole: alert?.getAttribute('role'), alertKind: fixed[text] ?? (text ? 'other-fixed-message' : 'empty') };
        });
      } catch { failure.ui = 'unavailable'; }
    }
    result.failures.push(failure);
    await save();
  }
  console.error(`A07_CLIENT_MODE_FAILED mode=${mode} stage=${stage}`);
  process.exitCode = 1;
} finally {
  if (progress) clearInterval(progress);
  for (const context of contexts.reverse()) await context.close();
  if (cdp) await cdp.close();
}
