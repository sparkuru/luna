import {
  createCipheriv,
  createDecipheriv,
  randomBytes as nodeRandomBytes,
  scrypt,
} from 'node:crypto';
import {
  CONFIG_ENVELOPE_FORMAT,
  CONFIG_ENVELOPE_VERSION,
  ConfigCryptoError,
  ConfigEnvelopeV1,
  MAX_REMOTE_CONFIG_PAYLOAD_BYTES,
  configEnvelopeAad,
  decodeConfigEnvelopeBytes,
} from '../shared/config-crypto';
import {
  RemotePortablePayloadV1,
  decodeRemotePortablePayload,
  encodeRemotePortablePayload,
} from '../shared/settings';

export interface ConfigCryptoOptions {
  cost?: number;
  maxmem?: number;
  randomBytes?: (size: number) => Buffer;
}

const DEFAULT_SCRYPT_COST = 131_072;
const DEFAULT_SCRYPT_MAXMEM = 256 * 1024 * 1024;

export async function encryptRemoteConfig(
  payload: RemotePortablePayloadV1,
  passphrase: string,
  options: ConfigCryptoOptions = {},
): Promise<Uint8Array> {
  validatePassphrase(passphrase);
  const plaintext = Buffer.from(JSON.stringify(encodeRemotePortablePayload(payload)), 'utf8');
  if (plaintext.byteLength > MAX_REMOTE_CONFIG_PAYLOAD_BYTES) {
    plaintext.fill(0);
    throw new ConfigCryptoError('invalid-envelope', 'Remote settings payload exceeds the size limit.');
  }
  const randomBytes = options.randomBytes ?? nodeRandomBytes;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cost = options.cost ?? DEFAULT_SCRYPT_COST;
  const maxmem = options.maxmem ?? DEFAULT_SCRYPT_MAXMEM;
  const password = Buffer.from(passphrase, 'utf8');
  let key: Buffer | null = null;
  try {
    key = await deriveKey(password, salt, cost, maxmem);
    const envelope: ConfigEnvelopeV1 = {
      format: CONFIG_ENVELOPE_FORMAT,
      version: CONFIG_ENVELOPE_VERSION,
      payloadSchemaVersion: 1,
      kdf: {
        name: 'scrypt',
        salt: salt.toString('base64'),
        N: cost,
        r: 8,
        p: 1,
        maxmem,
      },
      cipher: {
        name: 'aes-256-gcm',
        iv: iv.toString('base64'),
        tag: '',
      },
      ciphertext: '',
    };
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    cipher.setAAD(configEnvelopeAad(envelope));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    envelope.cipher.tag = cipher.getAuthTag().toString('base64');
    envelope.ciphertext = ciphertext.toString('base64');
    ciphertext.fill(0);
    return Buffer.from(JSON.stringify(envelope), 'utf8');
  } finally {
    plaintext.fill(0);
    password.fill(0);
    key?.fill(0);
    salt.fill(0);
    iv.fill(0);
  }
}

export async function decryptRemoteConfig(
  encrypted: Uint8Array,
  passphrase: string,
): Promise<RemotePortablePayloadV1> {
  validatePassphrase(passphrase);
  const envelope = decodeConfigEnvelopeBytes(encrypted);
  const password = Buffer.from(passphrase, 'utf8');
  const salt = Buffer.from(envelope.kdf.salt, 'base64');
  const iv = Buffer.from(envelope.cipher.iv, 'base64');
  const tag = Buffer.from(envelope.cipher.tag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  let key: Buffer | null = null;
  let plaintext: Buffer | null = null;
  try {
    key = await deriveKey(password, salt, envelope.kdf.N, envelope.kdf.maxmem);
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    decipher.setAAD(configEnvelopeAad(envelope));
    decipher.setAuthTag(tag);
    try {
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new ConfigCryptoError(
        'wrong-password-or-tampered',
        'The sync passphrase is wrong or the remote config was changed.',
      );
    }
    if (plaintext.byteLength > MAX_REMOTE_CONFIG_PAYLOAD_BYTES) {
      throw new ConfigCryptoError('invalid-envelope', 'Remote settings payload exceeds the size limit.');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
    } catch {
      throw new ConfigCryptoError('invalid-envelope', 'Decrypted remote settings are invalid.');
    }
    return decodeRemotePortablePayload(parsed);
  } finally {
    password.fill(0);
    salt.fill(0);
    iv.fill(0);
    tag.fill(0);
    ciphertext.fill(0);
    key?.fill(0);
    plaintext?.fill(0);
  }
}

function validatePassphrase(passphrase: string): void {
  if (passphrase.length < 8 || passphrase.length > 1024) {
    throw new ConfigCryptoError('invalid-envelope', 'Sync passphrase has an invalid length.');
  }
}

function deriveKey(password: Buffer, salt: Buffer, cost: number, maxmem: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, { N: cost, r: 8, p: 1, maxmem }, (error, derivedKey) => {
      if (error !== null) reject(error);
      else resolve(derivedKey);
    });
  });
}
