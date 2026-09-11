import { LedgerSessionError } from "../shared/ledger-session";

export const WEB_DATABASE_NAME = "luna-ledger";
export const WEB_DATABASE_VERSION = 1;
export const WEB_DATABASE_STORE = "state";
export const WEB_DATABASE_RECORD = "current";
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

  destroy(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.factory === null) {
        reject(new Error("LUNA_ERROR:web-storage-unavailable"));
        return;
      }
      let request: IDBOpenDBRequest;
      try {
        request = this.factory.deleteDatabase(
          this.options.databaseName ?? WEB_DATABASE_NAME,
        );
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
        transaction = database.transaction(WEB_DATABASE_STORE, "readwrite");
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
