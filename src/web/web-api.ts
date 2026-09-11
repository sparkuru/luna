import {
  assertExpectedRevision,
  calculateMonthlySummary,
  canonicalMinorUnits,
  createTransaction,
  decodeId,
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
import {
  appendLedgerRevision,
  assertBudgetHeads,
  budgetHeadIds,
  decodeLedgerDocument,
  LedgerSyncError,
  mergeLedgerDocuments,
  projectLedgerDocument,
  seedLedgerDocument,
  type LedgerConflict,
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

const WEB_STATE_SCHEMA_VERSION = 2 as const;

interface WebLedgerState {
  schemaVersion: typeof WEB_STATE_SCHEMA_VERSION;
  settings: AppSettingsFileV1;
  ledger: LedgerDocument | null;
}

/**
 * Browser-local host for the shared renderer. It deliberately has no access
 * to Node, Electron, SQLite, filesystem paths, or provider SDKs.
 */
export function createWebLedgerApi(
  storage: Storage | null = safeLocalStorage(),
  database?: IDBFactory | null,
): LunaLedgerApi {
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
      state.ledger = seedLedgerDocument(workspace, [], {
        [localMonthFromTimestamp(now)]: normalized.monthlyBudgetMinor,
      });
      return workspace;
    });
  }

  async createTransaction(input: TransactionDraft): Promise<Transaction> {
    const decoded = decodeTransactionDraft(input);
    return this.mutate((state) => {
      const ledger = this.requireLedger(state);
      const transaction = createTransaction(
        randomId("transaction"),
        decoded,
        ledger.workspace.precision,
        new Date().toISOString(),
      );
      state.ledger = appendLedgerRevision(
        ledger,
        {
          id: randomId("revision"),
          kind: "transaction",
          entityId: transaction.id,
          value: transaction,
        },
        [],
      );
      return transaction;
    });
  }

  async updateTransaction(
    id: string,
    input: TransactionDraft,
    expectedRevision?: number,
  ): Promise<Transaction> {
    const transactionId = decodeId(id, "transaction id");
    const decoded = decodeTransactionDraft(input);
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
      state.ledger = appendLedgerRevision(ledger, {
        id: randomId("revision"),
        kind: "transaction",
        entityId: transaction.id,
        value: transaction,
      });
      return transaction;
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
      state.ledger = appendLedgerRevision(ledger, {
        id: randomId("revision"),
        kind: "transaction",
        entityId: transaction.id,
        value: transaction,
      });
      return transaction;
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

  async mergeLedgerDocument(
    input: LedgerDocument,
    signal?: AbortSignal,
  ): Promise<LedgerDocument> {
    const remote = decodeLedgerDocument(input);
    return this.mutate((state) => {
      state.ledger =
        state.ledger === null
          ? remote
          : mergeLedgerDocuments(state.ledger, remote);
      return state.ledger;
    }, signal);
  }

  async getLedgerConflicts(): Promise<LedgerConflict[]> {
    const ledger = await this.getLedgerDocument();
    return ledger === null ? [] : projectLedgerDocument(ledger).conflicts;
  }

  async resolveLedgerConflict(
    input: LedgerConflictChoice,
  ): Promise<LedgerDocument> {
    const choice = decodeLedgerConflictChoice(input);
    return this.mutate((state) => {
      state.ledger = resolveLedgerChoice(
        this.requireLedger(state),
        choice,
        randomId("revision"),
        new Date().toISOString(),
      );
      return state.ledger;
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
  };
}

function decodeWebState(value: unknown): WebLedgerState {
  if (!isRecord(value)) {
    throw new Error("Invalid browser state.");
  }
  if (value.schemaVersion === WEB_STATE_SCHEMA_VERSION) {
    assertExactKeys(value, ["schemaVersion", "settings", "ledger"]);
    return {
      schemaVersion: WEB_STATE_SCHEMA_VERSION,
      settings: decodeSettingsFile(value.settings),
      ledger: value.ledger === null ? null : decodeLedgerDocument(value.ledger),
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
    ledger:
      workspace === null
        ? null
        : seedLedgerDocument(workspace, transactions, budgets),
  };
}

function normalizeBudget(value: string): string {
  const normalized = canonicalMinorUnits(value);
  if (normalized.startsWith("-")) throw new Error("LUNA_ERROR:invalid-amount");
  return normalized;
}

function randomId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  const uuid =
    typeof cryptoApi?.randomUUID === "function"
      ? cryptoApi.randomUUID()
      : randomUuidFromValues(cryptoApi);
  return `${prefix}-${uuid}`;
}

function randomUuidFromValues(cryptoApi: Crypto | undefined): string {
  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error("LUNA_ERROR:secure-random-unavailable");
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
