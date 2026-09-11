import {
  BrowserStateStore,
  type StateStore,
} from "./browser-state-store";
import { SqliteWasmStateStore } from "./sqlite-wasm-store";
import { WebLedgerApi, decodeStoredState } from "./web-api";
import { ServerHost } from "../sync/server-host";
import { createWebSessionVault } from "./session-vault";
import type { LocalProfile, ProfileRepository } from "../sync/profile-port";
import {
  decodeProfileId,
  decodeBinding,
  type ProfileSummary,
} from "../shared/server-api";
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
  async open(value: string): Promise<LocalProfile> {
    const id = decodeProfileId(value);
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
      },
      close: async () => {
        await api.clearLedgerSync();
        api.configSession.cancelSession();
        await store.close?.();
        this.instances.delete(id);
      },
    };
    if (id !== "legacy-local")
      await this.catalog((ids) => (ids.includes(id) ? ids : [id, ...ids]));
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
      const ids = decodeCatalog(raw);
      if (id !== "legacy-local" && !ids.includes(id))
        throw new Error("LUNA_ERROR:server-not-found");
      return {
        result: undefined,
        value:
          id === "legacy-local"
            ? JSON.stringify(ids)
            : JSON.stringify([id, ...ids.filter((candidate) => candidate !== id)]),
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
    const ids = await this.catalog((current) => current);
    if (!ids.includes(id)) throw new Error("LUNA_ERROR:server-not-found");
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
    await this.catalog((current) =>
      current.filter((candidate) => candidate !== id),
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
    const ids = await this.readCatalog();
    const active = await this.active();
    const ordered = [
      active,
      "legacy-local",
      ...ids,
    ].filter((id, index, values) => values.indexOf(id) === index);
    const result: ProfileSummary[] = [];
    for (const id of ordered) {
      const p = await this.open(id);
      result.push({
        id,
        displayName:
          (await p.ledger.getLedgerDocument())?.workspace.name ?? "Luna",
        binding: await p.binding(),
      });
    }
    return result;
  }
  private async catalog(
    change: (ids: string[]) => string[],
  ): Promise<string[]> {
    const store = this.getCatalogStore();
    const result = await store.update((raw) => {
      const ids = change(decodeCatalog(raw));
      return { result: ids, value: JSON.stringify(ids) };
    });
    return result;
  }
  private async readCatalog(): Promise<string[]> {
    return decodeCatalog(await this.getCatalogStore().read());
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
          if (databaseName === CATALOG) decodeCatalog(raw);
          else decodeStoredState(raw);
        },
        { databaseName: sqliteDatabaseName(databaseName), importLegacy },
      );
    return new SqliteWasmStateStore(sqliteDatabaseName(databaseName));
  }
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
