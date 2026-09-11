import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import test from 'node:test';
import { createTransaction, type Workspace } from './domain';
import {
  decryptLedgerDocument, encryptLedgerDocument, LedgerCryptoError, MAX_LEDGER_ENVELOPE_BYTES, validateLedgerPassword,
  type LedgerCryptoErrorCode,
} from './ledger-crypto';
import { LedgerSyncError, MAX_LEDGER_DOCUMENT_BYTES, seedLedgerDocument, type LedgerDocument } from './ledger-sync';

const password = 'a synthetic password 🎑';
const workspace: Workspace = {
  id: 'household', name: 'Private household', currency: 'CNY', precision: 2, createdAt: '2026-09-01T00:00:00.000Z',
};
const document = seedLedgerDocument(workspace, [createTransaction('purchase', {
  type: 'expense', amountMinor: '1250', date: '2026-09-05',
  splits: [{ category: 'Food', amountMinor: '1250' }], notes: 'Private ledger note',
}, 2, '2026-09-05T01:00:00.000Z')], { '2026-09': '200000' });

interface EnvelopeFixture {
  format: string; version: number; payloadSchemaVersion: number;
  kdf: { name: string; hash: string; iterations: number; salt: string };
  cipher: { name: string; iv: string; tagLength: number };
  ciphertext: string;
}

function errorCode(code: LedgerCryptoErrorCode): (error: unknown) => boolean {
  return (error) => error instanceof LedgerCryptoError && error.code === code && error.message === `LUNA_ERROR:${code}`;
}

function parse(raw: string): EnvelopeFixture {
  return JSON.parse(raw) as EnvelopeFixture;
}

function metadata(envelope: EnvelopeFixture) {
  return {
    format: envelope.format, version: envelope.version, payloadSchemaVersion: envelope.payloadSchemaVersion,
    kdf: { name: envelope.kdf.name, hash: envelope.kdf.hash, iterations: envelope.kdf.iterations, salt: envelope.kdf.salt },
    cipher: { name: envelope.cipher.name, iv: envelope.cipher.iv, tagLength: envelope.cipher.tagLength },
  };
}

/** Independent Node cipher fixture checks the wire protocol against WebCrypto. */
function sealPlaintext(plaintext: string | Buffer, changeAad?: (aad: Record<string, unknown>) => void): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const envelope: EnvelopeFixture = {
    format: 'luna-ledger-envelope', version: 1, payloadSchemaVersion: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000, salt: salt.toString('base64') },
    cipher: { name: 'AES-GCM', iv: iv.toString('base64'), tagLength: 128 }, ciphertext: '',
  };
  const key = pbkdf2Sync(password, salt, 600_000, 32, 'sha256');
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const aad: Record<string, unknown> = metadata(envelope);
    changeAad?.(aad);
    cipher.setAAD(Buffer.from(JSON.stringify(aad)));
    envelope.ciphertext = Buffer.concat([
      cipher.update(typeof plaintext === 'string' ? Buffer.from(plaintext) : plaintext), cipher.final(), cipher.getAuthTag(),
    ]).toString('base64');
    return JSON.stringify(envelope);
  } finally { key.fill(0); }
}

test('ledger envelope round-trips without exposing plaintext and interoperates with the Node cipher', async () => {
  const raw = await encryptLedgerDocument(document, password);
  const envelope = parse(raw);
  assert.deepEqual(await decryptLedgerDocument(raw, password), document);
  assert.equal(raw.includes(workspace.name), false);
  assert.equal(raw.includes('Private ledger note'), false);
  assert.equal(raw.includes(password), false);
  assert.deepEqual(Object.keys(envelope), ['format', 'version', 'payloadSchemaVersion', 'kdf', 'cipher', 'ciphertext']);
  assert.deepEqual(envelope.kdf, {
    name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000, salt: envelope.kdf.salt,
  });
  const key = pbkdf2Sync(password, Buffer.from(envelope.kdf.salt, 'base64'), 600_000, 32, 'sha256');
  try {
    const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.cipher.iv, 'base64'));
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    cipher.setAAD(Buffer.from(JSON.stringify(metadata(envelope))));
    cipher.setAuthTag(ciphertext.subarray(-16));
    assert.deepEqual(JSON.parse(Buffer.concat([cipher.update(ciphertext.subarray(0, -16)), cipher.final()]).toString()), document);
  } finally { key.fill(0); }
  assert.deepEqual(await decryptLedgerDocument(sealPlaintext(JSON.stringify(document)), password), document);
});

test('each encryption generates fresh canonical salt and IV', async () => {
  const first = parse(await encryptLedgerDocument(document, password));
  const second = parse(await encryptLedgerDocument(document, password));
  assert.notEqual(first.kdf.salt, second.kdf.salt);
  assert.notEqual(first.cipher.iv, second.cipher.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(Buffer.from(first.kdf.salt, 'base64').length, 16);
  assert.equal(Buffer.from(first.cipher.iv, 'base64').length, 12);
  for (const text of [first.kdf.salt, first.cipher.iv, first.ciphertext]) {
    assert.equal(Buffer.from(text, 'base64').toString('base64'), text);
  }
});

test('derives nonextractable AES256 keys with only the operation-specific usage', async (context) => {
  const original = crypto.subtle.deriveKey.bind(crypto.subtle);
  const keys: CryptoKey[] = [];
  const spy = context.mock.method(crypto.subtle, 'deriveKey', async (...args: Parameters<SubtleCrypto['deriveKey']>) => {
    const key = await original(...args);
    keys.push(key);
    return key;
  });
  const raw = await encryptLedgerDocument(document, password);
  await decryptLedgerDocument(raw, password);
  assert.equal(spy.mock.callCount(), 2);
  assert.deepEqual(keys.map((key) => key.extractable), [false, false]);
  assert.deepEqual(keys.map((key) => key.usages), [['encrypt'], ['decrypt']]);
  assert.deepEqual(keys.map((key) => key.algorithm), [{ name: 'AES-GCM', length: 256 }, { name: 'AES-GCM', length: 256 }]);
});

test('password boundaries count Unicode codepoints and exact UTF8 bytes without normalization', async () => {
  for (const accepted of ['a'.repeat(12), '🌙'.repeat(12), 'a'.repeat(1024), '🌙'.repeat(256), ' '.repeat(12)]) {
    assert.doesNotThrow(() => validateLedgerPassword(accepted));
    const raw = await encryptLedgerDocument(document, accepted);
    assert.deepEqual(await decryptLedgerDocument(raw, accepted), document);
  }
  const spaced = await encryptLedgerDocument(document, ` ${password} `);
  await assert.rejects(() => decryptLedgerDocument(spaced, password), errorCode('ledger-wrong-password-or-tampered'));
  const composed = await encryptLedgerDocument(document, 'é'.repeat(12));
  await assert.rejects(() => decryptLedgerDocument(composed, 'e\u0301'.repeat(12)), errorCode('ledger-wrong-password-or-tampered'));
});

test('invalid passwords reject before key derivation, including unmatched surrogates', async (context) => {
  const raw = await encryptLedgerDocument(document, password);
  const spy = context.mock.method(crypto.subtle, 'deriveKey', () => { throw new Error('KDF must not run'); });
  for (const rejected of ['', 'a'.repeat(11), '🌙'.repeat(11), 'a'.repeat(1025), '🌙'.repeat(257), `${password}\ud800`, `\udfff${password}`]) {
    assert.throws(() => validateLedgerPassword(rejected), errorCode('ledger-password-invalid'));
    await assert.rejects(() => encryptLedgerDocument(document, rejected), errorCode('ledger-password-invalid'));
    await assert.rejects(() => decryptLedgerDocument(raw, rejected), errorCode('ledger-password-invalid'));
  }
  assert.equal(spy.mock.callCount(), 0);
});

test('wrong password and salt, IV, ciphertext and tag tampering return one authentication error', async () => {
  const raw = await encryptLedgerDocument(document, password);
  await assert.rejects(() => decryptLedgerDocument(raw, 'a different password'), errorCode('ledger-wrong-password-or-tampered'));
  for (const target of ['salt', 'iv', 'ciphertext', 'tag'] as const) {
    const envelope = parse(raw);
    const text = target === 'salt' ? envelope.kdf.salt : target === 'iv' ? envelope.cipher.iv : envelope.ciphertext;
    const bytes = Buffer.from(text, 'base64');
    const offset = target === 'tag' ? bytes.length - 1 : 0;
    bytes[offset] = bytes[offset]! ^ 1;
    if (target === 'salt') envelope.kdf.salt = bytes.toString('base64');
    else if (target === 'iv') envelope.cipher.iv = bytes.toString('base64');
    else envelope.ciphertext = bytes.toString('base64');
    await assert.rejects(() => decryptLedgerDocument(JSON.stringify(envelope), password), errorCode('ledger-wrong-password-or-tampered'));
  }
});

test('authenticates every metadata group and reconstructs fixed AAD order from reordered JSON', async () => {
  for (const key of ['format', 'version', 'payloadSchemaVersion', 'kdf', 'cipher']) {
    const raw = sealPlaintext(JSON.stringify(document), (aad) => { delete aad[key]; });
    await assert.rejects(() => decryptLedgerDocument(raw, password), errorCode('ledger-wrong-password-or-tampered'));
  }
  const envelope = parse(await encryptLedgerDocument(document, password));
  const reordered = JSON.stringify({
    ciphertext: envelope.ciphertext,
    cipher: { tagLength: 128, iv: envelope.cipher.iv, name: 'AES-GCM' },
    kdf: { salt: envelope.kdf.salt, iterations: 600_000, hash: 'SHA-256', name: 'PBKDF2' },
    payloadSchemaVersion: 1, version: 1, format: envelope.format,
  });
  assert.deepEqual(await decryptLedgerDocument(reordered, password), document);
});

test('strict envelope fields, base64, bounds and KDF parameters reject before KDF', async (context) => {
  const raw = await encryptLedgerDocument(document, password);
  const envelope = parse(raw);
  const spy = context.mock.method(crypto.subtle, 'deriveKey', () => { throw new Error('KDF must not run'); });
  const invalid = [
    '', '{', 'null', '[]', '{}', 'x'.repeat(MAX_LEDGER_ENVELOPE_BYTES + 1),
    '月'.repeat(Math.floor(MAX_LEDGER_ENVELOPE_BYTES / 3) + 1),
    JSON.stringify({ ...envelope, extra: true }),
    JSON.stringify({ ...envelope, kdf: { ...envelope.kdf, extra: true } }),
    JSON.stringify({ ...envelope, cipher: { ...envelope.cipher, extra: true } }),
    JSON.stringify({ ...envelope, cipher: { ...envelope.cipher, tagLength: 96 } }),
    JSON.stringify({ ...envelope, ciphertext: Buffer.alloc(15).toString('base64') }),
    JSON.stringify({ ...envelope, ciphertext: Buffer.alloc(MAX_LEDGER_DOCUMENT_BYTES + 17).toString('base64') }),
    ...[0, -1, 599_999, 600_001, 1e12, 600000.5, '600000', null].map((iterations) => JSON.stringify({
      ...envelope, kdf: { ...envelope.kdf, iterations },
    })),
    ...[' ', '____', '!!!!', 'AAAA=', 'A===', 'AB==', 'AAAAAAAAAAAAAAAAAAAAAB==', 'AAAA\n', Buffer.alloc(15).toString('base64')].map((salt) => JSON.stringify({
      ...envelope, kdf: { ...envelope.kdf, salt },
    })),
    JSON.stringify({ ...envelope, cipher: { ...envelope.cipher, iv: Buffer.alloc(11).toString('base64') } }),
  ];
  for (const value of invalid) await assert.rejects(() => decryptLedgerDocument(value, password), errorCode('ledger-invalid-envelope'));
  for (const value of [
    { ...envelope, version: 2 }, { ...envelope, payloadSchemaVersion: 2 }, { ...envelope, format: 'other' },
    { ...envelope, kdf: { ...envelope.kdf, name: 'scrypt' } },
    { ...envelope, kdf: { ...envelope.kdf, hash: 'SHA-1' } },
    { ...envelope, cipher: { ...envelope.cipher, name: 'AES-CBC' } },
  ]) await assert.rejects(() => decryptLedgerDocument(JSON.stringify(value), password), errorCode('ledger-unsupported-envelope'));
  assert.equal(spy.mock.callCount(), 0);
});

test('encoded size limit runs before JSON parsing as well as KDF', async (context) => {
  const parseSpy = context.mock.method(JSON, 'parse', () => { throw new Error('JSON parser must not run'); });
  const kdfSpy = context.mock.method(crypto.subtle, 'deriveKey', () => { throw new Error('KDF must not run'); });
  for (const raw of ['x'.repeat(MAX_LEDGER_ENVELOPE_BYTES + 1), '月'.repeat(Math.floor(MAX_LEDGER_ENVELOPE_BYTES / 3) + 1)]) {
    await assert.rejects(() => decryptLedgerDocument(raw, password), errorCode('ledger-invalid-envelope'));
  }
  assert.equal(parseSpy.mock.callCount(), 0);
  assert.equal(kdfSpy.mock.callCount(), 0);
});

test('preserves graph validation errors before encryption and after authenticated decryption', async (context) => {
  const invalid = { ...document, revisions: [{ ...document.revisions[0]!, parents: ['missing-parent'] }] };
  const raw = sealPlaintext(JSON.stringify(invalid));
  const graphError = (error: unknown) => error instanceof LedgerSyncError && error.code === 'ledger-invalid-parent';
  await assert.rejects(() => decryptLedgerDocument(raw, password), graphError);
  const spy = context.mock.method(crypto.subtle, 'deriveKey', () => { throw new Error('KDF must not run'); });
  await assert.rejects(() => encryptLedgerDocument(invalid as LedgerDocument, password), graphError);
  await assert.rejects(() => encryptLedgerDocument({ ...document, workspace: { ...workspace, name: 'x'.repeat(MAX_LEDGER_DOCUMENT_BYTES) } }, password),
    (error: unknown) => error instanceof LedgerSyncError && error.code === 'ledger-too-large');
  assert.equal(spy.mock.callCount(), 0);
});

test('authenticated invalid JSON and invalid UTF8 never return plaintext', async () => {
  for (const invalid of ['{', Buffer.from([0xc3, 0x28])]) {
    await assert.rejects(() => decryptLedgerDocument(sealPlaintext(invalid), password), errorCode('ledger-invalid-envelope'));
  }
});

test('unavailable WebCrypto operations return sanitized availability errors', async (context) => {
  const raw = await encryptLedgerDocument(document, password);
  context.mock.method(crypto.subtle, 'deriveKey', () => { throw new Error('private runtime details'); });
  await assert.rejects(() => encryptLedgerDocument(document, password), errorCode('ledger-crypto-unavailable'));
  await assert.rejects(() => decryptLedgerDocument(raw, password), errorCode('ledger-crypto-unavailable'));
});
