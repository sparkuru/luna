import {
  decodeLedgerDocument,
  LedgerSyncError,
  MAX_LEDGER_DOCUMENT_BYTES,
  type LedgerDocument,
  type LedgerDocumentSchemaVersion,
} from './ledger-sync';

export const MAX_LEDGER_ENVELOPE_BYTES = 12 * 1024 * 1024;
const ITERATIONS = 600_000;
const TAG_BYTES = 16;
const encoder = new TextEncoder();

export type LedgerCryptoErrorCode =
  | 'ledger-invalid-envelope' | 'ledger-unsupported-envelope' | 'ledger-password-invalid'
  | 'ledger-wrong-password-or-tampered' | 'ledger-crypto-unavailable';

export class LedgerCryptoError extends Error {
  constructor(readonly code: LedgerCryptoErrorCode) {
    super(`LUNA_ERROR:${code}`);
    this.name = 'LedgerCryptoError';
  }
}

interface LedgerEnvelope {
  format: 'luna-ledger-envelope';
  version: LedgerDocumentSchemaVersion;
  payloadSchemaVersion: LedgerDocumentSchemaVersion;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: 600000; salt: string };
  cipher: { name: 'AES-GCM'; iv: string; tagLength: 128 };
  ciphertext: string;
}

export function validateLedgerPassword(password: string): void {
  decodePassword(password).fill(0);
}

export async function encryptLedgerDocument(document: LedgerDocument, password: string): Promise<string> {
  const passwordBytes = decodePassword(password);
  let plaintext: Uint8Array<ArrayBuffer> | undefined;
  try {
    const decodedDocument = decodeLedgerDocument(document);
    const version = decodedDocument.schemaVersion;
    plaintext = encoder.encode(JSON.stringify(decodedDocument));
    if (plaintext.byteLength > MAX_LEDGER_DOCUMENT_BYTES) throw new LedgerSyncError('ledger-too-large');
    const crypto = requireCrypto();
    let encrypted: ArrayBuffer;
    let envelope: LedgerEnvelope;
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      envelope = {
        format: 'luna-ledger-envelope', version, payloadSchemaVersion: version,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: encodeBase64(salt) },
        cipher: { name: 'AES-GCM', iv: encodeBase64(iv), tagLength: 128 },
        ciphertext: '',
      };
      const key = await deriveKey(crypto, passwordBytes, salt, 'encrypt');
      encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: 128, additionalData: authenticatedMetadata(envelope) }, key, plaintext,
      );
    } catch {
      throw new LedgerCryptoError('ledger-crypto-unavailable');
    }
    envelope.ciphertext = encodeBase64(new Uint8Array(encrypted));
    return JSON.stringify(envelope);
  } finally {
    passwordBytes.fill(0);
    plaintext?.fill(0);
  }
}

export async function decryptLedgerDocument(raw: string, password: string): Promise<LedgerDocument> {
  const { envelope, salt, iv, ciphertext } = decodeLedgerEnvelope(raw);
  const passwordBytes = decodePassword(password);
  let plaintext: Uint8Array<ArrayBuffer> | undefined;
  try {
    const crypto = requireCrypto();
    let key: CryptoKey;
    try {
      key = await deriveKey(crypto, passwordBytes, salt, 'decrypt');
    } catch {
      throw new LedgerCryptoError('ledger-crypto-unavailable');
    }
    try {
      plaintext = new Uint8Array(await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, tagLength: 128, additionalData: authenticatedMetadata(envelope) }, key, ciphertext,
      ));
    } catch (error) {
      throw new LedgerCryptoError(error instanceof Error && error.name === 'OperationError'
        ? 'ledger-wrong-password-or-tampered' : 'ledger-crypto-unavailable');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
    } catch {
      throw new LedgerCryptoError('ledger-invalid-envelope');
    }
    const document = decodeLedgerDocument(parsed);
    if (document.schemaVersion !== envelope.version)
      throw new LedgerCryptoError('ledger-invalid-envelope');
    return document;
  } finally {
    passwordBytes.fill(0);
    plaintext?.fill(0);
  }
}

function decodePassword(password: string): Uint8Array<ArrayBuffer> {
  if (typeof password !== 'string' || password.length > 1024) fail('ledger-password-invalid');
  let codePoints = 0;
  for (const character of password) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) fail('ledger-password-invalid');
    codePoints++;
  }
  if (codePoints < 12) fail('ledger-password-invalid');
  const bytes = encoder.encode(password);
  if (bytes.byteLength > 1024) {
    bytes.fill(0);
    fail('ledger-password-invalid');
  }
  return bytes;
}

function requireCrypto(): Crypto {
  const crypto = globalThis.crypto;
  if (crypto?.subtle === undefined || typeof crypto.getRandomValues !== 'function') {
    fail('ledger-crypto-unavailable');
  }
  return crypto;
}

async function deriveKey(
  crypto: Crypto, password: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, usage: 'encrypt' | 'decrypt',
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt }, material,
    { name: 'AES-GCM', length: 256 }, false, [usage],
  );
}

export function decodeLedgerEnvelope(raw: string): {
  envelope: LedgerEnvelope;
  salt: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: Uint8Array<ArrayBuffer>;
} {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LEDGER_ENVELOPE_BYTES
    || encoder.encode(raw).byteLength > MAX_LEDGER_ENVELOPE_BYTES) fail('ledger-invalid-envelope');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { fail('ledger-invalid-envelope'); }
  const envelope = exactRecord(parsed, ['format', 'version', 'payloadSchemaVersion', 'kdf', 'cipher', 'ciphertext']);
  const version = envelope.version;
  const payloadSchemaVersion = envelope.payloadSchemaVersion;
  if (
    envelope.format !== 'luna-ledger-envelope' ||
    !isLedgerVersion(version) ||
    !isLedgerVersion(payloadSchemaVersion) ||
    payloadSchemaVersion !== version
  ) {
    fail('ledger-unsupported-envelope');
  }
  const kdf = exactRecord(envelope.kdf, ['name', 'hash', 'iterations', 'salt']);
  const cipher = exactRecord(envelope.cipher, ['name', 'iv', 'tagLength']);
  if (kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256' || cipher.name !== 'AES-GCM') {
    fail('ledger-unsupported-envelope');
  }
  if (kdf.iterations !== ITERATIONS || cipher.tagLength !== 128) fail('ledger-invalid-envelope');
  const salt = decodeBase64(kdf.salt, 16, 16);
  const iv = decodeBase64(cipher.iv, 12, 12);
  const ciphertext = decodeBase64(envelope.ciphertext, TAG_BYTES, MAX_LEDGER_DOCUMENT_BYTES + TAG_BYTES);
  return {
    envelope: {
      format: 'luna-ledger-envelope', version, payloadSchemaVersion,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: kdf.salt as string },
      cipher: { name: 'AES-GCM', iv: cipher.iv as string, tagLength: 128 },
      ciphertext: envelope.ciphertext as string,
    },
    salt, iv, ciphertext,
  };
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('ledger-invalid-envelope');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key))) {
    fail('ledger-invalid-envelope');
  }
  return record;
}

/** Reconstruct in protocol order, independent of the received JSON key order. */
function authenticatedMetadata(envelope: LedgerEnvelope): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify({
    format: envelope.format, version: envelope.version, payloadSchemaVersion: envelope.payloadSchemaVersion,
    kdf: { name: envelope.kdf.name, hash: envelope.kdf.hash, iterations: envelope.kdf.iterations, salt: envelope.kdf.salt },
    cipher: { name: envelope.cipher.name, iv: envelope.cipher.iv, tagLength: envelope.cipher.tagLength },
  }));
}

function encodeBase64(bytes: Uint8Array<ArrayBuffer>): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(chunks.join(''));
}

function decodeBase64(value: unknown, minimumBytes: number, maximumBytes: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0
    || value.length > Math.ceil(maximumBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    fail('ledger-invalid-envelope');
  }
  let binary: string;
  try { binary = atob(value); } catch { fail('ledger-invalid-envelope'); }
  if (binary.length < minimumBytes || binary.length > maximumBytes || btoa(binary) !== value) {
    fail('ledger-invalid-envelope');
  }
  const decoded = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) decoded[index] = binary.charCodeAt(index);
  return decoded;
}

function fail(code: LedgerCryptoErrorCode): never {
  throw new LedgerCryptoError(code);
}

function isLedgerVersion(value: unknown): value is LedgerDocumentSchemaVersion {
  return value === 1 || value === 2 || value === 3;
}
