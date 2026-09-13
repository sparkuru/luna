import type { Client } from "../api-client/generated/client";
import { assertNotAborted } from "../shared/abort";
import {
  getLedgerObject,
  putLedgerObject,
  getLedgerAttachment,
  putLedgerAttachment,
  repairLedgerAttachment,
  getPreferenceObject,
  putPreferenceObject,
} from "../api-client/generated/sdk.gen";
import { decodeLedgerEnvelope } from "../shared/ledger-crypto";
import { decodeConfigEnvelopeBytes } from "../shared/config-crypto";
import { LedgerObjectError, type LedgerObjectStore } from "./s3-ledger-store";
import {
  ObjectStoreError,
  type ConfigObjectStore,
  type ConditionalPut,
} from "./s3-config-store";
import type { AttachmentObjectStore } from "./attachment-object-store";

export class ServerTransportError extends Error {
  constructor(readonly code: string) {
    super(`LUNA_ERROR:server-${code}`);
  }
}
export function randomRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function pause(ms: number, signal: AbortSignal): Promise<void> {
  assertNotAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(new ServerTransportError("cancelled"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
interface Result {
  data?: unknown;
  error?: unknown;
  response?: Response;
}
async function send(
  operation: () => Promise<Result>,
  signal: AbortSignal,
): Promise<Result> {
  for (let attempt = 0; ; attempt++) {
    assertNotAborted(signal);
    const result = await operation();
    assertNotAborted(signal);
    if (result.response?.ok) return result;
    const status = result.response?.status;
    if (
      attempt < 2 &&
      (status === undefined ||
        status === 429 ||
        status === 503 ||
        status === 502 ||
        status === 504)
    ) {
      const retry = result.response?.headers.get("retry-after");
      const seconds = retry ? Number(retry) : NaN;
      const ms = Number.isFinite(seconds)
        ? Math.max(0, seconds * 1000)
        : 100 * 2 ** attempt;
      await pause(ms, signal);
      continue;
    }
    return result;
  }
}
function code(result: Result): string {
  const error = result.error;
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    [
      "object-not-found",
      "not-found",
      "authentication",
      "permission",
      "conflict",
      "condition-required",
      "invalid-condition",
      "precondition-failed",
      "unsupported-content-type",
      "origin-not-allowed",
      "session-limit",
      "ledger-exists",
      "idempotency-conflict",
      "invalid-input",
      "payload-too-large",
      "rate-limited",
      "unavailable",
      "attachment-not-found",
      "attachment-conflict",
      "attachment-quota-exceeded",
      "attachment-unavailable",
      "attachment-reservation-expired",
      "ledger-upgrade-required",
    ].includes(error.code)
    ? error.code
    : "network";
}
function etag(result: Result): string {
  const value = result.response?.headers.get("etag");
  if (!value) throw new ServerTransportError("invalid-response");
  return value;
}
export class HttpLedgerObjectStore implements LedgerObjectStore {
  private closed = false;
  readonly attachments: HttpLedgerAttachmentStore;
  constructor(
    private readonly client: Client,
    private readonly ledgerId: string,
  ) {
    this.attachments = new HttpLedgerAttachmentStore(client, ledgerId);
  }
  private check(key: string) {
    if (this.closed || key !== "ledger-v1.enc.json")
      throw new ServerTransportError("cancelled");
  }
  async get(key: string, signal: AbortSignal) {
    this.check(key);
    const result = await send(
      () =>
        getLedgerObject({
          client: this.client,
          path: { id: this.ledgerId },
          parseAs: "text",
          signal,
        }),
      signal,
    );
    this.check(key);
    if (result.response?.status === 404 && code(result) === "object-not-found")
      return null;
    if (!result.response?.ok) this.fail(result);
    if (typeof result.data !== "string")
      throw new ServerTransportError("invalid-response");
    return { body: result.data, etag: etag(result) };
  }
  async put(
    key: string,
    body: string,
    observed: string | null,
    signal: AbortSignal,
  ) {
    this.check(key);
    const envelope = decodeLedgerEnvelope(body).envelope;
    const idempotency = randomRequestId();
    const headers = {
      "idempotency-key": idempotency,
      ...(observed === null
        ? { "if-none-match": "*" as const }
        : { "if-match": observed }),
    };
    const result = await send(
      () =>
        putLedgerObject({
          client: this.client,
          path: { id: this.ledgerId },
          // The generated v1 operation still describes the legacy envelope;
          // the raw serializer carries the validated v1/v2 body until the
          // server OpenAPI contract is regenerated for both versions.
          body: envelope as never,
          bodySerializer: () => body,
          headers,
          signal,
        }),
      signal,
    );
    this.check(key);
    if (!result.response?.ok) this.fail(result);
    etag(result);
  }
  private fail(result: Result): never {
    if (result.response?.status === 412)
      throw new LedgerObjectError("conflict");
    if (result.response?.status === 401)
      throw new LedgerObjectError("authentication");
    if (result.response?.status === 403)
      throw new LedgerObjectError("permission");
    throw new ServerTransportError(code(result));
  }
  close() {
    this.closed = true;
    this.attachments.close();
  }
}

/** HTTP attachment transport; callers verify the returned digest before promotion. */
export class HttpLedgerAttachmentStore implements AttachmentObjectStore {
  private closed = false;
  constructor(private readonly client: Client, private readonly ledgerId: string) {}

  private check(): void {
    if (this.closed) throw new ServerTransportError("cancelled");
  }

  async get(attachmentId: string, signal: AbortSignal) {
    this.check();
    const result = await send(
      () =>
        getLedgerAttachment({
          client: this.client,
          path: { id: this.ledgerId, attachmentId },
          parseAs: "arrayBuffer",
          signal,
        }),
      signal,
    );
    this.check();
    if (result.response?.status === 404 && code(result) === "attachment-not-found")
      return null;
    if (!result.response?.ok) this.fail(result);
    const data = result.data as unknown;
    if (!(data instanceof ArrayBuffer))
      throw new ServerTransportError("invalid-response");
    const sha256 = result.response.headers.get("x-luna-cipher-sha256");
    const responseEtag = result.response.headers.get("etag");
    const length = Number(result.response.headers.get("content-length"));
    if (
      sha256 === null ||
      !/^[0-9a-f]{64}$/.test(sha256) ||
      responseEtag === null ||
      !Number.isSafeInteger(length) ||
      length !== data.byteLength
    )
      throw new ServerTransportError("invalid-response");
    return { body: new Uint8Array(data), etag: responseEtag, sha256 };
  }

  async putImmutable(
    attachmentId: string,
    body: Uint8Array,
    sha256: string,
    signal: AbortSignal,
    idempotencyKey = randomRequestId(),
  ): Promise<{ etag: string }> {
    this.check();
    const result = await send(
      () =>
        putLedgerAttachment({
          client: this.client,
          path: { id: this.ledgerId, attachmentId },
          // The generated OpenAPI type cannot express Request's raw
          // ArrayBufferView body, but the generated fetch client passes this
          // value directly to Request without serializing it.
          body: body as unknown as Blob,
          headers: {
            "Content-Type": "application/octet-stream",
            "if-none-match": "*",
            "idempotency-key": idempotencyKey,
            "x-luna-cipher-sha256": sha256,
          },
          signal,
        }),
      signal,
    );
    this.check();
    if (!result.response?.ok) this.fail(result);
    return { etag: etag(result) };
  }

  async repairExpectedCiphertext(
    attachmentId: string,
    body: Uint8Array,
    sha256: string,
    observedEtag: string,
    signal: AbortSignal,
    idempotencyKey = randomRequestId(),
  ): Promise<{ etag: string }> {
    this.check();
    const result = await send(
      () =>
        repairLedgerAttachment({
          client: this.client,
          path: { id: this.ledgerId, attachmentId },
          body: body as unknown as Blob,
          headers: {
            "Content-Type": "application/octet-stream",
            "if-match": observedEtag,
            "idempotency-key": idempotencyKey,
            "x-luna-cipher-sha256": sha256,
          },
          signal,
        }),
      signal,
    );
    this.check();
    if (!result.response?.ok) this.fail(result);
    return { etag: etag(result) };
  }

  close(): void {
    this.closed = true;
  }

  private fail(result: Result): never {
    if (result.response?.status === 404)
      throw new LedgerObjectError("not-found");
    if (result.response?.status === 409)
      throw new LedgerObjectError("conflict");
    if (result.response?.status === 401)
      throw new LedgerObjectError("authentication");
    if (result.response?.status === 403)
      throw new LedgerObjectError("permission");
    throw new ServerTransportError(code(result));
  }
}
export class HttpPreferenceObjectStore implements ConfigObjectStore {
  private closed = false;
  private attempt: { body: string; condition: string; key: string } | null =
    null;
  constructor(private readonly client: Client) {}
  private check(key: string) {
    if (this.closed || key !== "preferences-v1.enc.json")
      throw new ServerTransportError("cancelled");
  }
  async get(key: string, signal = AbortSignal.timeout(60000)) {
    this.check(key);
    this.attempt = null;
    const result = await send(
      () =>
        getPreferenceObject({ client: this.client, parseAs: "text", signal }),
      signal,
    );
    this.check(key);
    if (!result.response?.ok) this.fail(result);
    if (typeof result.data !== "string")
      throw new ObjectStoreError("invalid-response", "Invalid response");
    const body = new TextEncoder().encode(result.data);
    decodeConfigEnvelopeBytes(body);
    return { body, etag: etag(result) };
  }
  async put(
    key: string,
    body: Uint8Array,
    condition: ConditionalPut,
    signal = AbortSignal.timeout(60000),
  ) {
    this.check(key);
    const envelope = decodeConfigEnvelopeBytes(body);
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(body);
    const conditionKey = JSON.stringify(condition);
    if (this.attempt?.body !== raw || this.attempt.condition !== conditionKey)
      this.attempt = {
        body: raw,
        condition: conditionKey,
        key: randomRequestId(),
      };
    const headers = {
      "idempotency-key": this.attempt.key,
      ...(condition.ifNoneMatch
        ? { "if-none-match": "*" as const }
        : { "if-match": condition.ifMatch! }),
    };
    const result = await send(
      () =>
        putPreferenceObject({
          client: this.client,
          body: {
            ...envelope,
            kdf: { ...envelope.kdf, N: configCost(envelope.kdf.N) },
          },
          bodySerializer: () => raw,
          headers,
          signal,
        }),
      signal,
    );
    this.check(key);
    if (!result.response?.ok) this.fail(result);
    return { etag: etag(result) };
  }
  private fail(result: Result): never {
    if (result.response?.status === 404 && code(result) === "object-not-found")
      throw new ObjectStoreError("not-found", "Not found");
    if (result.response?.status === 412)
      throw new ObjectStoreError("conflict", "Conflict");
    if (result.response?.status === 401)
      throw new ObjectStoreError("authentication", "Authentication required");
    if (result.response?.status === 403)
      throw new ObjectStoreError("permission", "Permission denied");
    throw new ServerTransportError(code(result));
  }
  close() {
    this.closed = true;
    this.attempt = null;
  }
}

function configCost(value: number): 16384 | 32768 | 65536 | 131072 {
  if (value === 16384 || value === 32768 || value === 65536 || value === 131072)
    return value;
  throw new ServerTransportError("invalid-response");
}
