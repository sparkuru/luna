export const SETTINGS_SCHEMA_VERSION = 1 as const;
export const REMOTE_SETTINGS_SCHEMA_VERSION = 1 as const;
export const SUPPORTED_LOCALES = ['zh-CN', 'en'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const LEDGER_SYNC_MODES = ['automatic', 'manual'] as const;
export type LedgerSyncMode = (typeof LEDGER_SYNC_MODES)[number];

export interface Revisioned<T> {
  value: T;
  updatedAt: string;
}

export interface PortableSettings {
  locale: Revisioned<AppLocale>;
  hideSensitiveAmountsByDefault: Revisioned<boolean>;
}

export interface ConfigSyncConnection {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  forcePathStyle: boolean;
}

export const CONFIG_SYNC_STATUS_CODES = [
  'never',
  'disabled',
  'syncing',
  'synced',
  'connection-ok',
  'missing-connection',
  'missing-secrets',
  'secret-storage-unavailable',
  'authentication',
  'permission',
  'network',
  'transient',
  'remote-not-found',
  'conflict',
  'wrong-password-or-tampered',
  'invalid-remote-config',
  'unsupported-version',
  'operation-failed',
] as const;

export type ConfigSyncStatusCode = (typeof CONFIG_SYNC_STATUS_CODES)[number];

export interface ConfigSyncStatus {
  code: ConfigSyncStatusCode;
  updatedAt: string | null;
  etag: string | null;
}

export interface AppSettingsFileV1 {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  deviceId: string;
  syncAllPortableSettings: boolean;
  ledgerSyncMode: LedgerSyncMode;
  portable: PortableSettings;
  syncConnection: ConfigSyncConnection | null;
  lastSync: ConfigSyncStatus;
}

export type SecretPersistence = 'secure' | 'session-only' | 'unavailable';

/** Renderer-safe projection. It intentionally contains no path, credential, or passphrase. */
export interface RendererSettings {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  locale: AppLocale;
  hideSensitiveAmountsByDefault: boolean;
  /** Whether this host supports the portable-settings encrypted sync protocol. */
  configSyncAvailable: boolean;
  syncAllPortableSettings: boolean;
  ledgerSyncMode: LedgerSyncMode;
  syncConnection: ConfigSyncConnection | null;
  lastSync: Pick<ConfigSyncStatus, 'code' | 'updatedAt'>;
  hasConfigSyncSecrets: boolean;
  secretPersistence: SecretPersistence;
}

export interface SettingsUpdateInput {
  locale?: AppLocale;
  hideSensitiveAmountsByDefault?: boolean;
  syncAllPortableSettings?: boolean;
  ledgerSyncMode?: LedgerSyncMode;
}

export interface ConfigSyncCredentialsInput {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  passphrase: string;
}

export interface ConfigureConfigSyncInput {
  connection: ConfigSyncConnection;
  credentials: ConfigSyncCredentialsInput;
  rememberSecrets: boolean;
}

export interface ConfigSyncActionResult {
  settings: RendererSettings;
  code: ConfigSyncStatusCode;
}

export interface RemotePortablePayloadV1 {
  schemaVersion: typeof REMOTE_SETTINGS_SCHEMA_VERSION;
  portable: PortableSettings;
  /** Unknown fields are retained only for remote round trips and never applied locally. */
  unknownTopLevel: Readonly<Record<string, unknown>>;
  unknownPortable: Readonly<Record<string, unknown>>;
}

const INITIAL_REVISION_TIME = '1970-01-01T00:00:00.000Z';
const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const BUCKET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]{1,61}[A-Za-z0-9]$/;

export class SettingsDecodeError extends Error {
  readonly code: 'invalid-settings' | 'unsupported-version';

  constructor(code: 'invalid-settings' | 'unsupported-version', message: string) {
    super(message);
    this.name = 'SettingsDecodeError';
    this.code = code;
  }
}

export function resolveLocale(systemLocale: string): AppLocale {
  return systemLocale.toLowerCase().startsWith('en') ? 'en' : 'zh-CN';
}

export function createDefaultSettings(deviceId: string, systemLocale: string): AppSettingsFileV1 {
  const validatedDeviceId = decodeDeviceId(deviceId);
  const locale = resolveLocale(systemLocale);
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    deviceId: validatedDeviceId,
    syncAllPortableSettings: false,
    ledgerSyncMode: 'automatic',
    portable: {
      locale: { value: locale, updatedAt: INITIAL_REVISION_TIME },
      hideSensitiveAmountsByDefault: {
        value: true,
        updatedAt: INITIAL_REVISION_TIME,
      },
    },
    syncConnection: null,
    lastSync: { code: 'never', updatedAt: null, etag: null },
  };
}

export function decodeSettingsFile(value: unknown): AppSettingsFileV1 {
  const record = readRecord(value, 'settings');
  assertAllowedKeys(record, [
    'schemaVersion',
    'deviceId',
    'syncAllPortableSettings',
    'ledgerSyncMode',
    'portable',
    'syncConnection',
    'lastSync',
  ], 'settings');
  for (const key of [
    'schemaVersion',
    'deviceId',
    'syncAllPortableSettings',
    'portable',
    'syncConnection',
    'lastSync',
  ]) {
    if (!(key in record)) {
      throw new SettingsDecodeError('invalid-settings', `settings is missing ${key}.`);
    }
  }
  if (record.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
    throw new SettingsDecodeError('unsupported-version', 'Unsupported settings schema version.');
  }
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    deviceId: decodeDeviceId(record.deviceId),
    syncAllPortableSettings: readBoolean(record.syncAllPortableSettings, 'syncAllPortableSettings'),
    ledgerSyncMode:
      record.ledgerSyncMode === undefined
        ? 'automatic'
        : decodeLedgerSyncMode(record.ledgerSyncMode),
    portable: decodePortableSettings(record.portable, true),
    syncConnection: record.syncConnection === null ? null : decodeConfigSyncConnection(record.syncConnection),
    lastSync: decodeSyncStatus(record.lastSync),
  };
}

export function decodeSettingsUpdate(value: unknown): SettingsUpdateInput {
  const record = readRecord(value, 'settings update');
  assertAllowedKeys(record, [
    'locale',
    'hideSensitiveAmountsByDefault',
    'syncAllPortableSettings',
    'ledgerSyncMode',
  ], 'settings update');
  const result: SettingsUpdateInput = {};
  if ('locale' in record) result.locale = decodeLocale(record.locale);
  if ('hideSensitiveAmountsByDefault' in record) {
    result.hideSensitiveAmountsByDefault = readBoolean(
      record.hideSensitiveAmountsByDefault,
      'hideSensitiveAmountsByDefault',
    );
  }
  if ('syncAllPortableSettings' in record) {
    result.syncAllPortableSettings = readBoolean(
      record.syncAllPortableSettings,
      'syncAllPortableSettings',
    );
  }
  if ('ledgerSyncMode' in record)
    result.ledgerSyncMode = decodeLedgerSyncMode(record.ledgerSyncMode);
  if (Object.keys(result).length === 0) {
    throw new SettingsDecodeError('invalid-settings', 'Settings update must contain a supported field.');
  }
  return result;
}

export function decodeConfigureConfigSync(value: unknown): ConfigureConfigSyncInput {
  const record = readRecord(value, 'config sync setup');
  assertExactKeys(record, ['connection', 'credentials', 'rememberSecrets'], 'config sync setup');
  return {
    connection: decodeConfigSyncConnection(record.connection),
    credentials: decodeConfigSyncCredentials(record.credentials),
    rememberSecrets: readBoolean(record.rememberSecrets, 'rememberSecrets'),
  };
}

export function decodeConfigSyncConnection(value: unknown): ConfigSyncConnection {
  const record = readRecord(value, 'sync connection');
  assertExactKeys(
    record,
    ['endpoint', 'region', 'bucket', 'prefix', 'forcePathStyle'],
    'sync connection',
  );
  const endpointText = readBoundedString(record.endpoint, 'endpoint', 1, 2048);
  let endpoint: URL;
  try {
    endpoint = new URL(endpointText);
  } catch {
    throw new SettingsDecodeError('invalid-settings', 'Endpoint must be a valid HTTP or HTTPS URL.');
  }
  if (
    (endpoint.protocol !== 'https:' && endpoint.protocol !== 'http:') ||
    endpoint.username.length > 0 ||
    endpoint.password.length > 0 ||
    endpoint.search.length > 0 ||
    endpoint.hash.length > 0
  ) {
    throw new SettingsDecodeError(
      'invalid-settings',
      'Endpoint must be an HTTP(S) URL without credentials, query, or fragment.',
    );
  }
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '');
  const region = readBoundedString(record.region, 'region', 1, 100).trim();
  const bucket = readBoundedString(record.bucket, 'bucket', 3, 63).trim();
  if (!BUCKET_PATTERN.test(bucket) || bucket.includes('..')) {
    throw new SettingsDecodeError('invalid-settings', 'Bucket name is invalid.');
  }
  return {
    endpoint: endpoint.toString().replace(/\/$/, ''),
    region,
    bucket,
    prefix: normalizePrefix(readBoundedString(record.prefix, 'prefix', 0, 512)),
    forcePathStyle: readBoolean(record.forcePathStyle, 'forcePathStyle'),
  };
}

export function decodeRemotePortablePayload(value: unknown): RemotePortablePayloadV1 {
  const record = readRecord(value, 'remote settings payload');
  if (record.schemaVersion !== REMOTE_SETTINGS_SCHEMA_VERSION) {
    throw new SettingsDecodeError('unsupported-version', 'Unsupported remote settings schema version.');
  }
  const portableRecord = readRecord(record.portable, 'remote portable settings');
  const unknownTopLevel = omitKeys(record, ['schemaVersion', 'portable']);
  const unknownPortable = omitKeys(portableRecord, ['locale', 'hideSensitiveAmountsByDefault']);
  return {
    schemaVersion: REMOTE_SETTINGS_SCHEMA_VERSION,
    portable: decodePortableSettings(portableRecord, false),
    unknownTopLevel,
    unknownPortable,
  };
}

export function encodeRemotePortablePayload(payload: RemotePortablePayloadV1): Record<string, unknown> {
  return {
    ...payload.unknownTopLevel,
    schemaVersion: REMOTE_SETTINGS_SCHEMA_VERSION,
    portable: {
      ...payload.unknownPortable,
      locale: payload.portable.locale,
      hideSensitiveAmountsByDefault: payload.portable.hideSensitiveAmountsByDefault,
    },
  };
}

export function remotePayloadFromSettings(settings: AppSettingsFileV1): RemotePortablePayloadV1 {
  return {
    schemaVersion: REMOTE_SETTINGS_SCHEMA_VERSION,
    portable: settings.portable,
    unknownTopLevel: {},
    unknownPortable: {},
  };
}

export function mergePortableSettings(
  left: PortableSettings,
  right: PortableSettings,
): PortableSettings {
  return {
    locale: laterRevision(left.locale, right.locale),
    hideSensitiveAmountsByDefault: laterRevision(
      left.hideSensitiveAmountsByDefault,
      right.hideSensitiveAmountsByDefault,
    ),
  };
}

export function portableSettingsEqual(left: PortableSettings, right: PortableSettings): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function applySettingsUpdate(
  current: AppSettingsFileV1,
  update: SettingsUpdateInput,
  now: string,
): AppSettingsFileV1 {
  const requestedAt = decodeTimestamp(now, 'updatedAt');
  const portable: PortableSettings = { ...current.portable };
  if (update.locale !== undefined && update.locale !== current.portable.locale.value) {
    portable.locale = {
      value: update.locale,
      updatedAt: nextRevisionTime(requestedAt, current.portable.locale.updatedAt),
    };
  }
  if (
    update.hideSensitiveAmountsByDefault !== undefined &&
    update.hideSensitiveAmountsByDefault !== current.portable.hideSensitiveAmountsByDefault.value
  ) {
    portable.hideSensitiveAmountsByDefault = {
      value: update.hideSensitiveAmountsByDefault,
      updatedAt: nextRevisionTime(
        requestedAt,
        current.portable.hideSensitiveAmountsByDefault.updatedAt,
      ),
    };
  }
  return {
    ...current,
    portable,
    syncAllPortableSettings:
      update.syncAllPortableSettings ?? current.syncAllPortableSettings,
    ledgerSyncMode: update.ledgerSyncMode ?? current.ledgerSyncMode,
  };
}

export function settingsToRenderer(
  settings: AppSettingsFileV1,
  hasConfigSyncSecrets: boolean,
  secretPersistence: SecretPersistence,
  configSyncAvailable = true,
): RendererSettings {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    locale: settings.portable.locale.value,
    hideSensitiveAmountsByDefault: settings.portable.hideSensitiveAmountsByDefault.value,
    configSyncAvailable,
    syncAllPortableSettings: settings.syncAllPortableSettings,
    ledgerSyncMode: settings.ledgerSyncMode,
    syncConnection: settings.syncConnection,
    lastSync: {
      code: settings.lastSync.code,
      updatedAt: settings.lastSync.updatedAt,
    },
    hasConfigSyncSecrets,
    secretPersistence,
  };
}

export function configObjectKey(prefix: string): string {
  const normalized = normalizePrefix(prefix);
  return normalized.length === 0
    ? 'config/v1/settings.enc.json'
    : `${normalized}/config/v1/settings.enc.json`;
}

function decodePortableSettings(value: unknown, exact: boolean): PortableSettings {
  const record = readRecord(value, 'portable settings');
  if (exact) {
    assertExactKeys(record, ['locale', 'hideSensitiveAmountsByDefault'], 'portable settings');
  }
  return {
    locale: decodeRevision(record.locale, decodeLocale, 'locale'),
    hideSensitiveAmountsByDefault: decodeRevision(
      record.hideSensitiveAmountsByDefault,
      (field) => readBoolean(field, 'hideSensitiveAmountsByDefault.value'),
      'hideSensitiveAmountsByDefault',
    ),
  };
}

function decodeRevision<T>(
  value: unknown,
  decodeValue: (value: unknown) => T,
  label: string,
): Revisioned<T> {
  const record = readRecord(value, `${label} revision`);
  assertExactKeys(record, ['value', 'updatedAt'], `${label} revision`);
  return {
    value: decodeValue(record.value),
    updatedAt: decodeTimestamp(record.updatedAt, `${label}.updatedAt`),
  };
}

function decodeSyncStatus(value: unknown): ConfigSyncStatus {
  const record = readRecord(value, 'sync status');
  assertExactKeys(record, ['code', 'updatedAt', 'etag'], 'sync status');
  if (!CONFIG_SYNC_STATUS_CODES.includes(record.code as ConfigSyncStatusCode)) {
    throw new SettingsDecodeError('invalid-settings', 'Sync status code is invalid.');
  }
  return {
    code: record.code as ConfigSyncStatusCode,
    updatedAt: record.updatedAt === null ? null : decodeTimestamp(record.updatedAt, 'lastSync.updatedAt'),
    etag: record.etag === null ? null : readBoundedString(record.etag, 'lastSync.etag', 1, 1024),
  };
}

export function decodeConfigSyncCredentials(value: unknown): ConfigSyncCredentialsInput {
  const record = readRecord(value, 'config sync credentials');
  assertAllowedKeys(record, ['accessKeyId', 'secretAccessKey', 'sessionToken', 'passphrase'], 'config sync credentials');
  const credentials: ConfigSyncCredentialsInput = {
    accessKeyId: readBoundedString(record.accessKeyId, 'accessKeyId', 1, 512),
    secretAccessKey: readBoundedString(record.secretAccessKey, 'secretAccessKey', 1, 2048),
    passphrase: readBoundedString(record.passphrase, 'passphrase', 8, 1024),
  };
  if (record.sessionToken !== undefined && record.sessionToken !== '') {
    credentials.sessionToken = readBoundedString(record.sessionToken, 'sessionToken', 1, 8192);
  }
  return credentials;
}

function laterRevision<T>(left: Revisioned<T>, right: Revisioned<T>): Revisioned<T> {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? left : right;
  return JSON.stringify(left.value) >= JSON.stringify(right.value) ? left : right;
}

function nextRevisionTime(requestedAt: string, previousAt: string): string {
  if (requestedAt > previousAt) return requestedAt;
  return new Date(new Date(previousAt).getTime() + 1).toISOString();
}

function decodeLocale(value: unknown): AppLocale {
  if (value !== 'zh-CN' && value !== 'en') {
    throw new SettingsDecodeError('invalid-settings', 'Locale must be zh-CN or en.');
  }
  return value;
}

export function decodeLedgerSyncMode(value: unknown): LedgerSyncMode {
  if (!LEDGER_SYNC_MODES.includes(value as LedgerSyncMode)) {
    throw new SettingsDecodeError('invalid-settings', 'Ledger sync mode is invalid.');
  }
  return value as LedgerSyncMode;
}

function decodeDeviceId(value: unknown): string {
  if (typeof value !== 'string' || !DEVICE_ID_PATTERN.test(value)) {
    throw new SettingsDecodeError('invalid-settings', 'Device identifier is invalid.');
  }
  return value;
}

function decodeTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > 40) {
    throw new SettingsDecodeError('invalid-settings', `${label} must be an ISO timestamp.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new SettingsDecodeError('invalid-settings', `${label} must be an ISO timestamp.`);
  }
  return value;
}

function normalizePrefix(value: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  if (/[\u0000-\u001f\u007f\\]/.test(normalized) || normalized.split('/').includes('..')) {
    throw new SettingsDecodeError('invalid-settings', 'Prefix contains an unsafe path segment.');
  }
  return normalized;
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SettingsDecodeError('invalid-settings', `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new SettingsDecodeError('invalid-settings', `${label} must be a boolean.`);
  }
  return value;
}

function readBoundedString(
  value: unknown,
  label: string,
  minimumLength: number,
  maximumLength: number,
): string {
  if (typeof value !== 'string' || value.length < minimumLength || value.length > maximumLength) {
    throw new SettingsDecodeError('invalid-settings', `${label} has an invalid length.`);
  }
  return value;
}

function assertExactKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  assertAllowedKeys(record, keys, label);
  for (const key of keys) {
    if (!(key in record)) {
      throw new SettingsDecodeError('invalid-settings', `${label} is missing ${key}.`);
    }
  }
}

function assertAllowedKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  const unexpected = Object.keys(record).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    throw new SettingsDecodeError('invalid-settings', `${label} contains unsupported field ${unexpected}.`);
  }
}

function omitKeys(record: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const omitted = new Set(keys);
  return Object.fromEntries(Object.entries(record).filter(([key]) => !omitted.has(key)));
}
