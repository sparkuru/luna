import {
  assertExpectedRevision,
  calculateMonthlySummary,
  canonicalMinorUnits,
  createTransaction,
  decodeId,
  parseMinorUnits,
  decodeMonth,
  decodeTransaction,
  decodeTransactionDraft,
  decodeWorkspace,
  decodeWorkspaceSetup,
  localMonthFromTimestamp,
  normalizeWorkspaceSetup,
  reviseTransaction,
  tombstoneTransaction,
  type AppSnapshot,
  type Transaction,
  type TransactionDraft,
  type Workspace,
  type WorkspaceSetupInput,
} from "../shared/domain";
import type { LunaLedgerApi } from "../shared/api";
import type {
  AttachmentBytes,
  AttachmentUsage,
  StagedAttachment,
} from "../shared/api";
import {
  AttachmentContractError,
  MAX_ATTACHMENTS_PER_TRANSACTION,
  MAX_LEDGER_ATTACHMENT_BYTES,
  MAX_LEDGER_ATTACHMENT_COUNT,
  createEncryptedAttachment,
  decryptAttachmentBytes,
  toAttachmentMetadata,
  validateAttachmentInventoryQuota,
  validateAttachmentDescriptor,
  type AttachmentMetadata,
  type AttachmentRef,
  type StoredAttachmentDescriptor,
} from "../shared/attachment-contract";
import {
  FullBackupError,
  type FullBackupRestoreSink,
  type FullBackupArchive,
} from "../shared/full-backup";
import { FullBackupSessionManager } from "../shared/full-backup-session";
import { secureRandomId } from "../shared/secure-random";
import {
  isStoredTransaction,
  storedTransactionFromTransaction,
  storedTransactionToTransaction,
  type StoredTransaction,
} from "../shared/ledger-record";
import type { PublicLedgerConflict } from "../shared/ledger-public";
import { projectLedgerConflicts } from "../shared/ledger-public";
import { LedgerSyncSession } from "../sync/ledger-service";
import {
  ConfigSyncService,
  SessionConfigSecrets,
} from "../sync/config-service";
import { createS3ConfigObjectStore } from "../sync/s3-config-store";
import {
  decryptLedgerDocument,
  encryptLedgerDocument,
} from "../shared/ledger-crypto";
import type { LedgerSessionStatus } from "../shared/ledger-session";
import type { MigrationLease } from "../shared/ports";
import {
  categoryDefinitionById,
  defaultCategoryCatalog,
  decodeCategoryCreateInput,
  decodeCategoryReassignmentInput,
  decodeCategoryUpdateInput,
  validateCategoryCatalog,
  type CategoryCatalog,
  type CategoryCreateInput,
  type CategoryDefinition,
  type CategoryReassignmentInput,
  type CategoryUpdateInput,
  type CategoryUsage,
} from "../shared/category-catalog";
import {
  appendLedgerRevision,
  assertBudgetHeads,
  attachmentInventory,
  budgetHeadIds,
  categoryHeadIds,
  decodeLedgerHeadIds,
  decodeLedgerDocument,
  LedgerSyncError,
  mergeLedgerDocuments,
  projectLedgerDocument,
  seedLedgerDocumentV3,
  type LedgerDocument,
} from "../shared/ledger-sync";
import {
  decodeBudgetUpdate,
  decodeLedgerConflictChoice,
  resolveLedgerChoice,
  type LedgerConflictChoice,
} from "../shared/ledger-data";
import {
  BrowserStateStore,
  type StateStore,
} from "./browser-state-store";
import { SqliteWasmStateStore } from "./sqlite-wasm-store";
import {
  createDefaultSettings,
  decodeSettingsFile,
  type AppSettingsFileV1,
  type ConfigSyncActionResult,
  type ConfigureConfigSyncInput,
  type RendererSettings,
  type SettingsUpdateInput,
} from "../shared/settings";

const WEB_STATE_SCHEMA_VERSION = 4 as const;

interface WebAttachmentRecord {
  attachmentId: string;
  draftToken: string | null;
  draftSessionId: string | null;
  descriptor: StoredAttachmentDescriptor;
  binaryKey: string;
  state: "staged" | "committed";
  createdAt: string;
}

interface WebLedgerState {
  schemaVersion: typeof WEB_STATE_SCHEMA_VERSION;
  settings: AppSettingsFileV1;
  ledger: LedgerDocument | null;
  attachments: WebAttachmentRecord[];
  remotePayloadVersions: Record<string, 1 | 2 | 3>;
}

/**
 * Browser-local host for the shared renderer. It deliberately has no access
 * to Node, Electron, SQLite, filesystem paths, or provider SDKs.
 */
export function createWebLedgerApi(
  storage: Storage | null = safeLocalStorage(),
  database?: IDBFactory | null,
): WebLedgerApi {
  const store =
    database === undefined
      ? new SqliteWasmStateStore("luna-ledger-legacy-local")
      : new BrowserStateStore(database, storage, decodeStoredState);
  return new WebLedgerApi(
    store,
  );
}

export class WebLedgerApi implements LunaLedgerApi {
  private readonly ledgerSession = new LedgerSyncSession(this);
  private readonly fullBackupSessions: FullBackupSessionManager;
  readonly configSession: ConfigSyncService;
  constructor(private readonly store: StateStore) {
    this.configSession = new ConfigSyncService(
      {
        get: async () => decodeStoredState(await this.store.read()).settings,
        mutateSettings: (change, signal) =>
          this.mutate((state) => {
            state.settings = decodeSettingsFile(change(state.settings));
            return state.settings;
          }, signal),
      },
      new SessionConfigSecrets(),
      createS3ConfigObjectStore,
      { now: () => new Date().toISOString() },
    );
    this.fullBackupSessions = new FullBackupSessionManager({
      getLedgerDocument: () => this.getLedgerDocument(),
      readAttachmentCiphertext: (attachmentId) =>
        this.readAttachmentCiphertext(attachmentId),
      beginFullBackupRestore: (graph) => this.beginFullBackupRestore(graph),
      restoreFullBackup: (archive) => this.restoreFullBackupArchive(archive),
    });
  }

  async getLedgerSyncStatus(): Promise<LedgerSessionStatus> {
    return this.ledgerSession.getCurrentStatus();
  }
  async configureLedgerSync(
    input: ConfigureConfigSyncInput,
  ): Promise<LedgerSessionStatus> {
    return this.ledgerSession.configure(input);
  }
  async syncLedgerNow(): Promise<LedgerSessionStatus> {
    return this.ledgerSession.syncNow();
  }
  async clearLedgerSync(): Promise<LedgerSessionStatus> {
    return this.ledgerSession.clear();
  }
  async exportLedgerBackup(password: string): Promise<string> {
    const document = await this.getLedgerDocument();
    if (document === null) throw new Error("LUNA_ERROR:ledger-empty");
    return encryptLedgerDocument(document, password);
  }
  async importLedgerBackup(raw: string, password: string): Promise<void> {
    await this.mergeLedgerDocument(await decryptLedgerDocument(raw, password));
  }
  beginBackupExport = (password: string) =>
    this.fullBackupSessions.beginBackupExport(password);
  readBackupChunk = (jobId: string, sequence: number) =>
    this.fullBackupSessions.readBackupChunk(jobId, sequence);
  finishBackupExport = (jobId: string) => {
    this.fullBackupSessions.finishBackupExport(jobId);
    return Promise.resolve();
  };
  beginBackupImport = (totalBytes: number | null, password: string) =>
    this.fullBackupSessions.beginBackupImport(totalBytes, password);
  appendBackupChunk = (jobId: string, sequence: number, bytes: Uint8Array) =>
    this.fullBackupSessions.appendBackupChunk(jobId, sequence, bytes);
  finishBackupImport = (jobId: string) =>
    this.fullBackupSessions.finishBackupImport(jobId);
  cancelBackupJob = (jobId: string) => {
    return this.fullBackupSessions.cancelBackupJob(jobId);
  };

  private async beginFullBackupRestore(
    _graph: import("../shared/ledger-sync").LedgerDocument,
  ): Promise<FullBackupRestoreSink> {
    const before = decodeStoredState(await this.store.read());
    const existingIds = new Set(
      before.attachments.map((record) => record.attachmentId),
    );
    const staged = new Map<
      string,
      { descriptor: StoredAttachmentDescriptor; binaryKey: string }
    >();
    const sessionId = randomId("backup");
    return {
      writeAttachment: async (item) => {
        validateAttachmentDescriptor(item.descriptor);
        if (
          staged.has(item.descriptor.id) ||
          item.ciphertext.byteLength !== item.descriptor.cipherByteLength
        )
          throw new FullBackupError("backup-attachment-mismatch");
        const binaryKey = attachmentBinaryKey(
          item.descriptor.workspaceId,
          item.descriptor.id,
        );
        await this.store.writeBinary(binaryKey, item.ciphertext);
        staged.set(item.descriptor.id, {
          descriptor: { ...item.descriptor },
          binaryKey,
        });
      },
      commit: (graph) =>
        this.commitStagedFullBackup(sessionId, graph, staged),
      abort: async () => {
        const current = decodeStoredState(await this.store.read());
        for (const item of staged.values()) {
          if (
            existingIds.has(item.descriptor.id) ||
            current.attachments.some(
              (record) => record.attachmentId === item.descriptor.id,
            )
          )
            continue;
          await this.store.deleteBinary(item.binaryKey).catch(() => undefined);
        }
        staged.clear();
      },
    };
  }

  async stageTransactionImage(
    draftSessionId: string,
    bytes: Uint8Array,
    mime: string,
    width: number,
    height: number,
  ): Promise<StagedAttachment> {
    const before = decodeStoredState(await this.store.read());
    const workspace = this.requireLedger(before).workspace;
    validateDraftSessionId(draftSessionId);
    const encrypted = await createEncryptedAttachment(
      new Uint8Array(bytes),
      workspace.id,
      mime,
      width,
      height,
    );
    const draftToken = randomId("draft");
    const binaryKey = attachmentBinaryKey(workspace.id, encrypted.descriptor.id);
    await this.store.writeBinary(binaryKey, encrypted.ciphertext);
    try {
      await this.mutate((state) => {
        const currentWorkspace = this.requireLedger(state).workspace;
        if (currentWorkspace.id !== workspace.id)
          throw new Error("LUNA_ERROR:attachment-invalid-reference");
        assertAttachmentQuota(state.attachments, encrypted.ciphertext.byteLength, 1);
        if (state.attachments.some((item) => item.attachmentId === encrypted.descriptor.id))
          throw new Error("LUNA_ERROR:attachment-invalid-reference");
        state.attachments.push({
          attachmentId: encrypted.descriptor.id,
          draftToken,
          draftSessionId,
          descriptor: { ...encrypted.descriptor },
          binaryKey,
          state: "staged",
          createdAt: new Date().toISOString(),
        });
        return {
          draftToken,
          metadata: toAttachmentMetadata(encrypted.descriptor),
        };
      });
    } catch (error) {
      await this.store.deleteBinary(binaryKey).catch(() => undefined);
      throw error;
    }
    return {
      draftToken,
      metadata: toAttachmentMetadata(encrypted.descriptor),
    };
  }

  async readDraftImage(draftToken: string): Promise<AttachmentBytes> {
    const state = decodeStoredState(await this.store.read());
    const record = state.attachments.find(
      (item) => item.state === "staged" && item.draftToken === draftToken,
    );
    if (record === undefined) throw new Error("LUNA_ERROR:attachment-not-found");
    return this.readAttachmentRecord(record);
  }

  async discardDraftImage(draftToken: string): Promise<void> {
    const removed = await this.mutate((state) => {
      const index = state.attachments.findIndex(
        (item) => item.state === "staged" && item.draftToken === draftToken,
      );
      if (index < 0) return null;
      const [record] = state.attachments.splice(index, 1);
      return record ?? null;
    });
    if (removed !== null) await this.store.deleteBinary(removed.binaryKey);
  }

  async readTransactionImage(
    transactionId: string,
    attachmentId: string,
    conflictHeadId?: string,
  ): Promise<AttachmentBytes> {
    const state = decodeStoredState(await this.store.read());
    const record = readStoredTransactionFromLedger(
      this.requireLedger(state),
      transactionId,
      conflictHeadId,
    );
    const descriptor = record.attachments.find((item) => item.id === attachmentId);
    if (descriptor === undefined)
      throw new Error("LUNA_ERROR:attachment-not-found");
    const stored = state.attachments.find(
      (item) => item.state === "committed" && item.attachmentId === descriptor.id,
    );
    if (stored === undefined || JSON.stringify(stored.descriptor) !== JSON.stringify(descriptor))
      throw new Error("LUNA_ERROR:attachment-unavailable");
    return this.readAttachmentRecord(stored);
  }

  async readAttachmentCiphertext(
    attachmentId: string,
  ): Promise<{ descriptor: StoredAttachmentDescriptor; ciphertext: Uint8Array } | null> {
    const state = decodeStoredState(await this.store.read());
    const record = state.attachments.find(
      (item) => item.state === "committed" && item.attachmentId === attachmentId,
    );
    if (record === undefined) return null;
    const ciphertext = await this.store.readBinary(record.binaryKey);
    if (ciphertext === null) throw new Error("LUNA_ERROR:attachment-unavailable");
    await decryptAttachmentBytes(ciphertext, record.descriptor);
    return { descriptor: { ...record.descriptor }, ciphertext };
  }

  async saveDownloadedAttachment(
    descriptor: StoredAttachmentDescriptor,
    ciphertext: Uint8Array,
  ): Promise<void> {
    validateAttachmentDescriptor(descriptor);
    const state = decodeStoredState(await this.store.read());
    const workspace = this.requireLedger(state).workspace;
    if (descriptor.workspaceId !== workspace.id)
      throw new Error("LUNA_ERROR:attachment-invalid-reference");
    const verified = new Uint8Array(ciphertext);
    await decryptAttachmentBytes(verified, descriptor);
    const binaryKey = attachmentBinaryKey(workspace.id, descriptor.id);
    const existing = state.attachments.find(
      (item) => item.attachmentId === descriptor.id,
    );
    if (existing !== undefined) {
      if (JSON.stringify(existing.descriptor) !== JSON.stringify(descriptor))
        throw new Error("LUNA_ERROR:attachment-digest-mismatch");
      if (existing.state === "committed") return;
    }
    await this.store.writeBinary(binaryKey, verified);
    try {
      await this.mutate((next) => {
        const current = this.requireLedger(next).workspace;
        if (current.id !== workspace.id)
          throw new Error("LUNA_ERROR:attachment-invalid-reference");
        const present = next.attachments.find(
          (item) => item.attachmentId === descriptor.id,
        );
        if (present !== undefined) {
          if (JSON.stringify(present.descriptor) !== JSON.stringify(descriptor))
            throw new Error("LUNA_ERROR:attachment-digest-mismatch");
          present.state = "committed";
          present.draftToken = null;
          present.draftSessionId = null;
          return undefined;
        }
        assertAttachmentQuota(next.attachments, verified.byteLength, 1);
        next.attachments.push({
          attachmentId: descriptor.id,
          draftToken: null,
          draftSessionId: null,
          descriptor: { ...descriptor },
          binaryKey,
          state: "committed",
          createdAt: new Date().toISOString(),
        });
        return undefined;
      });
    } catch (error) {
      const after = decodeStoredState(await this.store.read()).attachments.some(
        (item) => item.attachmentId === descriptor.id,
      );
      if (!after) await this.store.deleteBinary(binaryKey).catch(() => undefined);
      throw error;
    }
  }

  async getAttachmentUsage(): Promise<AttachmentUsage> {
    const state = decodeStoredState(await this.store.read());
    const usedBytes = state.attachments
      .filter((item) => item.state === "committed")
      .reduce((total, item) => total + item.descriptor.cipherByteLength, 0);
    const reservedBytes = state.attachments
      .filter((item) => item.state === "staged")
      .reduce((total, item) => total + item.descriptor.cipherByteLength, 0);
    return {
      usedBytes,
      reservedBytes,
      maxBytes: MAX_LEDGER_ATTACHMENT_BYTES,
      count: state.attachments.filter((item) => item.state === "committed").length,
      maxCount: MAX_LEDGER_ATTACHMENT_COUNT,
      pendingCount: state.attachments.filter((item) => item.state === "staged").length,
    };
  }

  async retryAttachmentDownload(
    transactionId: string,
    attachmentId: string,
    conflictHeadId?: string,
  ): Promise<AttachmentMetadata> {
    await this.readTransactionImage(transactionId, attachmentId, conflictHeadId);
    const state = decodeStoredState(await this.store.read());
    const transaction = readStoredTransactionFromLedger(
      this.requireLedger(state),
      transactionId,
      conflictHeadId,
    );
    const descriptor = transaction.attachments.find((item) => item.id === attachmentId);
    if (descriptor === undefined) throw new Error("LUNA_ERROR:attachment-not-found");
    return toAttachmentMetadata(descriptor);
  }

  private async readAttachmentRecord(
    record: WebAttachmentRecord,
  ): Promise<AttachmentBytes> {
    const bytes = await this.store.readBinary(record.binaryKey);
    if (bytes === null) throw new Error("LUNA_ERROR:attachment-unavailable");
    const plain = await decryptAttachmentBytes(bytes, record.descriptor);
    return {
      bytes: plain,
      mime: record.descriptor.mime,
      width: record.descriptor.width,
      height: record.descriptor.height,
    };
  }

  private async ensureDraftImages(
    refs: readonly AttachmentRef[] | undefined,
  ): Promise<void> {
    if (refs === undefined) return;
    const state = decodeStoredState(await this.store.read());
    for (const ref of refs) {
      if (ref.draftToken === undefined) continue;
      const record = state.attachments.find(
        (item) => item.state === "staged" && item.draftToken === ref.draftToken,
      );
      if (record === undefined) throw new Error("LUNA_ERROR:attachment-not-found");
      await this.readAttachmentRecord(record);
    }
  }

  async getSnapshot(month: string): Promise<AppSnapshot> {
    const selectedMonth = decodeMonth(month);
    const state = decodeStoredState(await this.store.read());
    const projection =
      state.ledger === null ? null : projectLedgerDocument(state.ledger);
    const workspace = projection?.workspace ?? null;
    return {
      workspace,
      conflictCount: projection?.conflicts.length ?? 0,
      budgetHeadIds:
        state.ledger === null ? [] : budgetHeadIds(state.ledger, selectedMonth),
      categories: projection?.categories ?? [],
      categoryHeadIds:
        state.ledger === null ? [] : categoryHeadIds(state.ledger),
      // Keep tombstones in the public snapshot for migration/conflict
      // inspection. Financial summaries and the renderer query layer exclude
      // deleted records from visible totals and results.
      transactions: projection?.transactions ?? [],
      summary:
        projection === null
          ? null
          : calculateMonthlySummary(
              projection.transactions,
              selectedMonth,
              this.readBudget(projection.budgets, selectedMonth),
            ),
      sync: {
        mode: "local-only",
        remoteSyncEnabled: false,
        pendingChanges: 0,
        lastSyncedAt: null,
        lastError: null,
      },
    };
  }

  async createWorkspace(input: WorkspaceSetupInput): Promise<Workspace> {
    const decoded = decodeWorkspaceSetup(input);
    const normalized = normalizeWorkspaceSetup(decoded);
    return this.mutate((state) => {
      if (state.ledger !== null)
        throw new Error("LUNA_ERROR:already-configured");
      const now = new Date().toISOString();
      const workspace: Workspace = {
        id: randomId("workspace"),
        name: normalized.name,
        currency: normalized.currency,
        precision: normalized.precision,
        createdAt: now,
      };
      state.ledger = seedLedgerDocumentV3(workspace, [], {
        [localMonthFromTimestamp(now)]: normalized.monthlyBudgetMinor,
      }, defaultCategoryCatalog(state.settings.portable.locale.value));
      return workspace;
    });
  }

  async createTransaction(input: TransactionDraft): Promise<Transaction> {
    const decoded = decodeTransactionDraft(input);
    await this.ensureDraftImages(decoded.attachments);
    return this.mutate((state) => {
      const ledger = this.requireLedger(state);
      const transaction = createTransaction(
        randomId("transaction"),
        decoded,
        ledger.workspace.precision,
        new Date().toISOString(),
      );
      assertWebTransactionCategories(ledger, transaction, true);
      const resolved = resolveWebAttachmentRefs(
        state,
        decoded.attachments,
        ledger.workspace.id,
      );
      const value = graphTransactionValue(ledger, transaction, resolved.descriptors);
      state.ledger = appendLedgerRevision(
        ledger,
        {
          id: randomId("revision"),
          kind: "transaction",
          entityId: transaction.id,
          value,
        },
        [],
      );
      promoteWebAttachments(state, resolved.tokens, value);
      return publicTransactionValue(value);
    });
  }

  async updateTransaction(
    id: string,
    input: TransactionDraft,
    expectedRevision?: number,
  ): Promise<Transaction> {
    const transactionId = decodeId(id, "transaction id");
    const decoded = decodeTransactionDraft(input);
    await this.ensureDraftImages(decoded.attachments);
    return this.mutate((state) => {
      const ledger = this.requireLedger(state);
      const current = this.requireTransaction(ledger, transactionId);
      assertExpectedRevision(current, expectedRevision);
      const transaction = reviseTransaction(
        current,
        decoded,
        ledger.workspace.precision,
        new Date().toISOString(),
      );
      assertWebTransactionCategories(ledger, transaction, false);
      const currentStored = readStoredTransactionFromLedger(ledger, transactionId);
      const resolved =
        decoded.attachments === undefined
          ? { descriptors: [...currentStored.attachments], tokens: [] as string[] }
          : resolveWebAttachmentRefs(
              state,
              decoded.attachments,
              ledger.workspace.id,
              currentStored.attachments,
            );
      const value = graphTransactionValue(ledger, transaction, resolved.descriptors);
      state.ledger = appendLedgerRevision(ledger, {
        id: randomId("revision"),
        kind: "transaction",
        entityId: transaction.id,
        value,
      });
      promoteWebAttachments(state, resolved.tokens, value);
      return publicTransactionValue(value);
    });
  }

  async deleteTransaction(
    id: string,
    expectedRevision?: number,
  ): Promise<Transaction> {
    const transactionId = decodeId(id, "transaction id");
    return this.mutate((state) => {
      const ledger = this.requireLedger(state);
      const current = this.requireTransaction(ledger, transactionId);
      assertExpectedRevision(current, expectedRevision);
      const transaction = tombstoneTransaction(
        current,
        new Date().toISOString(),
      );
      const currentStored = readStoredTransactionFromLedger(ledger, transactionId);
      const value = graphTransactionValue(ledger, transaction, currentStored.attachments);
      state.ledger = appendLedgerRevision(ledger, {
        id: randomId("revision"),
        kind: "transaction",
        entityId: transaction.id,
        value,
      });
      return publicTransactionValue(value);
    });
  }

  async createCategory(
    input: CategoryCreateInput,
    expectedHeadIds?: string[],
  ): Promise<CategoryDefinition> {
    const decoded = decodeCategoryCreateInput(input);
    return this.mutate((state) => {
      const ledger = this.requireLedger(state);
      const catalog = this.readCategoryCatalog(ledger);
      assertWebCategoryHeads(ledger, expectedHeadIds);
      const position = catalog.categories
        .filter((category) => category.type === decoded.type)
        .reduce((highest, category) => Math.max(highest, category.position), -1) + 1;
      const category: CategoryDefinition = {
        id: randomId("category"),
        type: decoded.type,
        name: decoded.name,
        enabled: true,
        position,
        deletedAt: null,
      };
      state.ledger = appendLedgerRevision(ledger, {
        id: randomId("revision"),
        kind: "category-catalog",
        entityId: ledger.workspace.id,
        value: validateCategoryCatalog({ categories: [...catalog.categories, category] }),
      }, expectedHeadIds);
      return category;
    });
  }

  async updateCategory(
    id: string,
    input: CategoryUpdateInput,
    expectedHeadIds?: string[],
  ): Promise<CategoryDefinition> {
    const categoryId = decodeId(id, "category id");
    const decoded = decodeCategoryUpdateInput(input);
    return this.mutate((state) => {
      const ledger = this.requireLedger(state);
      const catalog = this.readCategoryCatalog(ledger);
      assertWebCategoryHeads(ledger, expectedHeadIds);
      const current = categoryDefinitionById(catalog, categoryId);
      if (current === undefined || current.deletedAt !== null)
        throw new Error("LUNA_ERROR:not-found");
      const updated: CategoryDefinition = {
        ...current,
        ...(decoded.name === undefined ? {} : { name: decoded.name }),
        ...(decoded.enabled === undefined ? {} : { enabled: decoded.enabled }),
      };
      state.ledger = appendLedgerRevision(ledger, {
        id: randomId("revision"),
        kind: "category-catalog",
        entityId: ledger.workspace.id,
        value: validateCategoryCatalog({
          categories: catalog.categories.map((category) =>
            category.id === categoryId ? updated : category,
          ),
        }),
      }, expectedHeadIds);
      return updated;
    });
  }

  async deleteCategory(id: string, expectedHeadIds?: string[]): Promise<void> {
    const categoryId = decodeId(id, "category id");
    return this.mutate((state) => {
      const ledger = this.requireLedger(state);
      const catalog = this.readCategoryCatalog(ledger);
      assertWebCategoryHeads(ledger, expectedHeadIds);
      const current = categoryDefinitionById(catalog, categoryId);
      if (current === undefined || current.deletedAt !== null)
        throw new Error("LUNA_ERROR:not-found");
      const usage = categoryUsageFromDocument(ledger, categoryId);
      if (usage.length > 0)
        throw new Error("LUNA_ERROR:category-in-use");
      state.ledger = appendLedgerRevision(ledger, {
        id: randomId("revision"),
        kind: "category-catalog",
        entityId: ledger.workspace.id,
        value: validateCategoryCatalog({
          categories: catalog.categories.map((category) =>
            category.id === categoryId
              ? { ...category, enabled: false, deletedAt: new Date().toISOString() }
              : category,
          ),
        }),
      }, expectedHeadIds);
    });
  }

  async getCategoryUsage(id: string): Promise<CategoryUsage[]> {
    const categoryId = decodeId(id, "category id");
    const ledger = this.requireLedger(decodeStoredState(await this.store.read()));
    const catalog = this.readCategoryCatalog(ledger);
    if (categoryDefinitionById(catalog, categoryId) === undefined)
      throw new Error("LUNA_ERROR:not-found");
    return categoryUsageFromDocument(ledger, categoryId);
  }

  async reassignCategory(input: CategoryReassignmentInput): Promise<void> {
    const decoded = decodeCategoryReassignmentInput(input);
    return this.mutate((state) => {
      const ledger = this.requireLedger(state);
      const catalog = this.readCategoryCatalog(ledger);
      assertWebCategoryHeads(ledger, decoded.expectedHeadIds);
      const source = categoryDefinitionById(catalog, decoded.sourceCategoryId);
      const target = categoryDefinitionById(catalog, decoded.targetCategoryId);
      if (
        source === undefined || target === undefined ||
        source.deletedAt !== null || target.deletedAt !== null ||
        !target.enabled || source.type !== target.type || source.id === target.id
      )
        throw new Error("LUNA_ERROR:invalid-category");
      const projection = projectLedgerDocument(ledger);
      const updates: Array<{ next: Transaction; value: Transaction | StoredTransaction }> = [];
      for (const transactionId of decoded.transactionIds) {
        const transaction = projection.transactions.find(
          (item) => item.id === transactionId && item.deletedAt === null,
        );
        if (transaction === undefined) throw new Error("LUNA_ERROR:not-found");
        assertExpectedRevision(transaction, decoded.expectedRevisions[transactionId]);
        if (!transaction.splits.some((split) => split.category === source.id))
          throw new Error("LUNA_ERROR:invalid-category");
        const next = reassignWebTransactionCategory(
          transaction,
          source.id,
          target.id,
          new Date().toISOString(),
        );
        const currentStored = readStoredTransactionFromLedger(ledger, transaction.id);
        updates.push({
          next,
          value: graphTransactionValue(ledger, next, currentStored.attachments),
        });
      }
      for (const update of updates) {
        state.ledger = appendLedgerRevision(state.ledger!, {
          id: randomId("revision"),
          kind: "transaction",
          entityId: update.next.id,
          value: update.value,
        });
      }
    });
  }

  async setMonthlyBudget(
    month: string,
    budgetMinor: string | null,
    expectedHeadIds?: string[],
  ): Promise<void> {
    const decoded = decodeBudgetUpdate({ month, budgetMinor, expectedHeadIds });
    const normalized =
      decoded.budgetMinor === null
        ? null
        : normalizeBudget(decoded.budgetMinor);
    return this.mutate((state) => {
      const document = this.requireLedger(state);
      assertBudgetHeads(document, decoded.month, decoded.expectedHeadIds);
      state.ledger = appendLedgerRevision(document, {
        id: randomId("revision"),
        kind: "budget",
        entityId: decoded.month,
        value: normalized,
      });
    });
  }

  async getLedgerDocument(): Promise<LedgerDocument | null> {
    return decodeStoredState(await this.store.read()).ledger;
  }

  async getMigrationLease(): Promise<MigrationLease | null> {
    return this.store.getMigrationLease();
  }

  async acquireMigrationLease(
    lease: MigrationLease,
  ): Promise<void> {
    await this.store.acquireMigrationLease(lease);
  }

  async renewMigrationLease(
    leaseId: string,
    expiresAt: string,
  ): Promise<void> {
    await this.store.renewMigrationLease(leaseId, expiresAt);
  }

  async releaseMigrationLease(leaseId: string): Promise<void> {
    await this.store.releaseMigrationLease(leaseId);
  }

  async getRemotePayloadVersion(targetId: string): Promise<1 | 2 | 3 | null> {
    validateRemoteTargetId(targetId);
    const state = decodeStoredState(await this.store.read());
    return state.remotePayloadVersions[targetId] ?? null;
  }

  async setRemotePayloadVersion(
    targetId: string,
    version: 1 | 2 | 3,
  ): Promise<void> {
    validateRemoteTargetId(targetId);
    await this.mutate((state) => {
      const current = state.remotePayloadVersions[targetId];
      if (current !== undefined && current >= version) return;
      state.remotePayloadVersions[targetId] = version;
    });
  }

  async mergeLedgerDocument(
    input: LedgerDocument,
    signal?: AbortSignal,
  ): Promise<LedgerDocument> {
    const remote = decodeLedgerDocument(input);
    return this.mutate((state) => {
      const merged =
        state.ledger === null
          ? remote
          : mergeLedgerDocuments(state.ledger, remote);
      validateAttachmentInventoryQuota(attachmentInventory(merged));
      state.ledger = merged;
      return state.ledger;
    }, signal);
  }

  private async restoreFullBackupArchive(
    archive: FullBackupArchive,
  ): Promise<void> {
    const incoming = decodeLedgerDocument(archive.graph);
    if (incoming.schemaVersion !== 2 && incoming.schemaVersion !== 3)
      throw new FullBackupError("backup-invalid-container");
    const inventory = attachmentInventory(incoming);
    if (inventory.size !== archive.attachments.length)
      throw new FullBackupError("backup-attachment-mismatch");
    const verified = archive.attachments.map((item) => ({
      descriptor: { ...item.descriptor },
      ciphertext: new Uint8Array(item.ciphertext),
    }));
    const provided = new Set<string>();
    for (const item of verified) {
      const expected = inventory.get(item.descriptor.id);
      if (
        expected === undefined ||
        JSON.stringify(expected) !== JSON.stringify(item.descriptor) ||
        provided.has(item.descriptor.id) ||
        item.ciphertext.byteLength !== item.descriptor.cipherByteLength
      )
        throw new FullBackupError("backup-attachment-mismatch");
      provided.add(item.descriptor.id);
      try {
        await decryptAttachmentBytes(item.ciphertext, item.descriptor);
      } catch (error) {
        if (error instanceof AttachmentContractError)
          throw new FullBackupError("backup-attachment-mismatch");
        throw error;
      }
    }
    if (provided.size !== inventory.size)
      throw new FullBackupError("backup-attachment-missing");

    const before = decodeStoredState(await this.store.read());
    if (
      before.ledger !== null &&
      before.ledger.workspace.id !== incoming.workspace.id
    )
      throw new FullBackupError("backup-workspace-mismatch");
    const newBinaryKeys: string[] = [];
    try {
      for (const item of verified) {
        const existing = before.attachments.find(
          (record) => record.attachmentId === item.descriptor.id,
        );
        if (
          existing !== undefined &&
          JSON.stringify(existing.descriptor) !== JSON.stringify(item.descriptor)
        )
          throw new FullBackupError("backup-attachment-mismatch");
        const binaryKey = attachmentBinaryKey(
          item.descriptor.workspaceId,
          item.descriptor.id,
        );
        if (existing === undefined) newBinaryKeys.push(binaryKey);
        // Rewriting an existing key repairs a damaged local blob while the
        // graph is still unpublished; the JSON state remains the commit point.
        await this.store.writeBinary(binaryKey, item.ciphertext);
      }
      await this.mutate((state) => {
        const current = state.ledger;
        if (
          current !== null &&
          current.workspace.id !== incoming.workspace.id
        )
          throw new FullBackupError("backup-workspace-mismatch");
        const merged =
          current === null ? incoming : mergeLedgerDocuments(current, incoming);
        try {
          validateAttachmentInventoryQuota(attachmentInventory(merged));
        } catch (error) {
          if (error instanceof AttachmentContractError)
            throw new FullBackupError("backup-too-large");
          throw error;
        }
        for (const item of verified) {
          const present = state.attachments.find(
            (record) => record.attachmentId === item.descriptor.id,
          );
          if (present !== undefined) {
            if (
              JSON.stringify(present.descriptor) !==
              JSON.stringify(item.descriptor)
            )
              throw new FullBackupError("backup-attachment-mismatch");
            present.state = "committed";
            present.draftToken = null;
            present.draftSessionId = null;
            continue;
          }
          assertAttachmentQuota(
            state.attachments,
            item.ciphertext.byteLength,
            1,
          );
          state.attachments.push({
            attachmentId: item.descriptor.id,
            draftToken: null,
            draftSessionId: null,
            descriptor: { ...item.descriptor },
            binaryKey: attachmentBinaryKey(
              item.descriptor.workspaceId,
              item.descriptor.id,
            ),
            state: "committed",
            createdAt: new Date().toISOString(),
          });
        }
        state.ledger = merged;
      });
    } catch (error) {
      const after = decodeStoredState(await this.store.read()).attachments;
      for (const key of newBinaryKeys) {
        if (!after.some((record) => record.binaryKey === key))
          await this.store.deleteBinary(key).catch(() => undefined);
      }
      throw error;
    }
  }

  private async commitStagedFullBackup(
    _sessionId: string,
    incoming: import("../shared/ledger-sync").LedgerDocument,
    staged: ReadonlyMap<
      string,
      { descriptor: StoredAttachmentDescriptor; binaryKey: string }
    >,
  ): Promise<void> {
    const inventory = attachmentInventory(incoming);
    if (inventory.size !== staged.size)
      throw new FullBackupError("backup-attachment-mismatch");
    const before = decodeStoredState(await this.store.read());
    if (
      before.ledger !== null &&
      before.ledger.workspace.id !== incoming.workspace.id
    )
      throw new FullBackupError("backup-workspace-mismatch");

    let addedBytes = 0;
    let addedCount = 0;
    for (const item of staged.values()) {
      const expected = inventory.get(item.descriptor.id);
      if (
        expected === undefined ||
        JSON.stringify(expected) !== JSON.stringify(item.descriptor)
      )
        throw new FullBackupError("backup-attachment-mismatch");
      const ciphertext = await this.store.readBinary(item.binaryKey);
      if (
        ciphertext === null ||
        ciphertext.byteLength !== item.descriptor.cipherByteLength
      )
        throw new FullBackupError("backup-attachment-mismatch");
      let plaintext: Uint8Array | undefined;
      try {
        plaintext = await decryptAttachmentBytes(ciphertext, item.descriptor);
      } catch (error) {
        if (error instanceof AttachmentContractError)
          throw new FullBackupError("backup-attachment-mismatch");
        throw error;
      } finally {
        plaintext?.fill(0);
        ciphertext.fill(0);
      }
      const existing = before.attachments.find(
        (record) => record.attachmentId === item.descriptor.id,
      );
      if (existing === undefined) {
        addedBytes += item.descriptor.cipherByteLength;
        addedCount += 1;
      } else if (
        JSON.stringify(existing.descriptor) !== JSON.stringify(item.descriptor)
      ) {
        throw new FullBackupError("backup-attachment-mismatch");
      }
    }
    try {
      assertAttachmentQuota(before.attachments, addedBytes, addedCount);
    } catch (error) {
      if (error instanceof AttachmentContractError)
        throw new FullBackupError("backup-too-large");
      throw error;
    }

    await this.mutate((state) => {
      const current = state.ledger;
      if (
        current !== null &&
        current.workspace.id !== incoming.workspace.id
      )
        throw new FullBackupError("backup-workspace-mismatch");
      const merged =
        current === null ? incoming : mergeLedgerDocuments(current, incoming);
      try {
        validateAttachmentInventoryQuota(attachmentInventory(merged));
      } catch (error) {
        if (error instanceof AttachmentContractError)
          throw new FullBackupError("backup-too-large");
        throw error;
      }
      for (const item of staged.values()) {
        const present = state.attachments.find(
          (record) => record.attachmentId === item.descriptor.id,
        );
        if (present !== undefined) {
          if (
            JSON.stringify(present.descriptor) !==
            JSON.stringify(item.descriptor)
          )
            throw new FullBackupError("backup-attachment-mismatch");
          present.state = "committed";
          present.draftToken = null;
          present.draftSessionId = null;
          continue;
        }
        state.attachments.push({
          attachmentId: item.descriptor.id,
          draftToken: null,
          draftSessionId: null,
          descriptor: { ...item.descriptor },
          binaryKey: item.binaryKey,
          state: "committed",
          createdAt: new Date().toISOString(),
        });
      }
      state.ledger = merged;
    });
  }

  async getLedgerConflicts(): Promise<PublicLedgerConflict[]> {
    const ledger = await this.getLedgerDocument();
    return ledger === null
      ? []
      : projectLedgerConflicts(projectLedgerDocument(ledger).conflicts);
  }

  async resolveLedgerConflict(
    input: LedgerConflictChoice,
  ): Promise<void> {
    const choice = decodeLedgerConflictChoice(input);
    await this.mutate((state) => {
      state.ledger = resolveLedgerChoice(
        this.requireLedger(state),
        choice,
        randomId("revision"),
        new Date().toISOString(),
      );
    });
  }

  async getSettings(): Promise<RendererSettings> {
    return this.configSession.getRendererSettings();
  }

  async updateSettings(input: SettingsUpdateInput): Promise<RendererSettings> {
    return this.configSession.updateSettings(input);
  }

  async configureConfigSync(
    input: ConfigureConfigSyncInput,
  ): Promise<RendererSettings> {
    return this.configSession.configure(input);
  }

  async testConfigSync(): Promise<ConfigSyncActionResult> {
    return this.configSession.testConnection();
  }

  async syncConfigNow(): Promise<ConfigSyncActionResult> {
    return this.configSession.syncNow();
  }

  async clearConfigSync(): Promise<RendererSettings> {
    return this.configSession.clearLocalConfiguration();
  }

  private requireLedger(state: WebLedgerState): LedgerDocument {
    if (state.ledger === null) throw new Error("LUNA_ERROR:invalid-workspace");
    return state.ledger;
  }

  private readCategoryCatalog(ledger: LedgerDocument): CategoryCatalog {
    if (ledger.schemaVersion < 3)
      throw new Error("LUNA_ERROR:invalid-category");
    const projection = projectLedgerDocument(ledger);
    if (projection.conflicts.some((conflict) => conflict.kind === "category-catalog"))
      throw new Error("LUNA_ERROR:category-conflict");
    return validateCategoryCatalog({
      categories: projection.categories.map((category) => ({ ...category })),
    });
  }

  private requireTransaction(ledger: LedgerDocument, id: string): Transaction {
    const projection = projectLedgerDocument(ledger);
    if (
      projection.conflicts.some(
        (conflict) =>
          conflict.kind === "transaction" && conflict.entityId === id,
      )
    ) {
      throw new LedgerSyncError("ledger-conflict");
    }
    const transaction = projection.transactions.find(
      (value) => value.id === id,
    );
    if (transaction === undefined) throw new Error("LUNA_ERROR:not-found");
    return transaction;
  }

  private readBudget(
    budgets: Readonly<Record<string, string | null>>,
    month: string,
  ): string | null {
    if (Object.prototype.hasOwnProperty.call(budgets, month)) {
      return budgets[month] ?? null;
    }
    const inheritedMonth = Object.keys(budgets)
      .filter((candidate) => candidate < month)
      .sort()
      .at(-1);
    return inheritedMonth === undefined
      ? null
      : (budgets[inheritedMonth] ?? null);
  }

  private async mutate<T>(
    change: (state: WebLedgerState) => T,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.store.update((raw) => {
      const candidate = decodeStoredState(raw);
      const result = change(candidate);
      return { result, value: JSON.stringify(candidate) };
    }, signal);
  }
}

export function decodeStoredState(raw: string | null): WebLedgerState {
  if (raw === null) return createInitialState();
  try {
    return decodeWebState(JSON.parse(raw));
  } catch {
    throw new Error("LUNA_ERROR:web-storage-invalid");
  }
}

function createInitialState(): WebLedgerState {
  return {
    schemaVersion: WEB_STATE_SCHEMA_VERSION,
    settings: createDefaultSettings(
      randomId("web"),
      typeof navigator === "undefined" ? "en" : navigator.language,
    ),
    ledger: null,
    attachments: [],
    remotePayloadVersions: {},
  };
}

function decodeWebState(value: unknown): WebLedgerState {
  if (!isRecord(value)) {
    throw new Error("Invalid browser state.");
  }
  if (value.schemaVersion === WEB_STATE_SCHEMA_VERSION) {
    assertExactKeys(value, [
      "schemaVersion",
      "settings",
      "ledger",
      "attachments",
      "remotePayloadVersions",
    ]);
    if (
      !Array.isArray(value.attachments) ||
      value.attachments.length > MAX_LEDGER_ATTACHMENT_COUNT
    )
      throw new Error("Invalid browser attachments.");
    const settings = decodeSettingsFile(value.settings);
    const decodedLedger = decodeWebLedgerState(value.ledger, settings.portable.locale.value);
    return {
      schemaVersion: WEB_STATE_SCHEMA_VERSION,
      settings,
      ledger: decodedLedger.ledger,
      // Legacy ledger graphs are intentionally reset to a fresh catalog, so
      // staged/committed attachment blobs from those discarded records must
      // not remain as unreachable browser state.
      attachments: decodedLedger.legacy ? [] : value.attachments.map(decodeWebAttachment),
      remotePayloadVersions: decodeRemotePayloadVersions(
        value.remotePayloadVersions,
      ),
    };
  }
  if (value.schemaVersion === 3) {
    assertExactKeys(value, ["schemaVersion", "settings", "ledger", "attachments"]);
    if (
      !Array.isArray(value.attachments) ||
      value.attachments.length > MAX_LEDGER_ATTACHMENT_COUNT
    )
      throw new Error("Invalid browser attachments.");
    const settings = decodeSettingsFile(value.settings);
    const decodedLedger = decodeWebLedgerState(value.ledger, settings.portable.locale.value);
    return {
      schemaVersion: WEB_STATE_SCHEMA_VERSION,
      settings,
      ledger: decodedLedger.ledger,
      attachments: decodedLedger.legacy ? [] : value.attachments.map(decodeWebAttachment),
      remotePayloadVersions: {},
    };
  }
  if (value.schemaVersion === 2) {
    assertExactKeys(value, ["schemaVersion", "settings", "ledger"]);
    const settings = decodeSettingsFile(value.settings);
    return {
      schemaVersion: WEB_STATE_SCHEMA_VERSION,
      settings,
      ledger: decodeWebLedgerState(value.ledger, settings.portable.locale.value).ledger,
      attachments: [],
      remotePayloadVersions: {},
    };
  }
  if (value.schemaVersion !== 1) throw new Error("Invalid browser state.");
  assertExactKeys(value, [
    "schemaVersion",
    "settings",
    "workspace",
    "transactions",
    "budgets",
  ]);
  const settings = decodeSettingsFile(value.settings);
  const workspace =
    value.workspace === null ? null : decodeWorkspace(value.workspace);
  if (!Array.isArray(value.transactions) || !isRecord(value.budgets)) {
    throw new Error("Invalid browser state collections.");
  }
  const transactions = value.transactions.map((item) =>
    decodeTransaction(item, workspace?.precision ?? 2),
  );
  if (
    workspace === null &&
    (transactions.length > 0 || Object.keys(value.budgets).length > 0)
  ) {
    throw new Error("Financial records require a workspace.");
  }
  const budgets: Record<string, string | null> = {};
  for (const [month, budget] of Object.entries(value.budgets)) {
    decodeMonth(month);
    if (budget !== null && typeof budget !== "string")
      throw new Error("Invalid browser budget.");
    budgets[month] = budget === null ? null : normalizeBudget(budget);
  }
  return {
    schemaVersion: WEB_STATE_SCHEMA_VERSION,
    settings,
    attachments: [],
    remotePayloadVersions: {},
    ledger:
      workspace === null
        ? null
        : seedLedgerDocumentV3(workspace, [], budgets, defaultCategoryCatalog(settings.portable.locale.value)),
  };
}

function decodeWebLedgerState(
  value: unknown,
  locale: import("../shared/settings").AppLocale,
): { ledger: LedgerDocument | null; legacy: boolean } {
  if (value === null) return { ledger: null, legacy: false };
  const ledger = decodeLedgerDocument(value);
  if (ledger.schemaVersion >= 3) return { ledger, legacy: false };
  const projection = projectLedgerDocument(ledger);
  return {
    ledger: seedLedgerDocumentV3(
      projection.workspace,
      [],
      projection.budgets,
      defaultCategoryCatalog(locale),
    ),
    legacy: true,
  };
}

function normalizeBudget(value: string): string {
  const normalized = canonicalMinorUnits(value);
  if (normalized.startsWith("-")) throw new Error("LUNA_ERROR:invalid-amount");
  return normalized;
}

function assertWebCategoryHeads(
  document: LedgerDocument,
  expected: string[] | undefined,
): void {
  if (expected === undefined) return;
  if (JSON.stringify(decodeLedgerHeadIds(expected)) !== JSON.stringify(categoryHeadIds(document)))
    throw new Error("LUNA_ERROR:category-stale");
}

function assertWebTransactionCategories(
  document: LedgerDocument,
  transaction: Transaction,
  isCreate: boolean,
): void {
  const catalog = validateCategoryCatalog({
    categories: projectLedgerDocument(document).categories.map((category) => ({ ...category })),
  });
  for (const split of transaction.splits) {
    const category = categoryDefinitionById(catalog, split.category);
    if (
      category === undefined ||
      category.type !== transaction.type ||
      (isCreate && (!category.enabled || category.deletedAt !== null))
    ) {
      throw new Error("LUNA_ERROR:invalid-category");
    }
  }
}

function categoryUsageFromDocument(
  document: LedgerDocument,
  categoryId: string,
): CategoryUsage[] {
  return projectLedgerDocument(document).transactions
    .filter((transaction) => transaction.deletedAt === null)
    .flatMap((transaction) => {
      const matching = transaction.splits.filter((split) => split.category === categoryId);
      if (matching.length === 0) return [];
      const sourceAmountMinor = matching
        .reduce((total, split) => total + parseMinorUnits(split.amountMinor), 0n)
        .toString();
      return [{
        transactionId: transaction.id,
        revision: transaction.revision,
        date: transaction.date,
        type: transaction.type,
        amountMinor: transaction.amountMinor,
        merchant: transaction.merchant,
        notes: transaction.notes,
        sourceAmountMinor,
      }];
    })
    .sort((left, right) =>
      right.date.localeCompare(left.date) || left.transactionId.localeCompare(right.transactionId),
    );
}

function reassignWebTransactionCategory(
  transaction: Transaction,
  sourceCategoryId: string,
  targetCategoryId: string,
  now: string,
): Transaction {
  const sourceSplits = transaction.splits.filter((split) => split.category === sourceCategoryId);
  if (sourceSplits.length === 0) throw new Error("LUNA_ERROR:invalid-category");
  const target = transaction.splits.find((split) => split.category === targetCategoryId);
  const sourceAmount = sourceSplits.reduce((total, split) => total + parseMinorUnits(split.amountMinor), 0n);
  const splits = target === undefined
    ? transaction.splits.reduce<Array<{ category: string; amountMinor: string }>>((result, split) => {
        if (split.category !== sourceCategoryId) {
          result.push({ ...split });
        } else if (!result.some((candidate) => candidate.category === targetCategoryId)) {
          result.push({ ...split, category: targetCategoryId, amountMinor: canonicalMinorUnits(sourceAmount.toString()) });
        }
        return result;
      }, [])
    : transaction.splits
        .filter((split) => split.category !== sourceCategoryId)
        .map((split) => split.category === targetCategoryId
          ? {
              ...split,
              amountMinor: canonicalMinorUnits(
                (parseMinorUnits(split.amountMinor) + sourceAmount).toString(),
              ),
            }
          : { ...split });
  return { ...transaction, revision: transaction.revision + 1, updatedAt: now, splits };
}

function decodeWebAttachment(value: unknown): WebAttachmentRecord {
  if (!isRecord(value)) throw new Error("Invalid browser attachment.");
  assertExactKeys(value, [
    "attachmentId",
    "draftToken",
    "draftSessionId",
    "descriptor",
    "binaryKey",
    "state",
    "createdAt",
  ]);
  validateAttachmentDescriptor(value.descriptor);
  const descriptor = { ...value.descriptor };
  if (value.attachmentId !== descriptor.id) throw new Error("Invalid browser attachment.");
  if (
    typeof value.attachmentId !== "string" ||
    typeof value.binaryKey !== "string" ||
    value.binaryKey !== attachmentBinaryKey(descriptor.workspaceId, descriptor.id) ||
    typeof value.createdAt !== "string" ||
    Number.isNaN(Date.parse(value.createdAt))
  )
    throw new Error("Invalid browser attachment.");
  if (value.state !== "staged" && value.state !== "committed")
    throw new Error("Invalid browser attachment.");
  if (value.state === "staged") {
    if (
      typeof value.draftToken !== "string" ||
      value.draftToken.length === 0 ||
      value.draftToken.length > 256 ||
      typeof value.draftSessionId !== "string" ||
      value.draftSessionId.length === 0 ||
      value.draftSessionId.length > 256
    )
      throw new Error("Invalid browser attachment.");
  } else if (value.draftToken !== null || value.draftSessionId !== null) {
    throw new Error("Invalid browser attachment.");
  }
  return {
    attachmentId: descriptor.id,
    draftToken: value.draftToken as string | null,
    draftSessionId: value.draftSessionId as string | null,
    descriptor,
    binaryKey: value.binaryKey,
    state: value.state,
    createdAt: value.createdAt,
  };
}

function decodeRemotePayloadVersions(value: unknown): Record<string, 1 | 2 | 3> {
  if (!isRecord(value) || Object.keys(value).length > 1000)
    throw new Error("Invalid browser remote checkpoints.");
  const result: Record<string, 1 | 2 | 3> = {};
  for (const [targetId, version] of Object.entries(value)) {
    validateRemoteTargetId(targetId);
    if (version !== 1 && version !== 2 && version !== 3)
      throw new Error("Invalid browser remote checkpoint version.");
    result[targetId] = version;
  }
  return result;
}

function validateRemoteTargetId(value: string): void {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048)
    throw new Error("LUNA_ERROR:invalid-input");
}

function resolveWebAttachmentRefs(
  state: WebLedgerState,
  refs: readonly AttachmentRef[] | undefined,
  workspaceId: string,
  current: readonly StoredAttachmentDescriptor[] = [],
): { descriptors: StoredAttachmentDescriptor[]; tokens: string[] } {
  if (refs === undefined) return { descriptors: [], tokens: [] };
  if (refs.length > MAX_ATTACHMENTS_PER_TRANSACTION)
    throw new Error("LUNA_ERROR:attachment-invalid-reference");
  const currentById = new Map(current.map((descriptor) => [descriptor.id, descriptor]));
  const descriptors: StoredAttachmentDescriptor[] = [];
  const tokens: string[] = [];
  const ids = new Set<string>();
  for (const ref of refs) {
    let descriptor: StoredAttachmentDescriptor | undefined;
    if (ref.attachmentId !== undefined) {
      descriptor = currentById.get(ref.attachmentId);
    } else if (ref.draftToken !== undefined) {
      const staged = state.attachments.find(
        (item) => item.state === "staged" && item.draftToken === ref.draftToken,
      );
      descriptor = staged?.descriptor;
      if (staged !== undefined) tokens.push(ref.draftToken);
    }
    if (descriptor === undefined || descriptor.workspaceId !== workspaceId || ids.has(descriptor.id))
      throw new Error("LUNA_ERROR:attachment-invalid-reference");
    ids.add(descriptor.id);
    descriptors.push({ ...descriptor });
  }
  return { descriptors, tokens };
}

function promoteWebAttachments(
  state: WebLedgerState,
  tokens: readonly string[],
  value: Transaction | StoredTransaction,
): void {
  if (tokens.length === 0) return;
  if (!isStoredTransaction(value))
    throw new Error("LUNA_ERROR:attachment-invalid-reference");
  const descriptors = new Map(value.attachments.map((item) => [item.id, item]));
  for (const token of tokens) {
    const record = state.attachments.find(
      (item) => item.state === "staged" && item.draftToken === token,
    );
    if (record === undefined) throw new Error("LUNA_ERROR:attachment-not-found");
    const descriptor = descriptors.get(record.attachmentId);
    if (descriptor === undefined || JSON.stringify(descriptor) !== JSON.stringify(record.descriptor))
      throw new Error("LUNA_ERROR:attachment-invalid-reference");
    record.state = "committed";
    record.draftToken = null;
    record.draftSessionId = null;
  }
}

function graphTransactionValue(
  ledger: LedgerDocument,
  transaction: Transaction,
  attachments: readonly StoredAttachmentDescriptor[],
): Transaction | StoredTransaction {
  const financial = withoutAttachmentMetadata(transaction);
  return ledger.schemaVersion >= 2 || attachments.length > 0
    ? storedTransactionFromTransaction(financial, attachments)
    : financial;
}

function publicTransactionValue(value: Transaction | StoredTransaction): Transaction {
  return isStoredTransaction(value)
    ? storedTransactionToTransaction(value)
    : {
        ...value,
        splits: value.splits.map((split) => ({ ...split })),
        ...(value.attachments === undefined
          ? {}
          : { attachments: value.attachments.map((attachment) => ({ ...attachment })) }),
      };
}

function withoutAttachmentMetadata(
  transaction: Transaction,
): Omit<Transaction, "attachments"> {
  const { attachments: _attachments, ...financial } = transaction;
  return financial;
}

function readStoredTransactionFromLedger(
  ledger: LedgerDocument,
  id: string,
  conflictHeadId?: string,
): StoredTransaction {
  const transactionId = decodeId(id, "transaction id");
  const parentIds = new Set(ledger.revisions.flatMap((revision) => revision.parents));
  const heads = ledger.revisions.filter(
    (revision) =>
      revision.kind === "transaction" &&
      revision.entityId === transactionId &&
      !parentIds.has(revision.id),
  );
  const selected =
    conflictHeadId === undefined
      ? heads.length === 1
        ? heads[0]
        : heads.length > 1
          ? (() => {
              throw new LedgerSyncError("ledger-conflict");
            })()
          : undefined
      : heads.find((head) => head.id === conflictHeadId);
  if (selected === undefined || selected.kind !== "transaction") {
    if (conflictHeadId !== undefined) throw new LedgerSyncError("ledger-stale-heads");
    throw new Error("LUNA_ERROR:not-found");
  }
  return isStoredTransaction(selected.value)
    ? selected.value
    : storedTransactionFromTransaction(selected.value);
}

function assertAttachmentQuota(
  records: readonly WebAttachmentRecord[],
  extraBytes: number,
  extraCount: number,
): void {
  const bytes = records.reduce(
    (total, record) => total + record.descriptor.cipherByteLength,
    0,
  );
  if (
    bytes + extraBytes > MAX_LEDGER_ATTACHMENT_BYTES ||
    records.length + extraCount > MAX_LEDGER_ATTACHMENT_COUNT
  )
    throw new AttachmentContractError("attachment-quota-exceeded");
}

function attachmentBinaryKey(workspaceId: string, attachmentId: string): string {
  return `attachment:${workspaceId}:${attachmentId}`;
}

function validateDraftSessionId(value: string): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256)
    throw new Error("LUNA_ERROR:attachment-invalid-reference");
}

function randomId(prefix: string): string {
  return secureRandomId(prefix);
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): void {
  const expected = new Set(keys);
  if (Object.keys(value).some((key) => !expected.has(key)))
    throw new Error("Invalid browser state fields.");
  if (keys.some((key) => !(key in value)))
    throw new Error("Incomplete browser state.");
}
