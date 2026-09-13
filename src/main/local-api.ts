import { randomUUID } from "node:crypto";
import type { LunaLedgerApi } from "../shared/api";
import type { LocalStore } from "../shared/ports";
import type { ConfigSyncService } from "../sync/config-service";
import { LedgerSyncSession } from "../sync/ledger-service";
import { projectLedgerConflicts } from "../shared/ledger-public";
import {
  decryptLedgerDocument,
  encryptLedgerDocument,
} from "../shared/ledger-crypto";
import { FullBackupSessionManager } from "../shared/full-backup-session";
import type { FullBackupArchive } from "../shared/full-backup";

export function createNativeLedgerApi(
  store: LocalStore,
  config: ConfigSyncService,
): LunaLedgerApi {
  const session = new LedgerSyncSession(store);
  const backupSource = {
    getLedgerDocument: () => store.getLedgerDocument(),
    restoreFullBackup: (archive: FullBackupArchive) =>
      store.restoreFullBackup(archive),
    ...(store.readAttachmentCiphertext
      ? {
          readAttachmentCiphertext: (attachmentId: string) =>
            store.readAttachmentCiphertext!(attachmentId),
        }
      : {}),
    ...(store.beginFullBackupRestore
      ? {
          beginFullBackupRestore: (graph: import("../shared/ledger-sync").LedgerDocumentV2) =>
            store.beginFullBackupRestore!(graph),
        }
      : {}),
  };
  const backup = new FullBackupSessionManager(backupSource);
  return {
    getLedgerSyncStatus: () => session.getCurrentStatus(),
    configureLedgerSync: (input) => session.configure(input),
    syncLedgerNow: () => session.syncNow(),
    clearLedgerSync: async () => session.clear(),
    getLedgerConflicts: async () =>
      projectLedgerConflicts(store.getLedgerConflicts()),
    resolveLedgerConflict: async (input) => {
      store.resolveLedgerConflict(input);
    },
    stageTransactionImage: (draftSessionId, bytes, mime, width, height) =>
      store.stageTransactionImage(draftSessionId, bytes, mime, width, height),
    readDraftImage: (draftToken) => store.readDraftImage(draftToken),
    discardDraftImage: (draftToken) => store.discardDraftImage(draftToken),
    readTransactionImage: (transactionId, attachmentId, conflictHeadId) =>
      store.readTransactionImage(transactionId, attachmentId, conflictHeadId),
    getAttachmentUsage: async () => store.getAttachmentUsage(),
    retryAttachmentDownload: (transactionId, attachmentId, conflictHeadId) =>
      store.retryAttachmentDownload(transactionId, attachmentId, conflictHeadId),
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
    beginBackupExport: (password) => backup.beginBackupExport(password),
    readBackupChunk: (jobId, sequence) =>
      backup.readBackupChunk(jobId, sequence),
    finishBackupExport: (jobId) => {
      backup.finishBackupExport(jobId);
      return Promise.resolve();
    },
    beginBackupImport: (totalBytes, password) =>
      backup.beginBackupImport(totalBytes, password),
    appendBackupChunk: (jobId, sequence, bytes) =>
      backup.appendBackupChunk(jobId, sequence, bytes),
    finishBackupImport: (jobId) => backup.finishBackupImport(jobId),
    cancelBackupJob: (jobId) => {
      return backup.cancelBackupJob(jobId);
    },
  };
}
