import Database from "better-sqlite3";
import { decodeBinding, type ServerBinding } from "../shared/server-api";
import { randomUUID } from "node:crypto";
import {
  AppSnapshot,
  DomainError,
  Transaction,
  TransactionDraft,
  Workspace,
  WorkspaceSetupInput,
  calculateMonthlySummary,
  assertExpectedRevision,
  canonicalMinorUnits,
  createTransaction,
  decodeId,
  decodeMonth,
  localMonthFromTimestamp,
  normalizeWorkspaceSetup,
  parseMinorUnits,
  reviseTransaction,
  tombstoneTransaction,
} from "../shared/domain";
import type { LocalStore } from "../shared/ports";
import {
  appendLedgerRevision,
  assertBudgetHeads,
  budgetHeadIds,
  decodeLedgerDocument,
  mergeLedgerDocuments,
  projectLedgerDocument,
  seedLedgerDocument,
  LedgerSyncError,
  type LedgerConflict,
  type LedgerDocument,
  type LedgerRevisionInput,
} from "../shared/ledger-sync";
import {
  resolveLedgerChoice,
  type LedgerConflictChoice,
} from "../shared/ledger-data";

const SCHEMA_VERSION = 2;

interface WorkspaceRow {
  id: string;
  name: string;
  currency: string;
  precision: number;
  created_at: string;
}

interface TransactionRow {
  id: string;
  revision: number;
  type: "income" | "expense";
  amount_minor: string;
  local_date: string;
  merchant: string;
  payment_method: string;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface SplitRow {
  transaction_id: string;
  position: number;
  category: string;
  amount_minor: string;
}

interface BudgetRow {
  month: string;
  budget_minor: string | null;
}

/**
 * SQLite implementation of the local-only checkpoint.
 *
 * The schema is private to this adapter. Renderer code receives only domain
 * DTOs and never receives a database path, statement, or native object.
 */
export class SQLiteLocalStore implements LocalStore {
  private readonly database: Database.Database;

  constructor(filePath: string, profile = false) {
    this.database = new Database(filePath);
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("busy_timeout = 5000");
    if (filePath !== ":memory:") {
      this.database.pragma("journal_mode = WAL");
    }
    this.migrate();
    if (profile)
      this.database
        .transaction(() => {
          this.database.exec(
            "CREATE TABLE IF NOT EXISTS profile_metadata(singleton INTEGER PRIMARY KEY CHECK(singleton=1), binding_json TEXT NOT NULL)",
          );
          this.database.pragma("user_version = 3");
        })
        .immediate();
  }

  getProfileBinding(): ServerBinding | null {
    if (
      !this.database
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='profile_metadata'",
        )
        .get()
    )
      return null;
    const row = this.database
      .prepare("SELECT binding_json FROM profile_metadata WHERE singleton=1")
      .get() as { binding_json: string } | undefined;
    return row ? decodeBinding(JSON.parse(row.binding_json)) : null;
  }
  bindProfile(
    document: LedgerDocument,
    binding: ServerBinding,
    signal: AbortSignal,
  ): void {
    const incoming = decodeLedgerDocument(document);
    const valid = decodeBinding(binding);
    signal.throwIfAborted();
    this.database
      .transaction(() => {
        signal.throwIfAborted();
        const old = this.getProfileBinding();
        if (old && JSON.stringify(old) !== JSON.stringify(valid))
          throw new Error("LUNA_ERROR:server-binding-mismatch");
        const current = this.getLedgerDocument();
        this.persistGraph(
          current ? mergeLedgerDocuments(current, incoming) : incoming,
        );
        this.database
          .prepare(
            "INSERT INTO profile_metadata(singleton,binding_json) VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET binding_json=excluded.binding_json",
          )
          .run(JSON.stringify(valid));
        signal.throwIfAborted();
      })
      .immediate();
  }

  getSnapshot(month: string): AppSnapshot {
    decodeMonth(month);
    const document = this.getLedgerDocument();
    const projection =
      document === null ? null : projectLedgerDocument(document);
    const workspace = projection?.workspace ?? null;
    const transactions = (projection?.transactions ?? []).filter(
      (item) => item.deletedAt === null,
    );
    const budgetMonth = Object.keys(projection?.budgets ?? {})
      .filter((candidate) => candidate <= month)
      .sort()
      .at(-1);
    const budgetMinor =
      budgetMonth === undefined
        ? null
        : (projection?.budgets[budgetMonth] ?? null);

    return {
      workspace,
      conflictCount: projection?.conflicts.length ?? 0,
      budgetHeadIds: document === null ? [] : budgetHeadIds(document, month),
      transactions,
      summary:
        workspace === null
          ? null
          : calculateMonthlySummary(transactions, month, budgetMinor),
      sync: {
        mode: "local-only",
        remoteSyncEnabled: false,
        pendingChanges: this.readPendingCount(),
        lastSyncedAt: null,
        lastError: null,
      },
    };
  }

  getLedgerDocument(): LedgerDocument | null {
    const row = this.database
      .prepare("SELECT document_json FROM ledger_graph WHERE singleton = 1")
      .get() as { document_json: string } | undefined;
    return row === undefined
      ? null
      : decodeLedgerDocument(JSON.parse(row.document_json));
  }

  getLedgerConflicts(): LedgerConflict[] {
    const document = this.getLedgerDocument();
    return document === null ? [] : projectLedgerDocument(document).conflicts;
  }

  mergeLedgerDocument(input: LedgerDocument): LedgerDocument {
    const incoming = decodeLedgerDocument(input);
    return this.database
      .transaction(() => {
        const current = this.getLedgerDocument();
        const merged =
          current === null ? incoming : mergeLedgerDocuments(current, incoming);
        this.persistGraph(merged);
        return merged;
      })
      .immediate();
  }

  resolveLedgerConflict(input: LedgerConflictChoice): LedgerDocument {
    return this.database
      .transaction(() => {
        const current = this.getLedgerDocument();
        if (current === null) throw new LedgerSyncError("ledger-stale-heads");
        const resolved = resolveLedgerChoice(
          current,
          input,
          randomUUID(),
          new Date().toISOString(),
        );
        this.persistGraph(resolved);
        return resolved;
      })
      .immediate();
  }

  createWorkspace(
    input: WorkspaceSetupInput,
    id: string,
    now: string,
  ): Workspace {
    const normalized = normalizeWorkspaceSetup(input);
    const workspaceId = decodeId(id, "workspace id");
    const existing = this.readWorkspace();
    if (existing !== null) {
      throw new DomainError(
        "already-configured",
        "This local app already has a workspace.",
      );
    }

    const workspace: Workspace = {
      id: workspaceId,
      name: normalized.name,
      currency: normalized.currency,
      precision: normalized.precision,
      createdAt: now,
    };
    const currentMonth = localMonthFromTimestamp(now);

    const write = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO workspace (id, name, currency, precision, created_at)
           VALUES (@id, @name, @currency, @precision, @created_at)`,
        )
        .run({
          id: workspace.id,
          name: workspace.name,
          currency: workspace.currency,
          precision: workspace.precision,
          created_at: workspace.createdAt,
        });
      this.database
        .prepare(
          `INSERT INTO monthly_budgets (month, budget_minor)
           VALUES (@month, @budget_minor)`,
        )
        .run({
          month: currentMonth,
          budget_minor: normalized.monthlyBudgetMinor,
        });
      this.persistGraph(
        seedLedgerDocument(workspace, [], {
          [currentMonth]: normalized.monthlyBudgetMinor,
        }),
      );
    });
    write();
    return workspace;
  }

  createTransaction(
    input: TransactionDraft,
    id: string,
    now: string,
  ): Transaction {
    const workspace = this.requireWorkspace();
    const transaction = createTransaction(
      decodeId(id, "transaction id"),
      input,
      workspace.precision,
      now,
    );

    const write = this.database.transaction(() => {
      this.insertTransaction(transaction);
      this.insertRevision(transaction, "create");
      this.insertPendingOperation(transaction, "create");
      this.appendGraph({
        id: randomUUID(),
        kind: "transaction",
        entityId: transaction.id,
        value: transaction,
      });
    });
    write();
    return transaction;
  }

  updateTransaction(
    id: string,
    input: TransactionDraft,
    now: string,
    expectedRevision?: number,
  ): Transaction {
    const workspace = this.requireWorkspace();
    const transactionId = decodeId(id, "transaction id");
    const write = this.database.transaction(() => {
      const current = this.readTransaction(transactionId);
      if (current === null)
        throw new DomainError("not-found", "Transaction was not found.");
      assertExpectedRevision(current, expectedRevision);
      const transaction = reviseTransaction(
        current,
        input,
        workspace.precision,
        now,
      );
      this.replaceTransaction(transaction);
      this.insertRevision(transaction, "update");
      this.insertPendingOperation(transaction, "update");
      this.appendGraph({
        id: randomUUID(),
        kind: "transaction",
        entityId: transaction.id,
        value: transaction,
      });
      return transaction;
    });
    return write.immediate();
  }

  deleteTransaction(
    id: string,
    now: string,
    expectedRevision?: number,
  ): Transaction {
    this.requireWorkspace();
    const transactionId = decodeId(id, "transaction id");
    const write = this.database.transaction(() => {
      const current = this.readTransaction(transactionId);
      if (current === null)
        throw new DomainError("not-found", "Transaction was not found.");
      assertExpectedRevision(current, expectedRevision);
      const transaction = tombstoneTransaction(current, now);
      this.database
        .prepare(
          `UPDATE transactions
           SET revision = @revision, updated_at = @updated_at, deleted_at = @deleted_at
           WHERE id = @id`,
        )
        .run({
          id: transaction.id,
          revision: transaction.revision,
          updated_at: transaction.updatedAt,
          deleted_at: transaction.deletedAt,
        });
      this.database
        .prepare(
          `INSERT INTO tombstones (transaction_id, revision, deleted_at)
           VALUES (@transaction_id, @revision, @deleted_at)
           ON CONFLICT(transaction_id) DO UPDATE SET
             revision = excluded.revision,
             deleted_at = excluded.deleted_at`,
        )
        .run({
          transaction_id: transaction.id,
          revision: transaction.revision,
          deleted_at: transaction.deletedAt,
        });
      this.insertRevision(transaction, "delete");
      this.insertPendingOperation(transaction, "delete");
      this.appendGraph({
        id: randomUUID(),
        kind: "transaction",
        entityId: transaction.id,
        value: transaction,
      });
      return transaction;
    });
    return write.immediate();
  }

  setMonthlyBudget(
    month: string,
    budgetMinor: string | null,
    expectedHeadIds?: string[],
  ): void {
    decodeMonth(month);
    this.requireWorkspace();
    const normalizedBudget =
      budgetMinor === null ? null : this.normalizeBudget(budgetMinor);

    this.database
      .transaction(() => {
        const document = this.getLedgerDocument();
        if (document === null)
          throw new DomainError(
            "invalid-workspace",
            "Create a workspace first.",
          );
        assertBudgetHeads(document, month, expectedHeadIds);
        this.appendGraph({
          id: randomUUID(),
          kind: "budget",
          entityId: month,
          value: normalizedBudget,
        });
      })
      .immediate();
  }

  close(): void {
    this.database.close();
  }

  private migrate(): void {
    const currentVersion = Number(
      this.database.pragma("user_version", { simple: true }),
    );
    if (currentVersion === 3) return;
    if (currentVersion > SCHEMA_VERSION) {
      throw new Error(
        `Database schema ${currentVersion} is newer than this app supports.`,
      );
    }
    if (currentVersion === SCHEMA_VERSION) return;

    try {
      const migrate = this.database.transaction(() => {
        this.database.exec(`
          CREATE TABLE IF NOT EXISTS workspace (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            currency TEXT NOT NULL,
            precision INTEGER NOT NULL,
            created_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS monthly_budgets (
            month TEXT PRIMARY KEY NOT NULL,
            budget_minor TEXT
          );

          CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY NOT NULL,
            revision INTEGER NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
            amount_minor TEXT NOT NULL,
            local_date TEXT NOT NULL,
            merchant TEXT NOT NULL DEFAULT '',
            payment_method TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
          );

          CREATE INDEX IF NOT EXISTS idx_transactions_local_date
            ON transactions (local_date, updated_at);

          CREATE TABLE IF NOT EXISTS splits (
            transaction_id TEXT NOT NULL REFERENCES transactions(id),
            position INTEGER NOT NULL,
            category TEXT NOT NULL,
            amount_minor TEXT NOT NULL,
            PRIMARY KEY (transaction_id, position)
          );

          CREATE TABLE IF NOT EXISTS revisions (
            revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id TEXT NOT NULL REFERENCES transactions(id),
            revision INTEGER NOT NULL,
            operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
            snapshot_json TEXT NOT NULL,
            changed_at TEXT NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_revisions_transaction
            ON revisions (transaction_id, revision);

          CREATE TABLE IF NOT EXISTS tombstones (
            transaction_id TEXT PRIMARY KEY NOT NULL,
            revision INTEGER NOT NULL,
            deleted_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS pending_operations (
            operation_id TEXT PRIMARY KEY NOT NULL,
            transaction_id TEXT NOT NULL,
            operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
            created_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS conflicts (
            transaction_id TEXT PRIMARY KEY NOT NULL,
            details_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS ledger_graph (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            document_json TEXT NOT NULL
          );
        `);
        const workspace = this.readWorkspace();
        if (workspace !== null && this.getLedgerDocument() === null) {
          const budgets = this.database
            .prepare("SELECT month, budget_minor FROM monthly_budgets")
            .all() as BudgetRow[];
          this.persistGraph(
            seedLedgerDocument(
              workspace,
              this.readActiveTransactions(true),
              Object.fromEntries(
                budgets.map((row) => [row.month, row.budget_minor]),
              ),
            ),
          );
        }
        this.database.pragma(`user_version = ${SCHEMA_VERSION}`);
      });
      migrate();
    } catch (error) {
      throw new Error(
        `Unable to migrate local database: ${errorMessage(error)}`,
      );
    }
  }

  private readWorkspace(): Workspace | null {
    const row = this.database
      .prepare(
        "SELECT id, name, currency, precision, created_at FROM workspace LIMIT 1",
      )
      .get() as WorkspaceRow | undefined;
    if (row === undefined) return null;
    return {
      id: row.id,
      name: row.name,
      currency: row.currency,
      precision: row.precision,
      createdAt: row.created_at,
    };
  }

  private requireWorkspace(): Workspace {
    const workspace = this.readWorkspace();
    if (workspace === null) {
      throw new DomainError(
        "invalid-workspace",
        "Create a workspace before adding transactions.",
      );
    }
    return workspace;
  }

  private readActiveTransactions(includeDeleted = false): Transaction[] {
    const rows = this.database
      .prepare(
        `SELECT id, revision, type, amount_minor, local_date, merchant,
                payment_method, notes, created_at, updated_at, deleted_at
         FROM transactions
         WHERE @include_deleted = 1 OR deleted_at IS NULL
         ORDER BY local_date DESC, updated_at DESC, id DESC`,
      )
      .all({ include_deleted: includeDeleted ? 1 : 0 }) as TransactionRow[];
    const splitRows = this.database
      .prepare(
        `SELECT transaction_id, position, category, amount_minor
         FROM splits
         ORDER BY transaction_id, position`,
      )
      .all() as SplitRow[];
    const splitsByTransaction = new Map<string, SplitRow[]>();
    for (const split of splitRows) {
      const splits = splitsByTransaction.get(split.transaction_id) ?? [];
      splits.push(split);
      splitsByTransaction.set(split.transaction_id, splits);
    }

    return rows.map((row) => {
      const splits = splitsByTransaction.get(row.id) ?? [];
      if (splits.length === 0) {
        throw new Error(`Transaction ${row.id} has no category split.`);
      }
      return {
        id: row.id,
        revision: row.revision,
        type: row.type,
        amountMinor: row.amount_minor,
        date: row.local_date,
        splits: splits.map((split) => ({
          category: split.category,
          amountMinor: split.amount_minor,
        })),
        merchant: row.merchant,
        paymentMethod: row.payment_method,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
      };
    });
  }

  private readTransaction(id: string): Transaction | null {
    if (
      this.getLedgerConflicts().some(
        (item) => item.kind === "transaction" && item.entityId === id,
      )
    ) {
      throw new LedgerSyncError("ledger-conflict");
    }
    const row = this.database
      .prepare(
        `SELECT id, revision, type, amount_minor, local_date, merchant,
                payment_method, notes, created_at, updated_at, deleted_at
         FROM transactions WHERE id = @id`,
      )
      .get({ id }) as TransactionRow | undefined;
    if (row === undefined || row.deleted_at !== null) return null;

    const splits = this.database
      .prepare(
        `SELECT transaction_id, position, category, amount_minor
         FROM splits WHERE transaction_id = @id ORDER BY position`,
      )
      .all({ id }) as SplitRow[];
    if (splits.length === 0) {
      throw new Error(`Transaction ${id} has no category split.`);
    }
    return {
      id: row.id,
      revision: row.revision,
      type: row.type,
      amountMinor: row.amount_minor,
      date: row.local_date,
      splits: splits.map((split) => ({
        category: split.category,
        amountMinor: split.amount_minor,
      })),
      merchant: row.merchant,
      paymentMethod: row.payment_method,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }

  private readBudget(month: string): string | null {
    const exact = this.database
      .prepare(
        "SELECT month, budget_minor FROM monthly_budgets WHERE month = @month",
      )
      .get({ month }) as BudgetRow | undefined;
    if (exact !== undefined) return exact.budget_minor;

    const inherited = this.database
      .prepare(
        `SELECT month, budget_minor FROM monthly_budgets
         WHERE month < @month ORDER BY month DESC LIMIT 1`,
      )
      .get({ month }) as BudgetRow | undefined;
    return inherited?.budget_minor ?? null;
  }

  private readPendingCount(): number {
    const row = this.database
      .prepare("SELECT COUNT(*) AS count FROM pending_operations")
      .get() as { count: number };
    return row.count;
  }

  private appendGraph(input: LedgerRevisionInput): void {
    const current = this.getLedgerDocument();
    if (current === null)
      throw new DomainError("invalid-workspace", "Create a workspace first.");
    this.persistGraph(appendLedgerRevision(current, input));
  }

  /** Called only inside the same write transaction as local mutations or a merge. */
  private persistGraph(input: LedgerDocument): void {
    const document = decodeLedgerDocument(input);
    const projection = projectLedgerDocument(document);
    const workspace = projection.workspace;
    if (this.readWorkspace() === null) {
      this.database
        .prepare(
          `INSERT INTO workspace (id, name, currency, precision, created_at)
        VALUES (@id, @name, @currency, @precision, @created_at)`,
        )
        .run({ ...workspace, created_at: workspace.createdAt });
    }
    this.database
      .prepare(
        `INSERT INTO ledger_graph (singleton, document_json) VALUES (1, @document)
      ON CONFLICT(singleton) DO UPDATE SET document_json = excluded.document_json`,
      )
      .run({ document: JSON.stringify(document) });
    for (const transaction of projection.transactions) {
      const existing = this.database
        .prepare("SELECT id FROM transactions WHERE id = @id")
        .get({ id: transaction.id });
      if (existing === undefined) this.insertTransaction(transaction);
      else this.replaceTransaction(transaction);
      if (transaction.deletedAt !== null) {
        this.database
          .prepare(
            `INSERT INTO tombstones (transaction_id, revision, deleted_at)
          VALUES (@id, @revision, @deleted_at) ON CONFLICT(transaction_id) DO UPDATE SET
          revision = excluded.revision, deleted_at = excluded.deleted_at`,
          )
          .run({
            id: transaction.id,
            revision: transaction.revision,
            deleted_at: transaction.deletedAt,
          });
      } else {
        this.database
          .prepare("DELETE FROM tombstones WHERE transaction_id = @id")
          .run({ id: transaction.id });
      }
    }
    // Both tables are disposable projections; the full causal history remains in ledger_graph.
    this.database.prepare("DELETE FROM monthly_budgets").run();
    const insertBudget = this.database.prepare(
      "INSERT INTO monthly_budgets (month, budget_minor) VALUES (@month, @budget)",
    );
    for (const [month, budget] of Object.entries(projection.budgets))
      insertBudget.run({ month, budget });
    this.database.prepare("DELETE FROM conflicts").run();
    const insertConflict = this.database
      .prepare(`INSERT INTO conflicts (transaction_id, details_json, created_at)
      VALUES (@id, @details, @now)`);
    for (const conflict of projection.conflicts) {
      insertConflict.run({
        id: `${conflict.kind}:${conflict.entityId}`,
        details: JSON.stringify(conflict),
        now: workspace.createdAt,
      });
    }
  }

  private insertTransaction(transaction: Transaction): void {
    this.database
      .prepare(
        `INSERT INTO transactions
          (id, revision, type, amount_minor, local_date, merchant, payment_method,
           notes, created_at, updated_at, deleted_at)
         VALUES
          (@id, @revision, @type, @amount_minor, @local_date, @merchant, @payment_method,
           @notes, @created_at, @updated_at, @deleted_at)`,
      )
      .run(this.transactionParameters(transaction));
    this.insertSplits(transaction);
  }

  private replaceTransaction(transaction: Transaction): void {
    this.database
      .prepare(
        `UPDATE transactions
         SET revision = @revision, type = @type, amount_minor = @amount_minor,
             local_date = @local_date, merchant = @merchant,
             payment_method = @payment_method, notes = @notes,
             updated_at = @updated_at, deleted_at = @deleted_at
         WHERE id = @id`,
      )
      .run(this.transactionParameters(transaction));
    this.database
      .prepare("DELETE FROM splits WHERE transaction_id = @id")
      .run({ id: transaction.id });
    this.insertSplits(transaction);
  }

  private insertSplits(transaction: Transaction): void {
    const insert = this.database.prepare(
      `INSERT INTO splits (transaction_id, position, category, amount_minor)
       VALUES (@transaction_id, @position, @category, @amount_minor)`,
    );
    transaction.splits.forEach((split, position) => {
      insert.run({
        transaction_id: transaction.id,
        position,
        category: split.category,
        amount_minor: split.amountMinor,
      });
    });
  }

  private insertRevision(
    transaction: Transaction,
    operation: "create" | "update" | "delete",
  ): void {
    this.database
      .prepare(
        `INSERT INTO revisions
          (transaction_id, revision, operation, snapshot_json, changed_at)
         VALUES (@transaction_id, @revision, @operation, @snapshot_json, @changed_at)`,
      )
      .run({
        transaction_id: transaction.id,
        revision: transaction.revision,
        operation,
        snapshot_json: JSON.stringify(transaction),
        changed_at: transaction.updatedAt,
      });
  }

  private insertPendingOperation(
    transaction: Transaction,
    operation: "create" | "update" | "delete",
  ): void {
    this.database
      .prepare(
        `INSERT INTO pending_operations
          (operation_id, transaction_id, operation, created_at)
         VALUES (@operation_id, @transaction_id, @operation, @created_at)`,
      )
      .run({
        operation_id: `${transaction.id}:${transaction.revision}`,
        transaction_id: transaction.id,
        operation,
        created_at: transaction.updatedAt,
      });
  }

  private transactionParameters(
    transaction: Transaction,
  ): Record<string, string | number | null> {
    return {
      id: transaction.id,
      revision: transaction.revision,
      type: transaction.type,
      amount_minor: transaction.amountMinor,
      local_date: transaction.date,
      merchant: transaction.merchant,
      payment_method: transaction.paymentMethod,
      notes: transaction.notes,
      created_at: transaction.createdAt,
      updated_at: transaction.updatedAt,
      deleted_at: transaction.deletedAt,
    };
  }

  private normalizeBudget(value: string): string {
    const amount = parseMinorUnits(value);
    if (amount < 0n) {
      throw new DomainError(
        "invalid-amount",
        "Monthly budget cannot be negative.",
      );
    }
    return canonicalMinorUnits(value);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown database error";
}
