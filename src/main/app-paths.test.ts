import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  AppPathError,
  AppPathPrompt,
  DATABASE_FILE_NAME,
  LEGACY_DATABASE_FILE_NAME,
  LOCATION_POINTER_FILE_NAME,
  LOCATION_POINTER_SCHEMA_VERSION,
  appDataPaths,
  clearDatabaseArtifacts,
  databaseArtifactPaths,
  decodeLocationPointer,
  locationPointerPath,
  resolveActiveDataDirectory,
  resolveDefaultDataDirectory,
} from './app-paths';

interface PromptScript {
  initial?: 'create-default' | 'choose-other' | 'cancel';
  directories?: Array<string | null>;
  recoverableCodes?: string[];
}

function createPrompt(script: PromptScript): AppPathPrompt {
  const directories = [...(script.directories ?? [])];
  const recoverableCodes = script.recoverableCodes ?? [];
  return {
    async chooseInitialAction() {
      return script.initial ?? 'cancel';
    },
    async chooseDirectory() {
      return directories.shift() ?? null;
    },
    async showRecoverableError(code) {
      recoverableCodes.push(code);
    },
  };
}

async function withTemporaryDirectory<T>(
  prefix: string,
  callback: (directory: string) => Promise<T> | T,
): Promise<T> {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  try {
    return await callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('Linux default data directory resolves from home and has no literal tilde', () => {
  const homeDirectory = path.join(tmpdir(), 'luna-path-home');
  const resolved = resolveDefaultDataDirectory({ platform: 'linux', homeDirectory });
  assert.equal(resolved, path.join(homeDirectory, '.config', 'luna'));
  assert.equal(resolved.includes('~'), false);
});

test('existing default application data enters directly without prompting', async () => {
  await withTemporaryDirectory('luna-app-path-existing-', async (homeDirectory) => {
    const defaultDirectory = path.join(homeDirectory, '.config', 'luna');
    mkdirSync(defaultDirectory, { recursive: true });
    writeFileSync(path.join(defaultDirectory, 'settings.json'), '{}', { mode: 0o600 });
    let prompted = false;
    const result = await resolveActiveDataDirectory({
      platform: 'linux',
      homeDirectory,
      prompt: {
        async chooseInitialAction() {
          prompted = true;
          return 'cancel';
        },
        async chooseDirectory() {
          prompted = true;
          return null;
        },
        async showRecoverableError() {
          prompted = true;
        },
      },
    });
    assert.equal(result, defaultDirectory);
    assert.equal(prompted, false);
  });
});

test('an existing empty default directory also enters directly without prompting', async () => {
  await withTemporaryDirectory('luna-app-path-empty-existing-', async (homeDirectory) => {
    const defaultDirectory = path.join(homeDirectory, '.config', 'luna');
    mkdirSync(defaultDirectory, { recursive: true });
    let prompted = false;
    const result = await resolveActiveDataDirectory({
      platform: 'linux',
      homeDirectory,
      prompt: {
        async chooseInitialAction() {
          prompted = true;
          return 'cancel';
        },
        async chooseDirectory() {
          prompted = true;
          return null;
        },
        async showRecoverableError() {
          prompted = true;
        },
      },
    });
    assert.equal(result, defaultDirectory);
    assert.equal(prompted, false);
  });
});

test('a directory created after launch is not mistaken for an existing default directory', async () => {
  await withTemporaryDirectory('luna-app-path-created-after-launch-', async (homeDirectory) => {
    const defaultDirectory = path.join(homeDirectory, '.config', 'luna');
    mkdirSync(defaultDirectory, { recursive: true });
    let prompted = false;
    const result = await resolveActiveDataDirectory({
      platform: 'linux',
      homeDirectory,
      defaultDirectoryExistedAtLaunch: false,
      prompt: {
        async chooseInitialAction() {
          prompted = true;
          return 'cancel';
        },
        async chooseDirectory() {
          prompted = true;
          return null;
        },
        async showRecoverableError() {
          prompted = true;
        },
      },
    });
    assert.equal(result, null);
    assert.equal(prompted, true);
  });
});

test('first launch can create the default directory without creating storage files', async () => {
  await withTemporaryDirectory('luna-app-path-create-', async (homeDirectory) => {
    const defaultDirectory = path.join(homeDirectory, '.config', 'luna');
    const result = await resolveActiveDataDirectory({
      platform: 'linux',
      homeDirectory,
      prompt: createPrompt({ initial: 'create-default' }),
    });
    assert.equal(result, defaultDirectory);
    assert.equal(statSync(defaultDirectory).isDirectory(), true);
    assert.equal(existsSync(path.join(defaultDirectory, 'settings.json')), false);
    assert.equal(existsSync(path.join(defaultDirectory, DATABASE_FILE_NAME)), false);
    assert.equal(existsSync(path.join(defaultDirectory, 'config-sync-secrets.json')), false);
  });
});

test('cancelling first launch leaves the default path and application files untouched', async () => {
  await withTemporaryDirectory('luna-app-path-cancel-', async (homeDirectory) => {
    const defaultDirectory = path.join(homeDirectory, '.config', 'luna');
    const result = await resolveActiveDataDirectory({
      platform: 'linux',
      homeDirectory,
      prompt: createPrompt({ initial: 'cancel' }),
    });
    assert.equal(result, null);
    assert.equal(existsSync(defaultDirectory), false);
    assert.equal(existsSync(path.join(defaultDirectory, 'settings.json')), false);
    assert.equal(existsSync(path.join(defaultDirectory, DATABASE_FILE_NAME)), false);
    assert.equal(existsSync(path.join(defaultDirectory, 'config-sync-secrets.json')), false);
  });
});

test('custom directory is remembered in a private versioned pointer and restored on restart', async () => {
  await withTemporaryDirectory('luna-app-path-custom-', async (homeDirectory) => {
    const defaultDirectory = path.join(homeDirectory, '.config', 'luna');
    const customDirectory = path.join(homeDirectory, 'vault', 'luna-data');
    const first = await resolveActiveDataDirectory({
      platform: 'linux',
      homeDirectory,
      prompt: createPrompt({ initial: 'choose-other', directories: [customDirectory] }),
    });
    assert.equal(first, customDirectory);
    const pointerFile = locationPointerPath(defaultDirectory);
    assert.equal(existsSync(pointerFile), true);
    assert.deepEqual(JSON.parse(readFileSync(pointerFile, 'utf8')), {
      schemaVersion: LOCATION_POINTER_SCHEMA_VERSION,
      path: customDirectory,
    });
    if (process.platform !== 'win32') assert.equal(statSync(pointerFile).mode & 0o777, 0o600);

    const second = await resolveActiveDataDirectory({
      platform: 'linux',
      homeDirectory,
      prompt: {
        async chooseInitialAction() {
          throw new Error('a valid pointer must not prompt');
        },
        async chooseDirectory() {
          throw new Error('a valid pointer must not prompt');
        },
        async showRecoverableError() {
          throw new Error('a valid pointer must not show an error');
        },
      },
    });
    assert.equal(second, customDirectory);
  });
});

test('invalid pointer and file selection are recoverable and never become active directories', async () => {
  await withTemporaryDirectory('luna-app-path-invalid-', async (homeDirectory) => {
    const defaultDirectory = path.join(homeDirectory, '.config', 'luna');
    const fileSelection = path.join(homeDirectory, 'not-a-directory');
    const customDirectory = path.join(homeDirectory, 'valid-directory');
    mkdirSync(defaultDirectory, { recursive: true });
    writeFileSync(locationPointerPath(defaultDirectory), JSON.stringify({
      schemaVersion: LOCATION_POINTER_SCHEMA_VERSION,
      path: path.join(homeDirectory, 'missing-directory'),
    }), { mode: 0o600 });
    writeFileSync(fileSelection, 'not a directory');
    const recoverableCodes: string[] = [];
    const result = await resolveActiveDataDirectory({
      platform: 'linux',
      homeDirectory,
      prompt: createPrompt({
        directories: [fileSelection, customDirectory],
        recoverableCodes,
      }),
    });
    assert.equal(result, customDirectory);
    assert.deepEqual(recoverableCodes, ['invalid-pointer', 'invalid-directory']);
    assert.equal(JSON.parse(readFileSync(locationPointerPath(defaultDirectory), 'utf8')).path, customDirectory);
  });
});

test('malformed and URL pointers are rejected by the single pointer decoder', () => {
  assert.throws(
    () => decodeLocationPointer({ schemaVersion: LOCATION_POINTER_SCHEMA_VERSION, path: 'relative/path' }),
    (error: unknown) => error instanceof AppPathError && error.code === 'invalid-directory',
  );
  assert.throws(
    () => decodeLocationPointer({ schemaVersion: LOCATION_POINTER_SCHEMA_VERSION, path: 'https://example.test/data' }),
    (error: unknown) => error instanceof AppPathError && error.code === 'invalid-directory',
  );
  assert.throws(
    () => decodeLocationPointer({ schemaVersion: LOCATION_POINTER_SCHEMA_VERSION, path: '/tmp/data', extra: true }),
    (error: unknown) => error instanceof AppPathError && error.code === 'invalid-pointer',
  );
});

test('legacy nested app data migrates to the direct Luna directory without overwriting it', async () => {
  await withTemporaryDirectory('luna-app-path-migration-', async (homeDirectory) => {
    const defaultDirectory = path.join(homeDirectory, '.config', 'luna');
    const legacyDirectory = path.join(homeDirectory, '.config', 'luna-ledger', 'luna-ledger');
    mkdirSync(legacyDirectory, { recursive: true });
    writeFileSync(path.join(legacyDirectory, 'settings.json'), '{"schemaVersion":1}', { mode: 0o600 });
    writeFileSync(path.join(legacyDirectory, 'config-sync-secrets.json'), '{"ciphertext":"protected"}', { mode: 0o600 });
    writeFileSync(path.join(legacyDirectory, LEGACY_DATABASE_FILE_NAME), 'sqlite bytes');
    writeFileSync(path.join(legacyDirectory, `${LEGACY_DATABASE_FILE_NAME}-wal`), 'wal bytes');
    const result = await resolveActiveDataDirectory({
      platform: 'linux',
      homeDirectory,
      prompt: {
        async chooseInitialAction() {
          throw new Error('migrated data must enter directly');
        },
        async chooseDirectory() {
          throw new Error('migrated data must enter directly');
        },
        async showRecoverableError() {
          throw new Error('migrated data must not show an error');
        },
      },
    });
    assert.equal(result, defaultDirectory);
    assert.equal(readFileSync(path.join(defaultDirectory, 'settings.json'), 'utf8'), '{"schemaVersion":1}');
    assert.equal(readFileSync(path.join(defaultDirectory, 'config-sync-secrets.json'), 'utf8'), '{"ciphertext":"protected"}');
    assert.equal(readFileSync(path.join(defaultDirectory, DATABASE_FILE_NAME), 'utf8'), 'sqlite bytes');
    assert.equal(readFileSync(path.join(defaultDirectory, `${DATABASE_FILE_NAME}-wal`), 'utf8'), 'wal bytes');
    assert.equal(existsSync(path.join(legacyDirectory, LEGACY_DATABASE_FILE_NAME)), false);
  });
});

test('legacy migration reserves a destination when both database names exist', async () => {
  await withTemporaryDirectory('luna-app-path-migration-collision-', async (homeDirectory) => {
    const defaultDirectory = path.join(homeDirectory, '.config', 'luna');
    const legacyDirectory = path.join(homeDirectory, '.config', 'luna-ledger', 'luna-ledger');
    mkdirSync(legacyDirectory, { recursive: true });
    writeFileSync(path.join(legacyDirectory, DATABASE_FILE_NAME), 'current bytes');
    writeFileSync(path.join(legacyDirectory, LEGACY_DATABASE_FILE_NAME), 'legacy bytes');

    const result = await resolveActiveDataDirectory({
      platform: 'linux',
      homeDirectory,
      prompt: {
        async chooseInitialAction() {
          throw new Error('migrated data must enter directly');
        },
        async chooseDirectory() {
          throw new Error('migrated data must enter directly');
        },
        async showRecoverableError() {
          throw new Error('migration must not show an error');
        },
      },
    });

    assert.equal(result, defaultDirectory);
    assert.equal(readFileSync(path.join(defaultDirectory, DATABASE_FILE_NAME), 'utf8'), 'current bytes');
    assert.equal(readFileSync(path.join(legacyDirectory, LEGACY_DATABASE_FILE_NAME), 'utf8'), 'legacy bytes');
  });
});

test('database cleanup is limited to Luna SQLite artifacts and preserves settings and secrets', async () => {
  await withTemporaryDirectory('luna-app-path-cleanup-', async (directory) => {
    const paths = appDataPaths(directory);
    writeFileSync(paths.settingsPath, 'settings', { mode: 0o600 });
    writeFileSync(paths.secretsPath, 'protected secrets', { mode: 0o600 });
    for (const databasePath of databaseArtifactPaths(directory)) writeFileSync(databasePath, 'database artifact');
    writeFileSync(path.join(directory, 'unrelated.txt'), 'keep me');
    await clearDatabaseArtifacts(directory);
    for (const databasePath of databaseArtifactPaths(directory)) assert.equal(existsSync(databasePath), false);
    assert.equal(existsSync(paths.settingsPath), true);
    assert.equal(existsSync(paths.secretsPath), true);
    assert.equal(existsSync(path.join(directory, 'unrelated.txt')), true);
  });
});
