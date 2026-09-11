import { contextBridge, ipcRenderer } from "electron";
import type { LunaLedgerApi } from "./shared/api";
import type { TransactionDraft, WorkspaceSetupInput } from "./shared/domain";
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
  exportLedgerBackup: (password) =>
    ipcRenderer.invoke(IPC_CHANNELS.exportLedgerBackup, password),
  importLedgerBackup: (raw, password) =>
    ipcRenderer.invoke(IPC_CHANNELS.importLedgerBackup, raw, password),
  getLedgerDocument: () => ipcRenderer.invoke(IPC_CHANNELS.getLedgerDocument),
  mergeLedgerDocument: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.mergeLedgerDocument, input),
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
