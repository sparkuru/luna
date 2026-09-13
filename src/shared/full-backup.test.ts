import assert from "node:assert/strict";
import test from "node:test";
import { createTransaction, type Workspace } from "./domain";
import {
  createEncryptedAttachment,
  type AttachmentCiphertext,
} from "./attachment-contract";
import {
  createFullBackupStream,
  decodeFullBackup,
  encodeFullBackup,
  FullBackupError,
} from "./full-backup";
import {
  projectLedgerDocument,
  seedLedgerDocument,
  seedLedgerDocumentV2,
} from "./ledger-sync";
import { storedTransactionFromTransaction } from "./ledger-record";

const PASSWORD = "full backup fixture passphrase";
const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
  0, 0, 0, 0,
]);
const workspace: Workspace = {
  id: "workspace-full-backup",
  name: "Full backup fixture",
  currency: "CNY",
  precision: 2,
  createdAt: "2026-09-12T00:00:00.000Z",
};

function fixtureTransaction(id: string) {
  return createTransaction(
    id,
    {
      type: "expense",
      amountMinor: "1234",
      date: "2026-09-12",
      splits: [{ category: "Food", amountMinor: "1234" }],
    },
    workspace.precision,
    "2026-09-12T01:00:00.000Z",
  );
}

function errorCode(code: string) {
  return (error: unknown) => error instanceof FullBackupError && error.code === code;
}

test("v2 full backup round-trips a v1 graph as a normalized no-image graph", async () => {
  const graph = seedLedgerDocument(workspace, [fixtureTransaction("backup-v1")], {});
  const bytes = await encodeFullBackup(graph, [], PASSWORD);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 8)), "LUNABK02");
  const restored = await decodeFullBackup(bytes, PASSWORD);
  assert.equal(restored.graph.schemaVersion, 2);
  assert.deepEqual(projectLedgerDocument(restored.graph).transactions, projectLedgerDocument(graph).transactions);
  assert.deepEqual(restored.attachments, []);
});

test("full backup includes every historical ciphertext frame and validates its GCM", async () => {
  const encrypted = await createEncryptedAttachment(
    PNG_1X1,
    workspace.id,
    "image/png",
    1,
    1,
  );
  const graph = seedLedgerDocumentV2(
    workspace,
    [storedTransactionFromTransaction(fixtureTransaction("backup-image"), [encrypted.descriptor])],
    {},
  );
  const bytes = await encodeFullBackup(graph, [encrypted], PASSWORD);
  const restored = await decodeFullBackup(bytes, PASSWORD);
  assert.equal(restored.attachments.length, 1);
  assert.deepEqual(restored.attachments[0]?.descriptor, encrypted.descriptor);
  assert.deepEqual(restored.attachments[0]?.ciphertext, encrypted.ciphertext);
});

test("streamed full backup keeps frame boundaries opaque across small chunks", async () => {
  const encrypted = await createEncryptedAttachment(
    PNG_1X1,
    workspace.id,
    "image/png",
    1,
    1,
  );
  const graph = seedLedgerDocumentV2(
    workspace,
    [storedTransactionFromTransaction(fixtureTransaction("backup-stream"), [encrypted.descriptor])],
    {},
  );
  let reads = 0;
  const stream = await createFullBackupStream(
    graph,
    PASSWORD,
    async (id) => {
      reads += 1;
      return id === encrypted.descriptor.id ? encrypted : null;
    },
  );
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await stream.readChunk(17);
      assert.ok(chunk.bytes.byteLength <= 17);
      chunks.push(chunk.bytes);
      length += chunk.bytes.byteLength;
      if (chunk.eof) break;
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const restored = await decodeFullBackup(bytes, PASSWORD);
    assert.deepEqual(restored.attachments[0]?.ciphertext, encrypted.ciphertext);
    assert.ok(reads >= 2, "the frozen object is validated before it is streamed");
  } finally {
    stream.dispose();
  }
});

test("full backup rejects wrong passwords, trailing bytes, and changed frames", async () => {
  const bytes = await encodeFullBackup(
    seedLedgerDocument(workspace, [fixtureTransaction("backup-tamper")], {}),
    [],
    PASSWORD,
  );
  await assert.rejects(
    decodeFullBackup(bytes, "wrong full backup passphrase"),
    errorCode("backup-wrong-password-or-tampered"),
  );
  const trailing = new Uint8Array(bytes.byteLength + 1);
  trailing.set(bytes);
  await assert.rejects(
    decodeFullBackup(trailing, PASSWORD),
    errorCode("backup-invalid-container"),
  );
  const changed = new Uint8Array(bytes);
  changed[changed.length - 1] = (changed[changed.length - 1] ?? 0) ^ 1;
  await assert.rejects(
    decodeFullBackup(changed, PASSWORD),
    errorCode("backup-invalid-container"),
  );
});

test("full backup refuses missing or extra attachment frames", async () => {
  const encrypted = await createEncryptedAttachment(
    PNG_1X1,
    workspace.id,
    "image/png",
    1,
    1,
  );
  const graph = seedLedgerDocumentV2(
    workspace,
    [storedTransactionFromTransaction(fixtureTransaction("backup-contract"), [encrypted.descriptor])],
    {},
  );
  await assert.rejects(
    encodeFullBackup(graph, [], PASSWORD),
    errorCode("backup-attachment-missing"),
  );
  const extra: AttachmentCiphertext = {
    descriptor: { ...encrypted.descriptor, id: "123e4567-e89b-42d3-a456-426614174099" },
    ciphertext: encrypted.ciphertext,
  };
  await assert.rejects(
    encodeFullBackup(graph, [extra], PASSWORD),
    errorCode("backup-attachment-extra"),
  );
});
