import { scryptAsync } from '@noble/hashes/scrypt.js';
import { assertNotAborted } from './abort';
import {
  CONFIG_ENVELOPE_FORMAT, CONFIG_ENVELOPE_VERSION, ConfigCryptoError,
  configEnvelopeAad, decodeConfigEnvelopeBytes, MAX_REMOTE_CONFIG_PAYLOAD_BYTES, type ConfigEnvelopeV1,
} from './config-crypto';
import { decodeRemotePortablePayload, encodeRemotePortablePayload, type RemotePortablePayloadV1 } from './settings';

export interface PortableConfigCryptoOptions {
  cost?: number;
  maxmem?: number;
  signal?: AbortSignal;
}

/** Exact v1 interoperability with Node scrypt + AES-GCM; no protocol migration. */
export async function encryptRemoteConfig(
  payload: RemotePortablePayloadV1, passphrase: string, options: PortableConfigCryptoOptions = {},
): Promise<Uint8Array> {
  validatePassphrase(passphrase);
  const plaintext = new TextEncoder().encode(JSON.stringify(encodeRemotePortablePayload(payload)));
  if (plaintext.byteLength > MAX_REMOTE_CONFIG_PAYLOAD_BYTES) {
    plaintext.fill(0);
    throw new ConfigCryptoError('invalid-envelope', 'Remote settings exceed the size limit.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const envelope: ConfigEnvelopeV1 = {
    format: CONFIG_ENVELOPE_FORMAT, version: CONFIG_ENVELOPE_VERSION, payloadSchemaVersion: 1,
    kdf: { name: 'scrypt', salt: base64(salt), N: options.cost ?? 131_072, r: 8, p: 1, maxmem: options.maxmem ?? 256 * 1024 * 1024 },
    cipher: { name: 'aes-256-gcm', iv: base64(iv), tag: '' }, ciphertext: '',
  };
  try {
    const key = await deriveKey(passphrase, salt, envelope, options.signal);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv,
      additionalData: new Uint8Array(configEnvelopeAad(envelope)), tagLength: 128 }, key, plaintext));
    assertNotAborted(options.signal);
    envelope.ciphertext = base64(encrypted.subarray(0, -16));
    envelope.cipher.tag = base64(encrypted.subarray(-16));
    encrypted.fill(0);
    const bytes = new TextEncoder().encode(JSON.stringify(envelope));
    decodeConfigEnvelopeBytes(bytes);
    return bytes;
  } finally { plaintext.fill(0); salt.fill(0); iv.fill(0); }
}

export async function decryptRemoteConfig(
  encrypted: Uint8Array, passphrase: string, options: PortableConfigCryptoOptions = {},
): Promise<RemotePortablePayloadV1> {
  validatePassphrase(passphrase);
  const envelope = decodeConfigEnvelopeBytes(encrypted);
  const salt = unbase64(envelope.kdf.salt);
  const iv = unbase64(envelope.cipher.iv);
  const ciphertext = unbase64(envelope.ciphertext);
  const tag = unbase64(envelope.cipher.tag);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext); combined.set(tag, ciphertext.length);
  let plaintext: Uint8Array | null = null;
  try {
    const key = await deriveKey(passphrase, salt, envelope, options.signal);
    try {
      plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv,
        additionalData: new Uint8Array(configEnvelopeAad(envelope)), tagLength: 128 }, key, combined));
    } catch { throw new ConfigCryptoError('wrong-password-or-tampered', 'Wrong passphrase or changed remote config.'); }
    assertNotAborted(options.signal);
    if (plaintext.length > MAX_REMOTE_CONFIG_PAYLOAD_BYTES) throw new ConfigCryptoError('invalid-envelope', 'Remote settings exceed the size limit.');
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)); }
    catch { throw new ConfigCryptoError('invalid-envelope', 'Decrypted settings are invalid.'); }
    return decodeRemotePortablePayload(parsed);
  } finally { salt.fill(0); iv.fill(0); ciphertext.fill(0); tag.fill(0); combined.fill(0); plaintext?.fill(0); }
}

async function deriveKey(passphrase: string, salt: Uint8Array, envelope: ConfigEnvelopeV1, signal?: AbortSignal): Promise<CryptoKey> {
  assertNotAborted(signal);
  const password = new TextEncoder().encode(passphrase);
  let bytes: Uint8Array | undefined;
  try {
    bytes = await scryptAsync(password, salt, { N: envelope.kdf.N, r: 8, p: 1,
      dkLen: 32, maxmem: envelope.kdf.maxmem, asyncTick: 5, onProgress: () => assertNotAborted(signal) });
    assertNotAborted(signal);
    return await crypto.subtle.importKey('raw', new Uint8Array(bytes), 'AES-GCM', false, ['encrypt', 'decrypt']);
  } finally { password.fill(0); bytes?.fill(0); }
}

function validatePassphrase(value: string): void {
  if (typeof value !== 'string' || value.length < 8 || value.length > 1024) {
    throw new ConfigCryptoError('invalid-envelope', 'Sync passphrase has an invalid length.');
  }
}
function base64(bytes: Uint8Array): string {
  let result = '';
  for (const byte of bytes) result += String.fromCharCode(byte);
  return btoa(result);
}
function unbase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
