import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { SQLiteLocalStore } from "./store";
import { seedLedgerDocument } from "../shared/ledger-sync";
import type { ServerBinding } from "../shared/server-api";

test("SQLite binding failure rolls back graph and profile metadata while legacy schema stays unchanged", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "luna-profile-atomic-"));
  const source = new SQLiteLocalStore(path.join(directory, "source.sqlite"));
  const destination = new SQLiteLocalStore(
    path.join(directory, "destination.sqlite"),
    true,
  );
  const probe = new Database(path.join(directory, "destination.sqlite"));
  const document = seedLedgerDocument(
    {
      id: "atomic-workspace",
      name: "Atomic",
      currency: "CNY",
      precision: 2,
      createdAt: "2026-09-08T00:00:00.000Z",
    },
    [],
    {},
  );
  const binding: ServerBinding = {
    instanceId: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    ledgerId: "33333333-3333-4333-8333-333333333333",
    baseUrl: "https://luna.example.test",
  };
  try {
    source.mergeLedgerDocument(document);
    probe.exec(
      "CREATE TRIGGER reject_binding BEFORE INSERT ON profile_metadata BEGIN SELECT RAISE(ABORT,'fixture failure'); END",
    );
    assert.throws(() =>
      destination.bindProfile(document, binding, new AbortController().signal),
    );
    assert.equal(destination.getLedgerDocument(), null);
    assert.equal(destination.getProfileBinding(), null);
    probe.exec("DROP TRIGGER reject_binding");
    destination.bindProfile(document, binding, new AbortController().signal);
    assert.deepEqual(destination.getLedgerDocument(), document);
    assert.deepEqual(destination.getProfileBinding(), binding);
    const original = new Database(path.join(directory, "source.sqlite"));
    try {
      assert.equal(original.pragma("user_version", { simple: true }), 2);
    } finally {
      original.close();
    }
    assert.deepEqual(source.getLedgerDocument(), document);
  } finally {
    probe.close();
    source.close();
    destination.close();
    await rm(directory, { recursive: true, force: true });
  }
});
