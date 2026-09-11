import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useBlocker,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import type { ProfileSummary, ServerStatus } from "../../shared/server-api";
import type { AppSnapshot } from "../../shared/domain";
import { AccountPanel, ServerSyncPanel } from "../features/account";
import { serverMessage } from "../features/server-i18n";
import { ledgerToolsMessage } from "../ledger-tools-i18n";
import { validateLedgerSearch } from "./search";
import { currentLocalMonth } from "../../shared/domain";
import type { RendererSettings } from "../../shared/settings";
import { t, type MessageKey } from "../i18n";
import {
  AppContext,
  errorMessage,
  queryClient,
  settingsOptions,
  snapshotOptions,
  localKeys,
  scopedRead,
} from "../data/local";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../components/ui/dialog";
import { LedgerHome } from "../features/ledger";
import { Setup } from "../features/setup";
import { TransactionDialog, type Entry } from "../features/entry";
import { BudgetEditor, Statistics } from "../features/budget";
import { Settings, LanguageSelect } from "../features/settings";
import { LedgerTools, type ToolsPage } from "../features/tools";
export function App() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const search = validateLedgerSearch(
    useRouterState({ select: (state) => state.location.search }),
  );
  const month = search.month ?? currentLocalMonth();
  const setMonth = (month: string) => {
    void navigate({ to: path, search: { ...search, month } });
  };
  const server = window.lunaLedger.server;
  const hostStatus = useQuery({
    queryKey: ["host-status"],
    queryFn: () => server!.status(),
    enabled: !!server,
  });
  const serverStatus = hostStatus.data ?? null;
  const profilesQuery = useQuery({
    queryKey: ["server-safe", "local-profiles"],
    queryFn: () => server!.profiles(),
    enabled: !!server && !!serverStatus,
    staleTime: 0,
  });
  const scope = {
    profileId: serverStatus?.profile.id ?? "legacy-local",
    generation: serverStatus?.generation ?? 0,
  };
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [serverBusy, setServerBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [showStartupPicker, setShowStartupPicker] = useState<boolean | null>(
    server ? null : false,
  );
  const [serverError, setServerError] = useState<unknown>();
  const actionRunning = useRef(false);
  const previous = useRef<{
    profile: string;
    month?: string;
    snapshot?: AppSnapshot;
    settings?: RendererSettings;
  }>({ profile: scope.profileId });
  if (previous.current.profile !== scope.profileId)
    previous.current = { profile: scope.profileId };
  const ready = (!server || !!serverStatus) && !switching && !serverBusy;
  const settingsQuery = useQuery({
    ...settingsOptions(scope),
    enabled: ready,
    ...(previous.current.settings
      ? { placeholderData: previous.current.settings }
      : {}),
  });
  const snapshotQuery = useQuery({
    ...snapshotOptions(month, scope),
    enabled: ready,
    ...(previous.current.month === month && previous.current.snapshot
      ? { placeholderData: previous.current.snapshot }
      : {}),
  });
  if (settingsQuery.data) previous.current.settings = settingsQuery.data;
  if (snapshotQuery.data) {
    previous.current.snapshot = snapshotQuery.data;
    previous.current.month = month;
  }
  const settings = settingsQuery.data;
  const snapshot = snapshotQuery.data;
  const locale = settings?.locale ?? "zh-CN";
  const m = (
    key: MessageKey,
    params: Readonly<Record<string, string | number>> = {},
  ) => t(locale, key, params);
  const syncSummary = server
    ? !serverStatus?.account
      ? serverMessage(locale, "needsLogin")
      : serverStatus.sync.remoteChangeAvailable
        ? serverMessage(locale, "remoteChangeAvailable")
        : ledgerToolsMessage(locale, serverStatus.sync.code)
    : m("localOnly");
  const [announcement, setAnnouncement] = useState("");
  const [visibility, setVisibility] = useState([false, false, false]);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryKey, setEntryKey] = useState(0);
  const dirty = useRef(new Set<string>());
  const [hasDirty, setHasDirty] = useState(false);
  const setDirty = useCallback((key: string, value: boolean) => {
    if (value) dirty.current.add(key);
    else dirty.current.delete(key);
    setHasDirty(dirty.current.size > 0);
  }, []);
  useBlocker({
    shouldBlockFn: ({ next }) => {
      if (entryOpen) {
        window.dispatchEvent(new Event("luna:back"));
        return true;
      }
      return (
        (!["/ledger", "/ledger/menu"].includes(next.pathname) ||
          (next.search.month ?? currentLocalMonth()) !== month) &&
        [...dirty.current].some((key) => key !== "entry") &&
        !window.confirm(m("discardDraft"))
      );
    },
    enableBeforeUnload: hasDirty,
  });
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = m("appTitle");
  }, [locale]);
  useEffect(() => {
    if (settings)
      setVisibility(Array(3).fill(!settings.hideSensitiveAmountsByDefault));
  }, [settings?.hideSensitiveAmountsByDefault]);
  useEffect(() => {
    if (showStartupPicker !== null) return;
    if (profilesQuery.error !== null) {
      setShowStartupPicker(false);
      return;
    }
    if (profilesQuery.data === undefined || snapshot === undefined) return;
    const activeProfileKnown = profilesQuery.data.some(
      (profile) => profile.id === scope.profileId,
    );
    const needsChoice =
      profilesQuery.data.length > 1 &&
      (!activeProfileKnown || snapshot.workspace === null);
    setShowStartupPicker(needsChoice);
  }, [
    profilesQuery.data,
    profilesQuery.error,
    scope.profileId,
    showStartupPicker,
    snapshot,
  ]);
  const refresh = useCallback(async () => {
    const currentScope = scopeRef.current;
    await scopedRead(currentScope, async () => undefined);
    await queryClient.invalidateQueries({
      queryKey: localKeys(currentScope).root,
      refetchType: "none",
    });
    await Promise.all([
      queryClient.fetchQuery({
        ...snapshotOptions(month, currentScope),
        staleTime: 0,
      }),
      queryClient.fetchQuery({
        ...settingsOptions(currentScope),
        staleTime: 0,
      }),
      ...(server
        ? [
            queryClient.fetchQuery({
              queryKey: ["host-status"],
              queryFn: () => server.status(),
              staleTime: 0,
            }),
          ]
        : []),
    ]);
  }, [month, server]);
  const updateSettings = useCallback(
    (next: RendererSettings) => {
      if (
        scopeRef.current.profileId !== scope.profileId ||
        scopeRef.current.generation !== scope.generation
      )
        return;
      void queryClient.cancelQueries({
        queryKey: localKeys(scope).settings,
        exact: true,
      });
      queryClient.setQueryData(localKeys(scope).settings, next);
    },
    [scope.profileId, scope.generation],
  );
  const runServer = async (
    action: () => Promise<ServerStatus>,
    switchProfile = false,
  ): Promise<boolean> => {
    if (actionRunning.current) return false;
    if (
      switchProfile &&
      dirty.current.size &&
      !window.confirm(m("discardDraft"))
    )
      return false;
    actionRunning.current = true;
    setServerBusy(true);
    setServerError(undefined);
    if (switchProfile) {
      dirty.current.clear();
      setHasDirty(false);
      setEntry(null);
      setEntryOpen(false);
      setSwitching(true);
      previous.current = { profile: "" };
    }
    await queryClient.cancelQueries();
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== "host-status",
    });
    let success = false;
    try {
      const result = await action();
      scopeRef.current = {
        profileId: result.profile.id,
        generation: result.generation,
      };
      if (result.profile.id !== scope.profileId) setAnnouncement("");
      queryClient.setQueryData(["host-status"], result);
      success = true;
      try {
        // A sync can merge into SQLite without changing the React query object.
        // Read the committed graph again before reporting the action complete.
        await refresh();
      } catch (error) {
        setServerError(error);
      }
    } catch (error) {
      setServerError(error);
      try {
        queryClient.setQueryData(["host-status"], await server!.status());
      } catch {
        /* Keep local recovery available. */
      }
    } finally {
      document
        .querySelectorAll<HTMLInputElement>('input[type="password"]')
        .forEach((input) => {
          input.value = "";
        });
      actionRunning.current = false;
      setServerBusy(false);
      setSwitching(false);
      void queryClient.invalidateQueries({ queryKey: ["local"] });
      void queryClient.invalidateQueries({ queryKey: ["server-safe"] });
    }
    return success;
  };
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (disposed || actionRunning.current) return;
        if (queryClient.isMutating()) {
          changed();
          return;
        }
        void (async () => {
          const next = server ? await server.status() : null;
          if (disposed || actionRunning.current) return;
          if (
            next &&
            (next.profile.id !== scope.profileId ||
              next.generation !== scope.generation)
          ) {
            await queryClient.cancelQueries({ queryKey: ["local"] });
            queryClient.removeQueries({ queryKey: ["local"] });
            queryClient.removeQueries({ queryKey: ["server-safe"] });
          }
          if (next && next.profile.id !== scope.profileId) {
            setEntry(null);
            setEntryOpen(false);
            dirty.current.clear();
            setHasDirty(false);
            setAnnouncement("");
          }
          if (next) {
            scopeRef.current = {
              profileId: next.profile.id,
              generation: next.generation,
            };
            queryClient.setQueryData(["host-status"], next);
          }
          await refresh();
        })().catch((error) => {
          if (!disposed) setServerError(error);
        });
      }, 75);
    };
    const unsubscribe = window.lunaLedger.onChange?.(changed);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
    };
  }, [refresh, server, scope.profileId, scope.generation]);
  const menu = path.startsWith("/ledger/menu");
  const section = path.split("/")[3] ?? "";
  const goto = (to: string) => void navigate({ to, search });
  const closeMenu = () => {
    goto("/ledger");
  };
  useEffect(() => {
    const back = (event: Event) => {
      if (entryOpen) {
        event.preventDefault();
        window.dispatchEvent(new Event("luna:back"));
      } else if (menu) {
        event.preventDefault();
        void navigate({
          to: section ? "/ledger/menu" : "/ledger",
          search,
        });
      }
    };
    window.addEventListener("luna:navigate-back", back);
    return () => window.removeEventListener("luna:navigate-back", back);
  }, [entryOpen, menu, section, navigate, search.month, search.type]);
  if (server && hostStatus.error && !serverStatus)
    return (
      <main id="main-content" className="app-shell">
        <p id="global-error" className="global-alert" role="alert">
          {errorMessage(locale, hostStatus.error)}
        </p>
        <Button id="retry-load" onClick={() => void hostStatus.refetch()}>
          {m("tryAgain")}
        </Button>
      </main>
    );
  if (switching || (!!server && hostStatus.isPending))
    return (
      <div className="app-shell" role="status">
        {m("loading")}
      </div>
    );
  if (
    (settingsQuery.isPending || snapshotQuery.isPending) &&
    (!settings || !snapshot)
  )
    return (
      <div className="app-shell">
        <div className="loading-state animate-pulse" role="status">
          {m("loading")}
        </div>
      </div>
    );
  if (!settings || !snapshot) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <span className="brand">Luna</span>
        </header>
        <main id="main-content" tabIndex={-1}>
          <p className="global-alert" id="global-error" role="alert">
            {errorMessage(locale, settingsQuery.error ?? snapshotQuery.error)}
          </p>
          <Button
            id="retry-load"
            onClick={() => {
              void settingsQuery.refetch();
              void snapshotQuery.refetch();
            }}
          >
            {m("tryAgain")}
          </Button>
        </main>
      </div>
    );
  }
  if (server && showStartupPicker === true && profilesQuery.data) {
    return (
      <StartupLedgerPicker
        profiles={profilesQuery.data}
        activeId={scope.profileId}
        busy={serverBusy || switching}
        locale={locale}
        onChoose={async (id) => {
          if (id === scope.profileId) {
            setShowStartupPicker(false);
            return;
          }
          if (await runServer(() => server.selectProfile(id), true))
            setShowStartupPicker(false);
        }}
      />
    );
  }
  const workspace = snapshot.workspace;
  const pages: { path: string; label: MessageKey }[] = [
    { path: "budget", label: "monthlyLimit" },
    { path: "statistics", label: "categoryBreakdown" },
    { path: "settings", label: "settingsTitle" },
    { path: "sync", label: "ledgerToolsLink" },
    { path: "backup", label: "ledgerToolsSummary" },
    { path: "conflicts", label: "ledgerToolsLink" },
    { path: "account", label: "accountTitle" },
  ];
  return (
    <AppContext.Provider
      key={scope.profileId}
      value={{
        scope,
        serverStatus,
        serverBusy,
        serverError,
        runServer,
        snapshot,
        settings,
        month,
        locale,
        message: m,
        errorMessage: (error) => errorMessage(locale, error),
        refresh,
        announce: (value) => {
          if (
            scopeRef.current.profileId === scope.profileId &&
            scopeRef.current.generation === scope.generation
          )
            setAnnouncement(value);
        },
        updateSettings,
        setDirty: (key, value) => {
          if (
            scopeRef.current.profileId === scope.profileId &&
            scopeRef.current.generation === scope.generation
          )
            setDirty(key, value);
        },
      }}
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        {m("skipLink")}
      </a>
      <div className="app-shell">
        <header className="topbar">
          <a
            className="brand"
            href="/ledger"
            aria-label={m("homeLabel")}
            onClick={(e) => {
              e.preventDefault();
              goto("/ledger");
            }}
          >
            <span className="brand-mark" aria-hidden="true">
              L
            </span>
            <span>{m("appTitle")}</span>
          </a>
          <div className="status-row">
            <div className="sync-summary" aria-live="polite">
              <span
                className={`status-pill sync-status-pill${serverStatus?.sync.remoteChangeAvailable ? " is-available" : ""}`}
              >
                <span className="sync-status-dot" aria-hidden="true" />
                <span>{server ? syncSummary : m("localOnly")}</span>
              </span>
              {server && (
                <Button
                  id="open-sync-status"
                  className="sync-status-button"
                  variant="outline"
                  onClick={() => goto("/ledger/menu/sync")}
                  aria-label={serverMessage(locale, "openSync")}
                >
                  <span>{serverMessage(locale, "syncStatusLabel")}</span>
                  <span className="sync-status-detail">
                    {serverStatus?.account
                      ? serverStatus.profile.binding
                        ? serverStatus.connected
                          ? serverStatus.profile.displayName
                          : serverMessage(locale, "needsUnlock")
                        : serverMessage(locale, "signedIn")
                      : serverMessage(locale, "needsLogin")}
                  </span>
                </Button>
              )}
            </div>
            {server && profilesQuery.data && profilesQuery.data.length > 0 && (
              <label className="compact-field ledger-picker" htmlFor="local-ledger-picker">
                <span>{m("localLedger")}</span>
                <select
                  id="local-ledger-picker"
                  value={scope.profileId}
                  disabled={serverBusy || switching || profilesQuery.isFetching}
                  onChange={(event) => {
                    const id = event.currentTarget.value;
                    void runServer(() => server.selectProfile(id), true);
                  }}
                >
                  {profilesQuery.data.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.displayName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {serverStatus?.profile.binding && (
              <span className="helper">{serverStatus.profile.displayName}</span>
            )}
            <Button
              id="open-secondary-menu"
              className="menu-button"
              variant="outline"
              aria-label={m("openMenu")}
              aria-haspopup="dialog"
              aria-controls="secondary-menu-dialog"
              onClick={() => goto("/ledger/menu")}
            >
              <span className="menu-icon" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </Button>
            {!workspace && <LanguageSelect id="setup-language" />}
            <span
              className="visually-hidden"
              id="live-status"
              aria-live="polite"
            >
              {announcement}
            </span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {workspace && snapshot.summary ? (
            <LedgerHome
              openEntry={(next) => {
                if (
                  entry &&
                  dirty.current.has("entry") &&
                  entry.transaction?.id === next.transaction?.id &&
                  entry.type === next.type
                ) {
                  setEntryOpen(true);
                  return;
                }
                if (
                  entry &&
                  dirty.current.has("entry") &&
                  !window.confirm(m("discardDraft"))
                )
                  return;
                setEntry(next);
                setEntryKey((key) => key + 1);
                setEntryOpen(true);
              }}
              changeMonth={setMonth}
              type={search.type ?? "all"}
              changeType={(type) => {
                void navigate({ to: path, search: { ...search, type } });
              }}
              visibility={visibility}
              toggle={(index) =>
                setVisibility((values) =>
                  values.map((value, i) => (i === index ? !value : value)),
                )
              }
            />
          ) : (
            <Setup />
          )}
          {snapshotQuery.error && (
            <p className="global-alert" role="alert">
              {errorMessage(locale, snapshotQuery.error)}{" "}
              <Button
                variant="outline"
                onClick={() => void snapshotQuery.refetch()}
              >
                {m("tryAgain")}
              </Button>
            </p>
          )}
        </main>
      </div>
      <Dialog
        open={menu}
        onOpenChange={(open) => {
          if (!open) closeMenu();
        }}
      >
        <DialogContent
          active={menu}
          id="secondary-menu-dialog"
          aria-labelledby="secondary-menu-title"
          aria-describedby="secondary-menu-description"
          className="luna-dialog secondary-menu-panel"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("close-secondary-menu")?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("open-secondary-menu")?.focus();
          }}
        >
          <header className="dialog-header">
            <div>
              <span className="kicker" id="secondary-menu-kicker">
                {m("menuKicker")}
              </span>
              <DialogTitle id="secondary-menu-title">
                {m(workspace ? "menuTitle" : "ledgerToolsLink")}
              </DialogTitle>
              <DialogDescription id="secondary-menu-description">
                {m(workspace ? "menuDescription" : "ledgerToolsSummary")}
              </DialogDescription>
            </div>
            <Button
              id="close-secondary-menu"
              variant="outline"
              onClick={closeMenu}
            >
              {m("closeMenu")}
            </Button>
          </header>
          <nav className="flex flex-wrap gap-2" aria-label={m("menuTitle")}>
            {section && (
              <Button variant="outline" onClick={() => goto("/ledger/menu")}>
                {m("menuBack")}
              </Button>
            )}
            {pages.map((page) => (
              <Button
                key={page.path}
                variant={section === page.path ? "default" : "outline"}
                onClick={() => goto(`/ledger/menu/${page.path}`)}
              >
                {page.path === "backup"
                  ? m("backupNav")
                  : page.path === "conflicts"
                    ? m("conflictsNav")
                    : m(page.label)}
              </Button>
            ))}
          </nav>
          <div id="secondary-menu-content" className="secondary-menu-sections">
            {workspace && (!section || section === "budget") && (
              <BudgetEditor key={`${workspace.id}:${month}`} />
            )}{" "}
            {workspace && (!section || section === "statistics") && (
              <Statistics />
            )}
            {(!section || section === "settings") && <Settings />}
            {section === "account" && <AccountPanel />}
            {section === "sync" && server && <ServerSyncPanel />}
          </div>
          {(!section || ["sync", "backup", "conflicts"].includes(section)) && (
            <div id="ledger-tools-root" className="secondary-tools-host">
              <LedgerTools
                active={menu}
                page={(section || "all") as ToolsPage}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
      {entry && workspace && (
        <TransactionDialog
          key={entryKey}
          entry={entry}
          open={entryOpen}
          close={() => setEntryOpen(false)}
          saved={() => {
            setEntryOpen(false);
            setEntry(null);
          }}
        />
      )}
    </AppContext.Provider>
  );
}

function StartupLedgerPicker({
  profiles,
  activeId,
  busy,
  locale,
  onChoose,
}: {
  profiles: ProfileSummary[];
  activeId: string;
  busy: boolean;
  locale: import("../../shared/settings").AppLocale;
  onChoose: (id: string) => Promise<void>;
}) {
  const m = (key: Parameters<typeof serverMessage>[1]) =>
    serverMessage(locale, key);
  return (
    <main id="local-ledger-start" className="app-shell" tabIndex={-1}>
      <section className="panel mx-auto max-w-2xl space-y-5">
        <p className="eyebrow">{m("local")}</p>
        <h1>{m("profiles")}</h1>
        <p>{m("localNotice")}</p>
        <ul className="grid gap-3" aria-label={m("profiles")}>
          {profiles.map((profile) => (
            <li
              key={profile.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border p-4"
            >
              <div>
                <strong>{profile.displayName}</strong>
                {profile.binding && (
                  <p className="helper">{m("serverCopy")}</p>
                )}
              </div>
              <Button
                type="button"
                variant={profile.id === activeId ? "secondary" : "default"}
                disabled={busy}
                aria-current={profile.id === activeId ? "true" : undefined}
                onClick={() => void onChoose(profile.id)}
              >
                {profile.id === activeId ? m("active") : m("chooseProfile")}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
