import {
  decryptLedgerDocument,
  encryptLedgerDocument,
  validateLedgerPassword,
} from "../shared/ledger-crypto";
import {
  decodeLedgerSessionInput,
  LedgerSessionError,
  type LedgerSessionStatus,
} from "../shared/ledger-session";
import type {
  ConfigSyncConnection,
  ConfigureConfigSyncInput,
} from "../shared/settings";
import {
  attachmentInventory,
  mergeLedgerDocuments,
  LedgerSyncError,
  type LedgerDocument,
} from "../shared/ledger-sync";
import {
  ATTACHMENT_SYNC_CONCURRENCY,
  ATTACHMENT_SYNC_MAX_ATTEMPTS,
  ATTACHMENT_SYNC_TIMEOUT_MS,
  decryptAttachmentBytes,
  AttachmentContractError,
  sha256Hex,
  validateAttachmentInventoryQuota,
  type StoredAttachmentDescriptor,
} from "../shared/attachment-contract";
import type { LocalAttachmentPort } from "./attachment-object-store";
import type { MigrationLease } from "../shared/ports";
import {
  LedgerObjectError,
  S3LedgerObjectStore,
  type LedgerObjectStore,
} from "./s3-ledger-store";

export interface LedgerDataPort extends LocalAttachmentPort {
  getLedgerDocument(): LedgerDocument | null | Promise<LedgerDocument | null>;
  mergeLedgerDocument(
    input: LedgerDocument,
    signal?: AbortSignal,
  ): LedgerDocument | Promise<LedgerDocument>;
  getRemotePayloadVersion?(
    targetId: string,
  ): 1 | 2 | null | Promise<1 | 2 | null>;
  setRemotePayloadVersion?(
    targetId: string,
    version: 1 | 2,
  ): void | Promise<void>;
  getMigrationLease?(): MigrationLease | null | Promise<MigrationLease | null>;
  acquireMigrationLease?(lease: MigrationLease): void | Promise<void>;
  renewMigrationLease?(
    leaseId: string,
    expiresAt: string,
  ): void | Promise<void>;
  releaseMigrationLease?(leaseId: string): void | Promise<void>;
}

export function s3LedgerTargetIdentity(connection: ConfigSyncConnection): string {
  return `s3:${JSON.stringify([
    connection.endpoint,
    connection.region,
    connection.bucket,
    connection.prefix,
    connection.forcePathStyle,
  ])}`;
}

export function httpLedgerTargetIdentity(
  instanceId: string,
  userId: string,
  ledgerId: string,
): string {
  return `http:${JSON.stringify([instanceId, userId, ledgerId])}`;
}

/** Credentials and passphrase never enter persistent settings or renderer projections. */
export class LedgerSyncSession {
  private session: {
    passphrase: string;
    key: string;
    targetId: string;
    remote: LedgerObjectStore;
  } | null = null;
  private running: AbortController | null = null;
  private syncedDocument: string | null = null;
  private status: LedgerSessionStatus = {
    enabled: false,
    configured: false,
    code: "disabled",
    lastSyncedAt: null,
  };

  constructor(
    private readonly local: LedgerDataPort,
    private readonly createRemote: (
      input: ConfigureConfigSyncInput,
    ) => LedgerObjectStore = (input) =>
      new S3LedgerObjectStore(input.connection, input.credentials),
    private readonly preflightDocument?: (document: LedgerDocument) => void,
  ) {}

  getStatus(): LedgerSessionStatus {
    return { ...this.status };
  }

  /** Mark a safe remote-marker change without downloading the encrypted body. */
  markRemoteChangeAvailable(): void {
    if (!this.status.remoteChangeAvailable)
      this.status = { ...this.status, remoteChangeAvailable: true };
  }

  /** Clear the manual-mode marker after an explicit or automatic sync. */
  markRemoteChangeSynced(): void {
    if (this.status.remoteChangeAvailable) {
      const { remoteChangeAvailable: _remoteChangeAvailable, ...status } =
        this.status;
      this.status = status;
    }
  }

  async getCurrentStatus(): Promise<LedgerSessionStatus> {
    const acknowledged = this.syncedDocument;
    const session = this.session;
    if (this.status.code === "synced" && acknowledged !== null) {
      const current = JSON.stringify(await this.local.getLedgerDocument());
      if (
        session === this.session &&
        acknowledged === this.syncedDocument &&
        this.status.code === "synced" &&
        current !== acknowledged
      )
        this.status.code = "pending";
    }
    return this.getStatus();
  }

  async configure(
    value: ConfigureConfigSyncInput,
  ): Promise<LedgerSessionStatus> {
    const input = decodeLedgerSessionInput(value);
    validateLedgerPassword(input.credentials.passphrase);
    this.clear();
    const prefix = input.connection.prefix;
    this.session = {
      passphrase: input.credentials.passphrase,
      key: `${prefix === "" ? "" : `${prefix}/`}ledger-v1.enc.json`,
      targetId: s3LedgerTargetIdentity(input.connection),
      remote: this.createRemote(input),
    };
    this.status = {
      enabled: true,
      configured: true,
      code: "ready",
      lastSyncedAt: null,
    };
    return this.getStatus();
  }

  configureTarget(
    remote: LedgerObjectStore,
    passphrase: string,
    key = "ledger-v1.enc.json",
    targetId = key,
  ): LedgerSessionStatus {
    validateLedgerPassword(passphrase);
    this.clear();
    this.session = { remote, passphrase, key, targetId };
    this.status = {
      enabled: true,
      configured: true,
      code: "ready",
      lastSyncedAt: null,
    };
    return this.getStatus();
  }

  clear(): LedgerSessionStatus {
    this.running?.abort();
    this.running = null;
    this.session?.remote.close();
    this.session = null;
    this.syncedDocument = null;
    this.status = {
      enabled: false,
      configured: false,
      code: "disabled",
      lastSyncedAt: null,
    };
    return this.getStatus();
  }

  async syncNow(): Promise<LedgerSessionStatus> {
    const session = this.session;
    if (session === null) return this.getStatus();
    if (this.running !== null) throw new LedgerSessionError("ledger-sync-busy");
    const controller = new AbortController();
    this.running = controller;
    this.status.code = "syncing";
    const assertCurrent = (): void => {
      if (this.session !== session || controller.signal.aborted)
        throw new LedgerSessionError("ledger-sync-cancelled");
    };
    const key = session.key;
    try {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        assertCurrent();
        const checkpoint = await this.readRemotePayloadVersion(session.targetId);
        const object = await withOperationTimeout(controller.signal, (signal) =>
          session.remote.get(key, signal),
        );
        assertCurrent();
        let remoteDocument: LedgerDocument | null = null;
        if (object !== null) {
          remoteDocument = await decryptLedgerDocument(
            object.body,
            session.passphrase,
          );
          assertCurrent();
          assertRemotePayloadVersion(checkpoint, remoteDocument.schemaVersion);
          await this.observeRemotePayloadVersion(
            session.targetId,
            remoteDocument.schemaVersion,
          );
        }
        // Preflight the exact graph candidate before the adapter can commit it.
        // The adapter repeats this check inside its final local transaction.
        const current = await this.local.getLedgerDocument();
        const candidate =
          remoteDocument === null
            ? current
            : current === null
              ? remoteDocument
              : mergeLedgerDocuments(current, remoteDocument);
        if (candidate !== null) {
          validateAttachmentInventoryQuota(attachmentInventory(candidate));
          this.preflightDocument?.(candidate);
        }
        // The adapter merges against the latest committed local graph, not a
        // pre-download copy.
        const document =
          remoteDocument === null
            ? current
            : await this.local.mergeLedgerDocument(
                remoteDocument,
                controller.signal,
              );
        assertCurrent();
        if (document === null) throw new LedgerSessionError("ledger-empty");
        const canonical = JSON.stringify(document);
        const attachments = await this.syncAttachments(
          document,
          session.remote,
          controller.signal,
        );
        assertCurrent();
        // Never publish a graph reference before every ciphertext is present
        // remotely. A local graph may remain usable while this status is pending.
        if (attachments.pendingCount > 0 || attachments.failedCount > 0) {
          this.status = {
            enabled: true,
            configured: true,
            code: "pending",
            lastSyncedAt: null,
            attachmentPendingCount: attachments.pendingCount,
            attachmentFailedCount: attachments.failedCount,
            overall: attachments.failedCount > 0 ? "failed" : "pending",
          };
          this.syncedDocument = null;
          if (attachments.incompleteCount > 0) {
            this.status.code = "failed";
            throw new AttachmentContractError("attachment-incomplete");
          }
          return this.getStatus();
        }
        if (
          remoteDocument === null ||
          canonical !== JSON.stringify(remoteDocument)
        ) {
          const encrypted = await encryptLedgerDocument(
            document,
            session.passphrase,
          );
          assertCurrent();
          try {
            await withOperationTimeout(controller.signal, (signal) =>
              session.remote.put(
                key,
                encrypted,
                object?.etag ?? null,
                signal,
              ),
            );
          } catch (error) {
            assertCurrent();
            if (
              error instanceof LedgerObjectError &&
              (error.code === "conflict" || error.code === "not-found")
            )
              continue;
            throw error;
          }
          await this.observeRemotePayloadVersion(
            session.targetId,
            document.schemaVersion,
          );
        }
        assertCurrent();
        const latest = await this.local.getLedgerDocument();
        assertCurrent();
        if (latest !== null) {
          validateAttachmentInventoryQuota(attachmentInventory(latest));
          this.preflightDocument?.(latest);
          const latestCheckpoint = await this.readRemotePayloadVersion(
            session.targetId,
          );
          assertRemotePayloadVersion(latestCheckpoint, latest.schemaVersion);
        }
        if (JSON.stringify(latest) !== canonical) continue;
        this.markRemoteChangeSynced();
        this.status = {
          enabled: true,
          configured: true,
          code: "synced",
          lastSyncedAt: new Date().toISOString(),
          ...(attachments.seen
            ? {
                attachmentPendingCount: 0,
                attachmentFailedCount: 0,
                overall: "synced" as const,
              }
            : {}),
        };
        this.syncedDocument = canonical;
        return this.getStatus();
      }
      this.status.code = "pending";
      return this.getStatus();
    } catch (error) {
      if (this.session === session) this.status.code = "failed";
      throw error;
    } finally {
      if (this.running === controller) this.running = null;
    }
  }

  private async syncAttachments(
    document: LedgerDocument,
    remote: LedgerObjectStore,
    signal: AbortSignal,
  ): Promise<{
    seen: boolean;
    pendingCount: number;
    failedCount: number;
    incompleteCount: number;
  }> {
    const inventory = attachmentInventory(document);
    if (inventory.size === 0)
      return {
        seen: false,
        pendingCount: 0,
        failedCount: 0,
        incompleteCount: 0,
      };
    const remoteAttachments = remote.attachments;
    const local = this.local as LedgerDataPort;
    if (
      remoteAttachments === undefined ||
      local.readAttachmentCiphertext === undefined ||
      local.saveDownloadedAttachment === undefined
    )
      return {
        seen: true,
        pendingCount: inventory.size,
        failedCount: 0,
        incompleteCount: 0,
      };

    const entries = [...inventory.entries()];
    const results = new Array<AttachmentSyncResult>(entries.length);
    const batch = new AbortController();
    const abortBatch = () => batch.abort();
    signal.addEventListener("abort", abortBatch, { once: true });
    if (signal.aborted) batch.abort();
    let next = 0;
    let firstError: unknown = null;
    const worker = async (): Promise<void> => {
      while (!batch.signal.aborted) {
        const index = next;
        next += 1;
        const entry = entries[index];
        if (entry === undefined) return;
        try {
          results[index] = await this.syncOneAttachment(
            entry[0],
            entry[1],
            remoteAttachments,
            local,
            batch.signal,
          );
        } catch (error) {
          firstError ??= error;
          batch.abort();
          return;
        }
      }
    };
    try {
      await Promise.all(
        Array.from(
          { length: Math.min(ATTACHMENT_SYNC_CONCURRENCY, entries.length) },
          () => worker(),
        ),
      );
    } finally {
      signal.removeEventListener("abort", abortBatch);
    }
    if (firstError !== null) throw firstError;
    if (signal.aborted) throw new LedgerSessionError("ledger-sync-cancelled");
    return results.reduce(
      (total, result) => {
        if (result === undefined) return total;
        total.pendingCount += result.pending ? 1 : 0;
        total.failedCount += result.failed ? 1 : 0;
        total.incompleteCount += result.incomplete ? 1 : 0;
        return total;
      },
      {
        seen: true,
        pendingCount: 0,
        failedCount: 0,
        incompleteCount: 0,
      },
    );
  }

  private async syncOneAttachment(
    attachmentId: string,
    descriptor: StoredAttachmentDescriptor,
    remote: NonNullable<LedgerObjectStore["attachments"]>,
    local: LedgerDataPort,
    signal: AbortSignal,
  ): Promise<AttachmentSyncResult> {
    let localCopy: AttachmentCiphertextCopy | null;
    try {
      throwIfAborted(signal);
      localCopy = await local.readAttachmentCiphertext!(attachmentId);
      if (
        localCopy !== null &&
        JSON.stringify(localCopy.descriptor) !== JSON.stringify(descriptor)
      )
        throw new LedgerSyncError("ledger-revision-collision");
      if (localCopy !== null) {
        if (
          localCopy.ciphertext.byteLength !== descriptor.cipherByteLength ||
          (await sha256Hex(localCopy.ciphertext)) !== descriptor.cipherSha256
        )
          throw new AttachmentContractError("attachment-digest-mismatch");
        const plain = await decryptAttachmentBytes(
          localCopy.ciphertext,
          descriptor,
        );
        plain.fill(0);
      }
    } catch (error) {
      if (error instanceof AttachmentContractError)
        return failedAttachmentResult();
      throw error;
    }

    for (let attempt = 0; attempt < ATTACHMENT_SYNC_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.syncAttachmentAttempt(
          attachmentId,
          descriptor,
          localCopy,
          remote,
          local,
          signal,
        );
      } catch (error) {
        if (error instanceof AttachmentContractError)
          return failedAttachmentResult();
        if (!isRetryableAttachmentError(error)) throw error;
        if (attempt + 1 >= ATTACHMENT_SYNC_MAX_ATTEMPTS)
          return failedAttachmentResult();
        await waitForRetry(attempt, signal);
      }
    }
    return failedAttachmentResult();
  }

  private async syncAttachmentAttempt(
    attachmentId: string,
    descriptor: StoredAttachmentDescriptor,
    localCopy: AttachmentCiphertextCopy | null,
    remote: NonNullable<LedgerObjectStore["attachments"]>,
    local: LedgerDataPort,
    signal: AbortSignal,
  ): Promise<AttachmentSyncResult> {
    let remoteCopy = await withOperationTimeout(signal, (operationSignal) =>
      remote.get(attachmentId, operationSignal),
    );
    if (localCopy !== null && remoteCopy === null) {
      try {
        await withOperationTimeout(signal, (operationSignal) =>
          remote.putImmutable(
            attachmentId,
            localCopy.ciphertext,
            descriptor.cipherSha256,
            operationSignal,
            attachmentIdempotencyKey(attachmentId, "put"),
          ),
        );
      } catch (error) {
        if (!(error instanceof LedgerObjectError) || error.code !== "conflict")
          throw error;
      }
      remoteCopy = await withOperationTimeout(signal, (operationSignal) =>
        remote.get(attachmentId, operationSignal),
      );
      if (remoteCopy === null) throw new LedgerObjectError("network");
    }
    if (remoteCopy === null) {
      return localCopy === null
        ? { pending: false, failed: true, incomplete: true }
        : { pending: true, failed: false, incomplete: false };
    }

    if (!(await remoteAttachmentMatches(remoteCopy, descriptor))) {
      if (localCopy === null) return failedAttachmentResult();
      await withOperationTimeout(signal, (operationSignal) =>
        remote.repairExpectedCiphertext(
          attachmentId,
          localCopy.ciphertext,
          descriptor.cipherSha256,
          remoteCopy!.etag,
          operationSignal,
          attachmentIdempotencyKey(attachmentId, "repair", remoteCopy!.etag),
        ),
      );
      remoteCopy = await withOperationTimeout(signal, (operationSignal) =>
        remote.get(attachmentId, operationSignal),
      );
      if (
        remoteCopy === null ||
        !(await remoteAttachmentMatches(remoteCopy, descriptor))
      )
        return failedAttachmentResult();
    }

    const plain = await decryptAttachmentBytes(remoteCopy.body, descriptor);
    plain.fill(0);
    if (localCopy === null)
      await local.saveDownloadedAttachment!(descriptor, remoteCopy.body);
    return { pending: false, failed: false, incomplete: false };
  }

  private async readRemotePayloadVersion(
    targetId: string,
  ): Promise<1 | 2 | null> {
    const reader = this.local.getRemotePayloadVersion;
    if (reader === undefined) return null;
    const version = await reader.call(this.local, targetId);
    return version === 1 || version === 2 ? version : null;
  }

  private async observeRemotePayloadVersion(
    targetId: string,
    version: 1 | 2,
  ): Promise<void> {
    const writer = this.local.setRemotePayloadVersion;
    if (writer === undefined) return;
    const current = await this.readRemotePayloadVersion(targetId);
    if (current === 2 || current === version) return;
    await writer.call(this.local, targetId, version);
  }
}

type AttachmentCiphertextCopy = {
  descriptor: StoredAttachmentDescriptor;
  ciphertext: Uint8Array;
};

type AttachmentSyncResult = {
  pending: boolean;
  failed: boolean;
  incomplete: boolean;
};

function failedAttachmentResult(): AttachmentSyncResult {
  return { pending: false, failed: true, incomplete: false };
}

async function remoteAttachmentMatches(
  value: { body: Uint8Array; etag: string; sha256: string },
  descriptor: StoredAttachmentDescriptor,
): Promise<boolean> {
  return (
    value.body.byteLength === descriptor.cipherByteLength &&
    value.sha256 === descriptor.cipherSha256 &&
    (await sha256Hex(value.body)) === descriptor.cipherSha256
  );
}

function attachmentIdempotencyKey(
  attachmentId: string,
  operation: "put" | "repair",
  observedEtag?: string,
): string {
  const etag = observedEtag?.replace(/[^A-Za-z0-9_-]/g, "") ?? "";
  return `luna-${operation}-${attachmentId}${etag ? `-${etag}` : ""}`.slice(
    0,
    128,
  );
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new LedgerSessionError("ledger-sync-cancelled");
}

function assertRemotePayloadVersion(
  observed: 1 | 2 | null,
  candidate: 1 | 2,
): void {
  if (observed === 2 && candidate === 1)
    throw new LedgerSessionError("ledger-remote-downgrade");
}

async function waitForRetry(attempt: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, 50 * 2 ** attempt);
    const cancel = () => {
      clearTimeout(timer);
      reject(new LedgerSessionError("ledger-sync-cancelled"));
    };
    signal.addEventListener("abort", cancel, { once: true });
  });
}

async function withOperationTimeout<T>(
  parentSignal: AbortSignal,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  throwIfAborted(parentSignal);
  const operationController = new AbortController();
  const abortOperation = () => operationController.abort();
  let rejectCancellation: (reason?: unknown) => void = () => undefined;
  const cancelParent = () => {
    rejectCancellation(new LedgerSessionError("ledger-sync-cancelled"));
  };
  const cancelled = new Promise<never>((_resolve, reject) => {
    rejectCancellation = reject;
  });
  parentSignal.addEventListener("abort", abortOperation, { once: true });
  parentSignal.addEventListener("abort", cancelParent, { once: true });
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      operationController.abort();
      reject(new LedgerObjectError("network"));
    }, ATTACHMENT_SYNC_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      operation(operationController.signal),
      timeout,
      cancelled,
    ]);
  } catch (error) {
    if (parentSignal.aborted)
      throw new LedgerSessionError("ledger-sync-cancelled");
    if (timedOut) throw new LedgerObjectError("network");
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    parentSignal.removeEventListener("abort", abortOperation);
    parentSignal.removeEventListener("abort", cancelParent);
    operationController.abort();
  }
}

function isRetryableAttachmentError(error: unknown): boolean {
  if (error instanceof LedgerSessionError || error instanceof LedgerSyncError)
    return false;
  if (error instanceof LedgerObjectError)
    return error.code === "network" || error.code === "conflict" || error.code === "not-found";
  if (!(error instanceof Error)) return true;
  const message = error.message.toLowerCase();
  if (
    message.includes("authentication") ||
    message.includes("permission") ||
    message.includes("quota") ||
    message.includes("invalid") ||
    message.includes("unsupported") ||
    message.includes("idempotency") ||
    message.includes("attachment-conflict") ||
    message.includes("condition-required")
  )
    return false;
  return true;
}
