import assert from "node:assert/strict";
import test from "node:test";
import { createTransaction, type Workspace } from "./domain";
import { FullBackupSessionManager } from "./full-backup-session";
import { seedLedgerDocument } from "./ledger-sync";
import type { FullBackupArchive } from "./full-backup";

const PASSWORD = "full backup session test passphrase";
const workspace: Workspace = {
  id: "workspace-backup-session",
  name: "Backup session",
  currency: "CNY",
  precision: 2,
  createdAt: "2026-09-12T00:00:00.000Z",
};

function graph() {
  return seedLedgerDocument(
    workspace,
    [
      createTransaction(
        "backup-session-transaction",
        {
          type: "expense",
          amountMinor: "123",
          date: "2026-09-12",
          splits: [{ category: "Food", amountMinor: "123" }],
        },
        2,
        "2026-09-12T01:00:00.000Z",
      ),
    ],
    {},
  );
}

test("full backup sessions enforce one active job, replay-safe chunks, and completion", async () => {
  const restored: { value: FullBackupArchive | null } = { value: null };
  const manager = new FullBackupSessionManager({
    getLedgerDocument: () => graph(),
    restoreFullBackup: (archive) => {
      restored.value = archive;
    },
  });
  const exportStart = await manager.beginBackupExport(PASSWORD);
  await assert.rejects(
    manager.beginBackupExport(PASSWORD),
    /LUNA_ERROR:ledger-backup-busy/,
  );
  const first = await manager.readBackupChunk(exportStart.jobId, 0);
  const replay = await manager.readBackupChunk(exportStart.jobId, 0);
  assert.deepEqual(replay, first);
  assert.equal(first.eof, true);
  manager.finishBackupExport(exportStart.jobId);

  const importStart = await manager.beginBackupImport(null, PASSWORD);
  await assert.rejects(
    manager.appendBackupChunk(importStart.jobId, 1, first.bytes),
    /LUNA_ERROR:backup-invalid-container/,
  );
  assert.deepEqual(
    await manager.appendBackupChunk(importStart.jobId, 0, first.bytes),
    { receivedBytes: first.bytes.byteLength },
  );
  assert.deepEqual(
    await manager.appendBackupChunk(importStart.jobId, 0, first.bytes),
    { receivedBytes: first.bytes.byteLength },
  );
  const receipt = await manager.finishBackupImport(importStart.jobId);
  assert.deepEqual(receipt, {
    attachmentCount: 0,
    totalBytes: first.bytes.byteLength,
  });
  assert.equal(restored.value?.graph.schemaVersion, 2);
});

test("cancelled or failed sessions release their password and active slot", async () => {
  const manager = new FullBackupSessionManager({
    getLedgerDocument: () => graph(),
    restoreFullBackup: () => undefined,
  });
  const exportStart = await manager.beginBackupExport(PASSWORD);
  await manager.cancelBackupJob(exportStart.jobId);
  await assert.rejects(
    manager.readBackupChunk(exportStart.jobId, 0),
    /LUNA_ERROR:backup-invalid-container/,
  );
  const importStart = await manager.beginBackupImport(1, PASSWORD);
  await manager.cancelBackupJob(importStart.jobId);
  await manager.beginBackupExport(PASSWORD);
  await manager.cancelAll();
});
