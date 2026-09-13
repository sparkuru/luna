import { LedgerSessionError } from "../shared/ledger-session";
import {
  decodeMigrationLease,
  validateMigrationLease,
  validateMigrationLeaseId,
  type MigrationLease,
} from "../shared/ports";

export const WEB_DATABASE_NAME = "luna-ledger";
export const WEB_DATABASE_VERSION = 2;
export const WEB_DATABASE_STORE = "state";
export const WEB_DATABASE_ATTACHMENT_STORE = "attachments";
export const WEB_DATABASE_RECORD = "current";
export const WEB_MIGRATION_RECORD = "migration";
export const WEB_LEGACY_STORAGE_KEY = "luna.web.state.v1";

export interface StateChange<T> {
  result: T;
  value?: string;
  metadata?: string;
}

export interface StateStore {
  read(): Promise<string | null>;
  update<T>(
    change: (raw: string | null) => { result: T; value: string },
    signal?: AbortSignal,
  ): Promise<T>;
  metadata(): Promise<string | null>;
  updateWithMetadata<T>(
    change: (raw: string | null, metadata: string | null) => StateChange<T>,
    signal?: AbortSignal,
  ): Promise<T>;
  readBinary(key: string): Promise<Uint8Array | null>;
  writeBinary(key: string, bytes: Uint8Array): Promise<void>;
  deleteBinary(key: string): Promise<void>;
  getMigrationLease(): Promise<MigrationLease | null>;
  acquireMigrationLease(lease: MigrationLease): Promise<void>;
  renewMigrationLease(leaseId: string, expiresAt: string): Promise<void>;
  releaseMigrationLease(leaseId: string): Promise<void>;
  /** Permanently removes this store's local database, when supported. */
  destroy?(signal?: AbortSignal): Promise<void>;
  close?(): Promise<void> | void;
}

/** A complete JSON snapshot is the unit of commit, including legacy migration. */
/**
 * Compatibility adapter for the old browser fixture and native Android
 * WebViews that predate OPFS. The Android entry point selects it only when the
 * secure bundled origin lacks the OPFS API; ordinary Web hosts never silently
 * downgrade from SQLite-WASM.
 */
export class BrowserStateStore implements StateStore {
  constructor(
    private readonly factory: IDBFactory | null,
    private readonly legacyStorage: Storage | null,
    private readonly validate: (raw: string) => void,
    private readonly options: {
      databaseName?: string;
      importLegacy?: boolean;
    } = {},
  ) {}

  read(): Promise<string | null> {
    return this.transact((raw) => ({ result: raw }));
  }

  update<T>(
    change: (raw: string | null) => { result: T; value: string },
    signal?: AbortSignal,
  ): Promise<T> {
    return this.transact(change, signal);
  }

  metadata(): Promise<string | null> {
    return this.transact((_raw, metadata) => ({ result: metadata }));
  }
  updateWithMetadata<T>(
    change: (raw: string | null, metadata: string | null) => StateChange<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.transact(change, signal);
  }

  async readBinary(key: string): Promise<Uint8Array | null> {
    return (await this.transactBinary(key, undefined)) as Uint8Array | null;
  }

  async writeBinary(key: string, bytes: Uint8Array): Promise<void> {
    await this.transactBinary(key, new Uint8Array(bytes));
  }

  async deleteBinary(key: string): Promise<void> {
    await this.transactBinary(key, null);
  }

  async getMigrationLease(): Promise<MigrationLease | null> {
    const database = await this.open();
    return new Promise<MigrationLease | null>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(WEB_DATABASE_STORE, "readonly");
      } catch {
        database.close();
        reject(new Error("LUNA_ERROR:web-storage-unavailable"));
        return;
      }
      const request = transaction.objectStore(WEB_DATABASE_STORE).get(
        WEB_MIGRATION_RECORD,
      );
      transaction.oncomplete = () => {
        database.close();
      };
      transaction.onerror = () => {
        database.close();
        reject(new Error("LUNA_ERROR:web-storage-unavailable"));
      };
      request.onsuccess = () => {
        try {
          resolve(decodeMigrationLease(request.result ?? null));
        } catch (error) {
          try {
            transaction.abort();
          } catch {
            database.close();
          }
          reject(error);
        }
      };
    });
  }

  async acquireMigrationLease(lease: MigrationLease): Promise<void> {
    validateMigrationLease(lease);
    await this.updateMigrationLease((current) => {
      if (
        current !== null &&
        Date.parse(current.expiresAt) > Date.now() &&
        current.id !== lease.id
      )
        throw new Error("LUNA_ERROR:migration-busy");
      return lease;
    });
  }

  async renewMigrationLease(
    leaseId: string,
    expiresAt: string,
  ): Promise<void> {
    validateMigrationLeaseId(leaseId);
    if (!Number.isFinite(Date.parse(expiresAt)))
      throw new Error("LUNA_ERROR:invalid-input");
    await this.updateMigrationLease((current) => {
      if (
        current === null ||
        current.id !== leaseId ||
        Date.parse(current.expiresAt) <= Date.now()
      )
        throw new Error("LUNA_ERROR:migration-not-owner");
      if (Date.parse(expiresAt) <= Date.parse(current.acquiredAt))
        throw new Error("LUNA_ERROR:invalid-input");
      return { ...current, expiresAt };
    });
  }

  async releaseMigrationLease(leaseId: string): Promise<void> {
    validateMigrationLeaseId(leaseId);
    await this.updateMigrationLease((current) => {
      if (current === null) return null;
      if (current.id !== leaseId)
        throw new Error("LUNA_ERROR:migration-not-owner");
      return null;
    });
  }

  destroy(): Promise<void> {
    return this.deleteDatabase(this.stateDatabaseName());
  }

  private deleteDatabase(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.factory === null) {
        reject(new Error("LUNA_ERROR:web-storage-unavailable"));
        return;
      }
      let request: IDBOpenDBRequest;
      try {
        request = this.factory.deleteDatabase(name);
      } catch {
        reject(new Error("LUNA_ERROR:web-storage-unavailable"));
        return;
      }
      request.onblocked = () =>
        reject(new Error("LUNA_ERROR:web-storage-blocked"));
      request.onerror = () =>
        reject(new Error("LUNA_ERROR:web-storage-unavailable"));
      request.onsuccess = () => resolve();
    });
  }

  private async transactBinary(
    key: string,
    bytes: Uint8Array | null | undefined,
    signal?: AbortSignal,
  ): Promise<Uint8Array | null | void> {
    if (typeof key !== "string" || key.length === 0 || key.length > 256)
      throw new Error("LUNA_ERROR:web-storage-invalid");
    assertNotCancelled(signal);
    const database = await this.open(signal);
    return new Promise<Uint8Array | null | void>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(
          bytes === undefined
            ? WEB_DATABASE_ATTACHMENT_STORE
            : [WEB_DATABASE_STORE, WEB_DATABASE_ATTACHMENT_STORE],
          bytes === undefined ? "readonly" : "readwrite",
        );
      } catch {
        database.close();
        reject(new Error("LUNA_ERROR:web-storage-unavailable"));
        return;
      }
      let failure: unknown;
      const cancel = () => {
        failure = new LedgerSessionError("ledger-sync-cancelled");
        try {
          transaction.abort();
        } catch {
          /* Completion/abort already owns settlement. */
        }
      };
      const cleanup = () => {
        signal?.removeEventListener("abort", cancel);
        database.close();
      };
      transaction.oncomplete = () => {
        cleanup();
        if (signal?.aborted) reject(new LedgerSessionError("ledger-sync-cancelled"));
        else resolve(bytes === undefined ? result : undefined);
      };
      transaction.onabort = () => {
        cleanup();
        reject(failure ?? new Error("LUNA_ERROR:web-storage-write-failed"));
      };
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) {
        cancel();
        return;
      }
      let result: Uint8Array | null = null;
      const store = transaction.objectStore(WEB_DATABASE_ATTACHMENT_STORE);
      if (bytes === undefined) {
        const request = store.get(key);
        request.onsuccess = () => {
          const value: unknown = request.result;
          if (value === undefined) {
            result = null;
          } else if (value instanceof Uint8Array) {
            result = new Uint8Array(value);
          } else if (value instanceof ArrayBuffer) {
            result = new Uint8Array(value.slice(0));
          } else {
            failure = new Error("LUNA_ERROR:web-storage-invalid");
            try {
              transaction.abort();
            } catch {
              cleanup();
              reject(failure);
            }
          }
        };
      } else {
        const migrationStore = transaction.objectStore(WEB_DATABASE_STORE);
        const migrationRequest = migrationStore.get(WEB_MIGRATION_RECORD);
        migrationRequest.onsuccess = () => {
          try {
            const lease = decodeMigrationLease(
              migrationRequest.result ?? null,
            );
            if (lease !== null && Date.parse(lease.expiresAt) > Date.now())
              throw new Error("LUNA_ERROR:migration-locked");
            if (lease !== null)
              migrationStore.delete(WEB_MIGRATION_RECORD);
            if (bytes === null) store.delete(key);
            else store.put(new Uint8Array(bytes), key);
          } catch (error) {
            failure = error;
            try {
              transaction.abort();
            } catch {
              cleanup();
              reject(failure);
            }
          }
        };
      }
    });
  }

  private async transact<T>(
    change: (raw: string | null, metadata: string | null) => StateChange<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    assertNotCancelled(signal);
    const database = await this.open(signal);
    if (signal?.aborted) {
      database.close();
      throw new LedgerSessionError("ledger-sync-cancelled");
    }
    return new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        // Reads may perform the one-time migration, so they share the same
        // serialized transaction boundary as mutations across every tab.
        transaction = database.transaction(
          [WEB_DATABASE_STORE, WEB_DATABASE_ATTACHMENT_STORE],
          "readwrite",
        );
      } catch {
        database.close();
        reject(new Error("LUNA_ERROR:web-storage-unavailable"));
        return;
      }
      let result: { value: T } | null = null;
      let failure: unknown;
      const cancel = () => {
        failure = new LedgerSessionError("ledger-sync-cancelled");
        // A queued readwrite transaction must be aborted too, before its first request runs.
        try {
          transaction.abort();
        } catch {
          /* Completion/abort already owns settlement. */
        }
      };
      const cleanup = () => {
        signal?.removeEventListener("abort", cancel);
        database.close();
      };
      transaction.oncomplete = () => {
        cleanup();
        if (signal?.aborted)
          reject(new LedgerSessionError("ledger-sync-cancelled"));
        else if (result === null)
          reject(new Error("LUNA_ERROR:web-storage-write-failed"));
        else resolve(result.value);
      };
      transaction.onabort = () => {
        cleanup();
        reject(failure ?? new Error("LUNA_ERROR:web-storage-write-failed"));
      };
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) {
        cancel();
        return;
      }
      const store = transaction.objectStore(WEB_DATABASE_STORE);
      const metadataRequest = store.get("profile");
      const migrationRequest = store.get(WEB_MIGRATION_RECORD);
      const request = store.get(WEB_DATABASE_RECORD);
      request.onsuccess = () => {
        try {
          assertNotCancelled(signal);
          const stored: unknown = request.result;
          if (stored !== undefined && typeof stored !== "string") {
            throw new Error("LUNA_ERROR:web-storage-invalid");
          }
          const raw = stored === undefined ? this.readLegacy() : stored;
          if (raw !== null) this.validate(raw);
          const metadata: unknown = metadataRequest.result;
          if (metadata !== undefined && typeof metadata !== "string")
            throw new Error("LUNA_ERROR:web-storage-invalid");
          const next = change(raw, metadata ?? null);
          assertNotCancelled(signal);
          const lease = decodeMigrationLease(migrationRequest.result ?? null);
          const writesState =
            next.metadata !== undefined ||
            next.value !== undefined ||
            (stored === undefined && raw !== null);
          if (writesState && lease !== null) {
            if (Date.parse(lease.expiresAt) > Date.now())
              throw new Error("LUNA_ERROR:migration-locked");
            store.delete(WEB_MIGRATION_RECORD);
          }
          result = { value: next.result };
          if (next.metadata !== undefined) store.put(next.metadata, "profile");
          if (next.value !== undefined)
            store.put(next.value, WEB_DATABASE_RECORD);
          else if (stored === undefined && raw !== null)
            store.put(raw, WEB_DATABASE_RECORD);
        } catch (error) {
          failure =
            error instanceof DOMException
              ? new Error("LUNA_ERROR:web-storage-write-failed")
              : error;
          try {
            transaction.abort();
          } catch {
            cleanup();
            reject(failure);
          }
        }
      };
      // Request errors retain their default abort behavior. Only oncomplete
      // publishes success; a successful put request alone is not a commit.
    });
  }

  private async updateMigrationLease(
    change: (current: MigrationLease | null) => MigrationLease | null,
  ): Promise<void> {
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(WEB_DATABASE_STORE, "readwrite");
      } catch {
        database.close();
        reject(new Error("LUNA_ERROR:web-storage-unavailable"));
        return;
      }
      let failure: unknown;
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        database.close();
        if (error === undefined) resolve();
        else reject(error);
      };
      transaction.oncomplete = () => finish();
      transaction.onabort = () =>
        finish(failure ?? new Error("LUNA_ERROR:web-storage-write-failed"));
      transaction.onerror = () => undefined;
      const store = transaction.objectStore(WEB_DATABASE_STORE);
      const request = store.get(WEB_MIGRATION_RECORD);
      request.onsuccess = () => {
        try {
          const current = decodeMigrationLease(request.result ?? null);
          const next = change(current);
          if (next === null) store.delete(WEB_MIGRATION_RECORD);
          else {
            validateMigrationLease(next);
            store.put(next, WEB_MIGRATION_RECORD);
          }
        } catch (error) {
          failure = error;
          try {
            transaction.abort();
          } catch {
            finish(failure);
          }
        }
      };
    });
  }

  private readLegacy(): string | null {
    if (this.options.importLegacy === false) return null;
    if (this.legacyStorage === null)
      throw new Error("LUNA_ERROR:web-storage-unavailable");
    try {
      return this.legacyStorage.getItem(WEB_LEGACY_STORAGE_KEY);
    } catch {
      throw new Error("LUNA_ERROR:web-storage-unavailable");
    }
  }

  private open(signal?: AbortSignal): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (this.factory === null) {
        reject(new Error("LUNA_ERROR:web-storage-unavailable"));
        return;
      }
      let request: IDBOpenDBRequest;
      try {
        request = this.factory.open(
          this.options.databaseName ?? WEB_DATABASE_NAME,
          WEB_DATABASE_VERSION,
        );
      } catch {
        reject(new Error("LUNA_ERROR:web-storage-unavailable"));
        return;
      }
      let abandoned = false;
      const cleanup = () => {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", cancel);
      };
      const cancel = () => {
        abandoned = true;
        cleanup();
        reject(new LedgerSessionError("ledger-sync-cancelled"));
      };
      const timeout = setTimeout(() => {
        abandoned = true;
        cleanup();
        reject(new Error("LUNA_ERROR:web-storage-blocked"));
      }, 15_000);
      request.onblocked = () => {
        cleanup();
        abandoned = true;
        reject(new Error("LUNA_ERROR:web-storage-blocked"));
      };
      request.onupgradeneeded = () => {
        if (abandoned) {
          request.transaction?.abort();
          return;
        }
        if (!request.result.objectStoreNames.contains(WEB_DATABASE_STORE)) {
          request.result.createObjectStore(WEB_DATABASE_STORE);
        }
        if (!request.result.objectStoreNames.contains(WEB_DATABASE_ATTACHMENT_STORE)) {
          request.result.createObjectStore(WEB_DATABASE_ATTACHMENT_STORE);
        }
      };
      request.onerror = () => {
        cleanup();
        reject(
          new Error(
            request.error?.name === "VersionError"
              ? "LUNA_ERROR:web-storage-invalid"
              : "LUNA_ERROR:web-storage-unavailable",
          ),
        );
      };
      request.onsuccess = () => {
        cleanup();
        const database = request.result;
        database.onversionchange = () => database.close();
        if (abandoned) database.close();
        else resolve(database);
      };
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  }

  private stateDatabaseName(): string {
    return this.options.databaseName ?? WEB_DATABASE_NAME;
  }

}

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new LedgerSessionError("ledger-sync-cancelled");
}

export function safeIndexedDB(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}
