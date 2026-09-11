import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { MAX_CONFIG_ENVELOPE_BYTES } from '../shared/config-crypto';
import type {
  ConfigSyncConnection,
  ConfigSyncCredentialsInput,
} from '../shared/settings';

export type ObjectStoreErrorCode =
  | 'not-found'
  | 'authentication'
  | 'permission'
  | 'conflict'
  | 'network'
  | 'transient'
  | 'invalid-response';

export class ObjectStoreError extends Error {
  constructor(readonly code: ObjectStoreErrorCode, message: string) {
    super(message);
    this.name = 'ObjectStoreError';
  }
}

export interface ConfigObject {
  body: Uint8Array;
  etag: string;
}

export interface ConditionalPut {
  ifNoneMatch?: true;
  ifMatch?: string;
}

export interface ConfigObjectStore {
  get(key: string, signal?: AbortSignal): Promise<ConfigObject>;
  put(key: string, body: Uint8Array, condition: ConditionalPut, signal?: AbortSignal): Promise<{ etag: string }>;
  close?(): void;
}

export type ConfigObjectStoreFactory = (
  connection: ConfigSyncConnection,
  credentials: ConfigSyncCredentialsInput,
) => ConfigObjectStore;

export class S3ConfigObjectStore implements ConfigObjectStore {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    connection: ConfigSyncConnection,
    credentials: ConfigSyncCredentialsInput,
  ) {
    const config: S3ClientConfig = {
      endpoint: connection.endpoint,
      region: connection.region,
      forcePathStyle: connection.forcePathStyle,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        ...(credentials.sessionToken === undefined ? {} : { sessionToken: credentials.sessionToken }),
      },
      maxAttempts: 1,
    };
    this.client = new S3Client(config);
  }

  async get(key: string, signal?: AbortSignal): Promise<ConfigObject> {
    try {
      const output = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), signal === undefined ? {} : { abortSignal: signal });
      if (output.Body === undefined || output.ETag === undefined || output.ETag.length === 0) {
        await output.Body?.transformToWebStream().cancel();
        throw new ObjectStoreError('invalid-response', 'Object response is missing body or ETag.');
      }
      if (output.ContentLength !== undefined && output.ContentLength > MAX_CONFIG_ENVELOPE_BYTES) {
        await output.Body.transformToWebStream().cancel();
        throw new ObjectStoreError('invalid-response', 'Encrypted config exceeds the size limit.');
      }
      return { body: await readBoundedBody(output.Body), etag: output.ETag };
    } catch (error) {
      throw classifyObjectStoreError(error);
    }
  }

  async put(
    key: string,
    body: Uint8Array,
    condition: ConditionalPut,
    signal?: AbortSignal,
  ): Promise<{ etag: string }> {
    if ((condition.ifNoneMatch === true) === (condition.ifMatch !== undefined) || condition.ifMatch === '') {
      throw new ObjectStoreError('invalid-response', 'Exactly one conditional write token is required.');
    }
    if (body.byteLength === 0 || body.byteLength > MAX_CONFIG_ENVELOPE_BYTES) {
      throw new ObjectStoreError('invalid-response', 'Encrypted config has an invalid size.');
    }
    try {
      const output = await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/json',
        ...(condition.ifNoneMatch === true ? { IfNoneMatch: '*' } : { IfMatch: condition.ifMatch }),
      }), signal === undefined ? {} : { abortSignal: signal });
      if (output.ETag === undefined || output.ETag.length === 0) {
        throw new ObjectStoreError('invalid-response', 'Conditional write response is missing ETag.');
      }
      return { etag: output.ETag };
    } catch (error) {
      throw classifyObjectStoreError(error);
    }
  }
  close(): void { this.client.destroy(); }
}

async function readBoundedBody(body: { transformToWebStream(): ReadableStream<Uint8Array> }): Promise<Uint8Array> {
  const reader = body.transformToWebStream().getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_CONFIG_ENVELOPE_BYTES) throw new ObjectStoreError('invalid-response', 'Encrypted config exceeds the size limit.');
      chunks.push(next.value);
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  } catch (error) {
    try { await reader.cancel(); } catch { /* Preserve the bounded read failure. */ }
    throw error;
  } finally { reader.releaseLock(); }
}

export function createS3ConfigObjectStore(
  connection: ConfigSyncConnection,
  credentials: ConfigSyncCredentialsInput,
): ConfigObjectStore {
  return new S3ConfigObjectStore(connection.bucket, connection, credentials);
}

function classifyObjectStoreError(error: unknown): ObjectStoreError {
  if (error instanceof ObjectStoreError) return error;
  const record = typeof error === 'object' && error !== null
    ? error as Record<string, unknown>
    : {};
  const metadata = typeof record.$metadata === 'object' && record.$metadata !== null
    ? record.$metadata as Record<string, unknown>
    : {};
  const status = typeof metadata.httpStatusCode === 'number' ? metadata.httpStatusCode : undefined;
  const name = typeof record.name === 'string' ? record.name : '';
  const code = typeof record.Code === 'string' ? record.Code : '';
  if (status === 404 || name === 'NoSuchKey' || code === 'NoSuchKey') {
    return new ObjectStoreError('not-found', 'Object was not found.');
  }
  if (status === 401 || name === 'InvalidAccessKeyId' || name === 'SignatureDoesNotMatch') {
    return new ObjectStoreError('authentication', 'Object storage authentication failed.');
  }
  if (status === 403 || name === 'AccessDenied') {
    return new ObjectStoreError('permission', 'Object storage permission was denied.');
  }
  if (status === 409 || status === 412 || name === 'PreconditionFailed' || name === 'ConditionalRequestConflict') {
    return new ObjectStoreError('conflict', 'Object changed during conditional write.');
  }
  if (status === 429 || (status !== undefined && status >= 500)) {
    return new ObjectStoreError('transient', 'Object storage is temporarily unavailable.');
  }
  if (
    error instanceof TypeError ||
    name.includes('Timeout') ||
    name === 'NetworkingError' ||
    name === 'CredentialsProviderError'
  ) {
    return new ObjectStoreError('network', 'Unable to reach object storage.');
  }
  return new ObjectStoreError('invalid-response', 'Object storage returned an unexpected response.');
}
