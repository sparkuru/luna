import assert from 'node:assert/strict';
import test from 'node:test';
import { saveAndroidLedgerBackup } from './android-backup';

test('Android backup passes only ciphertext and waits for the native save result', async () => {
  let complete: (() => void) | undefined;
  let saved = false;
  const result = saveAndroidLedgerBackup({ exportLedgerBackup: async (password) => {
    assert.equal(password, 'test-only password');
    return 'encrypted-json';
  } }, 'test-only password', { save: async (input) => {
    assert.deepEqual(input, { json: 'encrypted-json' });
    await new Promise<void>((resolve) => { complete = resolve; });
  } }).then(() => { saved = true; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(saved, false);
  assert.ok(complete);
  complete();
  await result;
  assert.equal(saved, true);
});

test('Android backup propagates cancel and sanitizes native failures', async () => {
  for (const [failure, expected] of [
    ['LUNA_ERROR:ledger-backup-cancelled', 'ledger-backup-cancelled'],
    ['private content URI and provider details', 'ledger-backup-failed'],
  ]) {
    await assert.rejects(saveAndroidLedgerBackup({ exportLedgerBackup: async () => 'encrypted-json' },
      'test-only password', { save: async () => { throw new Error(failure); } }),
    { message: `LUNA_ERROR:${expected}` });
  }
});
