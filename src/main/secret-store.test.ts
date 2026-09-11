import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { SafeStorage } from 'electron';
import {
  ElectronSafeStorageProtector,
  SecretProtector,
  SecretStore,
} from './secret-store';

const credentials = {
  accessKeyId: 'ACCESS_TEST_ONLY',
  secretAccessKey: 'SECRET_TEST_ONLY',
  sessionToken: 'TOKEN_TEST_ONLY',
  passphrase: 'correct horse battery staple',
};

class TestProtector implements SecretProtector {
  constructor(private readonly available: boolean) {}
  async persistence() { return this.available ? 'secure' as const : 'unavailable' as const; }
  async protect(plaintext: string): Promise<Buffer> { return xor(Buffer.from(plaintext)); }
  async unprotect(ciphertext: Buffer) { return { plaintext: xor(ciphertext).toString('utf8'), shouldReEncrypt: false }; }
}

function xor(value: Buffer): Buffer {
  return Buffer.from([...value].map((byte) => byte ^ 0x5a));
}

test('secure secret storage persists only protected bytes and restores credentials', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'luna-secrets-'));
  try {
    const store = new SecretStore(directory, new TestProtector(true));
    assert.equal(await store.save(credentials), 'secure');
    const disk = readFileSync(store.secretsPath, 'utf8');
    assert.equal(disk.includes(credentials.accessKeyId), false);
    assert.equal(disk.includes(credentials.secretAccessKey), false);
    assert.equal(disk.includes(credentials.passphrase), false);
    assert.deepEqual(await store.load(), credentials);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('unavailable secure storage never persists new secrets', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'luna-secrets-unavailable-'));
  try {
    const store = new SecretStore(directory, new TestProtector(false));
    assert.equal(await store.save(credentials), 'session-only');
    assert.equal(await store.hasPersisted(), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('safeStorage initialization and encryption failures degrade to session-only', async () => {
  const unavailableStorage = {
    isAsyncEncryptionAvailable: async () => { throw new Error('keychain unavailable'); },
    getSelectedStorageBackend: () => 'unknown',
  } as unknown as SafeStorage;
  assert.equal(
    await new ElectronSafeStorageProtector(unavailableStorage, 'linux').persistence(),
    'unavailable',
  );
  const basicTextStorage = {
    isAsyncEncryptionAvailable: async () => true,
    getSelectedStorageBackend: () => 'basic_text',
  } as unknown as SafeStorage;
  assert.equal(
    await new ElectronSafeStorageProtector(basicTextStorage, 'linux').persistence(),
    'unavailable',
  );

  const directory = mkdtempSync(path.join(tmpdir(), 'luna-secrets-encrypt-failure-'));
  try {
    const protector: SecretProtector = {
      persistence: async () => 'secure',
      protect: async () => { throw new Error('keychain locked'); },
      unprotect: async () => { throw new Error('not used'); },
    };
    const store = new SecretStore(directory, protector);
    assert.equal(await store.save(credentials), 'session-only');
    assert.equal(await store.hasPersisted(), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
