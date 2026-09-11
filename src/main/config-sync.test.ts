import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { ConfigSyncCredentialsInput } from '../shared/settings';
import { ConfigSyncService, ConfigSyncServiceError } from './config-sync';
import { SecretProtector, SecretStore } from './secret-store';
import { SettingsStore } from './settings-store';
import { InMemoryConfigObjectStore, ObjectStoreError } from './s3-config-store';

const connection = {
  endpoint: 'https://s3.example.test',
  region: 'test-1',
  bucket: 'test-bucket',
  prefix: 'luna-user',
  forcePathStyle: true,
};
const credentials: ConfigSyncCredentialsInput = {
  accessKeyId: 'ACCESS_TEST_ONLY',
  secretAccessKey: 'SECRET_TEST_ONLY',
  passphrase: 'correct horse battery staple',
};

class SessionOnlyProtector implements SecretProtector {
  async persistence() { return 'unavailable' as const; }
  async protect(): Promise<Buffer> { throw new Error('must not persist'); }
  async unprotect(): Promise<{ plaintext: string; shouldReEncrypt: boolean }> { throw new Error('must not load'); }
}

async function createClient(
  directory: string,
  deviceId: string,
  remote: InMemoryConfigObjectStore,
  clock: { value: string },
): Promise<ConfigSyncService> {
  const settingsStore = new SettingsStore(directory, {
    deviceId: () => deviceId,
    systemLocale: 'en-US',
    now: () => clock.value,
  });
  await settingsStore.initialize();
  return new ConfigSyncService(
    settingsStore,
    new SecretStore(directory, new SessionOnlyProtector()),
    () => remote,
    {
      now: () => clock.value,
      sleep: async () => undefined,
      cryptoCost: 16_384,
      cryptoMaxmem: 64 * 1024 * 1024,
    },
  );
}

async function bootstrap(service: ConfigSyncService, supplied = credentials): Promise<void> {
  await service.configure({ connection, credentials: supplied, rememberSecrets: false });
  await service.updateSettings({ syncAllPortableSettings: true });
}

test('two independent clients restore, merge, and repeat encrypted portable-settings sync', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'luna-config-sync-'));
  const remote = new InMemoryConfigObjectStore();
  const clockA = { value: '2026-08-30T10:00:00.000Z' };
  const clockB = { value: '2026-08-30T10:00:01.000Z' };
  try {
    const clientA = await createClient(path.join(root, 'a'), 'device-a', remote, clockA);
    await bootstrap(clientA);
    await clientA.updateSettings({ locale: 'zh-CN', hideSensitiveAmountsByDefault: false });
    const first = await clientA.syncNow();
    assert.equal(first.code, 'synced');

    const stored = remote.peek('luna-user/config/v1/settings.enc.json');
    assert.ok(stored);
    const remoteText = Buffer.from(stored.body).toString('utf8');
    for (const forbidden of [credentials.accessKeyId, credentials.secretAccessKey, credentials.passphrase, 'zh-CN']) {
      assert.equal(remoteText.includes(forbidden), false);
    }

    const clientB = await createClient(path.join(root, 'b'), 'device-b', remote, clockB);
    await bootstrap(clientB);
    const restored = await clientB.syncNow();
    assert.equal(restored.settings.locale, 'zh-CN');
    assert.equal(restored.settings.hideSensitiveAmountsByDefault, false);

    const putCountBefore = remote.calls.filter((call) => call.operation === 'put').length;
    await clientB.syncNow();
    const putCountAfter = remote.calls.filter((call) => call.operation === 'put').length;
    assert.equal(putCountAfter, putCountBefore, 'an unchanged repeated sync must not rewrite randomized ciphertext');

    clockA.value = '2026-08-30T11:00:00.000Z';
    clockB.value = '2026-08-30T11:00:01.000Z';
    await clientA.updateSettings({ locale: 'en' });
    await clientB.updateSettings({ hideSensitiveAmountsByDefault: true });
    await clientA.syncNow();
    await clientB.syncNow();
    const converged = await clientA.syncNow();
    assert.equal(converged.settings.locale, 'en');
    assert.equal(converged.settings.hideSensitiveAmountsByDefault, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('master switch off performs zero remote reads and writes and never deletes remote config', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'luna-config-disabled-'));
  const remote = new InMemoryConfigObjectStore();
  const clock = { value: '2026-08-30T12:00:00.000Z' };
  try {
    const client = await createClient(root, 'device-off', remote, clock);
    await client.configure({ connection, credentials, rememberSecrets: false });
    const callsBefore = remote.calls.length;
    assert.equal((await client.syncNow()).code, 'disabled');
    assert.equal((await client.testConnection()).code, 'disabled');
    assert.equal(remote.calls.length, callsBefore);
    assert.equal(remote.peek('luna-user/config/v1/settings.enc.json'), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('sync classifies wrong passwords and tamper, retries transient failures, and retains local settings', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'luna-config-errors-'));
  const remote = new InMemoryConfigObjectStore();
  const clock = { value: '2026-08-30T13:00:00.000Z' };
  try {
    const owner = await createClient(path.join(root, 'owner'), 'device-owner', remote, clock);
    await bootstrap(owner);
    await owner.updateSettings({ locale: 'zh-CN' });
    await owner.syncNow();

    const wrong = await createClient(path.join(root, 'wrong'), 'device-wrong', remote, clock);
    await bootstrap(wrong, { ...credentials, passphrase: 'incorrect passphrase' });
    await assert.rejects(
      () => wrong.syncNow(),
      (error: unknown) => error instanceof ConfigSyncServiceError && error.code === 'wrong-password-or-tampered',
    );
    assert.equal((await wrong.getRendererSettings()).locale, 'en');

    remote.queueFailure(new ObjectStoreError('transient', 'retry one'));
    remote.queueFailure(new ObjectStoreError('network', 'retry two'));
    const callsBefore = remote.calls.length;
    assert.equal((await owner.testConnection()).code, 'connection-ok');
    assert.equal(remote.calls.length - callsBefore, 3);

    const current = remote.peek('luna-user/config/v1/settings.enc.json');
    assert.ok(current);
    const envelope = JSON.parse(Buffer.from(current.body).toString('utf8')) as Record<string, unknown>;
    const ciphertext = Buffer.from(String(envelope.ciphertext), 'base64');
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
    const tampered = Buffer.from(JSON.stringify({ ...envelope, ciphertext: ciphertext.toString('base64') }));
    await remote.put('luna-user/config/v1/settings.enc.json', tampered, { ifMatch: current.etag });
    await assert.rejects(
      () => owner.syncNow(),
      (error: unknown) => error instanceof ConfigSyncServiceError && error.code === 'wrong-password-or-tampered',
    );
    assert.equal((await owner.getRendererSettings()).locale, 'zh-CN');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('sync retries a concurrent remote deletion and converges with a conditional create', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'luna-config-delete-race-'));
  const remote = new InMemoryConfigObjectStore();
  const clock = { value: '2026-08-30T14:00:00.000Z' };
  try {
    const client = await createClient(root, 'device-race', remote, clock);
    await bootstrap(client);
    await client.syncNow();
    clock.value = '2026-08-30T14:00:01.000Z';
    await client.updateSettings({ locale: 'zh-CN' });
    remote.queueFailureFor('put', new ObjectStoreError('not-found', 'deleted concurrently'));
    const putsBefore = remote.calls.filter((call) => call.operation === 'put').length;
    const result = await client.syncNow();
    assert.equal(result.code, 'synced');
    assert.equal(result.settings.locale, 'zh-CN');
    assert.equal(
      remote.calls.filter((call) => call.operation === 'put').length - putsBefore,
      2,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
