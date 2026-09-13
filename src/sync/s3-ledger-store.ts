import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ConfigSyncConnection, ConfigSyncCredentialsInput } from '../shared/settings';
import { assertNotAborted } from '../shared/abort';
import type { AttachmentObjectStore } from './attachment-object-store';
import {
  ATTACHMENT_GCM_TAG_BYTES,
  MAX_CIPHER_ATTACHMENT_BYTES,
  sha256Hex,
} from '../shared/attachment-contract';

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
  attachments?: AttachmentObjectStore;
  close(): void;
}

/** The portable adapter uses the SDK's Fetch transport in browsers and HTTP in Node. */
export class S3LedgerObjectStore implements LedgerObjectStore {
  private readonly client: S3Client;
  readonly attachments: AttachmentObjectStore;
  constructor(private readonly connection: ConfigSyncConnection, credentials: ConfigSyncCredentialsInput) {
    this.client = new S3Client({ endpoint: connection.endpoint, region: connection.region,
      forcePathStyle: connection.forcePathStyle, maxAttempts: 1,
      credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey,
        ...(credentials.sessionToken === undefined ? {} : { sessionToken: credentials.sessionToken }) },
    });
    this.attachments = new S3LedgerAttachmentStore(this.client, connection);
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

  close(): void {
    this.attachments.close();
    this.client.destroy();
  }
}

export class S3LedgerAttachmentStore implements AttachmentObjectStore {
  private closed = false;
  constructor(
    private readonly client: S3Client,
    private readonly connection: ConfigSyncConnection,
  ) {}

  private check(signal: AbortSignal): void {
    if (this.closed || signal.aborted) throw new LedgerObjectError('network');
  }

  async get(attachmentId: string, signal: AbortSignal) {
    this.check(signal);
    try {
      const output = await this.client.send(
        new GetObjectCommand({ Bucket: this.connection.bucket, Key: this.key(attachmentId) }),
        { abortSignal: signal },
      );
      if (!output.Body || !output.ETag || output.ContentLength === undefined)
        throw new LedgerObjectError('invalid-response');
      if (
        output.ContentLength <= ATTACHMENT_GCM_TAG_BYTES ||
        output.ContentLength > MAX_CIPHER_ATTACHMENT_BYTES
      )
        throw new LedgerObjectError('invalid-response');
      const body = await readBoundedBytes(output.Body.transformToWebStream(), MAX_CIPHER_ATTACHMENT_BYTES, signal);
      const sha256 = await sha256Hex(body);
      const advertised = output.Metadata?.sha256;
      if (advertised !== undefined && advertised !== sha256)
        throw new LedgerObjectError('invalid-response');
      return { body, etag: output.ETag, sha256 };
    } catch (error) {
      const classified = classify(error);
      if (classified.code === 'not-found') return null;
      throw classified;
    }
  }

  async putImmutable(
    attachmentId: string,
    body: Uint8Array,
    sha256: string,
    signal: AbortSignal,
  ): Promise<{ etag: string }> {
    this.check(signal);
    if (
      body.byteLength <= ATTACHMENT_GCM_TAG_BYTES ||
      body.byteLength > MAX_CIPHER_ATTACHMENT_BYTES
    )
      throw new LedgerObjectError('invalid-response');
    if ((await sha256Hex(body)) !== sha256)
      throw new LedgerObjectError('invalid-response');
    try {
      const output = await this.client.send(
        new PutObjectCommand({
          Bucket: this.connection.bucket,
          Key: this.key(attachmentId),
          Body: body,
          ContentType: 'application/octet-stream',
          Metadata: { sha256 },
          IfNoneMatch: '*',
        }),
        { abortSignal: signal },
      );
      if (!output.ETag) throw new LedgerObjectError('invalid-response');
      return { etag: output.ETag };
    } catch (error) {
      const classified = classify(error);
      if (classified.code !== 'conflict') throw classified;
      const current = await this.get(attachmentId, signal);
      if (current === null || current.body.byteLength !== body.byteLength || current.sha256 !== sha256)
        throw new LedgerObjectError('conflict');
      return { etag: current.etag };
    }
  }

  async repairExpectedCiphertext(
    attachmentId: string,
    body: Uint8Array,
    sha256: string,
    observedEtag: string,
    signal: AbortSignal,
  ): Promise<{ etag: string }> {
    this.check(signal);
    if (
      body.byteLength <= ATTACHMENT_GCM_TAG_BYTES ||
      body.byteLength > MAX_CIPHER_ATTACHMENT_BYTES
    )
      throw new LedgerObjectError('invalid-response');
    if ((await sha256Hex(body)) !== sha256)
      throw new LedgerObjectError('invalid-response');
    const current = await this.get(attachmentId, signal);
    if (current !== null && current.sha256 === sha256 && current.body.byteLength === body.byteLength)
      return { etag: current.etag };
    try {
      const output = await this.client.send(
        new PutObjectCommand({
          Bucket: this.connection.bucket,
          Key: this.key(attachmentId),
          Body: body,
          ContentType: 'application/octet-stream',
          Metadata: { sha256 },
          ...(current === null ? { IfNoneMatch: '*' } : { IfMatch: observedEtag }),
        }),
        { abortSignal: signal },
      );
      if (!output.ETag) throw new LedgerObjectError('invalid-response');
      return { etag: output.ETag };
    } catch (error) {
      throw classify(error);
    }
  }

  close(): void { this.closed = true; }

  private key(attachmentId: string): string {
    const prefix = this.connection.prefix.replace(/^\/+|\/+$/g, '');
    return `${prefix ? `${prefix}/` : ''}attachments/v1/${attachmentId}`;
  }
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

async function readBoundedBytes(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      assertNotAborted(signal);
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) throw new LedgerObjectError('invalid-response');
      chunks.push(next.value);
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  } catch (error) {
    try { await reader.cancel(); } catch { /* Preserve the original failure. */ }
    throw error;
  } finally {
    reader.releaseLock();
  }
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
