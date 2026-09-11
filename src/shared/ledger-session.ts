import { decodeConfigureConfigSync, type ConfigureConfigSyncInput } from './settings';

export class LedgerSessionError extends Error {
  constructor(readonly code: 'ledger-insecure-connection' | 'ledger-sync-busy' | 'ledger-sync-cancelled' | 'ledger-empty') {
    super(`LUNA_ERROR:${code}`);
    this.name = 'LedgerSessionError';
  }
}

export interface LedgerSessionStatus {
  enabled: boolean;
  configured: boolean;
  code: 'disabled' | 'ready' | 'syncing' | 'synced' | 'pending' | 'failed';
  lastSyncedAt: string | null;
  /** True when a safe remote marker changed and manual mode is awaiting an explicit pull. */
  remoteChangeAvailable?: boolean;
}

/** Ledger credentials are session-only on every host; no implicit remote access. */
export function decodeLedgerSessionInput(value: unknown): ConfigureConfigSyncInput {
  const input = decodeConfigureConfigSync(value);
  const url = new URL(input.connection.endpoint);
  if (input.rememberSecrets || (url.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new LedgerSessionError('ledger-insecure-connection');
  }
  return input;
}
