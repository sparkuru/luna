import { randomUUID } from "node:crypto";
import type { ServerDatabase } from "./database";

export const SERVER_SCHEMA_VERSION = 3;

/** Idempotent schema creation for the single server metadata database. */
export async function migrate(database: ServerDatabase): Promise<void> {
  database.transaction(() => {
    database.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS server_metadata (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        instance_id TEXT NOT NULL,
        schema_version INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash BLOB NOT NULL,
        password_salt BLOB NOT NULL,
        password_params TEXT NOT NULL,
        disabled_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id),
        token_hash TEXT UNIQUE NOT NULL,
        device_label TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS ledgers (
        id TEXT PRIMARY KEY NOT NULL,
        owner_user_id TEXT UNIQUE NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        min_payload_version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS remote_objects (
        object_kind TEXT NOT NULL CHECK (object_kind IN ('ledger', 'preference')),
        owner_id TEXT NOT NULL,
        object_key TEXT NOT NULL,
        version INTEGER NOT NULL,
        etag TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        byte_length INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (object_kind, owner_id)
      );
      CREATE TABLE IF NOT EXISTS attachments (
        ledger_id TEXT NOT NULL REFERENCES ledgers(id),
        attachment_id TEXT NOT NULL,
        object_key TEXT NOT NULL,
        cipher_sha256 TEXT NOT NULL,
        byte_length INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('reserved', 'published')),
        reservation_id TEXT,
        lease_until TEXT,
        etag TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (ledger_id, attachment_id)
      );
      CREATE INDEX IF NOT EXISTS idx_attachments_ledger_status
        ON attachments(ledger_id, status);
      CREATE TABLE IF NOT EXISTS attachment_orphans (
        object_key TEXT PRIMARY KEY NOT NULL,
        ledger_id TEXT NOT NULL,
        attachment_id TEXT NOT NULL,
        eligible_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_swept_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_attachment_orphans_eligible
        ON attachment_orphans(eligible_at);
      CREATE TABLE IF NOT EXISTS idempotency_records (
        user_id TEXT NOT NULL REFERENCES users(id),
        operation_scope TEXT NOT NULL,
        key TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        status INTEGER NOT NULL,
        result_json TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        PRIMARY KEY (user_id, operation_scope, key)
      );
      CREATE TABLE IF NOT EXISTS security_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        actor_id TEXT,
        action TEXT NOT NULL,
        target_id TEXT,
        result TEXT NOT NULL,
        request_id TEXT
      );
    `);
    const row = database.sqlite
      .prepare("SELECT instance_id, schema_version FROM server_metadata WHERE singleton=1")
      .get() as { instance_id: string; schema_version: number } | undefined;
    if (row && row.schema_version > SERVER_SCHEMA_VERSION)
      throw new Error("Unsupported server schema");
    if (row !== undefined && row.schema_version < SERVER_SCHEMA_VERSION) {
      const columns = database.sqlite
        .prepare("PRAGMA table_info(ledgers)")
        .all() as Array<{ name: string }>;
      if (
        row.schema_version === 1 &&
        !columns.some((column) => column.name === "min_payload_version")
      ) {
        database.sqlite.exec(
          "ALTER TABLE ledgers ADD COLUMN min_payload_version INTEGER NOT NULL DEFAULT 1",
        );
      }
      database.sqlite
        .prepare("UPDATE server_metadata SET schema_version = ? WHERE singleton = 1")
        .run(SERVER_SCHEMA_VERSION);
    }
    if (!row) {
      database.sqlite
        .prepare(
          "INSERT INTO server_metadata(singleton, instance_id, schema_version) VALUES (1, ?, ?)",
        )
        .run(randomUUID(), SERVER_SCHEMA_VERSION);
    }
    database.sqlite.pragma(`user_version = ${SERVER_SCHEMA_VERSION}`);
  });
}
