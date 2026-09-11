import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Run the packaged main/storage smoke. This deliberately reports its scope:
 * it validates packaged Electron startup, the preload/IPC bridge, and userData
 * SQLite reopen, not the renderer's visual or accessibility behavior.
 */
const packageRoot = process.env.LUNA_LEDGER_PACKAGE ?? path.resolve('out');
const executable = process.env.LUNA_LEDGER_EXECUTABLE ?? findPackagedExecutable(packageRoot);
if (executable === null) {
  console.error('No packaged Luna executable found. Run npm run package first.');
  process.exitCode = 2;
} else {
  const smokeDirectory = mkdtempSync(path.join(tmpdir(), 'luna-electron-smoke-'));
  try {
    const result = spawnSync(executable, ['--smoke'], {
      env: {
        ...process.env,
        LUNA_LEDGER_SMOKE_USER_DATA: smokeDirectory,
      },
      encoding: 'utf8',
      timeout: 120_000,
      windowsHide: true,
    });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    // GUI-packaged processes may not preserve stdout on every platform. The
    // smoke entrypoint uses app.exit(1) for every assertion failure, so the
    // child exit status is the cross-platform source of truth.
    if (result.error !== undefined || result.status !== 0) {
      console.error('Packaged storage/IPC smoke failed.');
      console.error(`Packaged process status=${String(result.status)} signal=${String(result.signal)}`);
      // Child diagnostics can contain native paths; the exit marker/status is
      // sufficient for this helper's bounded, path-free report.
      if (result.error !== undefined || output.length > 0) {
        console.error('Packaged process emitted diagnostics; inspect it in the local test environment.');
      }
      process.exitCode = 1;
    } else {
      console.log('LUNA_PACKAGED_STORAGE_SMOKE_OK');
      const cryptoDuration = /config_crypto_ms=(\d+)/.exec(output)?.[1];
      console.log('Packaged Luna storage/IPC smoke passed: startup, bridge/settings writes, CNY/i18n/privacy, encrypted ledger backup/import, session isolation, config crypto, and userData reopen.');
      if (cryptoDuration !== undefined) {
        console.log(`Packaged default config KDF/envelope round-trip: ${cryptoDuration} ms.`);
      }
      console.log('Visual quality and assistive-technology behavior remain outside this helper\'s scope.');
    }
  } finally {
    rmSync(smokeDirectory, { recursive: true, force: true });
  }
}

function findPackagedExecutable(root: string): string | null {
  if (!existsSync(root)) return null;
  const candidates: string[] = [];
  for (const entry of readdirSync(root)) {
    const directory = path.join(root, entry);
    if (!statSync(directory).isDirectory() || !entry.startsWith('luna-')) continue;
    const executable = process.platform === 'win32'
      ? path.join(directory, 'luna.exe')
      : process.platform === 'darwin'
        ? path.join(directory, 'Luna.app', 'Contents', 'MacOS', 'luna')
        : path.join(directory, 'luna');
    if (existsSync(executable)) candidates.push(executable);
  }
  return candidates.sort().at(-1) ?? null;
}
