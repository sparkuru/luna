import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SettingsDecodeError,
  applySettingsUpdate,
  createDefaultSettings,
  decodeRemotePortablePayload,
  decodeSettingsFile,
  encodeRemotePortablePayload,
  mergePortableSettings,
  remotePayloadFromSettings,
  settingsToRenderer,
} from './settings';

test('settings defaults are versioned, locale-aware, local-first, and private by default', () => {
  const zh = createDefaultSettings('device-a', 'zh-Hans-CN');
  assert.equal(zh.schemaVersion, 1);
  assert.equal(zh.portable.locale.value, 'zh-CN');
  assert.equal(zh.portable.hideSensitiveAmountsByDefault.value, true);
  assert.equal(zh.syncAllPortableSettings, false);
  assert.equal(zh.syncConnection, null);
  assert.equal(createDefaultSettings('device-b', 'en-US').portable.locale.value, 'en');
});

test('local settings decoder rejects unknown, missing, malformed, and future fields', () => {
  const valid = createDefaultSettings('device-a', 'en');
  assert.deepEqual(decodeSettingsFile(valid), valid);
  assert.throws(() => decodeSettingsFile({ ...valid, unknown: true }), SettingsDecodeError);
  assert.throws(() => decodeSettingsFile({ ...valid, schemaVersion: 2 }), /Unsupported/);
  const { lastSync: _lastSync, ...missing } = valid;
  assert.throws(() => decodeSettingsFile(missing), /missing lastSync/);
  assert.throws(
    () => decodeSettingsFile({ ...valid, syncAllPortableSettings: 'yes' }),
    /must be a boolean/,
  );
});

test('ledger sync mode defaults to automatic and is persisted locally', () => {
  const current = createDefaultSettings('device-mode', 'en');
  assert.equal(current.ledgerSyncMode, 'automatic');
  const legacy = { ...current } as Record<string, unknown>;
  delete legacy.ledgerSyncMode;
  assert.equal(decodeSettingsFile(legacy).ledgerSyncMode, 'automatic');
  assert.equal(
    applySettingsUpdate(
      current,
      { ledgerSyncMode: 'manual' },
      '2026-09-10T00:00:00.000Z',
    ).ledgerSyncMode,
    'manual',
  );
  assert.throws(
    () => decodeSettingsFile({ ...current, ledgerSyncMode: 'later' }),
    /sync mode/i,
  );
});

test('portable settings merge deterministically without uploading a device identity', () => {
  const base = createDefaultSettings('device-a', 'en');
  const left = applySettingsUpdate(base, { locale: 'zh-CN' }, '2026-08-30T10:00:00.000Z');
  const rightBase = createDefaultSettings('device-z', 'en');
  const right = applySettingsUpdate(
    rightBase,
    { hideSensitiveAmountsByDefault: false },
    '2026-08-30T10:00:00.000Z',
  );
  const mergedLeftRight = mergePortableSettings(left.portable, right.portable);
  const mergedRightLeft = mergePortableSettings(right.portable, left.portable);
  assert.deepEqual(mergedLeftRight, mergedRightLeft);
  assert.equal(mergedLeftRight.locale.value, 'zh-CN');
  assert.equal(mergedLeftRight.hideSensitiveAmountsByDefault.value, false);

  const tieA = applySettingsUpdate(base, { locale: 'zh-CN' }, '2026-08-30T11:00:00.000Z');
  const tieZ = applySettingsUpdate(rightBase, { locale: 'zh-CN' }, '2026-08-30T11:00:00.000Z');
  assert.deepEqual(mergePortableSettings(tieA.portable, tieZ.portable), tieA.portable);

  const sameMillisecond = applySettingsUpdate(
    tieA,
    { locale: 'en' },
    '2026-08-30T11:00:00.000Z',
  );
  assert.equal(sameMillisecond.portable.locale.value, 'en');
  assert.equal(sameMillisecond.portable.locale.updatedAt, '2026-08-30T11:00:00.001Z');
  assert.equal(
    mergePortableSettings(tieA.portable, sameMillisecond.portable).locale.value,
    'en',
  );
});

test('renderer settings projection omits revision identities and remote write tokens', () => {
  const local = createDefaultSettings('device-private', 'en');
  local.lastSync = {
    code: 'synced',
    updatedAt: '2026-08-30T12:00:00.000Z',
    etag: 'private-etag',
  };
  const renderer = settingsToRenderer(local, false, 'unavailable');
  const serialized = JSON.stringify(renderer);
  assert.equal(serialized.includes('device-private'), false);
  assert.equal(serialized.includes('private-etag'), false);
});

test('remote payload contains only portable settings and preserves unknown remote fields', () => {
  const local = createDefaultSettings('device-a', 'zh-CN');
  const encoded = encodeRemotePortablePayload(remotePayloadFromSettings(local));
  const serialized = JSON.stringify(encoded);
  for (const forbidden of [
    'syncAllPortableSettings',
    'syncConnection',
    'device-a',
    'lastSync',
    'etag',
    'accessKeyId',
    'secretAccessKey',
    'passphrase',
    'settings.json',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }

  const decoded = decodeRemotePortablePayload({
    ...encoded,
    futureTopLevel: { version: 2 },
    portable: { ...(encoded.portable as object), futurePreference: { value: 'kept' } },
  });
  const roundTrip = encodeRemotePortablePayload(decoded);
  assert.deepEqual(roundTrip.futureTopLevel, { version: 2 });
  assert.deepEqual((roundTrip.portable as Record<string, unknown>).futurePreference, { value: 'kept' });
});
