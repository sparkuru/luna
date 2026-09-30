import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeLocalLedgerCatalog,
  defaultLocalLedgerEntry,
  encodeLocalLedgerCatalog,
  replaceLocalLedgerEntry,
} from "./local-ledger";
import { serverProfileId, type ServerBinding } from "./server-api";

const instanceId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

test("legacy profile ID arrays migrate to versioned safe catalog rows", () => {
  const serverId = serverProfileId(instanceId, userId);
  const catalog = decodeLocalLedgerCatalog(
    JSON.stringify(["legacy-local", serverId, `local-${instanceId}`]),
    "indexeddb-compat",
  );

  assert.equal(catalog.version, 1);
  assert.deepEqual(
    catalog.entries.map(({ id, storageKind }) => ({ id, storageKind })),
    [
      { id: "legacy-local", storageKind: "indexeddb-compat" },
      { id: serverId, storageKind: "indexeddb-compat" },
      { id: `local-${instanceId}`, storageKind: "indexeddb-compat" },
    ],
  );
  assert.equal(catalog.entries[0]?.displayName, "Luna");
  assert.equal(catalog.entries[1]?.displayName, "Server-linked ledger");
  assert.ok(catalog.entries.every((entry) => entry.createdAt === null));
});

test("structured catalog round-trips storage, last-opened, sync and binding metadata", () => {
  const binding: ServerBinding = {
    instanceId,
    userId,
    ledgerId: "33333333-3333-4333-8333-333333333333",
    baseUrl: "https://luna.example.test",
  };
  const entry = {
    ...defaultLocalLedgerEntry(`local-${instanceId}`, "sqlite-wasm-opfs", "2026-09-30T00:00:00.000Z"),
    displayName: "Home ledger",
    lastOpenedAt: "2026-09-30T12:30:00.000Z",
    syncState: "synced" as const,
    binding,
  };
  const catalog = decodeLocalLedgerCatalog(
    encodeLocalLedgerCatalog({ version: 1, entries: [entry] }),
    "indexeddb-compat",
  );

  assert.deepEqual(catalog.entries, [entry]);
  assert.deepEqual(
    replaceLocalLedgerEntry(catalog.entries, { ...entry, syncState: "pending" }),
    [{ ...entry, syncState: "pending" }],
  );
});

test("catalog decoder rejects corrupt IDs and unsupported catalog versions", () => {
  assert.throws(
    () => decodeLocalLedgerCatalog(JSON.stringify(["not-a-profile"]), "sqlite-native"),
    /LUNA_ERROR:invalid-input/,
  );
  assert.throws(
    () => decodeLocalLedgerCatalog(JSON.stringify({ version: 2, entries: [] }), "sqlite-native"),
    /LUNA_ERROR:local-catalog-invalid/,
  );
});
