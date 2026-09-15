import { contextBridge, ipcRenderer } from "electron";
import type { LunaLedgerApi } from "./shared/api";
import type { TransactionDraft, WorkspaceSetupInput } from "./shared/domain";
import type {
  CategoryCreateInput,
  CategoryReassignmentInput,
  CategoryUpdateInput,
} from "./shared/category-catalog";
import { IPC_CHANNELS } from "./shared/ipc";
import type {
  ConfigureConfigSyncInput,
  SettingsUpdateInput,
} from "./shared/settings";

const api: LunaLedgerApi = {
  onChange: (listener) => {
    const handler = () => listener();
    ipcRenderer.on(IPC_CHANNELS.profileInvalidated, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.profileInvalidated, handler);
  },
  server: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.serverStatus),
    login: (input) => ipcRenderer.invoke(IPC_CHANNELS.serverLogin, input),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.serverLogout),
    profiles: () => ipcRenderer.invoke(IPC_CHANNELS.serverProfiles),
    selectProfile: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.serverSelectProfile, id),
    removeProfile: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.serverRemoveProfile, id),
    connect: (input) => ipcRenderer.invoke(IPC_CHANNELS.serverConnect, input),
    unlock: (password) =>
      ipcRenderer.invoke(IPC_CHANNELS.serverUnlock, password),
    sync: () => ipcRenderer.invoke(IPC_CHANNELS.serverSync),
    setSyncMode: (mode) =>
      ipcRenderer.invoke(IPC_CHANNELS.serverSetSyncMode, mode),
    disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.serverDisconnect),
    configurePreferences: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.serverConfigurePreferences, input),
    syncPreferences: () =>
      ipcRenderer.invoke(IPC_CHANNELS.serverSyncPreferences),
    sessions: () => ipcRenderer.invoke(IPC_CHANNELS.serverSessions),
    revokeSession: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.serverRevokeSession, id),
  },
  getLedgerSyncStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getLedgerSyncStatus),
  configureLedgerSync: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.configureLedgerSync, input),
  syncLedgerNow: () => ipcRenderer.invoke(IPC_CHANNELS.syncLedgerNow),
  clearLedgerSync: () => ipcRenderer.invoke(IPC_CHANNELS.clearLedgerSync),
  saveLedgerBackup: (password) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveLedgerBackup, password),
  exportLedgerBackup: (password) =>
    ipcRenderer.invoke(IPC_CHANNELS.exportLedgerBackup, password),
  importLedgerBackup: (raw, password) =>
    ipcRenderer.invoke(IPC_CHANNELS.importLedgerBackup, raw, password),
  beginBackupExport: (password) =>
    ipcRenderer.invoke(IPC_CHANNELS.beginBackupExport, password),
  readBackupChunk: (jobId, sequence) =>
    ipcRenderer.invoke(IPC_CHANNELS.readBackupChunk, { jobId, sequence }),
  finishBackupExport: (jobId) =>
    ipcRenderer.invoke(IPC_CHANNELS.finishBackupExport, jobId),
  beginBackupImport: (totalBytes, password) =>
    ipcRenderer.invoke(IPC_CHANNELS.beginBackupImport, {
      totalBytes,
      password,
    }),
  appendBackupChunk: (jobId, sequence, bytes) =>
    ipcRenderer.invoke(IPC_CHANNELS.appendBackupChunk, {
      jobId,
      sequence,
      bytes,
    }),
  finishBackupImport: (jobId) =>
    ipcRenderer.invoke(IPC_CHANNELS.finishBackupImport, jobId),
  cancelBackupJob: (jobId) =>
    ipcRenderer.invoke(IPC_CHANNELS.cancelBackupJob, jobId),
  stageTransactionImage: (draftSessionId, bytes, mime, width, height) =>
    ipcRenderer.invoke(IPC_CHANNELS.stageTransactionImage, {
      draftSessionId,
      bytes,
      mime,
      width,
      height,
    }),
  readDraftImage: (draftToken) =>
    ipcRenderer.invoke(IPC_CHANNELS.readDraftImage, draftToken),
  discardDraftImage: (draftToken) =>
    ipcRenderer.invoke(IPC_CHANNELS.discardDraftImage, draftToken),
  readTransactionImage: (transactionId, attachmentId, conflictHeadId) =>
    ipcRenderer.invoke(IPC_CHANNELS.readTransactionImage, {
      transactionId,
      attachmentId,
      conflictHeadId,
    }),
  getAttachmentUsage: () => ipcRenderer.invoke(IPC_CHANNELS.getAttachmentUsage),
  retryAttachmentDownload: (transactionId, attachmentId, conflictHeadId) =>
    ipcRenderer.invoke(IPC_CHANNELS.retryAttachmentDownload, {
      transactionId,
      attachmentId,
      conflictHeadId,
    }),
  getLedgerConflicts: () => ipcRenderer.invoke(IPC_CHANNELS.getLedgerConflicts),
  resolveLedgerConflict: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.resolveLedgerConflict, input),
  getSnapshot: (month) => ipcRenderer.invoke(IPC_CHANNELS.getSnapshot, month),
  createWorkspace: (input: WorkspaceSetupInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.createWorkspace, input),
  createTransaction: (input: TransactionDraft) =>
    ipcRenderer.invoke(IPC_CHANNELS.createTransaction, input),
  updateTransaction: (
    id: string,
    input: TransactionDraft,
    expectedRevision?: number,
  ) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateTransaction, {
      id,
      draft: input,
      expectedRevision,
    }),
  deleteTransaction: (id: string, expectedRevision?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteTransaction, id, expectedRevision),
  createCategory: (input: CategoryCreateInput, expectedHeadIds?: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.createCategory, { input, expectedHeadIds }),
  updateCategory: (id: string, input: CategoryUpdateInput, expectedHeadIds?: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateCategory, { id, input, expectedHeadIds }),
  deleteCategory: (id: string, expectedHeadIds?: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteCategory, { id, expectedHeadIds }),
  getCategoryUsage: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getCategoryUsage, id),
  reassignCategory: (input: CategoryReassignmentInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.reassignCategory, input),
  setMonthlyBudget: (
    month: string,
    budgetMinor: string | null,
    expectedHeadIds?: string[],
  ) =>
    ipcRenderer.invoke(IPC_CHANNELS.setMonthlyBudget, {
      month,
      budgetMinor,
      expectedHeadIds,
    }),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  updateSettings: (input: SettingsUpdateInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateSettings, input),
  configureConfigSync: (input: ConfigureConfigSyncInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.configureConfigSync, input),
  testConfigSync: () => ipcRenderer.invoke(IPC_CHANNELS.testConfigSync),
  syncConfigNow: () => ipcRenderer.invoke(IPC_CHANNELS.syncConfigNow),
  clearConfigSync: () => ipcRenderer.invoke(IPC_CHANNELS.clearConfigSync),
};

contextBridge.exposeInMainWorld("lunaLedger", api);
