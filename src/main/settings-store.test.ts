import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SettingsStore } from './settings-store';

function createStore(directory: string, deviceId = 'device-a'): SettingsStore {
  return new SettingsStore(directory, {
    deviceId: () => deviceId,
    systemLocale: 'en-US',
    now: () => '2026-08-30T12:00:00.000Z',
  });
}

test('settings file is created privately, updated atomically, and survives reopen', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'luna-settings-'));
  try {
    const first = createStore(directory);
    const initial = await first.initialize();
    assert.equal(initial.portable.hideSensitiveAmountsByDefault.value, true);
    await first.update({ locale: 'zh-CN', hideSensitiveAmountsByDefault: false });
    assert.equal(readdirSync(directory).some((name) => name.endsWith('.tmp')), false);
    if (process.platform !== 'win32') {
      assert.equal(statSync(first.settingsPath).mode & 0o777, 0o600);
    }
    const reopened = createStore(directory);
    const loaded = await reopened.initialize();
    assert.equal(loaded.portable.locale.value, 'zh-CN');
    assert.equal(loaded.portable.hideSensitiveAmountsByDefault.value, false);
    assert.equal(JSON.parse(readFileSync(first.settingsPath, 'utf8')).schemaVersion, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('corrupt settings are preserved and safe defaults are returned without overwriting evidence', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'luna-settings-corrupt-'));
  try {
    const filePath = path.join(directory, 'settings.json');
    writeFileSync(filePath, '{"schemaVersion":99,"private":"evidence"}', { mode: 0o600 });
    const store = createStore(directory, 'device-recovered');
    const recovered = await store.initialize();
    assert.equal(recovered.portable.hideSensitiveAmountsByDefault.value, true);
    assert.equal(recovered.syncAllPortableSettings, false);
    assert.equal(readdirSync(directory).includes('settings.json'), true);
    const evidence = readdirSync(directory).find((name) => name.startsWith('settings.corrupt-'));
    assert.ok(evidence);
    assert.match(readFileSync(path.join(directory, evidence), 'utf8'), /private/);
    const reopened = createStore(directory, 'unexpected-new-device');
    assert.equal((await reopened.initialize()).deviceId, 'device-recovered');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
