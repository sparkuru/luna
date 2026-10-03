import {
  BrowserStateStore,
  type StateStore,
} from "./browser-state-store";
import { SqliteWasmStateStore } from "./sqlite-wasm-store";
import { hasSahDatabase } from "./opfs-sah-exists";
import { WebLedgerApi, decodeStoredState } from "./web-api";
import { ServerHost } from "../sync/server-host";
import { createWebSessionVault } from "./session-vault";
import type { LocalProfile, ProfileRepository } from "../sync/profile-port";
import {
  decodeProfileId,
  decodeBinding,
  type ProfileSummary,
} from "../shared/server-api";
import { secureRandomUuid } from "../shared/secure-random";
import {
  decodeLocalLedgerCatalog,
  defaultLocalLedgerEntry,
  encodeLocalLedgerCatalog,
  replaceLocalLedgerEntry,
  type LocalLedgerCatalog,
  type LocalLedgerCatalogEntry,
  type LocalLedgerStorageKind,
  type LocalLedgerSyncState,
} from "../shared/local-ledger";
import {
  decodeLedgerDocument,
  mergeLedgerDocuments,
} from "../shared/ledger-sync";

const CATALOG = "luna-profiles";
export class BrowserProfiles implements ProfileRepository {
  private readonly instances = new Map<string, Promise<LocalProfile>>();
  private catalogStore: StateStore | null = null;
  constructor(
    private readonly database?: IDBFactory | null,
    private readonly storage: Storage | null = safeStorage(),
  ) {}
  private get storageKind(): LocalLedgerStorageKind {
    return this.database === undefined ? "sqlite-wasm-opfs" : "indexeddb-compat";
  }
  async open(value: string, createIfMissing = false): Promise<LocalProfile> {
    const id = decodeProfileId(value);
    if (
      !createIfMissing &&
      id !== "legacy-local" &&
      !(await this.profileDatabaseExists(id))
    )
      throw new Error("LUNA_ERROR:server-not-found");
    let pending = this.instances.get(id);
    if (!pending) {
      pending = this.create(id);
      this.instances.set(id, pending);
      void pending.catch(() => this.instances.delete(id));
    }
    return pending;
  }
  private async create(id: string): Promise<LocalProfile> {
    const store = this.createStore(id, id === "legacy-local");
    const api = new WebLedgerApi(store);
    await api.getLedgerDocument();
    const profile: LocalProfile = {
      id,
      api,
      ledger: api,
      config: api.configSession,
      readDurable: async () => decodeStoredState(await store.read()).ledger,
      binding: async () =>
        decodeBinding(JSON.parse((await store.metadata()) ?? "null")),
      bind: async (document, binding, signal) => {
        const incoming = decodeLedgerDocument(document);
        const valid = decodeBinding(binding);
        await store.updateWithMetadata((raw, metadata) => {
          const state = decodeStoredState(raw);
          const old = decodeBinding(JSON.parse(metadata ?? "null"));
          if (old && JSON.stringify(old) !== JSON.stringify(valid))
            throw new Error("LUNA_ERROR:server-binding-mismatch");
          state.ledger = state.ledger
            ? mergeLedgerDocuments(state.ledger, incoming)
            : incoming;
          return {
            result: undefined,
            value: JSON.stringify(state),
            metadata: JSON.stringify(valid),
          };
        }, signal);
        await this.updateCatalogEntry({
          id,
          displayName: incoming.workspace.name,
          binding: valid,
          syncState: "ready",
        });
      },
      close: async () => {
        await api.clearLedgerSync();
        api.configSession.cancelSession();
        await store.close?.();
        this.instances.delete(id);
      },
    };
    if (id !== "legacy-local")
      await this.updateCatalogEntry({ id });
    return profile;
  }
  async active(): Promise<string> {
    const store = this.getCatalogStore();
    const raw = await store.metadata();
    return raw === null ? "legacy-local" : decodeProfileId(JSON.parse(raw));
  }
  async activate(id: string, signal: AbortSignal): Promise<void> {
    id = decodeProfileId(id);
    const store = this.getCatalogStore();
    await store.updateWithMetadata((raw) => {
      const catalog = decodeLocalLedgerCatalog(raw, this.storageKind);
      if (
        id !== "legacy-local" &&
        !catalog.entries.some((entry) => entry.id === id)
      )
        throw new Error("LUNA_ERROR:server-not-found");
      const current =
        catalog.entries.find((entry) => entry.id === id) ??
        defaultLocalLedgerEntry(id, this.storageKind);
      const entry = { ...current, lastOpenedAt: new Date().toISOString() };
      const entries = replaceLocalLedgerEntry(catalog.entries, entry);
      return {
        result: undefined,
        value: encodeLocalLedgerCatalog({ version: 1, entries }),
        metadata: JSON.stringify(id),
      };
    }, signal);
  }
  async remove(value: string): Promise<void> {
    const id = decodeProfileId(value);
    if (id === "legacy-local")
      throw new Error("LUNA_ERROR:server-profile-protected");
    if ((await this.active()) === id)
      throw new Error("LUNA_ERROR:server-active-profile");
    const catalog = await this.readCatalog();
    if (!catalog.entries.some((entry) => entry.id === id))
      throw new Error("LUNA_ERROR:server-not-found");
    const pending = this.instances.get(id);
    if (pending) await (await pending).close();
    const store = this.createStore(id, false);
    try {
      if (!store.destroy)
        throw new Error("LUNA_ERROR:server-unavailable");
      await store.destroy();
    } finally {
      await store.close?.();
    }
    await this.updateCatalog((entries) =>
      entries.filter((candidate) => candidate.id !== id),
    );
  }
  async closeAll(): Promise<void> {
    try {
      for (const pending of [...this.instances.values()])
        await (await pending).close();
    } finally {
      const store = this.catalogStore;
      this.catalogStore = null;
      await store?.close?.();
    }
  }
  async list(): Promise<ProfileSummary[]> {
    const active = await this.active();
    let catalog = await this.readCatalog();
    const original = encodeLocalLedgerCatalog(catalog);
    if (!catalog.entries.some((entry) => entry.id === "legacy-local")) {
      catalog = {
        ...catalog,
        entries: replaceLocalLedgerEntry(
          catalog.entries,
          defaultLocalLedgerEntry("legacy-local", this.storageKind),
        ),
      };
    }
    if (!catalog.entries.some((entry) => entry.id === active)) {
      catalog = {
        ...catalog,
        entries: replaceLocalLedgerEntry(
          catalog.entries,
          defaultLocalLedgerEntry(active, this.storageKind),
        ),
      };
    }

    const available = new Set<string>(["legacy-local"]);
    for (const entry of catalog.entries) {
      if (entry.id !== "legacy-local" && await this.profileDatabaseExists(entry.id))
        available.add(entry.id);
    }

    // Only inspect the selected ledger. Listing inactive rows must never open
    // their databases or accidentally initialize a missing local copy.
    if (available.has(active)) {
      const selected = await this.open(active);
      const document = await selected.ledger.getLedgerDocument();
      const binding = await selected.binding();
      const sync = await selected.api.getLedgerSyncStatus();
      const current = catalog.entries.find((entry) => entry.id === active)!;
      const updated = {
        ...current,
        displayName: document?.workspace.name ?? current.displayName,
        storageKind: this.storageKind,
        lastOpenedAt: current.lastOpenedAt ?? new Date().toISOString(),
        syncState: binding ? sync.code : "local-only",
        binding,
      } satisfies LocalLedgerCatalogEntry;
      catalog = {
        ...catalog,
        entries: replaceLocalLedgerEntry(catalog.entries, updated),
      };
    }
    if (encodeLocalLedgerCatalog(catalog) !== original)
      await this.writeCatalog(catalog);
    return [...catalog.entries]
      .sort((left, right) =>
        (right.lastOpenedAt ?? "").localeCompare(left.lastOpenedAt ?? ""),
      )
      .map((entry) => ({ ...entry, available: available.has(entry.id) }));
  }
  async createLocal(): Promise<string> {
    const id = `local-${secureRandomUuid()}`;
    await this.open(id, true);
    return id;
  }
  async setSyncState(id: string, syncState: LocalLedgerSyncState): Promise<void> {
    const current = (await this.readCatalog()).entries.find(
      (entry) => entry.id === decodeProfileId(id),
    );
    if (current?.syncState === syncState) return;
    await this.updateCatalogEntry({ id, syncState });
  }
  private async updateCatalog(
    change: (entries: LocalLedgerCatalogEntry[]) => LocalLedgerCatalogEntry[],
  ): Promise<LocalLedgerCatalog> {
    const store = this.getCatalogStore();
    const result = await store.update((raw) => {
      const catalog = decodeLocalLedgerCatalog(raw, this.storageKind);
      const entries = change(catalog.entries);
      const next = { version: 1 as const, entries };
      return { result: next, value: encodeLocalLedgerCatalog(next) };
    });
    return result;
  }
  private async updateCatalogEntry(
    update: Partial<LocalLedgerCatalogEntry> & { id: string },
  ): Promise<void> {
    const id = decodeProfileId(update.id);
    await this.updateCatalog((entries) => {
      const current =
        entries.find((entry) => entry.id === id) ??
        defaultLocalLedgerEntry(id, this.storageKind);
      return replaceLocalLedgerEntry(entries, {
        ...current,
        ...update,
        id,
        storageKind: this.storageKind,
      });
    });
  }
  private async readCatalog(): Promise<LocalLedgerCatalog> {
    return decodeLocalLedgerCatalog(
      await this.getCatalogStore().read(),
      this.storageKind,
    );
  }
  private async profileDatabaseExists(id: string): Promise<boolean> {
    const name = sqliteDatabaseName(id);
    if (this.database !== undefined) {
      const factory = this.database as IDBFactory & {
        databases?: () => Promise<Array<{ name?: string | null }>>;
      };
      if (typeof factory.databases !== "function") return false;
      const databases = await factory.databases.call(factory);
      return databases.some((database) => database.name === name);
    }

    const storage = globalThis.navigator?.storage as
      | StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> }
      | undefined;
    if (typeof storage?.getDirectory !== "function") return false;
    const root = await storage.getDirectory();
    if (await hasFile(root, `${name}.sqlite3`)) return true;
    try {
      const parent = await root.getDirectoryHandle(".luna-sqlite");
      const profileDirectory = await parent.getDirectoryHandle(name);
      return await hasSahDatabase(profileDirectory, `${name}.sqlite3`);
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }
  private async writeCatalog(catalog: LocalLedgerCatalog): Promise<void> {
    const store = this.getCatalogStore();
    await store.update(() => ({
      result: undefined,
      value: encodeLocalLedgerCatalog(catalog),
    }));
  }
  private getCatalogStore(): StateStore {
    return (this.catalogStore ??= this.createStore(CATALOG, false));
  }
  private createStore(databaseName: string, importLegacy: boolean): StateStore {
    if (this.database !== undefined)
      return new BrowserStateStore(
        this.database,
        this.storage,
        (raw) => {
          if (databaseName === CATALOG)
            decodeLocalLedgerCatalog(raw, this.storageKind);
          else decodeStoredState(raw);
        },
        { databaseName: sqliteDatabaseName(databaseName), importLegacy },
      );
    return new SqliteWasmStateStore(sqliteDatabaseName(databaseName));
  }
}
async function hasFile(directory: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await directory.getFileHandle(name);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}
function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}
function sqliteDatabaseName(databaseName: string): string {
  if (databaseName === CATALOG) return "luna-catalog";
  return `luna-ledger-${databaseName.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}
function decodeCatalog(raw: string | null): string[] {
  const value: unknown = raw === null ? [] : JSON.parse(raw);
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error("LUNA_ERROR:web-storage-invalid");
  return [...new Set(value.map(decodeProfileId))].filter(
    (id) => id !== "legacy-local",
  );
}
export function createWebProfileHost(
  database?: IDBFactory | null,
  storage: Storage | null = safeStorage(),
  fetcher: typeof fetch = globalThis.fetch,
) {
  const host = new ServerHost(
    new BrowserProfiles(database, storage),
    fetcher,
    createWebSessionVault(),
  );
  let send = (_id: string) => {};
  let close = () => {};
  if (
    typeof window !== "undefined" &&
    typeof BroadcastChannel !== "undefined"
  ) {
    const channel = new BroadcastChannel("luna-profile-invalidation");
    channel.onmessage = (event) => {
      if (typeof event.data === "string") host.notifyExternal(event.data);
    };
    send = (id) => channel.postMessage(id);
    close = () => channel.close();
  }
  // The notification transport is optional. The host also owns the active
  // remote-marker poll, so WebViews without BroadcastChannel must still get
  // automatic sync and visible remote-change notifications.
  host.setNotifications(send, close);
  return host;
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
