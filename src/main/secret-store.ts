import { readFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { SafeStorage } from 'electron';
import {
  ConfigSyncCredentialsInput,
  SecretPersistence,
  decodeConfigSyncCredentials,
} from '../shared/settings';
import { atomicWritePrivateFile, pathExists } from './atomic-file';

const SECRET_FILE_SCHEMA_VERSION = 1;
const MAX_SECRET_FILE_BYTES = 64 * 1024;

interface SecretFileV1 {
  schemaVersion: typeof SECRET_FILE_SCHEMA_VERSION;
  ciphertext: string;
}

export interface SecretProtector {
  persistence(): Promise<SecretPersistence>;
  protect(plaintext: string): Promise<Buffer>;
  unprotect(ciphertext: Buffer): Promise<{ plaintext: string; shouldReEncrypt: boolean }>;
}

export class ElectronSafeStorageProtector implements SecretProtector {
  constructor(
    private readonly storage: SafeStorage,
    private readonly platform = process.platform,
  ) {}

  async persistence(): Promise<SecretPersistence> {
    try {
      const available = await this.storage.isAsyncEncryptionAvailable();
      if (!available) return 'unavailable';
      if (this.platform === 'linux' && this.storage.getSelectedStorageBackend() === 'basic_text') {
        return 'unavailable';
      }
    } catch {
      return 'unavailable';
    }
    return 'secure';
  }

  async protect(plaintext: string): Promise<Buffer> {
    return this.storage.encryptStringAsync(plaintext);
  }

  async unprotect(ciphertext: Buffer): Promise<{ plaintext: string; shouldReEncrypt: boolean }> {
    const result = await this.storage.decryptStringAsync(ciphertext);
    return { plaintext: result.result, shouldReEncrypt: result.shouldReEncrypt };
  }
}

export class SecretStore {
  readonly secretsPath: string;

  constructor(dataDirectory: string, private readonly protector: SecretProtector) {
    this.secretsPath = path.join(dataDirectory, 'config-sync-secrets.json');
  }

  async persistence(): Promise<SecretPersistence> {
    return this.protector.persistence();
  }

  async hasPersisted(): Promise<boolean> {
    return pathExists(this.secretsPath);
  }

  async save(credentials: ConfigSyncCredentialsInput): Promise<SecretPersistence> {
    const persistence = await this.protector.persistence();
    if (persistence !== 'secure') return 'session-only';
    const validated = decodeConfigSyncCredentials(credentials);
    let ciphertext: Buffer;
    try {
      ciphertext = await this.protector.protect(JSON.stringify(validated));
    } catch {
      return 'session-only';
    }
    const file: SecretFileV1 = {
      schemaVersion: SECRET_FILE_SCHEMA_VERSION,
      ciphertext: ciphertext.toString('base64'),
    };
    await atomicWritePrivateFile(this.secretsPath, `${JSON.stringify(file, null, 2)}\n`);
    return 'secure';
  }

  async load(): Promise<ConfigSyncCredentialsInput | null> {
    if (!(await pathExists(this.secretsPath))) return null;
    if ((await this.protector.persistence()) !== 'secure') return null;
    const metadata = await stat(this.secretsPath);
    if (metadata.size > MAX_SECRET_FILE_BYTES) throw new Error('secret file exceeds size limit');
    const file = decodeSecretFile(JSON.parse(await readFile(this.secretsPath, 'utf8')) as unknown);
    const decrypted = await this.protector.unprotect(Buffer.from(file.ciphertext, 'base64'));
    const credentials = decodeConfigSyncCredentials(JSON.parse(decrypted.plaintext) as unknown);
    if (decrypted.shouldReEncrypt) await this.save(credentials);
    return credentials;
  }

  async clear(): Promise<void> {
    await unlink(this.secretsPath).catch((error: unknown) => {
      if (!isMissingFileError(error)) throw error;
    });
  }
}

function decodeSecretFile(value: unknown): SecretFileV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid secret file');
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    record.schemaVersion !== SECRET_FILE_SCHEMA_VERSION ||
    typeof record.ciphertext !== 'string' ||
    record.ciphertext.length === 0 ||
    record.ciphertext.length > MAX_SECRET_FILE_BYTES ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(record.ciphertext)
  ) {
    throw new Error('invalid secret file');
  }
  return { schemaVersion: SECRET_FILE_SCHEMA_VERSION, ciphertext: record.ciphertext };
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
