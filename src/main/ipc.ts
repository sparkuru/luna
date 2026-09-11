import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
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
import { decodeLedgerDocument, LedgerSyncError } from "../shared/ledger-sync";
import {
  decodeBudgetUpdate,
  decodeLedgerConflictChoice,
} from "../shared/ledger-data";
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
  handle(IPC_CHANNELS.exportLedgerBackup, (password) =>
    api.exportLedgerBackup(text(password)),
  );
  handle(IPC_CHANNELS.importLedgerBackup, (raw, password) =>
    api.importLedgerBackup(text(raw), text(password)),
  );
  handle(IPC_CHANNELS.getLedgerDocument, () => api.getLedgerDocument());
  handle(IPC_CHANNELS.mergeLedgerDocument, (input) =>
    api.mergeLedgerDocument(decodeLedgerDocument(input)),
  );
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
function text(value: unknown): string {
  if (typeof value !== "string")
    throw new DomainError("invalid-input", "Invalid input");
  return value;
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
      error instanceof LedgerSessionError
    ) {
      throw new Error(`LUNA_ERROR:${error.code}`);
    }
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
