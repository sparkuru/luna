import type {
  AppSnapshot,
  Transaction,
  TransactionDraft,
  Workspace,
  WorkspaceSetupInput,
} from "./domain";
import type {
  ConfigSyncActionResult,
  ConfigureConfigSyncInput,
  RendererSettings,
  SettingsUpdateInput,
} from "./settings";
import type { LedgerConflict, LedgerDocument } from "./ledger-sync";
import type { LedgerConflictChoice } from "./ledger-data";
import type { LedgerSessionStatus } from "./ledger-session";

/** The only API exposed to the renderer through contextBridge. */
export interface LunaLedgerApi {
  onChange?(listener: () => void): () => void;
  server?: import("./server-api").LunaServerApi;
  getLedgerSyncStatus(): Promise<LedgerSessionStatus>;
  configureLedgerSync(
    input: ConfigureConfigSyncInput,
  ): Promise<LedgerSessionStatus>;
  syncLedgerNow(): Promise<LedgerSessionStatus>;
  clearLedgerSync(): Promise<LedgerSessionStatus>;
  exportLedgerBackup(password: string): Promise<string>;
  /** Native hosts resolve only after the user-selected document is written. */
  saveLedgerBackup?(password: string): Promise<void>;
  importLedgerBackup(raw: string, password: string): Promise<void>;
  getLedgerDocument(): Promise<LedgerDocument | null>;
  mergeLedgerDocument(input: LedgerDocument): Promise<LedgerDocument>;
  getLedgerConflicts(): Promise<LedgerConflict[]>;
  resolveLedgerConflict(input: LedgerConflictChoice): Promise<LedgerDocument>;
  getSnapshot(month: string): Promise<AppSnapshot>;
  createWorkspace(input: WorkspaceSetupInput): Promise<Workspace>;
  createTransaction(input: TransactionDraft): Promise<Transaction>;
  updateTransaction(
    id: string,
    input: TransactionDraft,
    expectedRevision?: number,
  ): Promise<Transaction>;
  deleteTransaction(
    id: string,
    expectedRevision?: number,
  ): Promise<Transaction>;
  setMonthlyBudget(
    month: string,
    budgetMinor: string | null,
    expectedHeadIds?: string[],
  ): Promise<void>;
  getSettings(): Promise<RendererSettings>;
  updateSettings(input: SettingsUpdateInput): Promise<RendererSettings>;
  configureConfigSync(
    input: ConfigureConfigSyncInput,
  ): Promise<RendererSettings>;
  testConfigSync(): Promise<ConfigSyncActionResult>;
  syncConfigNow(): Promise<ConfigSyncActionResult>;
  clearConfigSync(): Promise<RendererSettings>;
}
