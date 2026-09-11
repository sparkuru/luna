import { mkdir, readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  AppSettingsFileV1,
  ConfigSyncConnection,
  ConfigSyncStatus,
  SettingsUpdateInput,
  applySettingsUpdate,
  createDefaultSettings,
  decodeSettingsFile,
} from '../shared/settings';
import { atomicWritePrivateFile, pathExists } from './atomic-file';

const MAX_SETTINGS_BYTES = 128 * 1024;

export interface SettingsStoreOptions {
  deviceId: () => string;
  systemLocale: string;
  now: () => string;
}

export class SettingsStore {
  readonly settingsPath: string;
  private cached: AppSettingsFileV1 | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly dataDirectory: string,
    private readonly options: SettingsStoreOptions,
  ) {
    this.settingsPath = path.join(dataDirectory, 'settings.json');
  }

  async initialize(): Promise<AppSettingsFileV1> {
    return this.runExclusive(async () => this.loadOrCreate());
  }

  async get(): Promise<AppSettingsFileV1> {
    return this.runExclusive(async () => structuredClone(await this.loadOrCreate()));
  }

  async mutateSettings(
    change: (current: AppSettingsFileV1) => AppSettingsFileV1, signal?: AbortSignal,
  ): Promise<AppSettingsFileV1> {
    return this.runExclusive(async () => {
      signal?.throwIfAborted();
      const current = await this.loadOrCreate();
      signal?.throwIfAborted();
      const next = decodeSettingsFile(change(structuredClone(current)));
      signal?.throwIfAborted();
      await this.persist(next, signal);
      return structuredClone(next);
    });
  }

  async update(update: SettingsUpdateInput, now = this.options.now()): Promise<AppSettingsFileV1> {
    return this.runExclusive(async () => {
      const current = await this.loadOrCreate();
      const next = applySettingsUpdate(current, update, now);
      await this.persist(next);
      return structuredClone(next);
    });
  }

  async setConnection(connection: ConfigSyncConnection | null): Promise<AppSettingsFileV1> {
    return this.runExclusive(async () => {
      const current = await this.loadOrCreate();
      const next: AppSettingsFileV1 = { ...current, syncConnection: connection };
      await this.persist(next);
      return structuredClone(next);
    });
  }

  async setStatus(status: ConfigSyncStatus): Promise<AppSettingsFileV1> {
    return this.runExclusive(async () => {
      const current = await this.loadOrCreate();
      const next: AppSettingsFileV1 = { ...current, lastSync: status };
      await this.persist(next);
      return structuredClone(next);
    });
  }

  async replacePortable(
    portable: AppSettingsFileV1['portable'],
    status?: ConfigSyncStatus,
  ): Promise<AppSettingsFileV1> {
    return this.runExclusive(async () => {
      const current = await this.loadOrCreate();
      const next: AppSettingsFileV1 = {
        ...current,
        portable,
        lastSync: status ?? current.lastSync,
      };
      await this.persist(next);
      return structuredClone(next);
    });
  }

  private async loadOrCreate(): Promise<AppSettingsFileV1> {
    if (this.cached !== null) return this.cached;
    await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 });
    if (!(await pathExists(this.settingsPath))) {
      const created = createDefaultSettings(this.options.deviceId(), this.options.systemLocale);
      await this.persist(created);
      return created;
    }

    try {
      const metadata = await stat(this.settingsPath);
      if (metadata.size > MAX_SETTINGS_BYTES) throw new Error('settings file exceeds size limit');
      const parsed: unknown = JSON.parse(await readFile(this.settingsPath, 'utf8'));
      const decoded = decodeSettingsFile(parsed);
      this.cached = decoded;
      return decoded;
    } catch {
      await this.preserveCorruptFile();
      const recovered = createDefaultSettings(this.options.deviceId(), this.options.systemLocale);
      await this.persist(recovered);
      return recovered;
    }
  }

  private async preserveCorruptFile(): Promise<void> {
    const timestamp = this.options.now().replace(/[^0-9A-Za-z]/g, '-');
    let candidate = path.join(this.dataDirectory, `settings.corrupt-${timestamp}.json`);
    let suffix = 1;
    while (await pathExists(candidate)) {
      candidate = path.join(this.dataDirectory, `settings.corrupt-${timestamp}-${suffix}.json`);
      suffix += 1;
    }
    await rename(this.settingsPath, candidate);
  }

  private async persist(settings: AppSettingsFileV1, signal?: AbortSignal): Promise<void> {
    const validated = decodeSettingsFile(settings);
    await atomicWritePrivateFile(this.settingsPath, `${JSON.stringify(validated, null, 2)}\n`, signal);
    this.cached = validated;
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release: (() => void) | undefined;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
    }
  }
}
