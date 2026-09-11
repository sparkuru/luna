import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultSettings, remotePayloadFromSettings } from '../shared/settings';
import { ConfigCryptoError, decodeConfigEnvelopeBytes } from '../shared/config-crypto';
import { decryptRemoteConfig, encryptRemoteConfig } from './config-crypto';

const cryptoOptions = {
  cost: 16_384,
  maxmem: 64 * 1024 * 1024,
  randomBytes: (size: number): Buffer => Buffer.from(Array.from({ length: size }, (_, index) => index + 1)),
};

test('remote config encryption round-trips a versioned authenticated secret-free payload', async () => {
  const payload = remotePayloadFromSettings(createDefaultSettings('device-a', 'zh-CN'));
  const encrypted = await encryptRemoteConfig(payload, 'test passphrase', cryptoOptions);
  const text = Buffer.from(encrypted).toString('utf8');
  assert.match(text, /luna-config-envelope/);
  assert.equal(text.includes('zh-CN'), false);
  assert.equal(text.includes('device-a'), false);
  const decrypted = await decryptRemoteConfig(encrypted, 'test passphrase');
  assert.deepEqual(decrypted.portable, payload.portable);
});

test('wrong passphrase, ciphertext tamper, and unsupported versions fail without plaintext', async () => {
  const payload = remotePayloadFromSettings(createDefaultSettings('device-a', 'en'));
  const encrypted = await encryptRemoteConfig(payload, 'test passphrase', cryptoOptions);
  await assert.rejects(
    () => decryptRemoteConfig(encrypted, 'wrong passphrase'),
    (error: unknown) => error instanceof ConfigCryptoError && error.code === 'wrong-password-or-tampered',
  );

  const envelope = decodeConfigEnvelopeBytes(encrypted);
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  ciphertext[0] = (ciphertext[0] ?? 0) ^ 0x01;
  const tampered = Buffer.from(JSON.stringify({ ...envelope, ciphertext: ciphertext.toString('base64') }));
  await assert.rejects(
    () => decryptRemoteConfig(tampered, 'test passphrase'),
    (error: unknown) => error instanceof ConfigCryptoError && error.code === 'wrong-password-or-tampered',
  );

  for (const changed of [
    { ...envelope, cipher: { ...envelope.cipher, iv: Buffer.alloc(12, 9).toString('base64') } },
    { ...envelope, cipher: { ...envelope.cipher, tag: Buffer.alloc(16, 9).toString('base64') } },
    { ...envelope, kdf: { ...envelope.kdf, salt: Buffer.alloc(16, 9).toString('base64') } },
    { ...envelope, kdf: { ...envelope.kdf, maxmem: 128 * 1024 * 1024 } },
  ]) {
    await assert.rejects(
      () => decryptRemoteConfig(Buffer.from(JSON.stringify(changed)), 'test passphrase'),
      (error: unknown) => error instanceof ConfigCryptoError && error.code === 'wrong-password-or-tampered',
    );
  }

  const future = Buffer.from(JSON.stringify({ ...envelope, version: 2 }));
  await assert.rejects(
    () => decryptRemoteConfig(future, 'test passphrase'),
    (error: unknown) => error instanceof ConfigCryptoError && error.code === 'unsupported-version',
  );
});

test('envelope decoder enforces strict fields and size limits before KDF work', () => {
  assert.throws(() => decodeConfigEnvelopeBytes(new Uint8Array()), /invalid size/);
  assert.throws(() => decodeConfigEnvelopeBytes(Buffer.from('{"unexpected":true}')), /fields/);
  assert.throws(() => decodeConfigEnvelopeBytes(new Uint8Array(1024 * 1024 + 1)), /invalid size/);
  const payload = remotePayloadFromSettings(createDefaultSettings('device-a', 'en'));
  return encryptRemoteConfig(payload, 'test passphrase', cryptoOptions).then((encrypted) => {
    const envelope = decodeConfigEnvelopeBytes(encrypted);
    assert.equal(Buffer.from(envelope.kdf.salt, 'base64').byteLength, 16);
    assert.equal(Buffer.from(envelope.cipher.iv, 'base64').byteLength, 12);
    assert.equal(Buffer.from(envelope.cipher.tag, 'base64').byteLength, 16);
    assert.throws(
      () => decodeConfigEnvelopeBytes(Buffer.from(JSON.stringify({
        ...envelope,
        cipher: { ...envelope.cipher, tag: Buffer.alloc(15).toString('base64') },
      }))),
      /invalid size/,
    );
    assert.throws(
      () => decodeConfigEnvelopeBytes(Buffer.from(JSON.stringify({
        ...envelope,
        kdf: { ...envelope.kdf, N: 8192 },
      }))),
      /KDF parameters/,
    );
  });
});

test('remote plaintext size is bounded before encryption', async () => {
  const payload = remotePayloadFromSettings(createDefaultSettings('device-a', 'en'));
  await assert.rejects(
    () => encryptRemoteConfig(
      { ...payload, unknownTopLevel: { oversized: 'x'.repeat(70 * 1024) } },
      'test passphrase',
      cryptoOptions,
    ),
    /exceeds the size limit/,
  );
});
