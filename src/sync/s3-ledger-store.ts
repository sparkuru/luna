import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ConfigSyncConnection, ConfigSyncCredentialsInput } from '../shared/settings';

export const MAX_LEDGER_OBJECT_BYTES = 12 * 1024 * 1024;

export class LedgerObjectError extends Error {
  constructor(readonly code: 'not-found' | 'conflict' | 'authentication' | 'permission' | 'network' | 'invalid-response') {
    super(`LUNA_ERROR:ledger-remote-${code}`);
    this.name = 'LedgerObjectError';
  }
}

export interface LedgerObjectStore {
  get(key: string, signal: AbortSignal): Promise<{ body: string; etag: string } | null>;
  put(key: string, body: string, etag: string | null, signal: AbortSignal): Promise<void>;
  close(): void;
}

/** The portable adapter uses the SDK's Fetch transport in browsers and HTTP in Node. */
export class S3LedgerObjectStore implements LedgerObjectStore {
  private readonly client: S3Client;
  constructor(private readonly connection: ConfigSyncConnection, credentials: ConfigSyncCredentialsInput) {
    this.client = new S3Client({ endpoint: connection.endpoint, region: connection.region,
      forcePathStyle: connection.forcePathStyle, maxAttempts: 1,
      credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey,
        ...(credentials.sessionToken === undefined ? {} : { sessionToken: credentials.sessionToken }) },
    });
  }

  async get(key: string, signal: AbortSignal): Promise<{ body: string; etag: string } | null> {
    try {
      const output = await this.client.send(new GetObjectCommand({ Bucket: this.connection.bucket, Key: key }),
        { abortSignal: signal });
      if (output.Body === undefined) throw new LedgerObjectError('invalid-response');
      const stream = output.Body.transformToWebStream();
      if (!output.ETag || (output.ContentLength !== undefined && output.ContentLength > MAX_LEDGER_OBJECT_BYTES)) {
        await stream.cancel();
        throw new LedgerObjectError('invalid-response');
      }
      return { body: await readBoundedLedgerBody(stream), etag: output.ETag };
    } catch (error) {
      const classified = classify(error);
      if (classified.code === 'not-found') return null;
      throw classified;
    }
  }

  async put(key: string, body: string, etag: string | null, signal: AbortSignal): Promise<void> {
    const bytes = new TextEncoder().encode(body);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_LEDGER_OBJECT_BYTES || etag === '') {
      throw new LedgerObjectError('invalid-response');
    }
    try {
      const output = await this.client.send(new PutObjectCommand({ Bucket: this.connection.bucket, Key: key,
        Body: bytes, ContentType: 'application/json',
        ...(etag === null ? { IfNoneMatch: '*' } : { IfMatch: etag }),
      }), { abortSignal: signal });
      if (!output.ETag) throw new LedgerObjectError('invalid-response');
    } catch (error) { throw classify(error); }
  }

  close(): void { this.client.destroy(); }
}

export async function readBoundedLedgerBody(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0;
  let result = '';
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_LEDGER_OBJECT_BYTES) throw new LedgerObjectError('invalid-response');
      result += decoder.decode(next.value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } catch {
    try { await reader.cancel(); } catch { /* Preserve the safe read failure. */ }
    throw new LedgerObjectError('invalid-response');
  } finally { reader.releaseLock(); }
}

function classify(error: unknown): LedgerObjectError {
  if (error instanceof LedgerObjectError) return error;
  const record = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {};
  const metadata = typeof record.$metadata === 'object' && record.$metadata !== null
    ? record.$metadata as Record<string, unknown> : {};
  const status = metadata.httpStatusCode;
  if (status === 404 || record.name === 'NoSuchKey') return new LedgerObjectError('not-found');
  if (status === 409 || status === 412) return new LedgerObjectError('conflict');
  if (status === 401 || record.name === 'InvalidAccessKeyId' || record.name === 'SignatureDoesNotMatch') {
    return new LedgerObjectError('authentication');
  }
  if (status === 403) return new LedgerObjectError('permission');
  return new LedgerObjectError('network');
}
