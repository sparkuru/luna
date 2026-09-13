import assert from 'node:assert/strict';
import test from 'node:test';
import { importAndroidLedgerBackup, saveAndroidLedgerBackup } from './android-backup';

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

test('Android complete backup verifies native write receipts and total size', async () => {
  let cancelledHost = false;
  let cancelledWriter = false;
  await assert.rejects(
    saveAndroidLedgerBackup({
      exportLedgerBackup: async () => 'unused',
      beginBackupExport: async () => ({ jobId: 'export-1', totalBytes: 3 }),
      readBackupChunk: async () => ({ bytes: Uint8Array.of(1, 2, 3), eof: true }),
      finishBackupExport: async () => undefined,
      cancelBackupJob: async () => { cancelledHost = true; },
    }, 'test-only password', {
      beginSave: async () => ({ handle: 'native-1' }),
      writeChunk: async () => ({ receivedBytes: 2 }),
      finishSave: async () => undefined,
      cancelSave: async () => { cancelledWriter = true; },
    }),
    { message: 'LUNA_ERROR:backup-invalid-container' },
  );
  assert.equal(cancelledHost, true);
  assert.equal(cancelledWriter, true);
});

test('Android complete backup verifies host import receipts and closes the reader', async () => {
  let cancelled = false;
  let closed = false;
  await assert.rejects(
    importAndroidLedgerBackup({
      beginBackupImport: async () => ({ jobId: 'import-1' }),
      appendBackupChunk: async () => ({ receivedBytes: 2 }),
      finishBackupImport: async () => ({ attachmentCount: 0, totalBytes: 3 }),
      cancelBackupJob: async () => { cancelled = true; },
    }, 'test-only password', {
      beginOpen: async () => ({ handle: 'native-1', size: 3 }),
      readChunk: async () => ({ base64: 'AQID', eof: true, receivedBytes: 3 }),
      closeOpen: async () => { closed = true; },
    }),
    { message: 'LUNA_ERROR:backup-invalid-container' },
  );
  assert.equal(cancelled, true);
  assert.equal(closed, true);
});

test('Android backup maps malformed native Base64 to a container error', async () => {
  await assert.rejects(
    importAndroidLedgerBackup({
      beginBackupImport: async () => ({ jobId: 'import-1' }),
      appendBackupChunk: async () => ({ receivedBytes: 1 }),
      finishBackupImport: async () => ({ attachmentCount: 0, totalBytes: 1 }),
      cancelBackupJob: async () => undefined,
    }, 'test-only password', {
      beginOpen: async () => ({ handle: 'native-1', size: null }),
      readChunk: async () => ({ base64: 'not-base64', eof: true, receivedBytes: 1 }),
      closeOpen: async () => undefined,
    }),
    { message: 'LUNA_ERROR:backup-invalid-container' },
  );
});
