import type {
  AppSnapshot,
  Transaction,
  TransactionDraft,
  Workspace,
  WorkspaceSetupInput,
} from './domain';
import type { LedgerConflict, LedgerDocument } from './ledger-sync';
import type { LedgerConflictChoice } from './ledger-data';

/**
 * The local application boundary. SQLite is one implementation; renderer code
 * depends on these use-case-shaped methods instead of a database schema.
 */
export interface LocalStore {
  getLedgerDocument(): LedgerDocument | null;
  mergeLedgerDocument(input: LedgerDocument): LedgerDocument;
  getLedgerConflicts(): LedgerConflict[];
  resolveLedgerConflict(input: LedgerConflictChoice): LedgerDocument;
  getSnapshot(month: string): AppSnapshot;
  createWorkspace(input: WorkspaceSetupInput, id: string, now: string): Workspace;
  createTransaction(input: TransactionDraft, id: string, now: string): Transaction;
  updateTransaction(id: string, input: TransactionDraft, now: string, expectedRevision?: number): Transaction;
  deleteTransaction(id: string, now: string, expectedRevision?: number): Transaction;
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
