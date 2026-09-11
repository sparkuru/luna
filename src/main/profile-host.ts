import { atomicWritePrivateFile } from "./atomic-file";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
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

export class NativeProfiles implements ProfileRepository {
  private readonly instances = new Map<string, Promise<LocalProfile>>();
  private readonly historyPath: string;
  constructor(
    private readonly directory: string,
    private readonly legacyStore: SQLiteLocalStore,
    private readonly legacyConfig: ConfigSyncService,
    private readonly locale = "en",
  ) {
    this.historyPath = path.join(directory, "profile-history.json");
  }
  async open(value: string): Promise<LocalProfile> {
    const id = decodeProfileId(value);
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
    return {
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
      bind: async (document, binding, signal) =>
        store.bindProfile(document, binding, signal),
      close: async () => {
        await api.clearLedgerSync();
        config.cancelSession();
        if (id !== "legacy-local") store.close();
        this.instances.delete(id);
      },
    };
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
    await atomicWritePrivateFile(
      path.join(this.directory, "active-profile.json"),
      JSON.stringify(valid),
      signal,
    );
    const history = await this.history();
    await atomicWritePrivateFile(
      this.historyPath,
      JSON.stringify([valid, ...history.filter((candidate) => candidate !== valid)].slice(0, 20)),
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
    const history = await this.history();
    await atomicWritePrivateFile(
      this.historyPath,
      JSON.stringify(history.filter((candidate) => candidate !== id)),
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
    const available = [
      "legacy-local",
      ...names.filter((name) => {
        try {
          return decodeProfileId(name) !== "legacy-local";
        } catch {
          return false;
        }
      }),
    ];
    const history = await this.history();
    const ids = [...history, ...available].filter(
      (id, index, values) =>
        available.includes(id) && values.indexOf(id) === index,
    );
    const result: ProfileSummary[] = [];
    for (const id of ids) {
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

  private async history(): Promise<string[]> {
    try {
      const value: unknown = JSON.parse(await readFile(this.historyPath, "utf8"));
      if (!Array.isArray(value)) return [];
      return value
        .filter((id): id is string => typeof id === "string")
        .map((id) => {
          try {
            return decodeProfileId(id);
          } catch {
            return null;
          }
        })
        .filter((id): id is string => id !== null)
        .slice(0, 20);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      return [];
    }
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
