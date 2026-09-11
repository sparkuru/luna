import { ConfigCryptoError } from "../shared/config-crypto";
import { assertNotAborted } from "../shared/abort";
import * as portableCrypto from "../shared/portable-config-crypto";
import {
  applySettingsUpdate,
  configObjectKey,
  decodeConfigureConfigSync,
  decodeSettingsUpdate,
  mergePortableSettings,
  portableSettingsEqual,
  remotePayloadFromSettings,
  settingsToRenderer,
  SettingsDecodeError,
  type AppSettingsFileV1,
  type ConfigSyncActionResult,
  type ConfigSyncCredentialsInput,
  type ConfigSyncStatusCode,
  type ConfigureConfigSyncInput,
  type RendererSettings,
  type RemotePortablePayloadV1,
  type SecretPersistence,
  type SettingsUpdateInput,
} from "../shared/settings";
import {
  ObjectStoreError,
  type ConfigObjectStore,
  type ConfigObjectStoreFactory,
} from "./s3-config-store";

export interface ConfigSettingsPort {
  get(): Promise<AppSettingsFileV1>;
  mutateSettings(
    change: (current: AppSettingsFileV1) => AppSettingsFileV1,
    signal?: AbortSignal,
  ): Promise<AppSettingsFileV1>;
}
export interface ConfigSecretsPort {
  persistence(): Promise<SecretPersistence>;
  hasPersisted(): Promise<boolean>;
  save(credentials: ConfigSyncCredentialsInput): Promise<SecretPersistence>;
  load(): Promise<ConfigSyncCredentialsInput | null>;
  clear(): Promise<void>;
}
export interface ConfigCryptoPort {
  encryptRemoteConfig(
    payload: RemotePortablePayloadV1,
    password: string,
    options: portableCrypto.PortableConfigCryptoOptions,
  ): Promise<Uint8Array>;
  decryptRemoteConfig(
    bytes: Uint8Array,
    password: string,
    options: portableCrypto.PortableConfigCryptoOptions,
  ): Promise<RemotePortablePayloadV1>;
}
export interface ConfigSyncServiceOptions {
  now: () => string;
  sleep?: (milliseconds: number) => Promise<void>;
  cryptoCost?: number;
  cryptoMaxmem?: number;
  crypto?: ConfigCryptoPort;
}
export class ConfigSyncServiceError extends Error {
  constructor(readonly code: ConfigSyncStatusCode) {
    super(`LUNA_ERROR:${code}`);
    this.name = "ConfigSyncServiceError";
  }
}

/** Both hosts use the same merge/retry lifecycle; persistence owns the commit boundary. */
export interface ConfigSessionTarget {
  passphrase: string;
  createStore: () => ConfigObjectStore;
  objectKey: string;
}
export class ConfigSyncService {
  private target: ConfigSessionTarget | null = null;
  private targetCode: ConfigSyncStatusCode = "disabled";
  configureTarget(target: ConfigSessionTarget | null): void {
    this.cancelSession();
    this.target = target;
    this.targetCode = target ? "never" : "disabled";
  }
  getTargetStatus(): { enabled: boolean; code: ConfigSyncStatusCode } {
    return { enabled: this.target !== null, code: this.targetCode };
  }
  cancelSession(): void {
    this.configurationEpoch++;
    this.cancel();
    this.sessionCredentials = null;
    this.target = null;
    this.targetCode = "disabled";
  }
  getSettingsPort(): ConfigSettingsPort {
    return this.settingsStore;
  }

  private sessionCredentials: ConfigSyncCredentialsInput | null = null;
  private active: AbortController | null = null;
  private configurationEpoch = 0;
  private configurationQueue: Promise<void> = Promise.resolve();
  private configuring = 0;
  private readonly crypto: ConfigCryptoPort;
  constructor(
    private readonly settingsStore: ConfigSettingsPort,
    private readonly secretStore: ConfigSecretsPort,
    private readonly objectStoreFactory: ConfigObjectStoreFactory,
    private readonly options: ConfigSyncServiceOptions,
  ) {
    this.crypto = options.crypto ?? portableCrypto;
  }

  async getRendererSettings(): Promise<RendererSettings> {
    return this.project(await this.settingsStore.get());
  }

  async updateSettings(value: SettingsUpdateInput): Promise<RendererSettings> {
    const update = decodeSettingsUpdate(value);
    if (update.syncAllPortableSettings === false) {
      this.configurationEpoch++;
      this.cancel();
    }
    return this.project(
      await this.settingsStore.mutateSettings((current) => {
        const next = applySettingsUpdate(current, update, this.options.now());
        if (!next.syncAllPortableSettings)
          next.lastSync = {
            ...next.lastSync,
            code: "disabled",
            updatedAt: this.options.now(),
          };
        else if (!portableSettingsEqual(current.portable, next.portable))
          next.lastSync = { ...next.lastSync, code: "never" };
        return next;
      }),
    );
  }

  async configure(value: ConfigureConfigSyncInput): Promise<RendererSettings> {
    this.target = null;
    this.targetCode = "disabled";
    const input = decodeConfigureConfigSync(value);
    const endpoint = new URL(input.connection.endpoint);
    if (
      endpoint.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
    ) {
      throw new SettingsDecodeError(
        "invalid-settings",
        "Sync requires HTTPS except on loopback.",
      );
    }
    this.cancel();
    this.sessionCredentials = null;
    const epoch = ++this.configurationEpoch;
    const assertCurrent = () => {
      if (epoch !== this.configurationEpoch)
        throw new ConfigSyncServiceError("operation-failed");
    };
    return this.configureExclusive(async () => {
      assertCurrent();
      // Never send old credentials to a newly selected endpoint after a failed setup.
      await this.secretStore.clear();
      assertCurrent();
      await this.settingsStore.mutateSettings((current) => {
        assertCurrent();
        return {
          ...current,
          syncConnection: input.connection,
          lastSync: {
            code: current.syncAllPortableSettings ? "never" : "disabled",
            updatedAt: this.options.now(),
            etag: null,
          },
        };
      });
      assertCurrent();
      if (input.rememberSecrets) {
        const persistence = await this.secretStore.save(input.credentials);
        assertCurrent();
        if (persistence !== "secure")
          await this.settingsStore.mutateSettings((current) => {
            assertCurrent();
            return {
              ...current,
              lastSync: {
                code: "secret-storage-unavailable",
                updatedAt: this.options.now(),
                etag: null,
              },
            };
          });
      }
      assertCurrent();
      this.sessionCredentials = { ...input.credentials };
      return this.getRendererSettings();
    });
  }

  async clearLocalConfiguration(): Promise<RendererSettings> {
    this.configurationEpoch++;
    this.cancel();
    this.sessionCredentials = null;
    return this.configureExclusive(async () => {
      await this.secretStore.clear();
      return this.project(
        await this.settingsStore.mutateSettings((current) => ({
          ...current,
          syncAllPortableSettings: false,
          syncConnection: null,
          lastSync: {
            code: "disabled",
            updatedAt: this.options.now(),
            etag: null,
          },
        })),
      );
    });
  }

  async testConnection(): Promise<ConfigSyncActionResult> {
    return this.run(false);
  }
  async syncNow(): Promise<ConfigSyncActionResult> {
    return this.run(true);
  }

  private async run(sync: boolean): Promise<ConfigSyncActionResult> {
    if (this.configuring > 0)
      throw new ConfigSyncServiceError("operation-failed");
    if (this.active !== null) {
      const current = await this.settingsStore.get();
      if (!current.syncAllPortableSettings)
        return { code: "disabled", settings: await this.project(current) };
      throw new ConfigSyncServiceError("operation-failed");
    }
    const target = this.target;
    const controller = new AbortController();
    this.active = controller;
    const signal = controller.signal;
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let store: ConfigObjectStore | null = null;
    try {
      const initial = await this.settingsStore.get();
      if (!target && !initial.syncAllPortableSettings)
        return { code: "disabled", settings: await this.project(initial) };
      if (!target && initial.syncConnection === null)
        throw new ConfigSyncServiceError("missing-connection");
      const credentials = target
        ? { passphrase: target.passphrase }
        : (this.sessionCredentials ?? (await this.secretStore.load()));
      assertNotAborted(signal);
      if (credentials === null)
        throw new ConfigSyncServiceError("missing-secrets");
      if (!target)
        this.sessionCredentials = credentials as ConfigSyncCredentialsInput;
      const connection = initial.syncConnection;
      const key = target?.objectKey ?? configObjectKey(connection!.prefix);
      const guard = (current: AppSettingsFileV1): void => {
        assertNotAborted(signal);
        if (
          target
            ? this.target !== target
            : !current.syncAllPortableSettings ||
              JSON.stringify(current.syncConnection) !==
                JSON.stringify(connection)
        ) {
          throw new ConfigSyncServiceError("disabled");
        }
      };
      const mutate = async (
        change: (current: AppSettingsFileV1) => AppSettingsFileV1,
      ) => {
        let committedCode: ConfigSyncStatusCode | null = null;
        const committed = await this.settingsStore.mutateSettings((current) => {
          guard(current);
          const next = change(current);
          if (target) {
            committedCode = next.lastSync.code;
            return { ...next, lastSync: current.lastSync };
          }
          return next;
        }, signal);
        guard(committed);
        if (target && committedCode) this.targetCode = committedCode;
        return committed;
      };
      store = target
        ? target.createStore()
        : this.objectStoreFactory(
            connection!,
            credentials as ConfigSyncCredentialsInput,
          );
      const remote = store;
      const options = {
        signal,
        ...(this.options.cryptoCost === undefined
          ? {}
          : { cost: this.options.cryptoCost }),
        ...(this.options.cryptoMaxmem === undefined
          ? {}
          : { maxmem: this.options.cryptoMaxmem }),
      };
      if (sync)
        await mutate((current) => ({
          ...current,
          lastSync: {
            code: "syncing",
            updatedAt: this.options.now(),
            etag: null,
          },
        }));
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          guard(await this.settingsStore.get());
          let object: Awaited<ReturnType<ConfigObjectStore["get"]>> | null =
            null;
          try {
            object = await this.retry(() => remote.get(key, signal), signal);
          } catch (error) {
            if (
              !(error instanceof ObjectStoreError) ||
              error.code !== "not-found"
            )
              throw error;
          }
          assertNotAborted(signal);
          if (!sync) {
            const next = await mutate((current) => ({
              ...current,
              lastSync: {
                code: "connection-ok",
                updatedAt: this.options.now(),
                etag: null,
              },
            }));
            return {
              code: "connection-ok",
              settings: await this.project(next),
            };
          }
          const payload =
            object === null
              ? null
              : await this.crypto.decryptRemoteConfig(
                  object.body,
                  credentials.passphrase,
                  options,
                );
          assertNotAborted(signal);
          // Merge against current state inside the actual storage transaction, never a pre-GET snapshot.
          const merged =
            payload === null
              ? await this.settingsStore.get()
              : await mutate((current) => ({
                  ...current,
                  portable: mergePortableSettings(
                    current.portable,
                    payload.portable,
                  ),
                }));
          guard(merged);
          let etag = object?.etag ?? null;
          if (
            payload === null ||
            !portableSettingsEqual(payload.portable, merged.portable)
          ) {
            const encrypted = await this.crypto.encryptRemoteConfig(
              payload === null
                ? remotePayloadFromSettings(merged)
                : { ...payload, portable: merged.portable },
              credentials.passphrase,
              options,
            );
            guard(await this.settingsStore.get());
            const condition =
              object === null
                ? { ifNoneMatch: true as const }
                : { ifMatch: object.etag };
            etag = (
              await this.retry(async () => {
                guard(await this.settingsStore.get());
                return remote.put(key, encrypted, condition, signal);
              }, signal)
            ).etag;
          }
          const next = await mutate((current) => {
            if (!portableSettingsEqual(current.portable, merged.portable))
              throw new ObjectStoreError(
                "conflict",
                "Local settings changed during sync.",
              );
            return {
              ...current,
              lastSync: { code: "synced", updatedAt: this.options.now(), etag },
            };
          });
          return { code: "synced", settings: await this.project(next) };
        } catch (error) {
          assertNotAborted(signal);
          if (
            !(error instanceof ObjectStoreError) ||
            !["conflict", "not-found"].includes(error.code) ||
            attempt === 2
          )
            throw error;
          await this.sleep(25 * 2 ** attempt);
        }
      }
      throw new ConfigSyncServiceError("conflict");
    } catch (error) {
      if (signal.aborted) throw new ConfigSyncServiceError("operation-failed");
      const code = mapSyncError(error);
      if (target) {
        if (this.target === target) this.targetCode = code;
      } else
        await this.settingsStore.mutateSettings(
          (current) => ({
            ...current,
            lastSync: {
              ...current.lastSync,
              code: current.syncAllPortableSettings ? code : "disabled",
              updatedAt: this.options.now(),
            },
          }),
          signal,
        );
      throw new ConfigSyncServiceError(code);
    } finally {
      clearTimeout(timeout);
      store?.close?.();
      if (this.active === controller) this.active = null;
    }
  }

  private cancel(): void {
    this.active?.abort();
  }
  private async configureExclusive<T>(operation: () => Promise<T>): Promise<T> {
    this.configuring++;
    const previous = this.configurationQueue;
    let release!: () => void;
    this.configurationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      this.configuring--;
      release();
    }
  }
  private sleep(milliseconds: number): Promise<void> {
    return (
      this.options.sleep?.(milliseconds) ??
      new Promise((resolve) => setTimeout(resolve, milliseconds))
    );
  }
  private async retry<T>(
    operation: () => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
          assertNotAborted(signal);
      try {
        return await operation();
      } catch (error) {
        if (
          !(error instanceof ObjectStoreError) ||
          !["network", "transient"].includes(error.code) ||
          attempt === 2
        )
          throw error;
        await this.sleep(25 * 2 ** attempt);
      }
    }
  }
  private async project(
    settings: AppSettingsFileV1,
  ): Promise<RendererSettings> {
    const persistence = await this.secretStore.persistence();
    const hasSecrets =
      this.sessionCredentials !== null ||
      (persistence === "secure" && (await this.secretStore.hasPersisted()));
    return settingsToRenderer(
      settings,
      hasSecrets,
      persistence === "secure"
        ? "secure"
        : hasSecrets
          ? "session-only"
          : "unavailable",
    );
  }
}

/** No browser credentials or passphrase ever enter persistent storage. */
export class SessionConfigSecrets implements ConfigSecretsPort {
  async persistence(): Promise<SecretPersistence> {
    return "unavailable";
  }
  async hasPersisted(): Promise<boolean> {
    return false;
  }
  async save(): Promise<SecretPersistence> {
    return "session-only";
  }
  async load(): Promise<null> {
    return null;
  }
  async clear(): Promise<void> {}
}

function mapSyncError(error: unknown): ConfigSyncStatusCode {
  if (error instanceof ConfigSyncServiceError) return error.code;
  if (error instanceof ObjectStoreError) {
    if (error.code === "invalid-response") return "operation-failed";
    if (error.code === "not-found") return "remote-not-found";
    return error.code;
  }
  if (error instanceof ConfigCryptoError)
    return error.code === "invalid-envelope"
      ? "invalid-remote-config"
      : error.code;
  if (error instanceof SettingsDecodeError)
    return error.code === "unsupported-version"
      ? "unsupported-version"
      : "invalid-remote-config";
  return "operation-failed";
}
