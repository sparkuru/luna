import assert from "node:assert/strict";
import test from "node:test";
import { createTransaction, type Workspace } from "./domain";
import {
  createAttachmentDescriptorInput,
  toAttachmentMetadata,
} from "./attachment-contract";
import {
  mergeLedgerDocuments,
  projectLedgerDocument,
  seedLedgerDocument,
  seedLedgerDocumentV2,
} from "./ledger-sync";
import { decryptLedgerDocument, encryptLedgerDocument } from "./ledger-crypto";
import { storedTransactionFromTransaction } from "./ledger-record";

const workspace: Workspace = {
  id: "workspace-v2",
  name: "V2 fixture",
  currency: "CNY",
  precision: 2,
  createdAt: "2026-09-12T00:00:00.000Z",
};

test("v2 graph keeps descriptors internal and projects only safe attachment metadata", () => {
  const transaction = createTransaction(
    "transaction-v2",
    {
      type: "expense",
      amountMinor: "1234",
      date: "2026-09-12",
      splits: [{ category: "Food", amountMinor: "1234" }],
    },
    2,
    "2026-09-12T01:00:00.000Z",
  );
  const descriptor = createAttachmentDescriptorInput(
    workspace.id,
    "123e4567-e89b-42d3-a456-426614174002",
    "image/png",
    1,
    1,
    3,
    "a".repeat(64),
    new Uint8Array(32).fill(1),
    new Uint8Array(12).fill(2),
  );
  const graph = seedLedgerDocumentV2(
    workspace,
    [storedTransactionFromTransaction(transaction, [descriptor])],
    {},
  );
  assert.equal(graph.schemaVersion, 2);
  assert.equal(JSON.stringify(graph).includes(descriptor.key), true);
  const visible = projectLedgerDocument(graph).transactions[0];
  assert.deepEqual(visible?.attachments, [toAttachmentMetadata(descriptor)]);
  assert.equal(visible && "key" in visible, false);
  assert.equal(visible && JSON.stringify(visible).includes(descriptor.iv), false);
});

test("merging a v1 history into v2 normalizes the old revisions without changing IDs or parents", () => {
  const transaction = createTransaction(
    "transaction-upgrade",
    {
      type: "income",
      amountMinor: "900",
      date: "2026-09-12",
      splits: [{ category: "Work", amountMinor: "900" }],
    },
    2,
    "2026-09-12T01:00:00.000Z",
  );
  const v1 = seedLedgerDocument(workspace, [transaction], {});
  const v2 = seedLedgerDocumentV2(workspace, [], {});
  const merged = mergeLedgerDocuments(v1, v2);
  assert.equal(merged.schemaVersion, 2);
  const revision = merged.revisions.find((item) => item.kind === "transaction");
  assert.deepEqual(revision?.parents, []);
  assert.equal(revision?.id, "seed:transaction:transaction-upgrade");
  assert.deepEqual(projectLedgerDocument(merged).transactions[0]?.attachments, undefined);
});

test("v2 graph uses a v2 envelope while legacy graph data remains on the v1 path", async () => {
  const transaction = createTransaction(
    "transaction-envelope-v2",
    {
      type: "expense",
      amountMinor: "100",
      date: "2026-09-12",
      splits: [{ category: "Test", amountMinor: "100" }],
    },
    2,
    "2026-09-12T01:00:00.000Z",
  );
  const v1 = seedLedgerDocument(workspace, [transaction], {});
  const v2 = seedLedgerDocumentV2(
    workspace,
    [storedTransactionFromTransaction(transaction)],
    {},
  );
  const password = "v2 fixture passphrase";
  const legacyRaw = JSON.parse(await encryptLedgerDocument(v1, password)) as Record<string, unknown>;
  const v2Raw = JSON.parse(await encryptLedgerDocument(v2, password)) as Record<string, unknown>;
  assert.equal(legacyRaw.version, 1);
  assert.equal(legacyRaw.payloadSchemaVersion, 1);
  assert.equal(v2Raw.version, 2);
  assert.equal(v2Raw.payloadSchemaVersion, 2);
  assert.equal((await decryptLedgerDocument(JSON.stringify(v2Raw), password)).schemaVersion, 2);
});
