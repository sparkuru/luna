import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron } from '@playwright/test';

// Run from the repository root with xvfb-run -a node <this file>.
// Native dialog presentation has separate evidence: only its returned selection
// is substituted here, in the main process, to exercise real packaged IPC/I/O.
const executablePath = path.resolve('out/luna-linux-x64/luna');
const scratch = await mkdtemp(path.join(tmpdir(), 'luna-a01-private-'));
const config = path.join(scratch, '.config');
const data = path.join(scratch, 'private-ledger-directory');
const chosen = path.join(scratch, 'private-selected-backup.luna-backup');
const pngPath = path.join(scratch, 'private-selected-image.png');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const checks = [];
let application;
const close = async () => {
  if (!application) return;
  const process = application.process();
  if (process.exitCode !== null) return;
  const exited = once(process, 'exit');
  await application.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
  await exited;
};
const launch = async () => {
  application = await _electron.launch({ executablePath, env: { ...process.env, HOME: scratch, XDG_CONFIG_HOME: config } });
  const page = await application.firstWindow();
  page.on('dialog', () => {});
  page.setDefaultTimeout(30_000);
  await page.waitForFunction(() => !!window.lunaLedger);
  return page;
};
const privateFree = (value) => {
  const serialized = JSON.stringify(value);
  assert(!serialized.includes(scratch), 'Renderer received synthetic private directory');
  assert(!serialized.includes(data), 'Renderer received selected ledger directory');
  assert(!serialized.includes(chosen), 'Renderer received selected backup path');
  return value;
};
try {
  await mkdir(path.join(config, 'luna'), { recursive: true });
  await mkdir(data);
  await writeFile(path.join(config, 'luna', '.luna-location-v1.json'), JSON.stringify({ schemaVersion: 1, path: data }));
  await writeFile(pngPath, png);
  let page = await launch();
  const preferences = await application.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, sandbox: p.sandbox };
  });
  assert.deepEqual(preferences, { contextIsolation: true, nodeIntegration: false, sandbox: true });
  const globals = await page.evaluate(() => Object.fromEntries(['require', 'process', 'ipcRenderer', 'electron', 'Buffer'].map(key => [key, typeof window[key]])));
  assert(Object.values(globals).every(value => value === 'undefined'));
  checks.push('Packaged BrowserWindow requests context isolation and sandbox, disables Node integration; renderer has no Node or raw IPC globals');
  const keys = await page.evaluate(() => [...Object.keys(window.lunaLedger), ...Object.keys(window.lunaLedger.server)]);
  assert(!keys.some(key => /path|directory|filesystem|invoke|send|webutils/i.test(key)));
  await page.locator('#workspace-name').fill('A01 synthetic privacy ledger');
  await page.locator('#workspace-form button[type=submit]').click();
  await page.locator('#record-expense').waitFor();
  const month = await page.locator('#month-picker').inputValue();
  const readProjection = () => page.evaluate(async month => ({
    snapshot: await window.lunaLedger.getSnapshot(month),
    settings: await window.lunaLedger.getSettings(),
    profiles: await window.lunaLedger.server.profiles(),
    status: await window.lunaLedger.server.status(),
    sync: await window.lunaLedger.getLedgerSyncStatus(),
    usage: await window.lunaLedger.getAttachmentUsage(),
    dom: document.documentElement.outerHTML,
    localStorage: { ...localStorage },
    sessionStorage: { ...sessionStorage },
  }), month);
  const initial = privateFree(await readProjection());
  assert.equal(initial.snapshot.workspace.name, 'A01 synthetic privacy ledger');
  await stat(path.join(data, 'luna.sqlite'));
  checks.push('Custom-directory pointer actually used; snapshot/settings/profiles/status/sync/usage/DOM/browser storage contain no private directory');
  const selectSave = filePath => application.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => filePath === null ? { canceled: true, filePath: undefined } : { canceled: false, filePath };
  }, filePath);
  const save = () => page.evaluate(async () => {
    try {
      const value = await window.lunaLedger.saveLedgerBackup('A01-only-synthetic-passphrase');
      return { success: true, resultType: typeof value };
    } catch (error) {
      return { success: false, message: error.message, stack: error.stack };
    }
  });
  await selectSave(chosen);
  assert.deepEqual(privateFree(await save()), { success: true, resultType: 'undefined' });
  assert((await stat(chosen)).size > 0);
  checks.push('Successful native backup selection writes nonempty file; renderer receives undefined, not its path');
  await selectSave(null);
  const cancel = privateFree(await save());
  assert.equal(cancel.success, false);
  assert.match(cancel.message, /LUNA_ERROR:ledger-backup-cancelled/);
  await selectSave(path.join(scratch, 'missing-parent', 'private-failed-backup.luna-backup'));
  const failure = privateFree(await save());
  assert.equal(failure.success, false);
  assert.match(failure.message, /LUNA_ERROR:operation-failed/);
  assert(!JSON.stringify(failure).includes('private-failed-backup'));
  assert.deepEqual((await readProjection()).snapshot, initial.snapshot);
  checks.push('Cancel and real ENOENT write failure return sanitized errors including stack; ledger remains unchanged');
  await page.locator('#record-expense').click();
  await page.evaluate(() => document.addEventListener('change', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
    const file = input.files[0];
    window.__a01File = { value: input.value, name: file.name, pathType: typeof file.path, relativePath: file.webkitRelativePath };
  }, { capture: true, once: true }));
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('.attachment-picker label').click();
  await (await chooserPromise).setFiles(pngPath);
  await page.locator('.attachment-preview-meta').waitFor();
  const file = privateFree(await page.evaluate(() => window.__a01File));
  assert.equal(file.pathType, 'undefined');
  assert.equal(file.relativePath, '');
  assert(!file.value.includes(scratch));
  privateFree(await readProjection());
  checks.push('Actual disk-file selection exposes basename/fake input path only; File.path absent and no selected directory in DOM');
  await close();
  application = undefined;
  page = await launch();
  await page.locator('#record-expense').waitFor();
  assert.deepEqual(privateFree(await readProjection()).snapshot, initial.snapshot);
  checks.push('Restart with custom data-directory pointer preserves synthetic ledger and private-free projections');
  const artifact = await readFile(path.resolve('out/luna-linux-x64/resources/app.asar'));
  console.log(JSON.stringify({ date: '2026-10-03', result: 'passed', environment: { platform: 'Linux x64', display: 'isolated Xvfb', driverRuntime: process.version, electron: await application.evaluate(() => process.versions.electron), artifactSha256: createHash('sha256').update(artifact).digest('hex'), chromiumSandbox: 'Playwright launch adds --no-sandbox; BrowserWindow preference checked, OS sandbox enforcement not validated' }, checks, scope: 'Packaged main/preload/renderer and real filesystem I/O. Save dialog selection substituted only in main; native chooser presentation remains covered by 2026-09-30 evidence. Selected user-file and data-directory paths are private; file:// installation resource URLs are not claimed hidden. Not a comprehensive security audit or subjective satisfaction assessment.' }, null, 2));
} finally {
  await close();
  await rm(scratch, { recursive: true, force: true });
}
