import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { SQLiteLocalStore } from "./store";
import { NativeProfiles } from "./profile-host";
import { seedLedgerDocument } from "../shared/ledger-sync";
import type { ServerBinding } from "../shared/server-api";
import type { ConfigSyncService } from "../sync/config-service";

test("SQLite binding failure rolls back graph and profile metadata while schema stays current", async () => {
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
      assert.equal(original.pragma("user_version", { simple: true }), 5);
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

test("native catalog migrates legacy IDs and marks absent profiles without opening them", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "luna-profile-catalog-"));
  const localId = "local-44444444-4444-4444-8444-444444444444";
  const missingId = "local-55555555-5555-4555-8555-555555555555";
  const legacyStore = new SQLiteLocalStore(path.join(directory, "legacy.sqlite"), true);
  const config = { cancelSession() {} } as unknown as ConfigSyncService;
  const profiles = new NativeProfiles(directory, legacyStore, config);
  const inactiveDirectory = path.join(directory, "profiles", localId);
  try {
    await mkdir(inactiveDirectory, { recursive: true });
    await writeFile(
      path.join(directory, "profile-history.json"),
      JSON.stringify(["legacy-local", localId, missingId]),
      { mode: 0o600 },
    );

    const entries = await profiles.list();
    assert.equal(entries.find((entry) => entry.id === "legacy-local")?.available, true);
    assert.equal(entries.find((entry) => entry.id === localId)?.available, false);
    assert.equal(entries.find((entry) => entry.id === missingId)?.available, false);
    await assert.rejects(access(path.join(inactiveDirectory, "luna.sqlite")));
    await assert.rejects(profiles.open(localId), /server-not-found/);

    const migrated = JSON.parse(
      await readFile(path.join(directory, "profile-history.json"), "utf8"),
    ) as { version: number; entries: Array<{ id: string; storageKind: string }> };
    assert.equal(migrated.version, 1);
    assert.ok(migrated.entries.some((entry) => entry.id === localId && entry.storageKind === "sqlite-native"));
  } finally {
    await profiles.closeAll();
    legacyStore.close();
    await rm(directory, { recursive: true, force: true });
  }
});
