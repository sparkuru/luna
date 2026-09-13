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
import type { PublicLedgerConflict } from "./ledger-public";
import type { LedgerConflictChoice } from "./ledger-data";
import type { LedgerSessionStatus } from "./ledger-session";
import type {
  AttachmentMetadata,
  AttachmentRef,
  NormalizedAttachmentMime,
} from "./attachment-contract";
import type {
  BackupChunk,
  BackupExportStart,
  BackupImportReceipt,
} from "./full-backup-session";

export interface StagedAttachment {
  draftToken: string;
  metadata: AttachmentMetadata;
}

export interface AttachmentBytes {
  bytes: Uint8Array;
  mime: NormalizedAttachmentMime;
  width: number;
  height: number;
}

export interface AttachmentUsage {
  usedBytes: number;
  reservedBytes: number;
  maxBytes: number;
  count: number;
  maxCount: number;
  pendingCount: number;
}

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
  /** Bounded complete-backup sessions; legacy string backup remains compatible. */
  beginBackupExport?(password: string): Promise<BackupExportStart>;
  readBackupChunk?(jobId: string, sequence: number): Promise<BackupChunk>;
  finishBackupExport?(jobId: string): Promise<void>;
  beginBackupImport?(
    totalBytes: number | null,
    password: string,
  ): Promise<{ jobId: string }>;
  appendBackupChunk?(
    jobId: string,
    sequence: number,
    bytes: Uint8Array,
  ): Promise<{ receivedBytes: number }>;
  finishBackupImport?(jobId: string): Promise<BackupImportReceipt>;
  cancelBackupJob?(jobId: string): Promise<void>;
  stageTransactionImage(
    draftSessionId: string,
    bytes: Uint8Array,
    mime: string,
    width: number,
    height: number,
  ): Promise<StagedAttachment>;
  readDraftImage(draftToken: string): Promise<AttachmentBytes>;
  discardDraftImage(draftToken: string): Promise<void>;
  readTransactionImage(
    transactionId: string,
    attachmentId: string,
    conflictHeadId?: string,
  ): Promise<AttachmentBytes>;
  getAttachmentUsage(): Promise<AttachmentUsage>;
  retryAttachmentDownload(
    transactionId: string,
    attachmentId: string,
    conflictHeadId?: string,
  ): Promise<AttachmentMetadata>;
  /** Host-only graph descriptors never cross the public renderer boundary. */
  getLedgerConflicts(): Promise<PublicLedgerConflict[]>;
  resolveLedgerConflict(input: LedgerConflictChoice): Promise<void>;
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
