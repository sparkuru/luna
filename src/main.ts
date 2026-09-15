import { homedir } from "node:os";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, safeStorage, session } from "electron";
import { randomUUID } from "node:crypto";
import {
  APP_PRODUCT_NAME,
  appDataPaths,
  resolveDefaultDataDirectory,
  resolveActiveDataDirectory,
} from "./main/app-paths";
import type { AppPathErrorCode, AppPathPrompt } from "./main/app-paths";
import { registerIpcHandlers } from "./main/ipc";
import { createNativeProfileHost } from "./main/profile-host";
import { SQLiteLocalStore } from "./main/store";
import { SettingsStore } from "./main/settings-store";
import { SecretStore, ElectronSafeStorageProtector } from "./main/secret-store";
import { ConfigSyncService } from "./main/config-sync";
import { decryptRemoteConfig, encryptRemoteConfig } from "./main/config-crypto";
import { createS3ConfigObjectStore } from "./main/s3-config-store";
import {
  createDefaultSettings,
  remotePayloadFromSettings,
} from "./shared/settings";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

const SMOKE_FLAG = "--smoke";
const isSmokeRun = process.argv.includes(SMOKE_FLAG);
const defaultDataDirectoryAtLaunch =
  process.platform === "linux"
    ? resolveDefaultDataDirectory({
        platform: process.platform,
        homeDirectory: homedir(),
      })
    : null;
const defaultDirectoryExistedAtLaunch =
  defaultDataDirectoryAtLaunch === null
    ? undefined
    : existsSync(defaultDataDirectoryAtLaunch);
let mainWindow: BrowserWindow | null = null;
let profileHost: ReturnType<typeof createNativeProfileHost> | null = null;
let quittingProfiles = false;
let localStore: SQLiteLocalStore | null = null;
let configSyncService: ConfigSyncService | null = null;
let handlersRegistered = false;
let activeDataDirectory: string | null = null;

if (isSmokeRun && process.env.LUNA_LEDGER_SMOKE_USER_DATA) {
  app.setPath("userData", process.env.LUNA_LEDGER_SMOKE_USER_DATA);
}

void app
  .whenReady()
  .then(() => initializeApplication())
  .catch(() => {
    // Startup diagnostics intentionally omit paths and all user data.
    console.error(
      "Luna could not start because its local data is unavailable.",
    );
    app.quit();
  });

app.on("before-quit", (event) => {
  if (profileHost && !quittingProfiles) {
    event.preventDefault();
    quittingProfiles = true;
    void profileHost.dispose().finally(() => {
      profileHost = null;
      app.quit();
    });
    return;
  }

  localStore?.close();
  localStore = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && !isSmokeRun) {
    void restoreMainWindow();
  }
});

async function restoreMainWindow(): Promise<void> {
  if (activeDataDirectory === null) return;
  if (localStore === null) localStore = createLocalStore();
  if (configSyncService === null)
    configSyncService = await createConfigSyncService();
  mainWindow = createMainWindow();
  if (!handlersRegistered) {
    registerIpcHandlers(
      localStore,
      configSyncService,
      () => mainWindow,
      (profileHost ??= createNativeProfileHost(
        getDataDirectory(),
        localStore,
        configSyncService,
        app.getLocale(),
      )).api,
    );
    handlersRegistered = true;
  }
}

function createLocalStore(): SQLiteLocalStore {
  return new SQLiteLocalStore(appDataPaths(getDataDirectory()).databasePath);
}

function getDataDirectory(): string {
  if (activeDataDirectory === null)
    throw new Error("Luna local data directory is not initialized.");
  return activeDataDirectory;
}

async function createConfigSyncService(): Promise<ConfigSyncService> {
  const settingsStore = new SettingsStore(getDataDirectory(), {
    deviceId: randomUUID,
    systemLocale: app.getLocale(),
    now: () => new Date().toISOString(),
  });
  await settingsStore.initialize();
  const secretStore = new SecretStore(
    getDataDirectory(),
    new ElectronSafeStorageProtector(safeStorage),
  );
  return new ConfigSyncService(
    settingsStore,
    secretStore,
    createS3ConfigObjectStore,
    {
      now: () => new Date().toISOString(),
    },
  );
}

async function initializeApplication(): Promise<void> {
  if (isSmokeRun) {
    activeDataDirectory = path.resolve(
      process.env.LUNA_LEDGER_SMOKE_USER_DATA ?? app.getPath("userData"),
    );
    await runPackagedStorageSmoke();
    return;
  }

  const resolvedDirectory = await resolveActiveDataDirectory({
    platform: process.platform,
    homeDirectory: homedir(),
    electronUserDataDirectory: app.getPath("userData"),
    ...(defaultDirectoryExistedAtLaunch === undefined
      ? {}
      : { defaultDirectoryExistedAtLaunch }),
    prompt: createDataDirectoryPrompt(),
  });
  if (resolvedDirectory === null) {
    app.quit();
    return;
  }
  activeDataDirectory = resolvedDirectory;
  // Keep Electron's profile at its stable application location. The selected
  // directory is only the active Luna data boundary; Electron caches and
  // session files must not be written into a user-selected ledger folder.
  localStore = createLocalStore();
  configSyncService = await createConfigSyncService();
  registerIpcHandlers(
    localStore,
    configSyncService,
    () => mainWindow,
    createNativeProfileHost(
      getDataDirectory(),
      localStore,
      configSyncService,
      app.getLocale(),
    ).api,
  );
  handlersRegistered = true;
  mainWindow = createMainWindow();
}

function createDataDirectoryPrompt(): AppPathPrompt {
  const copy = app.getLocale().toLowerCase().startsWith("en")
    ? {
        title: APP_PRODUCT_NAME,
        firstRunMessage: "Choose where Luna stores local data",
        firstRunDetail:
          "Luna uses one local workspace. Create its default folder, choose another local folder, or cancel to quit.",
        createDefault: "Create default folder",
        chooseOther: "Choose another folder",
        cancel: "Cancel",
        pickerTitle: "Choose a local Luna data folder",
        pickerButton: "Use this folder",
        recoveryTitle: "Luna needs a different local folder",
        recoveryMessage: "The saved local folder could not be used.",
        recoveryDetail:
          "Choose another local folder to continue, or cancel from the folder picker to quit. No new ledger files are created until a folder is chosen.",
        continue: "Continue",
      }
    : {
        title: APP_PRODUCT_NAME,
        firstRunMessage: "选择 Luna 的本机数据目录",
        firstRunDetail:
          "Luna 当前使用一个本机工作区。你可以创建默认目录、选择其他本机目录，或取消并退出。",
        createDefault: "创建默认目录",
        chooseOther: "选择其他目录",
        cancel: "取消",
        pickerTitle: "选择 Luna 本机数据目录",
        pickerButton: "使用此目录",
        recoveryTitle: "Luna 需要其他本机目录",
        recoveryMessage: "保存的本机目录无法使用。",
        recoveryDetail:
          "请选择其他本机目录继续，也可以在目录选择器中取消并退出。选定目录前不会创建新的账本文件。",
        continue: "继续",
      };

  return {
    async chooseInitialAction() {
      const result = await dialog.showMessageBox({
        type: "info",
        title: copy.title,
        message: copy.firstRunMessage,
        detail: copy.firstRunDetail,
        buttons: [copy.createDefault, copy.chooseOther, copy.cancel],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
      if (result.response === 0) return "create-default";
      if (result.response === 1) return "choose-other";
      return "cancel";
    },
    async chooseDirectory() {
      const result = await dialog.showOpenDialog({
        title: copy.pickerTitle,
        buttonLabel: copy.pickerButton,
        properties: ["openDirectory", "createDirectory"],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    async showRecoverableError(_code: AppPathErrorCode) {
      await dialog.showMessageBox({
        type: "warning",
        title: copy.recoveryTitle,
        message: copy.recoveryMessage,
        detail: copy.recoveryDetail,
        buttons: [copy.continue],
        defaultId: 0,
        noLink: true,
      });
    },
  };
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: APP_PRODUCT_NAME,
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 620,
    show: !isSmokeRun,
    backgroundColor: "#f5f7fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const connectPolicy = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? "connect-src 'self' ws://127.0.0.1:* ws://localhost:*"
    : "connect-src 'none'";
  const contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "worker-src 'self'",
    "font-src 'self'",
    connectPolicy,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [contentSecurityPolicy],
      },
    });
  });
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.on("will-navigate", (event, url) => {
    if (!isLocalRendererUrl(url)) event.preventDefault();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return window;
}

function isLocalRendererUrl(url: string): boolean {
  try {
    const candidate = new URL(url);
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      return (
        candidate.origin === new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin
      );
    }
    if (candidate.protocol !== "file:") return false;
    const rendererPath = path.normalize(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
    return path.normalize(fileURLToPath(candidate)) === rendererPath;
  } catch {
    return false;
  }
}

/**
 * Honest packaged helper: it verifies the made executable can open the real
 * userData SQLite path, exercise the preload bridge, and recover the record
 * after a close/reopen cycle. It does not claim to automate visual quality or
 * assistive-technology behavior.
 */
async function runPackagedStorageSmoke(): Promise<void> {
  let store: SQLiteLocalStore | null = null;
  try {
    store = createLocalStore();
    const now = "2026-08-30T12:00:00.000Z";
    store.createWorkspace(
      {
        name: "Packaged smoke workspace",
        currency: "CNY",
        precision: 2,
        monthlyBudgetMinor: "10000",
      },
      "smoke-workspace",
      now,
    );
    store.createTransaction(
      {
        type: "expense",
        amountMinor: "1250",
        date: "2026-08-30",
        splits: [{ category: "expense:0", amountMinor: "1250" }],
        merchant: "Local smoke",
        paymentMethod: "Test",
        notes: "Packaged storage verification",
      },
      "smoke-transaction",
      now,
    );
    store.close();
    store = null;
    store = new SQLiteLocalStore(appDataPaths(getDataDirectory()).databasePath);
    const reopenedSnapshot = store.getSnapshot("2026-08");
    if (
      reopenedSnapshot.workspace === null ||
      reopenedSnapshot.transactions.length !== 1 ||
      reopenedSnapshot.summary === null
    ) {
      throw new Error("packaged storage did not recover the smoke record");
    }

    store.close();
    store = null;
    localStore = createLocalStore();
    configSyncService = await createConfigSyncService();
    registerIpcHandlers(
      localStore,
      configSyncService,
      () => mainWindow,
      createNativeProfileHost(
        getDataDirectory(),
        localStore,
        configSyncService,
        app.getLocale(),
      ).api,
    );
    handlersRegistered = true;
    mainWindow = createMainWindow();
    await waitForMainWindowLoad(mainWindow);
    const bridgeResult = (await mainWindow.webContents.executeJavaScript(
      `(async () => {
        const waitFor = async (selector) => {
          for (let attempt = 0; attempt < 100; attempt += 1) {
            const element = document.querySelector(selector);
            if (element !== null) return element;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          throw new Error('renderer element did not appear: ' + selector);
        };
        const setValue = async (field, value) => {
          const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype
            : field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 50));
        };
        await waitFor('#month-picker');
        location.hash = '/settings/preferences';
        await waitFor('#settings-language');
        const language = document.querySelector('#settings-language');
        if (!(language instanceof HTMLSelectElement)) throw new Error('language setting is missing');
        await setValue(language, 'zh-CN');
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const currentSettings = await window.lunaLedger.getSettings();
          if (currentSettings.locale === 'zh-CN' && document.documentElement.lang === 'zh-CN') break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        location.hash = '/ledger';
        const monthPicker = await waitFor('#month-picker');
        if (!(monthPicker instanceof HTMLInputElement)) throw new Error('month picker is missing');
        await setValue(monthPicker, '2026-08');
        const transaction = await window.lunaLedger.createTransaction({
        type: 'expense',
        amountMinor: '375',
        date: '2026-08-30',
        splits: [{ category: 'IPC smoke', amountMinor: '375' }],
        merchant: 'Bridge check',
        paymentMethod: 'Test',
        notes: 'Packaged IPC verification'
      });
        document.querySelector('#record-income').click();
        const form = await waitFor('form#transaction-form');
        if (!(form instanceof HTMLFormElement)) throw new Error('transaction form is missing');
        const setField = async (name, value) => {
          const field = form.elements.namedItem(name);
          if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) {
            throw new Error('transaction form field is missing: ' + name);
          }
          await setValue(field, value);
        };
        await setField('amount', '24.50');
        await setField('date', '2026-08-30');
        document.querySelector('#choose-category').click();
        await waitFor('#category-dialog');
        const category = [...document.querySelectorAll('#category-options button')]
          .find((element) => element.textContent?.trim() === '兼职');
        if (!(category instanceof HTMLButtonElement)) throw new Error('income category option is missing');
        category.click();
        await setField('merchant', 'UI form smoke');
        await setField('payment', 'Bank transfer');
        await setField('notes', 'Packaged UI form verification');
        const hasTransactionForm = true;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        let snapshot;
        for (let attempt = 0; attempt < 50; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          snapshot = await window.lunaLedger.getSnapshot('2026-08');
          if (snapshot.transactions.some((item) => item.merchant === 'UI form smoke')) break;
        }
        if (snapshot === undefined || !snapshot.transactions.some((item) => item.merchant === 'UI form smoke')) {
          throw new Error('renderer transaction form did not persist its record');
        }
        for (let attempt = 0; attempt < 100; attempt += 1) {
          if (document.querySelector('#transaction-list-region')?.textContent?.includes('UI form smoke')
            && document.querySelector('#transaction-dialog')?.getAttribute('data-state') !== 'open') break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        const persistedSettings = await window.lunaLedger.getSettings();
        const summary = document.querySelector('#summary-grid');
        const summaryAmounts = [...document.querySelectorAll('#income-total, #expense-total, #net-total')];
        const moneyMasked = summaryAmounts.length === 3 && summaryAmounts.every((element) => element.textContent?.includes('••••'));
        const summaryCollapsed = summary?.getAttribute('data-summary-state') === 'collapsed' && summary?.classList.contains('is-collapsed');
        const amountPattern = /(^|[^0-9])(1250|1625|2450|375|24\.50|12\.50|3\.75)([^0-9]|$)/;
        const sensitiveAttributeLeak = summaryAmounts.some((element) => [...element.attributes].some((attribute) => amountPattern.test(attribute.value)));
        const detailText = [
          document.querySelector('#budget-status')?.textContent ?? '',
          document.querySelector('#budget-input')?.value ?? '',
          document.querySelector('#transaction-list-region')?.textContent ?? '',
          document.querySelector('#category-breakdown')?.textContent ?? '',
        ].join(' ');
        const detailAmountsVisible = ['12.50', '3.75', '24.50'].every((value) => detailText.includes(value));
        const summaryTextLeak = summaryAmounts.some((element) => amountPattern.test(element.textContent ?? ''));
        const transactionEditEnabled = [...document.querySelectorAll('#transaction-list-region button')]
          .some((element) => element.textContent?.includes('编辑') && !(element instanceof HTMLButtonElement && element.disabled));
        const liveStatus = document.querySelector('#live-status')?.textContent ?? '';
        location.hash = '/budget';
        await waitFor('#budget-input');
        const hasBudgetForm = document.querySelector('form#budget-form') !== null;
        const budgetEditorEnabled = document.querySelector('#budget-input:not(:disabled)') !== null
          && document.querySelector('#save-budget:not(:disabled)') !== null;
        location.hash = '/ledger';
        await new Promise((resolve) => setTimeout(resolve, 50));
        const originalLedgerSnapshot = await window.lunaLedger.getSnapshot('2026-08');
        const backupPassword = 'packaged ledger backup phrase';
        const encryptedLedger = await window.lunaLedger.exportLedgerBackup(backupPassword);
        if (encryptedLedger.includes('UI form smoke') || encryptedLedger.includes(backupPassword)) {
          throw new Error('ledger backup leaked plaintext');
        }
        await window.lunaLedger.importLedgerBackup(encryptedLedger, backupPassword);
        const ledgerBackupVerified = JSON.stringify(await window.lunaLedger.getSnapshot('2026-08')) === JSON.stringify(originalLedgerSnapshot)
          && JSON.parse(encryptedLedger).format === 'luna-ledger-envelope'
          && (await window.lunaLedger.syncLedgerNow()).code === 'disabled';
        const connectionStatus = await window.lunaLedger.configureLedgerSync({
          connection: { endpoint: 'https://example.invalid', region: 'us-east-1', bucket: 'smoke-ledger', prefix: 'test', forcePathStyle: true },
          credentials: { accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret', passphrase: backupPassword },
          rememberSecrets: false,
        });
        const ledgerSessionVerified = connectionStatus.code === 'ready'
          && !JSON.stringify(connectionStatus).includes('synthetic')
          && (await window.lunaLedger.clearLedgerSync()).code === 'disabled';
        return {
          ledgerBackupVerified,
          ledgerSessionVerified,
          amountMinor: transaction.amountMinor,
          transactionCount: snapshot.transactions.length,
          pendingChanges: snapshot.sync.pendingChanges,
          remoteSyncEnabled: snapshot.sync.remoteSyncEnabled,
          uiFormSaved: true,
          locale: persistedSettings.locale,
          hideSensitiveAmountsByDefault: persistedSettings.hideSensitiveAmountsByDefault,
          moneyMasked,
          summaryCollapsed,
          sensitiveAttributeLeak,
          detailAmountsVisible,
          summaryTextLeak,
          transactionEditEnabled,
          budgetEditorEnabled,
          liveStatus,
          ui: {
            title: document.title,
            hasMain: document.querySelector('main#main-content') !== null,
            hasTransactionForm,
            hasBudgetForm,
            hasMonthPicker: document.querySelector('input#month-picker') !== null,
            hasLiveStatus: document.querySelector('#live-status[aria-live="polite"]') !== null,
          },
        };
      })()`,
      true,
    )) as PackagedBridgeSmokeResult;
    if (
      bridgeResult.amountMinor !== "-375" ||
      bridgeResult.transactionCount !== 3 ||
      bridgeResult.pendingChanges !== 3 ||
      bridgeResult.remoteSyncEnabled !== false ||
      !bridgeResult.ledgerBackupVerified ||
      !bridgeResult.ledgerSessionVerified ||
      !bridgeResult.uiFormSaved ||
      bridgeResult.locale !== "zh-CN" ||
      bridgeResult.hideSensitiveAmountsByDefault !== true ||
      !bridgeResult.moneyMasked ||
      !bridgeResult.summaryCollapsed ||
      bridgeResult.sensitiveAttributeLeak ||
      !bridgeResult.detailAmountsVisible ||
      bridgeResult.summaryTextLeak ||
      !bridgeResult.transactionEditEnabled ||
      !bridgeResult.budgetEditorEnabled ||
      bridgeResult.liveStatus !== "交易已保存到本机。" ||
      bridgeResult.ui.title !== "Luna" ||
      !bridgeResult.ui.hasMain ||
      !bridgeResult.ui.hasTransactionForm ||
      !bridgeResult.ui.hasBudgetForm ||
      !bridgeResult.ui.hasMonthPicker ||
      !bridgeResult.ui.hasLiveStatus
    ) {
      throw new Error(
        "packaged IPC bridge did not persist the expected local record",
      );
    }

    const smokeStore = localStore;
    localStore = null;
    smokeStore?.close();
    mainWindow.destroy();
    mainWindow = null;
    store = new SQLiteLocalStore(appDataPaths(getDataDirectory()).databasePath);
    const finalSnapshot = store.getSnapshot("2026-08");
    configSyncService = await createConfigSyncService();
    const reopenedSettings = await configSyncService.getRendererSettings();
    if (
      finalSnapshot.workspace === null ||
      finalSnapshot.transactions.length !== 3 ||
      finalSnapshot.summary?.totalExpenseMinor !== "1625" ||
      finalSnapshot.summary?.totalIncomeMinor !== "2450" ||
      finalSnapshot.workspace.currency !== "CNY" ||
      reopenedSettings.locale !== "zh-CN" ||
      reopenedSettings.hideSensitiveAmountsByDefault !== true
    ) {
      throw new Error("packaged IPC record did not survive reopen");
    }
    const cryptoStartedAt = Date.now();
    const cryptoPayload = remotePayloadFromSettings(
      createDefaultSettings("smoke-crypto", "zh-CN"),
    );
    const encryptedConfig = await encryptRemoteConfig(
      cryptoPayload,
      "packaged smoke passphrase",
    );
    const decryptedConfig = await decryptRemoteConfig(
      encryptedConfig,
      "packaged smoke passphrase",
    );
    if (decryptedConfig.portable.locale.value !== "zh-CN") {
      throw new Error("packaged config crypto did not round-trip");
    }
    encryptedConfig.fill(0);
    await writeProcessOutput(
      process.stdout,
      `LUNA_PACKAGED_STORAGE_SMOKE_OK config_crypto_ms=${Date.now() - cryptoStartedAt}\n`,
    );
    store.close();
    store = null;
    app.exit(0);
  } catch (error) {
    store?.close();
    localStore?.close();
    localStore = null;
    await writeProcessOutput(
      process.stderr,
      `LUNA_PACKAGED_STORAGE_SMOKE_FAILED: ${errorMessage(error)}\n`,
    );
    app.exit(1);
  }
}

interface PackagedBridgeSmokeResult {
  ledgerBackupVerified: boolean;
  ledgerSessionVerified: boolean;
  amountMinor: string;
  transactionCount: number;
  pendingChanges: number;
  remoteSyncEnabled: false;
  uiFormSaved: boolean;
  locale: "zh-CN";
  hideSensitiveAmountsByDefault: true;
  moneyMasked: boolean;
  summaryCollapsed: boolean;
  sensitiveAttributeLeak: boolean;
  detailAmountsVisible: boolean;
  summaryTextLeak: boolean;
  transactionEditEnabled: boolean;
  budgetEditorEnabled: boolean;
  liveStatus: string;
  ui: {
    title: string;
    hasMain: boolean;
    hasTransactionForm: boolean;
    hasBudgetForm: boolean;
    hasMonthPicker: boolean;
    hasLiveStatus: boolean;
  };
}

function waitForMainWindowLoad(window: BrowserWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("packaged renderer did not finish loading")),
      30_000,
    );
    const finish = (): void => {
      clearTimeout(timeout);
      resolve();
    };
    window.webContents.once("did-finish-load", finish);
    window.webContents.once(
      "did-fail-load",
      (_event, errorCode, errorDescription) => {
        clearTimeout(timeout);
        reject(
          new Error(
            `packaged renderer failed to load (${errorCode}: ${errorDescription})`,
          ),
        );
      },
    );
    if (!window.webContents.isLoading()) finish();
  });
}

function errorMessage(_error: unknown): string {
  // Native errors can include the active SQLite path. Keep smoke diagnostics
  // useful as a stable marker without echoing local paths or user data.
  return "packaged smoke assertion failed";
}

function writeProcessOutput(
  stream: NodeJS.WriteStream,
  value: string,
): Promise<void> {
  return new Promise((resolve) => stream.write(value, () => resolve()));
}
