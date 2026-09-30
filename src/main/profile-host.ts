import { atomicWritePrivateFile } from "./atomic-file";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SQLiteLocalStore } from "./store";
import { SettingsStore } from "./settings-store";
import {
  ConfigSyncService,
  SessionConfigSecrets,
} from "../sync/config-service";
import * as nativeCrypto from "./config-crypto";
import { createS3ConfigObjectStore } from "../sync/s3-config-store";
import { createNativeLedgerApi } from "./local-api";
import { ServerHost } from "../sync/server-host";
import type { LocalProfile, ProfileRepository } from "../sync/profile-port";
import { decodeProfileId, type ProfileSummary } from "../shared/server-api";
import {
  decodeLocalLedgerCatalog,
  defaultLocalLedgerEntry,
  encodeLocalLedgerCatalog,
  replaceLocalLedgerEntry,
  type LocalLedgerCatalog,
  type LocalLedgerCatalogEntry,
  type LocalLedgerSyncState,
} from "../shared/local-ledger";

export class NativeProfiles implements ProfileRepository {
  private readonly instances = new Map<string, Promise<LocalProfile>>();
  private readonly historyPath: string;
  private readonly storageKind = "sqlite-native" as const;
  constructor(
    private readonly directory: string,
    private readonly legacyStore: SQLiteLocalStore,
    private readonly legacyConfig: ConfigSyncService,
    private readonly locale = "en",
  ) {
    this.historyPath = path.join(directory, "profile-history.json");
  }
  async open(value: string, createIfMissing = false): Promise<LocalProfile> {
    const id = decodeProfileId(value);
    if (id !== "legacy-local" && !createIfMissing) {
      try {
        await stat(path.join(this.directory, "profiles", id, "luna.sqlite"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          throw new Error("LUNA_ERROR:server-not-found");
        throw error;
      }
    }
    let result = this.instances.get(id);
    if (!result) {
      result = this.create(id);
      this.instances.set(id, result);
      void result.catch(() => this.instances.delete(id));
    }
    return result;
  }
  private async create(id: string): Promise<LocalProfile> {
    let store = this.legacyStore,
      config = this.legacyConfig;
    if (id !== "legacy-local") {
      const directory = path.join(this.directory, "profiles", id);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      store = new SQLiteLocalStore(path.join(directory, "luna.sqlite"), true);
      const settings = new SettingsStore(directory, {
        deviceId: randomUUID,
        systemLocale: this.locale,
        now: () => new Date().toISOString(),
      });
      await settings.initialize();
      config = new ConfigSyncService(
        settings,
        new SessionConfigSecrets(),
        createS3ConfigObjectStore,
        { now: () => new Date().toISOString(), crypto: nativeCrypto },
      );
    }
    const api = createNativeLedgerApi(store, config);
    const profile: LocalProfile = {
      id,
      api,
      ledger: store,
      config,
      readDurable: async () => {
        if (id === "legacy-local") return store.getLedgerDocument();
        const reader = new SQLiteLocalStore(
          path.join(this.directory, "profiles", id, "luna.sqlite"),
          true,
        );
        try {
          return reader.getLedgerDocument();
        } finally {
          reader.close();
        }
      },
      binding: async () => store.getProfileBinding(),
      bind: async (document, binding, signal) => {
        await store.bindProfile(document, binding, signal);
        await this.updateCatalogEntry({
          id,
          displayName: document.workspace.name,
          binding,
          syncState: "ready",
        });
      },
      close: async () => {
        await api.clearLedgerSync();
        config.cancelSession();
        if (id !== "legacy-local") store.close();
        this.instances.delete(id);
      },
    };
    if (id !== "legacy-local") await this.updateCatalogEntry({ id });
    return profile;
  }
  async active(): Promise<string> {
    try {
      return decodeProfileId(
        JSON.parse(
          await readFile(
            path.join(this.directory, "active-profile.json"),
            "utf8",
          ),
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return "legacy-local";
      throw error;
    }
  }
  async activate(id: string, signal: AbortSignal): Promise<void> {
    const valid = decodeProfileId(id);
    const catalog = await this.readCatalog();
    const existing = catalog.entries.find((entry) => entry.id === valid);
    if (valid !== "legacy-local" && !existing)
      throw new Error("LUNA_ERROR:server-not-found");
    const next = {
      ...catalog,
      entries: replaceLocalLedgerEntry(
        catalog.entries,
        {
          ...(existing ?? defaultLocalLedgerEntry(valid, this.storageKind)),
          lastOpenedAt: new Date().toISOString(),
        },
      ),
    };
    await this.writeCatalog(next);
    await atomicWritePrivateFile(
      path.join(this.directory, "active-profile.json"),
      JSON.stringify(valid),
      signal,
    );
  }
  async remove(value: string): Promise<void> {
    const id = decodeProfileId(value);
    if (id === "legacy-local")
      throw new Error("LUNA_ERROR:server-profile-protected");
    if ((await this.active()) === id)
      throw new Error("LUNA_ERROR:server-active-profile");
    const pending = this.instances.get(id);
    if (pending) await (await pending).close();
    const directory = path.join(this.directory, "profiles", id);
    try {
      await rm(directory, { recursive: true, force: false });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new Error("LUNA_ERROR:server-not-found");
      throw error;
    }
    await this.updateCatalog((entries) =>
      entries.filter((candidate) => candidate.id !== id),
    );
  }
  async closeAll(): Promise<void> {
    for (const pending of [...this.instances.values()])
      await (await pending).close();
  }
  async list(): Promise<ProfileSummary[]> {
    let names: string[] = [];
    try {
      names = await readdir(path.join(this.directory, "profiles"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const profileNames = names.filter((name) => {
      try {
        return decodeProfileId(name) !== "legacy-local";
      } catch {
        return false;
      }
    });
    const profileAvailability = await Promise.all(
      profileNames.map(async (name) => {
        try {
          await stat(path.join(this.directory, "profiles", name, "luna.sqlite"));
          return name;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw error;
        }
      }),
    );
    const available = [
      "legacy-local",
      ...profileAvailability.filter((name): name is string => name !== null),
    ];
    const active = await this.active();
    let catalog = await this.readCatalog();
    const original = encodeLocalLedgerCatalog(catalog);
    for (const id of available) {
      if (!catalog.entries.some((entry) => entry.id === id)) {
        catalog = {
          ...catalog,
          entries: replaceLocalLedgerEntry(
            catalog.entries,
            defaultLocalLedgerEntry(id, this.storageKind, null),
          ),
        };
      }
    }

    // Only inspect the selected database. Inactive catalog rows are metadata;
    // listing them must not open or initialize their SQLite files.
    if (available.includes(active)) {
      const selected = await this.open(active);
      const document = await selected.ledger.getLedgerDocument();
      const binding = await selected.binding();
      const sync = await selected.api.getLedgerSyncStatus();
      const current = catalog.entries.find((entry) => entry.id === active)!;
      catalog = {
        ...catalog,
        entries: replaceLocalLedgerEntry(catalog.entries, {
          ...current,
          displayName: document?.workspace.name ?? current.displayName,
          storageKind: this.storageKind,
          lastOpenedAt: current.lastOpenedAt ?? new Date().toISOString(),
          syncState: binding ? sync.code : "local-only",
          binding,
        }),
      };
    }
    if (encodeLocalLedgerCatalog(catalog) !== original)
      await this.writeCatalog(catalog);
    const availableSet = new Set(available);
    return [...catalog.entries]
      .sort((left, right) =>
        (right.lastOpenedAt ?? "").localeCompare(left.lastOpenedAt ?? ""),
      )
      .map((entry) => ({ ...entry, available: availableSet.has(entry.id) }));
  }

  async createLocal(): Promise<string> {
    const id = `local-${randomUUID()}`;
    const directory = path.join(this.directory, "profiles", id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await this.updateCatalogEntry({ id });
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

  private async readCatalog(): Promise<LocalLedgerCatalog> {
    try {
      return decodeLocalLedgerCatalog(
        await readFile(this.historyPath, "utf8"),
        this.storageKind,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { version: 1, entries: [] };
      throw error;
    }
  }
  private async updateCatalog(
    change: (entries: LocalLedgerCatalogEntry[]) => LocalLedgerCatalogEntry[],
  ): Promise<LocalLedgerCatalog> {
    const catalog = await this.readCatalog();
    const next = { version: 1 as const, entries: change(catalog.entries) };
    if (encodeLocalLedgerCatalog(next) === encodeLocalLedgerCatalog(catalog))
      return catalog;
    await this.writeCatalog(next);
    return next;
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
  private async writeCatalog(catalog: LocalLedgerCatalog): Promise<void> {
    await atomicWritePrivateFile(
      this.historyPath,
      encodeLocalLedgerCatalog(catalog),
    );
  }
}
export function createNativeProfileHost(
  directory: string,
  store: SQLiteLocalStore,
  config: ConfigSyncService,
  locale = "en",
  fetcher: typeof fetch = globalThis.fetch,
) {
  return new ServerHost(
    new NativeProfiles(directory, store, config, locale),
    fetcher,
  );
}
