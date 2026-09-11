import { serverErrorMessage } from "../features/server-i18n";
import { createContext, useContext } from "react";
import { QueryClient, queryOptions, useMutation } from "@tanstack/react-query";
import type { AppSnapshot } from "../../shared/domain";
import type { AppLocale, RendererSettings } from "../../shared/settings";
import { DomainError } from "../../shared/domain";
import {
  CONFIG_SYNC_STATUS_CODES,
  type ConfigSyncStatusCode,
} from "../../shared/settings";
import { t, syncStatusMessageKey, type MessageKey } from "../i18n";
import { ledgerToolsErrorMessage } from "../ledger-tools-i18n";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
      retry: false,
      refetchOnWindowFocus: false,
    },
    mutations: { networkMode: "always", retry: false, gcTime: 0 },
  },
});
export interface LocalScope {
  profileId: string;
  generation: number;
}
export const legacyScope: LocalScope = {
  profileId: "legacy-local",
  generation: 0,
};
export function localKeys(scope: LocalScope) {
  return {
    root: ["local", scope.profileId, scope.generation] as const,
    settings: ["local", scope.profileId, scope.generation, "settings"] as const,
  };
}
export async function scopedRead<T>(
  scope: LocalScope,
  read: () => Promise<T>,
): Promise<T> {
  const check = async () => {
    const status = await window.lunaLedger.server?.status();
    if (
      status &&
      (status.profile.id !== scope.profileId ||
        status.generation !== scope.generation)
    )
      throw new Error("LUNA_ERROR:server-cancelled");
  };
  await check();
  const result = await read();
  await check();
  return result;
}
export const snapshotOptions = (
  month: string,
  scope: LocalScope = legacyScope,
) =>
  queryOptions({
    queryKey: [...localKeys(scope).root, "snapshot", month],
    queryFn: () =>
      scopedRead(scope, () => window.lunaLedger.getSnapshot(month)),
  });
export const settingsOptions = (scope: LocalScope = legacyScope) =>
  queryOptions({
    queryKey: localKeys(scope).settings,
    queryFn: () => scopedRead(scope, () => window.lunaLedger.getSettings()),
  });
export interface AppContextValue {
  scope: LocalScope;
  serverStatus: import("../../shared/server-api").ServerStatus | null;
  serverBusy: boolean;
  serverError: unknown;
  runServer(
    action: () => Promise<import("../../shared/server-api").ServerStatus>,
    switchProfile?: boolean,
  ): Promise<boolean>;
  snapshot: AppSnapshot;
  settings: RendererSettings;
  month: string;
  locale: AppLocale;
  message(
    key: MessageKey,
    params?: Readonly<Record<string, string | number>>,
  ): string;
  errorMessage(error: unknown): string;
  refresh(): Promise<void>;
  announce(value: string): void;
  updateSettings(settings: RendererSettings): void;
  setDirty(key: string, dirty: boolean): void;
}
export const AppContext = createContext<AppContextValue | null>(null);
export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("Missing Luna provider");
  return value;
}
export function errorMessage(locale: AppLocale, error: unknown): string {
  const server = serverErrorMessage(locale, error);
  if (server !== undefined) return server;
  const ledger = ledgerToolsErrorMessage(locale, error);
  if (ledger !== undefined) return ledger;
  const code =
    error instanceof DomainError
      ? error.code
      : (/LUNA_ERROR:([a-z-]+)/.exec(
          error instanceof Error ? error.message : "",
        )?.[1] ?? "");
  if (CONFIG_SYNC_STATUS_CODES.includes(code as ConfigSyncStatusCode))
    return t(locale, syncStatusMessageKey(code as ConfigSyncStatusCode));
  const keys: Record<string, MessageKey> = {
    "invalid-input": "domainInvalidInput",
    "invalid-amount": "domainInvalidAmount",
    "invalid-date": "domainInvalidDate",
    "invalid-month": "domainInvalidMonth",
    "invalid-workspace": "domainInvalidWorkspace",
    "invalid-transaction": "domainInvalidTransaction",
    "not-found": "domainNotFound",
    "already-configured": "domainAlreadyConfigured",
    "web-config-sync-unavailable": "desktopOnlySync",
    "web-storage-unavailable": "webStorageUnavailable",
    "web-storage-write-failed": "webStorageWriteFailed",
    "web-storage-invalid": "webStorageInvalid",
    "web-storage-blocked": "webStorageBlocked",
    "sqlite-opfs-unavailable": "offlineUnavailable",
    "sqlite-worker-unavailable": "offlineUnavailable",
    "stale-revision": "staleRevision",
  };
  return t(locale, keys[code] ?? "genericError");
}
/** Never replay a committed write when the subsequent presentation read fails. */
export function useLocalWrite() {
  const app = useApp();
  return useMutation({
    mutationFn: async ({
      write,
      saved,
    }: {
      write(): Promise<unknown>;
      saved(): void;
    }) => {
      await write();
      saved();
      try {
        await app.refresh();
        return true;
      } catch {
        app.announce(app.message("savedRefreshFailed"));
        return false;
      }
    },
  });
}
export function formString(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === "string" ? value : "";
}
export function formChecked(form: HTMLFormElement, name: string): boolean {
  return new FormData(form).get(name) !== null;
}
