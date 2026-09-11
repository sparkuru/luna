import type { LunaLedgerApi } from '../shared/api';

declare global {
  interface Window {
    lunaLedger: LunaLedgerApi;
  }
}

export {};
