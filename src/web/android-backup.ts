import { registerPlugin } from '@capacitor/core';
import type { LunaLedgerApi } from '../shared/api';
import { MAX_LEDGER_ENVELOPE_BYTES } from '../shared/ledger-crypto';

export interface AndroidBackupWriter {
  save(options: { json: string }): Promise<void>;
}

const writer = registerPlugin<AndroidBackupWriter>('LedgerBackup');

export async function saveAndroidLedgerBackup(
  api: Pick<LunaLedgerApi, 'exportLedgerBackup'>,
  password: string,
  nativeWriter: AndroidBackupWriter = writer,
): Promise<void> {
  const json = await api.exportLedgerBackup(password);
  if (new TextEncoder().encode(json).byteLength > MAX_LEDGER_ENVELOPE_BYTES) {
    throw new Error('LUNA_ERROR:ledger-invalid-envelope');
  }
  try {
    await nativeWriter.save({ json });
  } catch (error) {
    const code = error instanceof Error && error.message === 'LUNA_ERROR:ledger-backup-cancelled'
      ? 'ledger-backup-cancelled' : 'ledger-backup-failed';
    throw new Error(`LUNA_ERROR:${code}`);
  }
}
