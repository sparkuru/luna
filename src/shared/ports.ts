import type {
  AppSnapshot,
  Transaction,
  TransactionDraft,
  Workspace,
  WorkspaceSetupInput,
} from './domain';
import type { LedgerConflict, LedgerDocument } from './ledger-sync';
import type { LedgerConflictChoice } from './ledger-data';
import type {
  AttachmentBytes,
  AttachmentUsage,
  StagedAttachment,
} from './api';
import type { AttachmentMetadata } from './attachment-contract';
import type { StoredAttachmentDescriptor } from './attachment-contract';
import type { AppLocale } from './settings';
import type {
  CategoryCreateInput,
  CategoryDefinition,
  CategoryReassignmentInput,
  CategoryUpdateInput,
  CategoryUsage,
} from './category-catalog';
import type {
  FullBackupArchive,
  FullBackupRestoreSink,
} from './full-backup';

export interface MigrationLease {
  id: string;
  snapshotVersion: string;
  acquiredAt: string;
  expiresAt: string;
}

export function decodeMigrationLease(value: unknown): MigrationLease | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error("LUNA_ERROR:invalid-input");
  const record = value as Record<string, unknown>;
  const keys = ["id", "snapshotVersion", "acquiredAt", "expiresAt"];
  if (
    Object.keys(record).some((key) => !keys.includes(key)) ||
    keys.some((key) => !(key in record))
  )
    throw new Error("LUNA_ERROR:invalid-input");
  const lease: MigrationLease = {
    id: record.id as string,
    snapshotVersion: record.snapshotVersion as string,
    acquiredAt: record.acquiredAt as string,
    expiresAt: record.expiresAt as string,
  };
  validateMigrationLease(lease);
  return lease;
}

export function validateMigrationLeaseId(value: string): void {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new Error("LUNA_ERROR:invalid-input");
}

export function validateMigrationLease(value: MigrationLease): void {
  validateMigrationLeaseId(value.id);
  if (
    typeof value.snapshotVersion !== "string" ||
    value.snapshotVersion.length === 0 ||
    value.snapshotVersion.length > 512
  )
    throw new Error("LUNA_ERROR:invalid-input");
  if (
    typeof value.acquiredAt !== "string" ||
    !Number.isFinite(Date.parse(value.acquiredAt))
  )
    throw new Error("LUNA_ERROR:invalid-input");
  if (
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= Date.parse(value.acquiredAt)
  )
    throw new Error("LUNA_ERROR:invalid-input");
}

/**
 * The local application boundary. SQLite is one implementation; renderer code
 * depends on these use-case-shaped methods instead of a database schema.
 */
export interface LocalStore {
  getLedgerDocument(): LedgerDocument | null;
  mergeLedgerDocument(input: LedgerDocument): LedgerDocument;
  getLedgerConflicts(): LedgerConflict[];
  resolveLedgerConflict(input: LedgerConflictChoice): LedgerDocument;
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
  getAttachmentUsage(): AttachmentUsage;
  retryAttachmentDownload(
    transactionId: string,
    attachmentId: string,
    conflictHeadId?: string,
  ): Promise<AttachmentMetadata>;
  readAttachmentCiphertext?(
    attachmentId: string,
  ): Promise<{ descriptor: StoredAttachmentDescriptor; ciphertext: Uint8Array } | null>;
  saveDownloadedAttachment?(
    descriptor: StoredAttachmentDescriptor,
    ciphertext: Uint8Array,
  ): Promise<void>;
  getRemotePayloadVersion?(targetId: string): 1 | 2 | 3 | null | Promise<1 | 2 | 3 | null>;
  setRemotePayloadVersion?(
    targetId: string,
    version: 1 | 2 | 3,
  ): void | Promise<void>;
  getMigrationLease?(): MigrationLease | null | Promise<MigrationLease | null>;
  acquireMigrationLease?(lease: MigrationLease): void | Promise<void>;
  renewMigrationLease?(
    leaseId: string,
    expiresAt: string,
  ): void | Promise<void>;
  releaseMigrationLease?(leaseId: string): void | Promise<void>;
  restoreFullBackup(archive: FullBackupArchive): Promise<void>;
  beginFullBackupRestore?(graph: LedgerDocument): FullBackupRestoreSink;
  getSnapshot(month: string): AppSnapshot;
  createWorkspace(
    input: WorkspaceSetupInput,
    id: string,
    now: string,
    locale?: AppLocale,
  ): Workspace;
  createTransaction(input: TransactionDraft, id: string, now: string): Transaction;
  updateTransaction(id: string, input: TransactionDraft, now: string, expectedRevision?: number): Transaction;
  deleteTransaction(id: string, now: string, expectedRevision?: number): Transaction;
  createCategory(input: CategoryCreateInput, expectedHeadIds?: string[]): CategoryDefinition;
  updateCategory(id: string, input: CategoryUpdateInput, expectedHeadIds?: string[]): CategoryDefinition;
  deleteCategory(id: string, expectedHeadIds?: string[]): void;
  getCategoryUsage(id: string): CategoryUsage[];
  reassignCategory(input: CategoryReassignmentInput): void;
  setMonthlyBudget(month: string, budgetMinor: string | null, expectedHeadIds?: string[]): void;
  close(): void;
}

/** Deferred seam for the security design; not used by the local checkpoint. */
export interface CryptoProvider {
  encrypt(payload: Uint8Array, rootKey: Uint8Array): Promise<Uint8Array>;
  decrypt(payload: Uint8Array, rootKey: Uint8Array): Promise<Uint8Array>;
}

/** Deferred seam for user-provided S3/OSS-compatible storage. */
export interface ObjectStore {
  put(key: string, payload: Uint8Array, metadata?: Readonly<Record<string, string>>): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}
