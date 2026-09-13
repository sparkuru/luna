import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { LIMITS } from "../schemas/http";

export type ObjectCondition =
  | { ifNoneMatch: true }
  | { ifMatch: string };

export interface ServerObjectStore {
  ensureReady(): Promise<void>;
  get(key: string, signal?: AbortSignal): Promise<{
    body: Buffer;
    etag: string;
  } | null>;
  put(
    key: string,
    body: Buffer,
    condition: ObjectCondition,
    signal?: AbortSignal,
  ): Promise<{ etag: string }>;
  head(key: string, signal?: AbortSignal): Promise<{
    etag: string;
    byteLength: number;
  } | null>;
  putImmutable(
    key: string,
    body: Buffer,
    signal?: AbortSignal,
  ): Promise<{ etag: string }>;
  remove(key: string, signal?: AbortSignal): Promise<void>;
  close(): void;
}

/**
 * S3 is a server-side implementation detail.  The browser only sees the
 * authenticated HTTP object API, so its access key never crosses this class.
 */
export class S3ServerObjectStore implements ServerObjectStore {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    private readonly prefix: string,
    config: S3ClientConfig,
  ) {
    this.client = new S3Client({ ...config, maxAttempts: 1 });
  }

  async ensureReady(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      const status = statusOf(error);
      if (status !== 404 && status !== 400) throw error;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async get(key: string, signal?: AbortSignal) {
    try {
      const output = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
        signal === undefined ? {} : { abortSignal: signal },
      );
      if (!output.Body || !output.ETag)
        throw new Error("object-store-invalid-response");
      const body = await readBody(output.Body, LIMITS.ledgerBytes, signal);
      return { body, etag: normalizeEtag(output.ETag) };
    } catch (error) {
      if (statusOf(error) === 404 || nameOf(error) === "NoSuchKey") return null;
      throw error;
    }
  }

  async put(key: string, body: Buffer, condition: ObjectCondition, signal?: AbortSignal) {
    const output = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        Body: body,
        ContentType: "application/json",
        ...("ifNoneMatch" in condition
          ? { IfNoneMatch: "*" }
          : { IfMatch: condition.ifMatch }),
      }),
      signal === undefined ? {} : { abortSignal: signal },
    );
    if (!output.ETag) throw new Error("object-store-invalid-response");
    return { etag: normalizeEtag(output.ETag) };
  }

  async head(key: string, signal?: AbortSignal) {
    try {
      const output = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
        signal === undefined ? {} : { abortSignal: signal },
      );
      if (!output.ETag || output.ContentLength === undefined)
        throw new Error("object-store-invalid-response");
      return { etag: normalizeEtag(output.ETag), byteLength: output.ContentLength };
    } catch (error) {
      if (statusOf(error) === 404 || nameOf(error) === "NotFound") return null;
      throw error;
    }
  }

  putImmutable(key: string, body: Buffer, signal?: AbortSignal) {
    return this.put(key, body, { ifNoneMatch: true }, signal);
  }

  async remove(key: string, signal?: AbortSignal): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
      signal === undefined ? {} : { abortSignal: signal },
    );
  }

  close(): void {
    this.client.destroy();
  }

  private objectKey(key: string): string {
    return this.prefix ? `${this.prefix.replace(/\/+$/, "")}/${key}` : key;
  }
}

/** Small deterministic adapter used by unit/contract tests without MinIO. */
export class MemoryServerObjectStore implements ServerObjectStore {
  private readonly objects = new Map<string, { body: Buffer; etag: string }>();

  async ensureReady(): Promise<void> {}

  async get(key: string): Promise<{ body: Buffer; etag: string } | null> {
    const value = this.objects.get(key);
    return value === undefined
      ? null
      : { body: Buffer.from(value.body), etag: value.etag };
  }

  async put(key: string, body: Buffer, condition: ObjectCondition) {
    const current = this.objects.get(key);
    if (("ifNoneMatch" in condition && current) || ("ifMatch" in condition && current?.etag !== condition.ifMatch)) {
      const error = new Error("precondition-failed");
      (error as Error & { statusCode?: number }).statusCode = 412;
      throw error;
    }
    const etag = `"${randomUUID()}"`;
    this.objects.set(key, { body: Buffer.from(body), etag });
    return { etag };
  }

  async head(key: string) {
    const current = this.objects.get(key);
    return current === undefined
      ? null
      : { etag: current.etag, byteLength: current.body.byteLength };
  }

  putImmutable(key: string, body: Buffer) {
    return this.put(key, body, { ifNoneMatch: true });
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(key);
  }

  close(): void {}
}

async function readBody(
  body: { transformToWebStream(): ReadableStream<Uint8Array> },
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  const reader = body.transformToWebStream().getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) throw new Error("object-store-response-too-large");
      chunks.push(next.value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
  } finally {
    reader.releaseLock();
  }
}

function normalizeEtag(value: string): string {
  return value.startsWith('"') ? value : `"${value}"`;
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const metadata = (error as { $metadata?: { httpStatusCode?: number } }).$metadata;
  return metadata?.httpStatusCode;
}

function nameOf(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "name" in error
    ? String((error as { name?: unknown }).name)
    : undefined;
}

/** Optional filesystem adapter for a development install without MinIO. */
export class FileServerObjectStore implements ServerObjectStore {
  constructor(private readonly directory: string) {}

  async ensureReady(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
  }

  async get(key: string): Promise<{ body: Buffer; etag: string } | null> {
    const file = this.file(key);
    try {
      const body = await readFile(file);
      return { body, etag: `"${body.toString("base64url").slice(0, 32)}"` };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async put(key: string, body: Buffer, condition: ObjectCondition) {
    const current = await this.get(key);
    if (("ifNoneMatch" in condition && current) || ("ifMatch" in condition && current?.etag !== condition.ifMatch)) {
      const error = new Error("precondition-failed");
      (error as Error & { statusCode?: number }).statusCode = 412;
      throw error;
    }
    await mkdir(path.dirname(this.file(key)), { recursive: true, mode: 0o700 });
    await writeFile(this.file(key), body, { mode: 0o600 });
    return { etag: `"${body.toString("base64url").slice(0, 32)}"` };
  }

  async head(key: string) {
    const current = await this.get(key);
    return current === null
      ? null
      : { etag: current.etag, byteLength: current.body.byteLength };
  }

  putImmutable(key: string, body: Buffer) {
    return this.put(key, body, { ifNoneMatch: true });
  }

  async remove(key: string): Promise<void> {
    const file = this.file(key);
    try {
      await unlink(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  close(): void {}

  private file(key: string): string {
    return path.join(this.directory, ...key.split("/"));
  }
}
