import {
  access,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { atomicWritePrivateFile } from './atomic-file';

export const APP_ID = 'luna';
export const APP_PRODUCT_NAME = 'Luna';
export const DATA_DIRECTORY_NAME = 'luna';
export const DATABASE_FILE_NAME = 'luna.sqlite';
export const SETTINGS_FILE_NAME = 'settings.json';
export const SECRETS_FILE_NAME = 'config-sync-secrets.json';
export const LOCATION_POINTER_FILE_NAME = '.luna-location-v1.json';
export const LOCATION_POINTER_SCHEMA_VERSION = 1 as const;
export const LEGACY_APP_ID = 'luna-ledger';
export const LEGACY_DATABASE_FILE_NAME = 'luna-ledger.sqlite';

const SQLITE_FILE_SUFFIXES = ['', '-wal', '-shm', '-journal'] as const;
const MAX_LOCATION_PATH_LENGTH = 4096;
const MAX_LOCATION_SELECTION_ATTEMPTS = 5;

export type InitialDirectoryChoice = 'create-default' | 'choose-other' | 'cancel';

export type AppPathErrorCode =
  | 'invalid-pointer'
  | 'invalid-directory'
  | 'directory-unavailable'
  | 'migration-failed';

export class AppPathError extends Error {
  readonly code: AppPathErrorCode;

  constructor(code: AppPathErrorCode, message: string) {
    super(message);
    this.name = 'AppPathError';
    this.code = code;
  }
}

export interface AppPathPrompt {
  chooseInitialAction(): Promise<InitialDirectoryChoice>;
  chooseDirectory(): Promise<string | null>;
  showRecoverableError(code: AppPathErrorCode): Promise<void>;
}

export interface AppPathOptions {
  platform?: NodeJS.Platform | string;
  homeDirectory?: string;
  /** Electron's platform-specific userData path, used outside Linux. */
  electronUserDataDirectory?: string;
  /** Whether the default directory existed before Electron startup. */
  defaultDirectoryExistedAtLaunch?: boolean;
  /** Override legacy locations in tests or an embedding runtime. */
  legacyDataDirectories?: readonly string[];
  prompt: AppPathPrompt;
}

export interface AppDataPaths {
  directory: string;
  databasePath: string;
  settingsPath: string;
  secretsPath: string;
  locationPointerPath: string;
}

interface LocationPointerV1 {
  schemaVersion: typeof LOCATION_POINTER_SCHEMA_VERSION;
  path: string;
}

interface DirectoryStats {
  isDirectory(): boolean;
}

interface AppPathFileSystem {
  access(filePath: string, mode?: number): Promise<void>;
  mkdir(directory: string, options: { recursive: true; mode: number }): Promise<void>;
  readFile(filePath: string, encoding: 'utf8'): Promise<string>;
  realpath(filePath: string): Promise<string>;
  rename(source: string, destination: string): Promise<void>;
  stat(filePath: string): Promise<DirectoryStats>;
  unlink(filePath: string): Promise<void>;
}

const fileSystem: AppPathFileSystem = {
  access,
  mkdir: async (directory, options) => {
    await mkdir(directory, options);
  },
  readFile: async (filePath, encoding) => readFile(filePath, encoding),
  realpath,
  rename,
  stat,
  unlink,
};

/** Resolve the product's data root without treating `~` as a literal path. */
export function resolveDefaultDataDirectory(options: {
  platform?: NodeJS.Platform | string;
  homeDirectory?: string;
  electronUserDataDirectory?: string;
} = {}): string {
  const platform = options.platform ?? process.platform;
  const homeDirectory = path.resolve(options.homeDirectory ?? homedir());
  if (platform === 'linux') return path.join(homeDirectory, '.config', DATA_DIRECTORY_NAME);
  if (options.electronUserDataDirectory !== undefined) {
    return normalizeAbsolutePath(options.electronUserDataDirectory, 'userData directory');
  }
  return path.join(homeDirectory, DATA_DIRECTORY_NAME);
}

export function appDataPaths(directory: string): AppDataPaths {
  const normalizedDirectory = normalizeAbsolutePath(directory, 'data directory');
  return {
    directory: normalizedDirectory,
    databasePath: path.join(normalizedDirectory, DATABASE_FILE_NAME),
    settingsPath: path.join(normalizedDirectory, SETTINGS_FILE_NAME),
    secretsPath: path.join(normalizedDirectory, SECRETS_FILE_NAME),
    locationPointerPath: locationPointerPath(normalizedDirectory),
  };
}

export function locationPointerPath(defaultDirectory: string): string {
  return path.join(
    normalizeAbsolutePath(defaultDirectory, 'default data directory'),
    LOCATION_POINTER_FILE_NAME,
  );
}

export function databaseArtifactPaths(directory: string): string[] {
  const normalizedDirectory = normalizeAbsolutePath(directory, 'data directory');
  return SQLITE_FILE_SUFFIXES.map((suffix) =>
    path.join(normalizedDirectory, `${DATABASE_FILE_NAME}${suffix}`),
  );
}

/** Remove only the active SQLite database and its sidecars. */
export async function clearDatabaseArtifacts(directory: string): Promise<void> {
  for (const databasePath of databaseArtifactPaths(directory)) {
    await fileSystem.unlink(databasePath).catch((error: unknown) => {
      if (!isMissingFileError(error)) throw error;
    });
  }
}

/**
 * Resolve the directory before opening SQLite or creating settings/secrets.
 * A null result means the user cancelled and the caller must quit without
 * initializing any application storage.
 */
export async function resolveActiveDataDirectory(options: AppPathOptions): Promise<string | null> {
  const defaultDirectory = resolveDefaultDataDirectory(options);
  const pointerPath = locationPointerPath(defaultDirectory);

  let pointer: LocationPointerV1 | null;
  try {
    pointer = await readLocationPointer(pointerPath);
  } catch {
    await options.prompt.showRecoverableError('invalid-pointer');
    await preserveInvalidPointer(pointerPath);
    return chooseAndRememberDirectory(defaultDirectory, options.prompt);
  }
  if (pointer !== null) {
    try {
      return await validateExistingDirectory(pointer.path);
    } catch (error) {
      await options.prompt.showRecoverableError('invalid-pointer');
      await preserveInvalidPointer(pointerPath);
      return chooseAndRememberDirectory(defaultDirectory, options.prompt);
    }
  }

  try {
    await migrateLegacyData(defaultDirectory, options);
  } catch (error) {
    const code = error instanceof AppPathError ? error.code : 'migration-failed';
    await options.prompt.showRecoverableError(code);
    return chooseAndRememberDirectory(defaultDirectory, options.prompt);
  }

  let migratedPointer: LocationPointerV1 | null;
  try {
    migratedPointer = await readLocationPointer(pointerPath);
  } catch {
    await options.prompt.showRecoverableError('invalid-pointer');
    await preserveInvalidPointer(pointerPath);
    return chooseAndRememberDirectory(defaultDirectory, options.prompt);
  }
  if (migratedPointer !== null) {
    try {
      return await validateExistingDirectory(migratedPointer.path);
    } catch {
      await options.prompt.showRecoverableError('invalid-pointer');
      await preserveInvalidPointer(pointerPath);
      return chooseAndRememberDirectory(defaultDirectory, options.prompt);
    }
  }

  const defaultState = await inspectPath(defaultDirectory);
  if (
    defaultState === 'directory' &&
    (options.defaultDirectoryExistedAtLaunch !== false || await hasApplicationData(defaultDirectory))
  ) {
    return normalizeAbsolutePath(defaultDirectory, 'default data directory');
  }
  if (defaultState === 'file' || defaultState === 'unavailable' || defaultState === 'not-directory') {
    await options.prompt.showRecoverableError('directory-unavailable');
    return chooseAndRememberDirectory(defaultDirectory, options.prompt);
  }

  const initialChoice = await options.prompt.chooseInitialAction();
  if (initialChoice === 'cancel') return null;
  if (initialChoice === 'create-default') {
    try {
      await ensureDirectory(defaultDirectory);
      return normalizeAbsolutePath(defaultDirectory, 'default data directory');
    } catch {
      await options.prompt.showRecoverableError('directory-unavailable');
      return chooseAndRememberDirectory(defaultDirectory, options.prompt);
    }
  }
  return chooseAndRememberDirectory(defaultDirectory, options.prompt);
}

export function decodeLocationPointer(value: unknown): LocationPointerV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AppPathError('invalid-pointer', 'The saved Luna location is invalid.');
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    record.schemaVersion !== LOCATION_POINTER_SCHEMA_VERSION ||
    typeof record.path !== 'string'
  ) {
    throw new AppPathError('invalid-pointer', 'The saved Luna location is invalid.');
  }
  return {
    schemaVersion: LOCATION_POINTER_SCHEMA_VERSION,
    path: normalizeAbsolutePath(record.path, 'saved location'),
  };
}

function normalizeAbsolutePath(value: string, label: string): string {
  if (
    value.length === 0 ||
    value.length > MAX_LOCATION_PATH_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    /^(?:file|https?):/iu.test(value) ||
    !path.isAbsolute(value)
  ) {
    throw new AppPathError('invalid-directory', `${label} must be a local absolute directory.`);
  }
  return path.normalize(path.resolve(value));
}

async function readLocationPointer(pointerPath: string): Promise<LocationPointerV1 | null> {
  const state = await inspectPath(pointerPath);
  if (state === 'missing') return null;
  if (state !== 'file') {
    throw new AppPathError('invalid-pointer', 'The saved Luna location is invalid.');
  }
  try {
    return decodeLocationPointer(JSON.parse(await fileSystem.readFile(pointerPath, 'utf8')) as unknown);
  } catch (error) {
    if (error instanceof AppPathError) throw error;
    throw new AppPathError('invalid-pointer', 'The saved Luna location is invalid.');
  }
}

async function validateExistingDirectory(directory: string): Promise<string> {
  let normalized: string;
  try {
    normalized = normalizeAbsolutePath(directory, 'saved location');
  } catch {
    throw new AppPathError('invalid-pointer', 'The saved Luna location is invalid.');
  }
  const state = await inspectPath(normalized);
  if (state !== 'directory') {
    throw new AppPathError('invalid-pointer', 'The saved Luna location is unavailable.');
  }
  try {
    return normalizeAbsolutePath(await fileSystem.realpath(normalized), 'saved location');
  } catch {
    throw new AppPathError('invalid-pointer', 'The saved Luna location is unavailable.');
  }
}

async function chooseAndRememberDirectory(
  defaultDirectory: string,
  prompt: AppPathPrompt,
): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_LOCATION_SELECTION_ATTEMPTS; attempt += 1) {
    const selected = await prompt.chooseDirectory();
    if (selected === null) return null;
    try {
      const normalized = normalizeAbsolutePath(selected, 'selected location');
      await ensureDirectory(normalized);
      const resolved = await validateSelectedDirectory(normalized);
      if (resolved !== normalizeAbsolutePath(defaultDirectory, 'default data directory')) {
        await ensureDirectory(defaultDirectory);
        await writeLocationPointer(locationPointerPath(defaultDirectory), resolved);
      }
      return resolved;
    } catch {
      await prompt.showRecoverableError('invalid-directory');
    }
  }
  return null;
}

async function validateSelectedDirectory(directory: string): Promise<string> {
  const state = await inspectPath(directory);
  if (state !== 'directory') {
    throw new AppPathError('invalid-directory', 'The selected location is not a local directory.');
  }
  try {
    return normalizeAbsolutePath(await fileSystem.realpath(directory), 'selected location');
  } catch {
    throw new AppPathError('invalid-directory', 'The selected location is unavailable.');
  }
}

async function writeLocationPointer(pointerPath: string, targetDirectory: string): Promise<void> {
  const pointer: LocationPointerV1 = {
    schemaVersion: LOCATION_POINTER_SCHEMA_VERSION,
    path: normalizeAbsolutePath(targetDirectory, 'selected location'),
  };
  await atomicWritePrivateFile(pointerPath, `${JSON.stringify(pointer, null, 2)}\n`);
}

async function ensureDirectory(directory: string): Promise<void> {
  try {
    await fileSystem.mkdir(normalizeAbsolutePath(directory, 'data directory'), {
      recursive: true,
      mode: 0o700,
    });
  } catch {
    throw new AppPathError('directory-unavailable', 'The local data directory is unavailable.');
  }
}

async function hasApplicationData(directory: string): Promise<boolean> {
  const knownFiles = new Set([
    SETTINGS_FILE_NAME,
    SECRETS_FILE_NAME,
    ...databaseFileNames(DATABASE_FILE_NAME),
    ...databaseFileNames(LEGACY_DATABASE_FILE_NAME),
  ]);
  for (const fileName of knownFiles) {
    const state = await inspectPath(path.join(directory, fileName));
    if (state === 'file' || state === 'directory') return true;
  }
  return false;
}

async function migrateLegacyData(defaultDirectory: string, options: AppPathOptions): Promise<void> {
  const defaultState = await inspectPath(defaultDirectory);
  if (defaultState === 'file' || defaultState === 'not-directory' || defaultState === 'unavailable') return;
  if (defaultState === 'directory' && await hasApplicationData(defaultDirectory)) return;

  const legacyDirectories = options.legacyDataDirectories ?? defaultLegacyDataDirectories(options);
  for (const legacyDirectoryValue of legacyDirectories) {
    let legacyDirectory: string;
    try {
      legacyDirectory = normalizeAbsolutePath(legacyDirectoryValue, 'legacy data directory');
    } catch {
      continue;
    }
    if (legacyDirectory === normalizeAbsolutePath(defaultDirectory, 'default data directory')) continue;
    const legacyState = await inspectPath(legacyDirectory);
    if (legacyState !== 'directory' || !(await hasLegacyApplicationData(legacyDirectory))) continue;
    await moveLegacyFiles(legacyDirectory, defaultDirectory);
    return;
  }
}

function defaultLegacyDataDirectories(options: AppPathOptions): string[] {
  const homeDirectory = path.resolve(options.homeDirectory ?? homedir());
  if (options.platform === 'linux' || (options.platform === undefined && process.platform === 'linux')) {
    return [path.join(homeDirectory, '.config', LEGACY_APP_ID, LEGACY_APP_ID)];
  }
  if (options.electronUserDataDirectory === undefined) return [];
  return [
    path.join(path.dirname(options.electronUserDataDirectory), LEGACY_APP_ID, LEGACY_APP_ID),
  ];
}

async function hasLegacyApplicationData(directory: string): Promise<boolean> {
  const knownFiles = new Set([
    LOCATION_POINTER_FILE_NAME,
    SETTINGS_FILE_NAME,
    SECRETS_FILE_NAME,
    ...databaseFileNames(DATABASE_FILE_NAME),
    ...databaseFileNames(LEGACY_DATABASE_FILE_NAME),
  ]);
  for (const fileName of knownFiles) {
    if ((await inspectPath(path.join(directory, fileName))) === 'file') return true;
  }
  return false;
}

async function moveLegacyFiles(legacyDirectory: string, defaultDirectory: string): Promise<void> {
  const filesToMove: Array<{ source: string; destination: string }> = [];
  for (const sourceName of [
    LOCATION_POINTER_FILE_NAME,
    SETTINGS_FILE_NAME,
    SECRETS_FILE_NAME,
    ...databaseFileNames(DATABASE_FILE_NAME),
    ...databaseFileNames(LEGACY_DATABASE_FILE_NAME),
  ]) {
    if ((await inspectPath(path.join(legacyDirectory, sourceName))) !== 'file') continue;
    const destinationName = sourceName.startsWith(LEGACY_DATABASE_FILE_NAME)
      ? `${DATABASE_FILE_NAME}${sourceName.slice(LEGACY_DATABASE_FILE_NAME.length)}`
      : sourceName;
    filesToMove.push({
      source: path.join(legacyDirectory, sourceName),
      destination: path.join(defaultDirectory, destinationName),
    });
  }
  if (filesToMove.length === 0) return;

  const movableFiles: Array<{ source: string; destination: string }> = [];
  const reservedDestinations = new Set<string>();
  for (const file of filesToMove) {
    // Existing new-format files win; migration must never overwrite them.
    // Reserve a destination during this preflight too, because legacy and
    // current SQLite names intentionally map to the same new filename.
    if (reservedDestinations.has(file.destination)) continue;
    if ((await inspectPath(file.destination)) === 'missing') {
      movableFiles.push(file);
      reservedDestinations.add(file.destination);
    }
  }
  if (movableFiles.length === 0) return;
  try {
    await ensureDirectory(defaultDirectory);
    for (const file of movableFiles) await fileSystem.rename(file.source, file.destination);
  } catch {
    throw new AppPathError('migration-failed', 'Luna could not migrate its existing local data.');
  }
}

function databaseFileNames(databaseName: string): string[] {
  return SQLITE_FILE_SUFFIXES.map((suffix) => `${databaseName}${suffix}`);
}

async function preserveInvalidPointer(pointerPath: string): Promise<void> {
  if ((await inspectPath(pointerPath)) !== 'file') return;
  const directory = path.dirname(pointerPath);
  const baseName = `${LOCATION_POINTER_FILE_NAME}.corrupt`;
  let candidate = path.join(directory, `${baseName}.json`);
  for (let suffix = 1; (await inspectPath(candidate)) !== 'missing'; suffix += 1) {
    candidate = path.join(directory, `${baseName}-${suffix}.json`);
  }
  await fileSystem.rename(pointerPath, candidate).catch(() => undefined);
}

type PathState = 'missing' | 'file' | 'directory' | 'not-directory' | 'unavailable';

async function inspectPath(filePath: string): Promise<PathState> {
  try {
    const metadata = await fileSystem.stat(filePath);
    return metadata.isDirectory() ? 'directory' : 'file';
  } catch (error) {
    if (isMissingFileError(error)) return 'missing';
    if (isNotDirectoryError(error)) return 'not-directory';
    return 'unavailable';
  }
}

function isMissingFileError(error: unknown): boolean {
  return hasFileSystemCode(error, 'ENOENT');
}

function isNotDirectoryError(error: unknown): boolean {
  return hasFileSystemCode(error, 'ENOTDIR');
}

function hasFileSystemCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
