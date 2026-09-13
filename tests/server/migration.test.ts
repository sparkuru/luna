import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createDatabase } from "../../src/server/config";
import { migrate, SERVER_SCHEMA_VERSION } from "../../src/server/db/migration";

test("server schema migration upgrades v1 metadata without replacing identity", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "luna-server-migration-"));
  const file = path.join(directory, "server.sqlite");
  const first = createDatabase(file);
  try {
    first.sqlite.exec(`
      CREATE TABLE server_metadata (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        instance_id TEXT NOT NULL,
        schema_version INTEGER NOT NULL
      );
      CREATE TABLE ledgers (
        id TEXT PRIMARY KEY NOT NULL,
        owner_user_id TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO server_metadata(singleton, instance_id, schema_version)
      VALUES (1, 'migration-instance-sentinel', 1);
      INSERT INTO ledgers(id, owner_user_id, created_at)
      VALUES ('ledger-sentinel', 'user-sentinel', '2026-09-13T00:00:00.000Z');
    `);
    await migrate(first);
    assert.equal(
      (first.sqlite.prepare("SELECT schema_version FROM server_metadata WHERE singleton = 1").get() as { schema_version: number }).schema_version,
      SERVER_SCHEMA_VERSION,
    );
    assert.equal(
      (first.sqlite.prepare("SELECT instance_id FROM server_metadata WHERE singleton = 1").get() as { instance_id: string }).instance_id,
      "migration-instance-sentinel",
    );
    assert.equal(
      (first.sqlite.prepare("SELECT min_payload_version FROM ledgers WHERE id = 'ledger-sentinel'").get() as { min_payload_version: number }).min_payload_version,
      1,
    );
    assert.ok(
      first.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'attachment_orphans'")
        .get(),
    );
  } finally {
    first.close();
  }

  const reopened = createDatabase(file);
  try {
    await migrate(reopened);
    assert.equal(
      (reopened.sqlite.prepare("SELECT schema_version FROM server_metadata WHERE singleton = 1").get() as { schema_version: number }).schema_version,
      SERVER_SCHEMA_VERSION,
    );
    assert.equal(
      (reopened.sqlite.prepare("SELECT instance_id FROM server_metadata WHERE singleton = 1").get() as { instance_id: string }).instance_id,
      "migration-instance-sentinel",
    );
    assert.equal(
      (reopened.sqlite.prepare("SELECT count(*) AS count FROM ledgers").get() as { count: number }).count,
      1,
    );
  } finally {
    reopened.close();
    await rm(directory, { recursive: true, force: true });
  }
});
