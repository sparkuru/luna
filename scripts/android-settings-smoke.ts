import assert from 'node:assert/strict';
import { expect, type AndroidDevice, type Page } from '@playwright/test';
import { decryptRemoteConfig, encryptRemoteConfig } from '../src/main/config-crypto';

/** Actual WebView v1 scrypt/WebCrypto, with an explicitly mocked HTTPS transport. */
export async function verifyAndroidSettings(device: AndroidDevice, page: Page): Promise<void> {
  await device.shell('svc wifi enable');
  await expect.poll(() => page.evaluate(() => navigator.onLine), { timeout: 30_000 }).toBe(true);
  let body: string | null = null;
  let version = 0;
  let gets = 0;
  let puts = 0;
  let routeFailure: unknown;
  const password = 'synthetic Android settings phrase';
  await page.route('https://luna-config-smoke.invalid/**', async (route) => {
    const request = route.request();
    const headers = { 'access-control-allow-origin': 'https://localhost',
      'access-control-allow-methods': 'GET,PUT,OPTIONS',
      'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '*',
      'access-control-expose-headers': 'ETag' };
    try {
      if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
      assert.match(await request.headerValue('authorization') ?? '', /^AWS4-HMAC-SHA256 /);
      assert.match(new URL(request.url()).pathname, /\/config\/v1\/settings\.enc\.json$/);
      if (request.method() === 'GET') {
        gets++;
        await route.fulfill({ status: body === null ? 404 : 200,
          headers: { ...headers, ETag: `"c${version}"` }, body: body ?? '<Error><Code>NoSuchKey</Code></Error>' });
      } else {
        assert.equal(request.method(), 'PUT');
        puts++;
        if (body === null) assert.equal(await request.headerValue('if-none-match'), '*');
        else assert.equal(await request.headerValue('if-match'), `"c${version}"`);
        body = request.postData();
        assert.ok(body);
        version++;
        await route.fulfill({ status: 200, headers: { ...headers, ETag: `"c${version}"` }, body: '' });
      }
    } catch (error) { routeFailure = error; await route.fulfill({ status: 500, headers, body: '' }); }
  });
  try {
    const configured = await page.evaluate(async (passphrase) => {
      await window.lunaLedger.configureConfigSync({
        connection: { endpoint: 'https://luna-config-smoke.invalid', region: 'us-east-1', bucket: 'luna-smoke', prefix: 'android', forcePathStyle: true },
        credentials: { accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret', passphrase }, rememberSecrets: false,
      });
      await window.lunaLedger.updateSettings({ syncAllPortableSettings: true });
      return window.lunaLedger.syncConfigNow();
    }, password);
    if (routeFailure !== undefined) throw routeFailure;
    assert.equal(configured.code, 'synced');
    assert.ok(body);
    const payload = await decryptRemoteConfig(new TextEncoder().encode(body), password);
    assert.equal(payload.portable.locale.value, 'en');
    const updatedAt = new Date(Date.now() + 60_000).toISOString();
    payload.portable.locale = { value: 'zh-CN', updatedAt };
    payload.portable.hideSensitiveAmountsByDefault = { value: false, updatedAt };
    body = new TextDecoder().decode(await encryptRemoteConfig(payload, password));
    version++;
    assert.equal((await page.evaluate(() => window.lunaLedger.syncConfigNow())).code, 'synced');
    const settings = await page.evaluate(() => window.lunaLedger.getSettings());
    assert.equal(settings.locale, 'zh-CN');
    assert.equal(settings.hideSensitiveAmountsByDefault, false);
    await page.evaluate(() => window.lunaLedger.updateSettings({ syncAllPortableSettings: false }));
    const calls = { gets, puts };
    assert.equal((await page.evaluate(() => window.lunaLedger.syncConfigNow())).code, 'disabled');
    assert.deepEqual({ gets, puts }, calls);
    if (routeFailure !== undefined) throw routeFailure;
  } finally {
    await page.evaluate(() => window.lunaLedger.clearConfigSync());
    await page.unroute('https://luna-config-smoke.invalid/**');
  }
}
