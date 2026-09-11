import { randomUUID } from "node:crypto";
import type { LunaLedgerApi } from "../shared/api";
import type { LocalStore } from "../shared/ports";
import type { ConfigSyncService } from "../sync/config-service";
import { LedgerSyncSession } from "../sync/ledger-service";
import {
  decryptLedgerDocument,
  encryptLedgerDocument,
} from "../shared/ledger-crypto";

export function createNativeLedgerApi(
  store: LocalStore,
  config: ConfigSyncService,
): LunaLedgerApi {
  const session = new LedgerSyncSession(store);
  return {
    getLedgerSyncStatus: () => session.getCurrentStatus(),
    configureLedgerSync: (input) => session.configure(input),
    syncLedgerNow: () => session.syncNow(),
    clearLedgerSync: async () => session.clear(),
    getLedgerDocument: async () => store.getLedgerDocument(),
    mergeLedgerDocument: async (input) => store.mergeLedgerDocument(input),
    getLedgerConflicts: async () => store.getLedgerConflicts(),
    resolveLedgerConflict: async (input) => store.resolveLedgerConflict(input),
    getSnapshot: async (month) => store.getSnapshot(month),
    createWorkspace: async (input) =>
      store.createWorkspace(input, randomUUID(), new Date().toISOString()),
    createTransaction: async (input) =>
      store.createTransaction(input, randomUUID(), new Date().toISOString()),
    updateTransaction: async (id, input, expected) =>
      store.updateTransaction(id, input, new Date().toISOString(), expected),
    deleteTransaction: async (id, expected) =>
      store.deleteTransaction(id, new Date().toISOString(), expected),
    setMonthlyBudget: async (month, amount, heads) =>
      store.setMonthlyBudget(month, amount, heads),
    getSettings: () => config.getRendererSettings(),
    updateSettings: (input) => config.updateSettings(input),
    configureConfigSync: (input) => config.configure(input),
    testConfigSync: () => config.testConnection(),
    syncConfigNow: () => config.syncNow(),
    clearConfigSync: () => config.clearLocalConfiguration(),
    exportLedgerBackup: async (password) => {
      const doc = store.getLedgerDocument();
      if (!doc) throw new Error("LUNA_ERROR:ledger-empty");
      return encryptLedgerDocument(doc, password);
    },
    importLedgerBackup: async (raw, password) => {
      store.mergeLedgerDocument(await decryptLedgerDocument(raw, password));
    },
  };
}
