import { open, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import {
  DomainError,
  decodeExpectedRevision,
  decodeId,
  decodeMonth,
  decodeTransactionDraft,
  decodeTransactionUpdate,
  decodeWorkspaceSetup,
} from "../shared/domain";
import { IPC_CHANNELS } from "../shared/ipc";
import type { LocalStore } from "../shared/ports";
import type { LunaLedgerApi } from "../shared/api";
import {
  SettingsDecodeError,
  decodeConfigureConfigSync,
  decodeLedgerSyncMode,
  decodeSettingsUpdate,
} from "../shared/settings";
import { ConfigSyncService, ConfigSyncServiceError } from "./config-sync";
import { decodeLedgerHeadIds, LedgerSyncError } from "../shared/ledger-sync";
import {
  decodeBudgetUpdate,
  decodeLedgerConflictChoice,
} from "../shared/ledger-data";
import {
  decodeCategoryCreateInput,
  decodeCategoryReassignmentInput,
  decodeCategoryUpdateInput,
} from "../shared/category-catalog";
import { LedgerCryptoError } from "../shared/ledger-crypto";
import { LedgerObjectError } from "../sync/s3-ledger-store";
import {
  decodeLedgerSessionInput,
  LedgerSessionError,
} from "../shared/ledger-session";
import { createNativeLedgerApi } from "./local-api";
import {
  decodeLogin,
  decodeProfileId,
  decodeServerId,
} from "../shared/server-api";
import { ServerTransportError } from "../sync/http-object-store";
import {
  AttachmentContractError,
  MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES,
  MAX_BACKUP_FILE_BYTES,
  MAX_NORMALIZED_IMAGE_BYTES,
} from "../shared/attachment-contract";
import { FullBackupError } from "../shared/full-backup";

export function registerIpcHandlers(
  store: LocalStore,
  configSync: ConfigSyncService,
  getMainWindow: () => BrowserWindow | null,
  api: LunaLedgerApi = createNativeLedgerApi(store, configSync),
): void {
  const handle = (channel: string, run: (...args: unknown[]) => unknown) =>
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      assertTrustedRenderer(event, getMainWindow);
      return callSafely("operation-failed", () => run(...args));
    });
  handle(IPC_CHANNELS.getLedgerSyncStatus, () => api.getLedgerSyncStatus());
  handle(IPC_CHANNELS.configureLedgerSync, (input) =>
    api.configureLedgerSync(decodeLedgerSessionInput(input)),
  );
  handle(IPC_CHANNELS.syncLedgerNow, () => api.syncLedgerNow());
  handle(IPC_CHANNELS.clearLedgerSync, () => api.clearLedgerSync());
  handle(IPC_CHANNELS.saveLedgerBackup, (password) =>
    saveNativeLedgerBackup(api, text(password), getMainWindow),
  );
  handle(IPC_CHANNELS.exportLedgerBackup, (password) =>
    api.exportLedgerBackup(text(password)),
  );
  handle(IPC_CHANNELS.importLedgerBackup, (raw, password) =>
    api.importLedgerBackup(text(raw), text(password)),
  );
  const beginBackupExport = api.beginBackupExport;
  const readBackupChunk = api.readBackupChunk;
  const finishBackupExport = api.finishBackupExport;
  const beginBackupImport = api.beginBackupImport;
  const appendBackupChunk = api.appendBackupChunk;
  const finishBackupImport = api.finishBackupImport;
  const cancelBackupJob = api.cancelBackupJob;
  if (
    beginBackupExport &&
    readBackupChunk &&
    finishBackupExport &&
    beginBackupImport &&
    appendBackupChunk &&
    finishBackupImport &&
    cancelBackupJob
  ) {
    handle(IPC_CHANNELS.beginBackupExport, (password) =>
      beginBackupExport(text(password)),
    );
    handle(IPC_CHANNELS.readBackupChunk, (input) => {
      const r = record(input, ["jobId", "sequence"]);
      return readBackupChunk(text(r.jobId), nonNegativeInteger(r.sequence));
    });
    handle(IPC_CHANNELS.finishBackupExport, (jobId) =>
      finishBackupExport(text(jobId)),
    );
    handle(IPC_CHANNELS.beginBackupImport, (input) => {
      const r = record(input, ["totalBytes", "password"]);
      return beginBackupImport(backupTotalBytes(r.totalBytes), text(r.password));
    });
    handle(IPC_CHANNELS.appendBackupChunk, (input) => {
      const r = record(input, ["jobId", "sequence", "bytes"]);
      return appendBackupChunk(
        text(r.jobId),
        nonNegativeInteger(r.sequence),
        bytes(r.bytes, MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES),
      );
    });
    handle(IPC_CHANNELS.finishBackupImport, (jobId) =>
      finishBackupImport(text(jobId)),
    );
    handle(IPC_CHANNELS.cancelBackupJob, (jobId) =>
      cancelBackupJob(text(jobId)),
    );
  }
  handle(IPC_CHANNELS.stageTransactionImage, (input) => {
    const r = record(input, ["draftSessionId", "bytes", "mime", "width", "height"]);
    return api.stageTransactionImage(
      text(r.draftSessionId),
      bytes(r.bytes, MAX_NORMALIZED_IMAGE_BYTES),
      text(r.mime),
      positiveInteger(r.width),
      positiveInteger(r.height),
    );
  });
  handle(IPC_CHANNELS.readDraftImage, (draftToken) =>
    api.readDraftImage(text(draftToken)),
  );
  handle(IPC_CHANNELS.discardDraftImage, (draftToken) =>
    api.discardDraftImage(text(draftToken)),
  );
  handle(IPC_CHANNELS.readTransactionImage, (input) => {
    const r = record(input, ["transactionId", "attachmentId", "conflictHeadId"]);
    return api.readTransactionImage(
      text(r.transactionId),
      text(r.attachmentId),
      optionalText(r.conflictHeadId),
    );
  });
  handle(IPC_CHANNELS.getAttachmentUsage, () => api.getAttachmentUsage());
  handle(IPC_CHANNELS.retryAttachmentDownload, (input) => {
    const r = record(input, ["transactionId", "attachmentId", "conflictHeadId"]);
    return api.retryAttachmentDownload(
      text(r.transactionId),
      text(r.attachmentId),
      optionalText(r.conflictHeadId),
    );
  });
  handle(IPC_CHANNELS.getLedgerConflicts, () => api.getLedgerConflicts());
  handle(IPC_CHANNELS.resolveLedgerConflict, (input) =>
    api.resolveLedgerConflict(decodeLedgerConflictChoice(input)),
  );
  handle(IPC_CHANNELS.getSnapshot, (month) =>
    api.getSnapshot(decodeMonth(month)),
  );
  handle(IPC_CHANNELS.createWorkspace, (input) =>
    api.createWorkspace(decodeWorkspaceSetup(input)),
  );
  handle(IPC_CHANNELS.createTransaction, (input) =>
    api.createTransaction(decodeTransactionDraft(input)),
  );
  handle(IPC_CHANNELS.updateTransaction, (input) => {
    const d = decodeTransactionUpdate(input);
    return api.updateTransaction(d.id, d.draft, d.expectedRevision);
  });
  handle(IPC_CHANNELS.deleteTransaction, (id, expected) =>
    api.deleteTransaction(
      decodeId(id, "transaction id"),
      decodeExpectedRevision(expected),
    ),
  );
  handle(IPC_CHANNELS.createCategory, (input) => {
    const r = record(input, ["input", "expectedHeadIds"]);
    return api.createCategory(
      decodeCategoryCreateInput(r.input),
      optionalHeadIds(r.expectedHeadIds),
    );
  });
  handle(IPC_CHANNELS.updateCategory, (input) => {
    const r = record(input, ["id", "input", "expectedHeadIds"]);
    return api.updateCategory(
      decodeId(r.id, "category id"),
      decodeCategoryUpdateInput(r.input),
      optionalHeadIds(r.expectedHeadIds),
    );
  });
  handle(IPC_CHANNELS.deleteCategory, (input) => {
    const r = record(input, ["id", "expectedHeadIds"]);
    return api.deleteCategory(
      decodeId(r.id, "category id"),
      optionalHeadIds(r.expectedHeadIds),
    );
  });
  handle(IPC_CHANNELS.getCategoryUsage, (id) =>
    api.getCategoryUsage(decodeId(id, "category id")),
  );
  handle(IPC_CHANNELS.reassignCategory, (input) =>
    api.reassignCategory(decodeCategoryReassignmentInput(input)),
  );
  handle(IPC_CHANNELS.setMonthlyBudget, (input) => {
    const d = decodeBudgetUpdate(input);
    return api.setMonthlyBudget(d.month, d.budgetMinor, d.expectedHeadIds);
  });
  handle(IPC_CHANNELS.getSettings, () => api.getSettings());
  handle(IPC_CHANNELS.updateSettings, (input) =>
    api.updateSettings(decodeSettingsUpdate(input)),
  );
  handle(IPC_CHANNELS.configureConfigSync, (input) =>
    api.configureConfigSync(decodeConfigureConfigSync(input)),
  );
  handle(IPC_CHANNELS.testConfigSync, () => api.testConfigSync());
  handle(IPC_CHANNELS.syncConfigNow, () => api.syncConfigNow());
  handle(IPC_CHANNELS.clearConfigSync, () => api.clearConfigSync());
  api.onChange?.(() => {
    const window = getMainWindow();
    if (window && !window.isDestroyed())
      window.webContents.send(IPC_CHANNELS.profileInvalidated);
  });
  const server = api.server;
  if (server) {
    handle(IPC_CHANNELS.serverStatus, () => server.status());
    handle(IPC_CHANNELS.serverLogin, (input) =>
      server.login(decodeLogin(input)),
    );
    handle(IPC_CHANNELS.serverLogout, () => server.logout());
    handle(IPC_CHANNELS.serverProfiles, () => server.profiles());
    handle(IPC_CHANNELS.serverSelectProfile, (id) =>
      server.selectProfile(decodeProfileId(id)),
    );
    handle(IPC_CHANNELS.serverRemoveProfile, (id) =>
      server.removeProfile(decodeProfileId(id)),
    );
    handle(IPC_CHANNELS.serverConnect, (input) => {
      const r = record(input, [
        "passphrase",
        "sourceProfileId",
        "allowLocalOnlyMigration",
      ]);
      if (typeof r.allowLocalOnlyMigration !== "boolean")
        throw new DomainError("invalid-input", "Invalid input");
      return server.connect({
        passphrase: text(r.passphrase),
        sourceProfileId:
          r.sourceProfileId === null
            ? null
            : decodeProfileId(r.sourceProfileId),
        allowLocalOnlyMigration: r.allowLocalOnlyMigration,
      });
    });
    handle(IPC_CHANNELS.serverUnlock, (input) => server.unlock(text(input)));
    handle(IPC_CHANNELS.serverSync, () => server.sync());
    handle(IPC_CHANNELS.serverSetSyncMode, (input) =>
      server.setSyncMode(decodeLedgerSyncMode(input)),
    );
    handle(IPC_CHANNELS.serverDisconnect, () => server.disconnect());
    handle(IPC_CHANNELS.serverConfigurePreferences, (input) => {
      const r = record(input, ["enabled", "passphrase"]);
      if (typeof r.enabled !== "boolean")
        throw new DomainError("invalid-input", "Invalid input");
      return server.configurePreferences({
        enabled: r.enabled,
        passphrase: text(r.passphrase),
      });
    });
    handle(IPC_CHANNELS.serverSyncPreferences, () => server.syncPreferences());
    handle(IPC_CHANNELS.serverSessions, () => server.sessions());
    handle(IPC_CHANNELS.serverRevokeSession, (id) =>
      server.revokeSession(decodeServerId(id)),
    );
  }
}

async function saveNativeLedgerBackup(
  api: LunaLedgerApi,
  password: string,
  getMainWindow: () => BrowserWindow | null,
): Promise<void> {
  if (
    api.beginBackupExport === undefined ||
    api.readBackupChunk === undefined ||
    api.finishBackupExport === undefined ||
    api.cancelBackupJob === undefined
  )
    throw new FullBackupError("backup-unsupported-container");
  const saveOptions = {
    title: "Save Luna encrypted backup",
    defaultPath: `luna-ledger-${new Date().toISOString().slice(0, 10)}.luna-backup`,
    filters: [{ name: "Luna encrypted backup", extensions: ["luna-backup"] }],
  };
  const mainWindow = getMainWindow();
  const chosen =
    mainWindow === null
      ? await dialog.showSaveDialog(saveOptions)
      : await dialog.showSaveDialog(mainWindow, saveOptions);
  if (chosen.canceled || chosen.filePath === undefined)
    throw new LedgerBackupCancelledError();

  const start = await api.beginBackupExport(password);
  if (
    !Number.isSafeInteger(start.totalBytes) ||
    start.totalBytes < 1 ||
    start.totalBytes > MAX_BACKUP_FILE_BYTES
  ) {
    await api.cancelBackupJob(start.jobId).catch(() => undefined);
    throw new FullBackupError("backup-too-large");
  }
  const temporaryPath = `${chosen.filePath}.luna-part-${randomUUID()}`;
  let file: Awaited<ReturnType<typeof open>> | null = null;
  let completed = false;
  try {
    file = await open(temporaryPath, "wx", 0o600);
    let written = 0;
    let reachedEof = false;
    const maxChunks = Math.ceil(
      MAX_BACKUP_FILE_BYTES / MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES,
    );
    for (let sequence = 0; sequence < maxChunks; sequence += 1) {
      const chunk = await api.readBackupChunk(start.jobId, sequence);
      if (chunk.bytes.byteLength > MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES)
        throw new FullBackupError("backup-too-large");
      if (written + chunk.bytes.byteLength > start.totalBytes)
        throw new FullBackupError("backup-invalid-container");
      if (chunk.bytes.byteLength > 0) {
        await writeAll(file, chunk.bytes);
        written += chunk.bytes.byteLength;
      }
      if (chunk.eof) {
        reachedEof = true;
        break;
      }
    }
    if (!reachedEof || written !== start.totalBytes)
      throw new FullBackupError("backup-invalid-container");
    await file.sync();
    await file.close();
    file = null;
    await api.finishBackupExport(start.jobId);
    await rename(temporaryPath, chosen.filePath);
    completed = true;
  } finally {
    if (file !== null) await file.close().catch(() => undefined);
    if (!completed) {
      await api.cancelBackupJob(start.jobId).catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
    }
  }
}

async function writeAll(
  file: Awaited<ReturnType<typeof open>>,
  bytes: Uint8Array,
): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const result = await file.write(bytes, offset, bytes.byteLength - offset);
    if (result.bytesWritten < 1) throw new Error("backup-file-write-incomplete");
    offset += result.bytesWritten;
  }
}

class LedgerBackupCancelledError extends Error {
  readonly code = "ledger-backup-cancelled" as const;

  constructor() {
    super("LUNA_ERROR:ledger-backup-cancelled");
    this.name = "LedgerBackupCancelledError";
  }
}

function text(value: unknown): string {
  if (typeof value !== "string")
    throw new DomainError("invalid-input", "Invalid input");
  return value;
}
function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return text(value);
}
function optionalHeadIds(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  return decodeLedgerHeadIds(value);
}
function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new DomainError("invalid-input", "Invalid input");
  return value;
}
function nonNegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new DomainError("invalid-input", "Invalid input");
  return value;
}
function backupTotalBytes(value: unknown): number | null {
  if (value === null) return null;
  const total = nonNegativeInteger(value);
  if (total > MAX_BACKUP_FILE_BYTES)
    throw new DomainError("invalid-input", "Invalid input");
  return total;
}
function bytes(value: unknown, maxBytes: number): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength < 1 || value.byteLength > maxBytes)
    throw new DomainError("invalid-input", "Invalid input");
  return new Uint8Array(value);
}
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== keys.sort().join(",")
  )
    throw new DomainError("invalid-input", "Invalid input");
  return value as Record<string, unknown>;
}
function assertTrustedRenderer(
  event: IpcMainInvokeEvent,
  getMainWindow: () => BrowserWindow | null,
): void {
  const mainWindow = getMainWindow();
  if (
    mainWindow === null ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  ) {
    throw new Error("Untrusted IPC sender.");
  }
}

async function callSafely<T>(
  operation: string,
  callback: () => T | Promise<T>,
): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    if (error instanceof ServerTransportError)
      throw new Error(`LUNA_ERROR:server-${error.code}`);
    if (
      error instanceof DomainError ||
      error instanceof LedgerSyncError ||
      error instanceof LedgerCryptoError ||
      error instanceof LedgerSessionError ||
      error instanceof AttachmentContractError ||
      error instanceof FullBackupError
    ) {
      throw new Error(`LUNA_ERROR:${error.code}`);
    }
    if (error instanceof LedgerBackupCancelledError)
      throw new Error(`LUNA_ERROR:${error.code}`);
    if (error instanceof LedgerObjectError)
      throw new Error(`LUNA_ERROR:ledger-remote-${error.code}`);
    if (error instanceof SettingsDecodeError) {
      throw new Error(
        `LUNA_ERROR:${error.code === "unsupported-version" ? "unsupported-version" : "invalid-input"}`,
      );
    }
    if (error instanceof ConfigSyncServiceError) {
      throw new Error(`LUNA_ERROR:${error.code}`);
    }
    // Keep payloads, credentials, SQL, and paths out of renderer-facing errors.
    throw new Error(`LUNA_ERROR:${operation}`);
  }
}
