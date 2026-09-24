import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Exercise the packaged renderer's desktop image-input boundary. Playwright's
 * filechooser event intentionally supplies the selected file, so this proves
 * the packaged Chromium input, normalization, native IPC and local readback;
 * it does not claim that a host GTK/Windows/macOS dialog was visually reviewed.
 */
const packageRoot = process.env.LUNA_LEDGER_PACKAGE ?? path.resolve('out');
const executable = process.env.LUNA_LEDGER_EXECUTABLE ?? findPackagedExecutable(packageRoot);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function main(): Promise<void> {
  if (executable === null) {
    console.error('No packaged Luna executable found. Run npm run package first.');
    process.exitCode = 2;
    return;
  }
  const homeDirectory = mkdtempSync(path.join(tmpdir(), 'luna-electron-file-input-'));
  const configDirectory = path.join(homeDirectory, '.config');
  const defaultDataDirectory = path.join(configDirectory, 'luna');
  const noSandbox = process.env.LUNA_ELECTRON_NO_SANDBOX === '1';
  let electronApp: ElectronApplication | undefined;
  try {
    await mkdir(defaultDataDirectory, { recursive: true, mode: 0o700 });
    electronApp = await _electron.launch({
      executablePath: executable,
      args: noSandbox ? ['--no-sandbox'] : [],
      env: {
        ...process.env,
        HOME: homeDirectory,
        XDG_CONFIG_HOME: configDirectory,
      },
    });
    const page = await electronApp.firstWindow();
    page.setDefaultTimeout(30_000);
    await verifyFileInput(page);
    console.log('LUNA_PACKAGED_FILE_INPUT_SMOKE_OK');
    console.log(
      'Packaged Electron file input passed: chooser selection, image normalization, local save, and decrypted readback.',
    );
    console.log(
      'Native host-dialog visuals remain a separate manual platform review.',
    );
  } catch (error) {
    console.error('Packaged Electron file-input smoke failed.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await electronApp?.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
    rmSync(homeDirectory, { recursive: true, force: true });
  }
}

async function verifyFileInput(page: Page): Promise<void> {
  await page.locator('#workspace-name').fill('Electron file input');
  await page.locator('#workspace-form button[type=submit]').click();
  await page.locator('#record-expense').waitFor();
  const month = await page.locator('#month-picker').inputValue();
  await page.locator('#record-expense').click();
  await page.locator('#transaction-dialog').waitFor({ state: 'visible' });
  await page.locator('#choose-category').click();
  await page.locator('#category-options .category-option').first().click();
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    if (setter === undefined) throw new Error('Missing native input setter');
    const fields = [
      [document.querySelector('#transaction-amount'), '12.34'],
      [document.querySelector('#transaction-merchant'), 'Packaged file input'],
    ] as const;
    for (const [field, value] of fields) {
      if (!(field instanceof HTMLInputElement))
        throw new Error('Missing packaged smoke field');
      setter.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('.attachment-picker label').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'luna-electron-probe.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await page.locator('.attachment-preview-meta').waitFor();
  await page.locator('#save-transaction').click();
  const result = await page.evaluate(async (selectedMonth) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const snapshot = await window.lunaLedger.getSnapshot(selectedMonth);
      const transaction = snapshot.transactions.find(
        (candidate) => candidate.merchant === 'Packaged file input',
      );
      const attachment = transaction?.attachments?.[0];
      if (transaction !== undefined && attachment !== undefined) {
        const image = await window.lunaLedger.readTransactionImage(
          transaction.id,
          attachment.id,
        );
        return {
          mime: image.mime,
          width: image.width,
          height: image.height,
          signature: Array.from(image.bytes.slice(0, 8)),
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Packaged file input did not persist its attachment');
  }, month);
  if (
    result.mime !== 'image/png' ||
    result.width !== 1 ||
    result.height !== 1 ||
    JSON.stringify(result.signature) !== JSON.stringify([137, 80, 78, 71, 13, 10, 26, 10])
  ) {
    throw new Error('Packaged file input readback was not the normalized PNG');
  }
}

function findPackagedExecutable(root: string): string | null {
  if (!existsSync(root)) return null;
  const candidates: string[] = [];
  for (const entry of readdirSync(root)) {
    const directory = path.join(root, entry);
    if (!statSync(directory).isDirectory() || !entry.startsWith('luna-')) continue;
    const candidate = process.platform === 'win32'
      ? path.join(directory, 'luna.exe')
      : process.platform === 'darwin'
        ? path.join(directory, 'Luna.app', 'Contents', 'MacOS', 'luna')
        : path.join(directory, 'luna');
    if (existsSync(candidate)) candidates.push(candidate);
  }
  return candidates.sort().at(-1) ?? null;
}

void main();
