export const CONFIG_ENVELOPE_FORMAT = 'luna-config-envelope' as const;
export const CONFIG_ENVELOPE_VERSION = 1 as const;
export const MAX_CONFIG_ENVELOPE_BYTES = 1024 * 1024;
export const MAX_REMOTE_CONFIG_PAYLOAD_BYTES = 64 * 1024;

export interface ConfigEnvelopeV1 {
  format: typeof CONFIG_ENVELOPE_FORMAT;
  version: typeof CONFIG_ENVELOPE_VERSION;
  payloadSchemaVersion: 1;
  kdf: {
    name: 'scrypt';
    salt: string;
    N: number;
    r: 8;
    p: 1;
    maxmem: number;
  };
  cipher: {
    name: 'aes-256-gcm';
    iv: string;
    tag: string;
  };
  ciphertext: string;
}

export class ConfigCryptoError extends Error {
  readonly code: 'invalid-envelope' | 'unsupported-version' | 'wrong-password-or-tampered';

  constructor(
    code: 'invalid-envelope' | 'unsupported-version' | 'wrong-password-or-tampered',
    message: string,
  ) {
    super(message);
    this.name = 'ConfigCryptoError';
    this.code = code;
  }
}

export function decodeConfigEnvelopeBytes(payload: Uint8Array): ConfigEnvelopeV1 {
  if (payload.byteLength === 0 || payload.byteLength > MAX_CONFIG_ENVELOPE_BYTES) {
    throw new ConfigCryptoError('invalid-envelope', 'Encrypted config has an invalid size.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload));
  } catch {
    throw new ConfigCryptoError('invalid-envelope', 'Encrypted config is not valid UTF-8 JSON.');
  }
  return decodeConfigEnvelope(parsed);
}

export function decodeConfigEnvelope(value: unknown): ConfigEnvelopeV1 {
  const record = readExactRecord(
    value,
    ['format', 'version', 'payloadSchemaVersion', 'kdf', 'cipher', 'ciphertext'],
    'envelope',
  );
  if (record.format !== CONFIG_ENVELOPE_FORMAT || record.version !== CONFIG_ENVELOPE_VERSION) {
    throw new ConfigCryptoError('unsupported-version', 'Encrypted config version is unsupported.');
  }
  if (record.payloadSchemaVersion !== 1) {
    throw new ConfigCryptoError('unsupported-version', 'Remote settings payload version is unsupported.');
  }
  const kdf = readExactRecord(record.kdf, ['name', 'salt', 'N', 'r', 'p', 'maxmem'], 'kdf');
  const cipher = readExactRecord(record.cipher, ['name', 'iv', 'tag'], 'cipher');
  if (
    kdf.name !== 'scrypt' ||
    typeof kdf.N !== 'number' ||
    !Number.isInteger(kdf.N) ||
    kdf.N < 16_384 ||
    kdf.N > 131_072 ||
    (kdf.N & (kdf.N - 1)) !== 0 ||
    kdf.r !== 8 ||
    kdf.p !== 1 ||
    typeof kdf.maxmem !== 'number' ||
    !Number.isInteger(kdf.maxmem) ||
    kdf.maxmem < 32 * 1024 * 1024 ||
    kdf.maxmem > 256 * 1024 * 1024
  ) {
    throw new ConfigCryptoError('invalid-envelope', 'Encrypted config KDF parameters are invalid.');
  }
  if (cipher.name !== 'aes-256-gcm') {
    throw new ConfigCryptoError('unsupported-version', 'Encrypted config cipher is unsupported.');
  }
  const salt = readBase64(kdf.salt, 'salt', 16);
  const iv = readBase64(cipher.iv, 'iv', 12);
  const tag = readBase64(cipher.tag, 'tag', 16);
  salt.fill(0);
  iv.fill(0);
  tag.fill(0);
  const ciphertext = readBase64(record.ciphertext, 'ciphertext', undefined, MAX_REMOTE_CONFIG_PAYLOAD_BYTES + 32);
  ciphertext.fill(0);
  return {
    format: CONFIG_ENVELOPE_FORMAT,
    version: CONFIG_ENVELOPE_VERSION,
    payloadSchemaVersion: 1,
    kdf: {
      name: 'scrypt',
      salt: kdf.salt as string,
      N: kdf.N,
      r: 8,
      p: 1,
      maxmem: kdf.maxmem,
    },
    cipher: {
      name: 'aes-256-gcm',
      iv: cipher.iv as string,
      tag: cipher.tag as string,
    },
    ciphertext: record.ciphertext as string,
  };
}

export function configEnvelopeAad(envelope: ConfigEnvelopeV1): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      format: envelope.format,
      version: envelope.version,
      payloadSchemaVersion: envelope.payloadSchemaVersion,
      kdf: {
        name: envelope.kdf.name,
        salt: envelope.kdf.salt,
        N: envelope.kdf.N,
        r: envelope.kdf.r,
        p: envelope.kdf.p,
        maxmem: envelope.kdf.maxmem,
      },
      cipher: { name: envelope.cipher.name, iv: envelope.cipher.iv },
    }),
  );
}

function readExactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigCryptoError('invalid-envelope', `${label} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !(key in record))) {
    throw new ConfigCryptoError('invalid-envelope', `${label} fields are invalid.`);
  }
  return record;
}

function readBase64(
  value: unknown,
  label: string,
  exactBytes?: number,
  maximumBytes?: number,
): Uint8Array {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_CONFIG_ENVELOPE_BYTES * 2 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new ConfigCryptoError('invalid-envelope', `${label} is not valid base64.`);
  }
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new ConfigCryptoError('invalid-envelope', `${label} is not valid base64.`);
  }
  const decoded = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (btoa(binary) !== value) {
    decoded.fill(0);
    throw new ConfigCryptoError('invalid-envelope', `${label} is not canonical base64.`);
  }
  if (
    (exactBytes !== undefined && decoded.byteLength !== exactBytes) ||
    (maximumBytes !== undefined && decoded.byteLength > maximumBytes)
  ) {
    decoded.fill(0);
    throw new ConfigCryptoError('invalid-envelope', `${label} has an invalid size.`);
  }
  return decoded;
}
