import assert from 'node:assert/strict';
import test from 'node:test';
import { encryptRemoteConfig as encryptNode, decryptRemoteConfig as decryptNode } from '../main/config-crypto';
import { ConfigCryptoError, decodeConfigEnvelopeBytes } from './config-crypto';
import { encryptRemoteConfig, decryptRemoteConfig } from './portable-config-crypto';
import { createDefaultSettings, decodeRemotePortablePayload, encodeRemotePortablePayload, remotePayloadFromSettings } from './settings';

const password = 'interoperable settings test passphrase';
const options = { cost: 16_384, maxmem: 64 * 1024 * 1024 };
const payload = decodeRemotePortablePayload({ ...encodeRemotePortablePayload(remotePayloadFromSettings(createDefaultSettings('test-device', 'zh-CN'))),
  futureTopLevel: { keep: true }, portable: { locale: { value: 'zh-CN', updatedAt: '2026-09-05T00:00:00.000Z' },
    hideSensitiveAmountsByDefault: { value: false, updatedAt: '2026-09-05T00:00:00.000Z' }, futurePreference: 'preserved' } });

test('browser scrypt/WebCrypto reads native Node v1 and Node reads browser v1, retaining unknown fields', async () => {
  const node = await encryptNode(payload, password, options);
  assert.deepEqual(await decryptRemoteConfig(node, password), payload);
  const browser = await encryptRemoteConfig(payload, password, options);
  assert.deepEqual(await decryptNode(browser, password), payload);
  assert.equal(decodeConfigEnvelopeBytes(browser).kdf.N, options.cost);
  for (const secret of [password, 'test-device', 'futurePreference', 'zh-CN']) {
    assert.equal(new TextDecoder().decode(browser).includes(secret), false);
  }
});

test('default browser encryption retains native production scrypt parameters and decrypts in Node', async () => {
  const bytes = await encryptRemoteConfig(payload, password);
  assert.equal(decodeConfigEnvelopeBytes(bytes).kdf.N, 131_072);
  assert.deepEqual(await decryptNode(bytes, password), payload);
});

test('browser crypto rejects wrong passwords, authenticated metadata/ciphertext tamper and future versions', async () => {
  const bytes = await encryptNode(payload, password, options);
  await assert.rejects(decryptRemoteConfig(bytes, 'a different test password'), (error: unknown) => error instanceof ConfigCryptoError && error.code === 'wrong-password-or-tampered');
  const envelope = decodeConfigEnvelopeBytes(bytes);
  envelope.kdf.maxmem = 128 * 1024 * 1024;
  await assert.rejects(decryptRemoteConfig(new TextEncoder().encode(JSON.stringify(envelope)), password), /Wrong passphrase/);
  await assert.rejects(decryptRemoteConfig(new TextEncoder().encode(JSON.stringify({ ...envelope, version: 2 })), password),
    (error: unknown) => error instanceof ConfigCryptoError && error.code === 'unsupported-version');
  await assert.rejects(decryptRemoteConfig(new Uint8Array(1024 * 1024 + 1), password), /invalid size/);
});

test('browser scrypt cooperatively aborts instead of completing a cancelled sync', async () => {
  const controller = new AbortController();
  const pending = encryptRemoteConfig(payload, password, { ...options, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
