import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigSyncService, ConfigSyncServiceError, SessionConfigSecrets, type ConfigSettingsPort, type ConfigSecretsPort } from './config-service';
import { InMemoryConfigObjectStore, ObjectStoreError } from '../main/s3-config-store';
import { decryptRemoteConfig, encryptRemoteConfig } from '../shared/portable-config-crypto';
import { applySettingsUpdate, createDefaultSettings, decodeSettingsFile, remotePayloadFromSettings, type AppSettingsFileV1, type ConfigSyncCredentialsInput } from '../shared/settings';

const input = { connection: { endpoint: 'https://settings.example.test', region: 'us-east-1', bucket: 'settings-test', prefix: 'cross-platform', forcePathStyle: true },
  credentials: { accessKeyId: 'SETTINGS_ACCESS_SENTINEL', secretAccessKey: 'SETTINGS_SECRET_SENTINEL', passphrase: 'settings tests passphrase' }, rememberSecrets: false };
const key = 'cross-platform/config/v1/settings.enc.json';
const cryptoOptions = { cost: 16_384, maxmem: 64 * 1024 * 1024 };
class Local implements ConfigSettingsPort {
  current = createDefaultSettings('local-only-device', 'en');
  async get() { return decodeSettingsFile(this.current); }
  async mutateSettings(change: (current: AppSettingsFileV1) => AppSettingsFileV1, signal?: AbortSignal) {
    signal?.throwIfAborted();
    this.current = decodeSettingsFile(change(decodeSettingsFile(this.current)));
    return this.get();
  }
}
function client(remote = new InMemoryConfigObjectStore()) {
  const local = new Local();
  const service = new ConfigSyncService(local, new SessionConfigSecrets(), () => remote, {
    now: () => '2026-09-05T10:00:00.000Z', cryptoCost: cryptoOptions.cost, cryptoMaxmem: cryptoOptions.maxmem, sleep: async () => undefined,
  });
  return { local, service, remote };
}
async function enable(service: ConfigSyncService) {
  await service.configure(input);
  await service.updateSettings({ syncAllPortableSettings: true });
}
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
async function seed(remote: InMemoryConfigObjectStore) {
  const settings = applySettingsUpdate(createDefaultSettings('remote-only-device', 'en'), { locale: 'zh-CN' }, '2026-09-05T09:00:00.000Z');
  await remote.put(key, await encryptRemoteConfig(remotePayloadFromSettings(settings), input.credentials.passphrase, cryptoOptions), { ifNoneMatch: true });
}

test('portable config two-client restore, disjoint merge, idempotency and disabled zero IO', async () => {
  const first = client(); const second = client(first.remote);
  await enable(first.service); await enable(second.service);
  await first.service.updateSettings({ locale: 'zh-CN' });
  await first.service.syncNow();
  assert.equal((await second.service.syncNow()).settings.locale, 'zh-CN');
  await second.service.updateSettings({ hideSensitiveAmountsByDefault: false });
  await second.service.syncNow(); await first.service.syncNow();
  assert.deepEqual(first.local.current.portable, second.local.current.portable);
  const encrypted = first.remote.peek(key);
  await first.service.syncNow();
  assert.deepEqual(first.remote.peek(key), encrypted);
  await first.service.updateSettings({ syncAllPortableSettings: false });
  const before = first.remote.calls.length;
  assert.equal((await first.service.syncNow()).code, 'disabled');
  assert.equal((await first.service.testConnection()).code, 'disabled');
  assert.equal(first.remote.calls.length, before);
});

test('settings changed while GET awaits merge with the latest committed local fields', async () => {
  const { remote, local, service } = client(); await seed(remote); await enable(service);
  const entered = gate(); const release = gate(); const get = remote.get.bind(remote);
  remote.get = async (key) => { entered.release(); await release.promise; return get(key); };
  const pending = service.syncNow(); await entered.promise;
  await service.updateSettings({ hideSensitiveAmountsByDefault: false });
  release.release(); await pending;
  assert.equal(local.current.portable.locale.value, 'zh-CN');
  assert.equal(local.current.portable.hideSensitiveAmountsByDefault.value, false);
  const stored = remote.peek(key); assert.ok(stored);
  assert.deepEqual((await decryptRemoteConfig(stored.body, input.credentials.passphrase)).portable, local.current.portable);
});

test('edits during upload trigger another round before synced acknowledgement', async () => {
  const { remote, local, service } = client(); await enable(service);
  const entered = gate(); const release = gate(); const put = remote.put.bind(remote);
  let once = true;
  remote.put = async (...args) => { if (once) { once = false; entered.release(); await release.promise; } return put(...args); };
  const pending = service.syncNow(); await entered.promise;
  await service.updateSettings({ locale: 'zh-CN' }); release.release();
  assert.equal((await pending).code, 'synced');
  const stored = remote.peek(key); assert.ok(stored);
  assert.deepEqual((await decryptRemoteConfig(stored.body, input.credentials.passphrase)).portable, local.current.portable);
  assert.equal(remote.calls.filter((call) => call.operation === 'put').length, 2);
});

for (const action of ['disable', 'clear'] as const) test(`${action} while GET is pending prevents late merge, PUT and synced status`, async () => {
  const { remote, local, service } = client(); await seed(remote); await enable(service);
  const entered = gate(); const release = gate(); const get = remote.get.bind(remote);
  remote.get = async (key) => { entered.release(); await release.promise; return get(key); };
  const original = remote.peek(key); const portable = structuredClone(local.current.portable);
  const pending = service.syncNow(); const rejected = assert.rejects(pending, ConfigSyncServiceError);
  await entered.promise;
  if (action === 'disable') await service.updateSettings({ syncAllPortableSettings: false });
  else await service.clearLocalConfiguration();
  const callsAfterDisable = remote.calls.length;
  assert.equal((await service.syncNow()).code, 'disabled');
  assert.equal(remote.calls.length, callsAfterDisable);
  release.release(); await rejected;
  assert.deepEqual(local.current.portable, portable); assert.deepEqual(remote.peek(key), original);
  assert.equal(local.current.lastSync.code, 'disabled');
  if (action === 'clear') assert.equal((await service.getRendererSettings()).hasConfigSyncSecrets, false);
});

test('clear waits out an in-flight protected-secret save and never republishes old credentials', async () => {
  const entered = gate(); const release = gate();
  let persisted: ConfigSyncCredentialsInput | null = null;
  const secrets: ConfigSecretsPort = {
    persistence: async () => 'secure', hasPersisted: async () => persisted !== null,
    load: async () => persisted,
    save: async (credentials) => { entered.release(); await release.promise; persisted = credentials; return 'secure'; },
    clear: async () => { persisted = null; },
  };
  const local = new Local(); const remote = new InMemoryConfigObjectStore();
  const service = new ConfigSyncService(local, secrets, () => remote, { now: () => '2026-09-05T00:00:00.000Z' });
  const configuring = service.configure({ ...input, rememberSecrets: true });
  const rejected = assert.rejects(configuring, ConfigSyncServiceError);
  await entered.promise;
  const clearing = service.clearLocalConfiguration();
  await assert.rejects(service.syncNow(), ConfigSyncServiceError);
  release.release(); await rejected; await clearing;
  assert.equal(persisted, null);
  assert.equal(local.current.syncConnection, null);
  assert.equal((await service.getRendererSettings()).hasConfigSyncSecrets, false);
  assert.equal(remote.calls.length, 0);
});

test('CAS retry re-downloads, HTTP403 is not absence, and wrong password preserves both stores', async () => {
  const { remote, local, service } = client(); await seed(remote); await enable(service);
  await service.updateSettings({ hideSensitiveAmountsByDefault: false });
  remote.queueFailureFor('put', new ObjectStoreError('conflict', 'competing client'));
  await service.syncNow();
  const stored = remote.peek(key); const portable = structuredClone(local.current.portable);
  remote.queueFailureFor('get', new ObjectStoreError('permission', 'denied'));
  await assert.rejects(service.syncNow(), (error: unknown) => error instanceof ConfigSyncServiceError && error.code === 'permission');
  await service.configure({ ...input, credentials: { ...input.credentials, passphrase: 'incorrect settings password' } });
  await assert.rejects(service.syncNow(), (error: unknown) => error instanceof ConfigSyncServiceError && error.code === 'wrong-password-or-tampered');
  assert.deepEqual(remote.peek(key), stored); assert.deepEqual(local.current.portable, portable);
});
