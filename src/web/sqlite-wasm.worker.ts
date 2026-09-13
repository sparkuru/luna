import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  decodeMigrationLease,
  type MigrationLease,
} from "../shared/ports";

type Request =
  | { id: number; op: "init"; name: string }
  | { id: number; op: "read" }
  | { id: number; op: "readBinary"; key: string }
  | { id: number; op: "writeBinary"; key: string; bytes: Uint8Array }
  | { id: number; op: "deleteBinary"; key: string }
  | {
      id: number;
      op: "commit";
      expectedRaw: string | null;
      expectedMetadata: string | null;
      raw?: string;
      metadata?: string;
    }
  | { id: number; op: "migrationAcquire"; lease: MigrationLease }
  | { id: number; op: "migrationRenew"; leaseId: string; expiresAt: string }
  | { id: number; op: "migrationRelease"; leaseId: string }
  | { id: number; op: "delete" }
  | { id: number; op: "close" };

type Reply =
  | {
      id: number;
      ok: true;
      raw: string | null;
      metadata: string | null;
      migration: string | null;
    }
  | { id: number; ok: true; bytes: Uint8Array | null }
  | { id: number; ok: true }
  | { id: number; ok: false; error: string };

const scope = globalThis as typeof globalThis & {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: Reply): void;
};

let database: {
  exec: (options: {
    sql: string;
    bind?: readonly (string | Uint8Array | null)[];
  }) => unknown;
  selectArray: (sql: string, bind?: readonly (string | Uint8Array | null)[]) => unknown[] | undefined;
  close: () => void;
  filename: string;
  pointer?: number;
} | null = null;
let deleteDatabase: (() => void) | null = null;
let initialized: Promise<void> | null = null;

scope.onmessage = (event) => {
  void handle(event.data);
};

async function handle(request: Request): Promise<void> {
  try {
    if (request.op === "init") {
      if (!initialized) initialized = initialize(request.name);
      await initialized;
      scope.postMessage({ id: request.id, ok: true });
      return;
    }
    if (!initialized) throw new Error("LUNA_ERROR:sqlite-uninitialized");
    await initialized;
    if (!database) throw new Error("LUNA_ERROR:sqlite-unavailable");
    if (request.op === "read") {
      const row = database.selectArray(
        "SELECT state_json, metadata_json, migration_json FROM luna_state WHERE singleton = 1",
      );
      scope.postMessage({
        id: request.id,
        ok: true,
        raw: typeof row?.[0] === "string" ? row[0] : null,
        metadata: typeof row?.[1] === "string" ? row[1] : null,
        migration: typeof row?.[2] === "string" ? row[2] : null,
      });
      return;
    }
    if (request.op === "migrationAcquire") {
      const lease = decodeMigrationLease(request.lease);
      if (lease === null) throw new Error("LUNA_ERROR:invalid-input");
      withImmediateWrite(() => {
        const current = readMigrationLease();
        if (
          current !== null &&
          Date.parse(current.expiresAt) > Date.now() &&
          current.id !== lease.id
        )
          throw new Error("LUNA_ERROR:migration-busy");
        database!.exec({
          sql: `
            INSERT INTO luna_state(singleton, state_json, metadata_json, migration_json)
            VALUES (1, NULL, NULL, ?)
            ON CONFLICT(singleton) DO UPDATE SET migration_json = excluded.migration_json
          `,
          bind: [JSON.stringify(lease)],
        });
      });
      scope.postMessage({ id: request.id, ok: true });
      return;
    }
    if (request.op === "migrationRenew") {
      if (
        typeof request.leaseId !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(request.leaseId) ||
        !Number.isFinite(Date.parse(request.expiresAt))
      )
        throw new Error("LUNA_ERROR:invalid-input");
      withImmediateWrite(() => {
        const current = readMigrationLease();
        if (
          current === null ||
          current.id !== request.leaseId ||
          Date.parse(current.expiresAt) <= Date.now() ||
          Date.parse(request.expiresAt) <= Date.parse(current.acquiredAt)
        )
          throw new Error("LUNA_ERROR:migration-not-owner");
        database!.exec({
          sql: `
            UPDATE luna_state SET migration_json = ?
            WHERE singleton = 1
          `,
          bind: [
            JSON.stringify({ ...current, expiresAt: request.expiresAt }),
          ],
        });
      });
      scope.postMessage({ id: request.id, ok: true });
      return;
    }
    if (request.op === "migrationRelease") {
      if (
        typeof request.leaseId !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(request.leaseId)
      )
        throw new Error("LUNA_ERROR:invalid-input");
      withImmediateWrite(() => {
        const current = readMigrationLease();
        if (current === null) return;
        if (current.id !== request.leaseId)
          throw new Error("LUNA_ERROR:migration-not-owner");
        database!.exec({
          sql: "UPDATE luna_state SET migration_json = NULL WHERE singleton = 1",
        });
      });
      scope.postMessage({ id: request.id, ok: true });
      return;
    }
    if (request.op === "readBinary") {
      const row = database.selectArray(
        "SELECT bytes FROM luna_attachments WHERE attachment_key = ?",
        [request.key],
      );
      const value = row?.[0];
      scope.postMessage({
        id: request.id,
        ok: true,
        bytes:
          value instanceof Uint8Array
            ? new Uint8Array(value)
            : value instanceof ArrayBuffer
              ? new Uint8Array(value.slice(0))
              : null,
      });
      return;
    }
    if (request.op === "writeBinary") {
      withImmediateWrite(() => {
        assertNoActiveMigration();
        database!.exec({
          sql: `
            INSERT INTO luna_attachments(attachment_key, bytes)
            VALUES (?, ?)
            ON CONFLICT(attachment_key) DO UPDATE SET bytes = excluded.bytes
          `,
          bind: [request.key, request.bytes],
        });
      });
      scope.postMessage({ id: request.id, ok: true });
      return;
    }
    if (request.op === "deleteBinary") {
      withImmediateWrite(() => {
        assertNoActiveMigration();
        database!.exec({
          sql: "DELETE FROM luna_attachments WHERE attachment_key = ?",
          bind: [request.key],
        });
      });
      scope.postMessage({ id: request.id, ok: true });
      return;
    }
    if (request.op === "close") {
      database.close();
      database = null;
      deleteDatabase = null;
      scope.postMessage({ id: request.id, ok: true });
      return;
    }
    if (request.op === "delete") {
      if (!deleteDatabase)
        throw new Error("LUNA_ERROR:sqlite-delete-unavailable");
      deleteDatabase();
      database = null;
      deleteDatabase = null;
      scope.postMessage({ id: request.id, ok: true });
      return;
    }
    const current = database.selectArray(
      "SELECT state_json, metadata_json FROM luna_state WHERE singleton = 1",
    );
    const currentRaw = typeof current?.[0] === "string" ? current[0] : null;
    const currentMetadata = typeof current?.[1] === "string" ? current[1] : null;
    if (currentRaw !== request.expectedRaw || currentMetadata !== request.expectedMetadata)
      throw new Error("LUNA_ERROR:sqlite-write-conflict");
    database.exec({ sql: "BEGIN IMMEDIATE" });
    try {
      assertNoActiveMigration();
      database.exec({
        sql: `
          INSERT INTO luna_state(singleton, state_json, metadata_json)
          VALUES (1, ?, ?)
          ON CONFLICT(singleton) DO UPDATE SET
            state_json = excluded.state_json,
            metadata_json = excluded.metadata_json
        `,
        bind: [request.raw ?? currentRaw, request.metadata ?? currentMetadata],
      });
      database.exec({ sql: "COMMIT" });
    } catch (error) {
      try {
        database.exec({ sql: "ROLLBACK" });
      } catch {
        /* Preserve the original SQLite failure. */
      }
      throw error;
    }
    scope.postMessage({ id: request.id, ok: true });
  } catch (error) {
    scope.postMessage({
      id: request.id,
      ok: false,
      error: normalizeWorkerError(error),
    });
  }
}

function readMigrationLease(): MigrationLease | null {
  if (database === null) throw new Error("LUNA_ERROR:sqlite-unavailable");
  const row = database.selectArray(
    "SELECT migration_json FROM luna_state WHERE singleton = 1",
  );
  const raw = typeof row?.[0] === "string" ? row[0] : null;
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("LUNA_ERROR:invalid-input");
  }
  return decodeMigrationLease(value);
}

function assertNoActiveMigration(): void {
  const lease = readMigrationLease();
  if (lease === null) return;
  if (Date.parse(lease.expiresAt) <= Date.now()) {
    database!.exec({
      sql: "UPDATE luna_state SET migration_json = NULL WHERE singleton = 1",
    });
    return;
  }
  throw new Error("LUNA_ERROR:migration-locked");
}

function withImmediateWrite(operation: () => void): void {
  if (database === null) throw new Error("LUNA_ERROR:sqlite-unavailable");
  database.exec({ sql: "BEGIN IMMEDIATE" });
  try {
    operation();
    database.exec({ sql: "COMMIT" });
  } catch (error) {
    try {
      database.exec({ sql: "ROLLBACK" });
    } catch {
      /* Preserve the original SQLite failure. */
    }
    throw error;
  }
}

async function initialize(name: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(name))
    throw new Error("LUNA_ERROR:sqlite-invalid-name");
  const sqlite3 = await sqlite3InitModule();
  let db: {
    exec: (options: {
      sql: string;
      bind?: readonly (string | Uint8Array | null)[];
    }) => unknown;
    selectArray: (sql: string, bind?: readonly (string | Uint8Array | null)[]) => unknown[] | undefined;
    close: () => void;
    filename: string;
    pointer?: number;
  };
  let remove: (() => void) | null = null;
  if (globalThis.crossOriginIsolated && typeof sqlite3.oo1?.OpfsDb === "function") {
    // The regular OPFS VFS is the best browser implementation: its locking
    // model supports the multi-tab tests and the production Web host supplies
    // the required COOP/COEP headers.
    db = new sqlite3.oo1.OpfsDb(`/${name}.sqlite3`);
  } else {
    // Android WebView exposes OPFS but does not provide a true
    // cross-origin-isolated browsing context. The SAH-pool VFS keeps the data
    // in OPFS without SharedArrayBuffer. Each state store owns one worker, so
    // it gets a private VFS name and directory and never shares a pool with
    // another profile worker.
    if (typeof sqlite3.installOpfsSAHPoolVfs !== "function")
      throw new Error("LUNA_ERROR:sqlite-opfs-unavailable");
    const pool = await sqlite3.installOpfsSAHPoolVfs({
      name: `luna-${name}`,
      directory: `.luna-sqlite/${name}`,
      initialCapacity: 4,
    });
    db = new pool.OpfsSAHPoolDb(`/${name}.sqlite3`);
    remove = () => {
      db.close();
      if (!pool.unlink(db.filename))
        throw new Error("LUNA_ERROR:sqlite-delete-failed");
    };
  }
  db.exec({
    sql: `
      CREATE TABLE IF NOT EXISTS luna_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        state_json TEXT,
        metadata_json TEXT,
        migration_json TEXT
      );
      CREATE TABLE IF NOT EXISTS luna_attachments (
        attachment_key TEXT PRIMARY KEY NOT NULL,
        bytes BLOB NOT NULL
      );
    `,
  });
  const migrationColumn = db.selectArray(
    "SELECT name FROM pragma_table_info('luna_state') WHERE name = 'migration_json'",
  );
  if (migrationColumn?.[0] !== "migration_json")
    db.exec({
      sql: "ALTER TABLE luna_state ADD COLUMN migration_json TEXT",
    });
  database = db;
  if (!remove) {
    const unlink = (
      sqlite3 as unknown as {
        util?: {
          sqlite3__wasm_vfs_unlink?: (vfs: number, filename: string) => void;
        };
      }
    ).util?.sqlite3__wasm_vfs_unlink;
    remove = () => {
      const vfs = sqlite3.capi.sqlite3_js_db_vfs(db.pointer ?? 0, "main");
      if (!vfs || !unlink)
        throw new Error("LUNA_ERROR:sqlite-delete-unavailable");
      db.close();
      unlink(vfs, db.filename);
    };
  }
  deleteDatabase = remove;
}

function normalizeWorkerError(error: unknown): string {
  const message = error instanceof Error ? error.message : "LUNA_ERROR:sqlite-failed";
  if (message.includes("Missing required OPFS APIs"))
    return "LUNA_ERROR:sqlite-opfs-unavailable";
  return message;
}
