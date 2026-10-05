import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, BookOpen, Plus, Settings as SettingsIcon, Wallet } from "lucide-react";
import {
  useBlocker,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import type { ProfileSummary, ServerStatus } from "../../shared/server-api";
import type { AppSnapshot } from "../../shared/domain";
import {
  AccountPanel,
  LedgerDirectoryPanel,
  ServerSyncPanel,
} from "../features/account";
import {
  serverLastOpenedMessage,
  serverMessage,
  serverStorageMessage,
  serverSyncStateMessage,
} from "../features/server-i18n";
import { defaultStatisticsAnchor, validateLedgerSearch } from "./search";
import { currentLocalMonth } from "../../shared/domain";
import type { RendererSettings } from "../../shared/settings";
import { formatMonth, t, type MessageKey } from "../i18n";
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
import { BrandMark } from "../components/brand-mark";
import { LedgerRoute } from "../features/ledger";
import { Setup } from "../features/setup";
import { TransactionDialog, type Entry } from "../features/entry";
import { BudgetEditor, Statistics } from "../features/budget";
import { Settings, LanguageSelect } from "../features/settings";
import {
  settingsAreaGroups,
  settingsNavigationItems,
} from "../features/settings-navigation";
import { Categories } from "../features/categories";
import { LedgerTools } from "../features/tools";
import { getClientSurface } from "../client-surface";

const SETTINGS_PATHS = new Set(
  settingsNavigationItems(false).map(({ path }) => path),
);

export function App() {
  const isWebSurface = getClientSurface() === "web";
  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const search = validateLedgerSearch(
    useRouterState({ select: (state) => state.location.search }),
  );
  const month = search.month ?? currentLocalMonth();
  const setMonth = (nextMonth: string) => {
    void navigate({
      to: path,
      search: {
        ...search,
        month: nextMonth,
        anchor: defaultStatisticsAnchor(nextMonth),
      },
    });
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
    // Keep the application chrome mounted while a new month is read. The
    // page content checks `isPlaceholderData` below so an old snapshot can
    // never be presented as the newly selected month.
    ...(previous.current.snapshot
      ? { placeholderData: previous.current.snapshot }
      : {}),
  });
  if (settingsQuery.data) previous.current.settings = settingsQuery.data;
  if (snapshotQuery.data && !snapshotQuery.isPlaceholderData) {
    previous.current.snapshot = snapshotQuery.data;
    previous.current.month = month;
  }
  const settings = settingsQuery.data;
  const queriedSnapshot = snapshotQuery.data;
  const snapshot =
    queriedSnapshot !== undefined &&
    (queriedSnapshot.workspace === null ||
      queriedSnapshot.summary?.month === month)
      ? queriedSnapshot
      : undefined;
  const cachedSnapshot = previous.current.snapshot;
  const snapshotForContext =
    snapshot ??
    (cachedSnapshot === undefined
      ? undefined
      : {
          ...cachedSnapshot,
          // A month transition must never display records or totals from the
          // previous query while the selected month's snapshot is loading.
          transactions: [],
          summary: null,
        });
  const rootTarget =
    path === "/" && snapshot !== undefined && snapshot.workspace !== null
      ? "/luna"
      : null;
  useEffect(() => {
    if (rootTarget === null) return;
    void navigate({
      to: rootTarget,
      search,
      replace: true,
    });
  }, [navigate, rootTarget, search.anchor, search.month, search.period, search.type]);
  const locale = settings?.locale ?? "zh-CN";
  const m = (
    key: MessageKey,
    params: Readonly<Record<string, string | number>> = {},
  ) => t(locale, key, params);
  const [announcement, setAnnouncement] = useState("");
  const [visibility, setVisibility] = useState([false, false, false]);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [statisticsType, setStatisticsType] = useState<"income" | "expense">(
    "expense",
  );
  const [entryOpen, setEntryOpen] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    let fullHeight = window.innerHeight;
    let fullWidth = window.innerWidth;
    const update = () => {
      // Rotation changes the unobscured layout; IME resizing preserves its width.
      if (fullWidth !== window.innerWidth) {
        fullWidth = window.innerWidth;
        fullHeight = window.innerHeight;
      } else {
        fullHeight = Math.max(fullHeight, window.innerHeight);
      }
      const focused = document.activeElement;
      const textFocused = focused instanceof HTMLTextAreaElement ||
        (focused instanceof HTMLInputElement && focused.inputMode !== "none" &&
          ["text", "search", "password", "email", "number", "url", "tel"].includes(focused.type));
      const height = window.visualViewport?.height ?? window.innerHeight;
      root.dataset.mobileIme = String(root.dataset.clientSurface === "mobile" && textFocused && fullHeight - height > 140);
    };
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      delete root.dataset.mobileIme;
    };
  }, []);

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
      const targetMonth = next.search.month ?? currentLocalMonth();
      const changingRoute = next.pathname !== path || targetMonth !== month;
      return (
        changingRoute &&
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
    if (!announcement) return;
    const timeout = window.setTimeout(() => setAnnouncement(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [announcement]);
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
    setShowStartupPicker(profilesQuery.data.length > 1);
  }, [
    profilesQuery.data,
    profilesQuery.error,
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
  const settingsSubpage = path.startsWith("/settings/")
    ? path.split("/")[2] ?? ""
    : "";
  const primarySection =
    path === "/luna"
      ? "ledger"
      : path === "/statistics"
        ? "statistics"
        : path === "/budget"
          ? "budget"
          : SETTINGS_PATHS.has(path)
            ? "settings"
            : path === "/" || path === "/setup"
              ? "setup"
              : "unknown";
  const goto = (to: string) => void navigate({ to, search });
  const openEntry = (next: Entry) => {
    if (
      entry &&
      dirty.current.has("entry") &&
      entry.transaction?.id === next.transaction?.id &&
      entry.type === next.type
    ) {
      setEntryOpen(true);
      return;
    }
    if (entry && dirty.current.has("entry") && !window.confirm(m("discardDraft")))
      return;
    setEntry(next);
    setEntryKey((key) => key + 1);
    setEntryOpen(true);
  };
  useEffect(() => {
    const back = (event: Event) => {
      if (event.defaultPrevented) return;
      // Native dispatch targets window itself; capture listeners on that same
      // target do not reliably precede the shell listener. Visible feature
      // dialogs own this event; closed persistent portals must not block routes.
      if (Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).some((dialog) => !dialog.closest('[hidden], [inert], [aria-hidden="true"], [data-state="closed"]') && getComputedStyle(dialog).visibility !== "hidden" && dialog.getClientRects().length > 0)) return;
      if (entryOpen) {
        event.preventDefault();
        window.dispatchEvent(new Event("luna:back"));
      } else if (path.startsWith("/settings/")) {
        event.preventDefault();
        void navigate({ to: "/settings", search });
      } else if (path === "/settings" || path === "/statistics" || path === "/budget") {
        event.preventDefault();
        void navigate({ to: "/luna", search });
      }
    };
    window.addEventListener("luna:navigate-back", back);
    return () => window.removeEventListener("luna:navigate-back", back);
  }, [entryOpen, navigate, path, search.anchor, search.month, search.period, search.type]);
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
  if (!settings || !snapshotForContext) {
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
  if (primarySection === "unknown") return null;
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
        onCreate={async (importBackup) => {
          if (await runServer(() => server.createLocalProfile(), true)) {
            setShowStartupPicker(false);
            if (importBackup) goto("/settings/backup");
          }
        }}
      />
    );
  }
  const workspace = snapshotForContext.workspace;
  const snapshotReady = snapshot !== undefined;
  return (
    <AppContext.Provider
      key={scope.profileId}
      value={{
        scope,
        serverStatus,
        serverBusy,
        serverError,
        runServer,
        snapshot: snapshotForContext,
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
      <div className={`app-shell${isWebSurface ? " client-surface-web" : ""}`}>
        {workspace && isWebSurface ? (
          <WebSidebar
            active={
              isWebSurface && primarySection === "budget"
                ? "settings"
                : primarySection
            }
            locale={locale}
            message={m}
            navigate={goto}
            announcement={announcement}
            web
          />
        ) : (
          <>
            <header className={`topbar${isWebSurface ? " web-setup-topbar" : ""}`}>
              <a
                className="brand"
                href="/luna"
                aria-label={m("homeLabel")}
                onClick={(e) => {
                  e.preventDefault();
                  goto("/luna");
                }}
              >
                <BrandMark />
                <span>{m("appTitle")}</span>
              </a>
              {workspace && (
                <span className="topbar-workspace">{workspace.name}</span>
              )}
              <div className="status-row">
                {getClientSurface() !== "mobile" && (!isWebSurface || workspace) && (
                  <Button
                    id="open-secondary-menu"
                    className="menu-button"
                    variant="outline"
                    aria-label={m("openSettingsSection")}
                    onClick={() => goto("/settings")}
                  >
                    <span className="menu-icon" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                  </Button>
                )}
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
            {workspace && (
              <PrimaryNavigation
                active={primarySection}
                locale={locale}
                navigate={goto}
                {...(getClientSurface() === "mobile" ? { settingsControlId: "open-secondary-menu" } : {})}
                record={() =>
                  openEntry({ type: "expense", returnFocus: "primary-record" })
                }
                message={m}
              />
            )}
          </>
        )}
        <main id="main-content" tabIndex={-1}>
          {isWebSurface && workspace && path === "/luna" && announcement && (
            <div className="web-action-toast" aria-hidden="true">
              {announcement}
            </div>
          )}
          {workspace &&
            (primarySection === "settings" ||
              (isWebSurface && primarySection === "budget")) &&
            (getClientSurface() === "mobile" ? path !== "/settings" : !isWebSurface || path !== "/settings") && (
            <SettingsNavigation
              active={
                path === "/settings/sync/advanced"
                  ? "advanced"
                  : path === "/budget"
                    ? "budget"
                  : settingsSubpage || "settings"
              }
              navigate={goto}
              message={m}
              web={isWebSurface}
            />
          )}
          {workspace && primarySection === "ledger" ? (
            <LedgerRoute
              key={scope.profileId}
              loading={!snapshotReady || !snapshotForContext.summary}
              month={month}
              locale={locale}
              message={m}
              changeMonth={setMonth}
              onRetry={() => void snapshotQuery.refetch()}
              error={
                snapshotQuery.error
                  ? errorMessage(locale, snapshotQuery.error)
                  : ""
              }
              openEntry={openEntry}
              type={search.type ?? "all"}
              changeType={(type) => {
                void navigate({
                  to: path,
                  search: { ...search, type },
                  resetScroll: false,
                }).then(() => {
                  requestAnimationFrame(() =>
                    document
                      .getElementById("filter-type")
                      ?.focus({ preventScroll: true }),
                  );
                });
              }}
              visibility={visibility}
              web={isWebSurface}
              toggle={(index) =>
                setVisibility((values) =>
                  values.map((value, i) => (i === index ? !value : value)),
                )
              }
            />
          ) : workspace && !snapshotReady ? (
            <>
              <section className="panel month-loading-state" role="status">
                <p className="kicker">{formatMonth(locale, month)}</p>
                <p>{m("loadingMonth")}</p>
                {snapshotQuery.error && (
                  <p className="form-alert" role="alert">
                    {errorMessage(locale, snapshotQuery.error)}{" "}
                    <Button
                      variant="outline"
                      onClick={() => void snapshotQuery.refetch()}
                    >
                      {m("tryAgain")}
                    </Button>
                  </p>
                )}
              </section>
            </>
          ) : workspace && snapshotForContext.summary ? (
            primarySection === "statistics" ? (
              <Statistics
                period={search.period ?? "month"}
                anchor={search.anchor ?? defaultStatisticsAnchor(month)}
                type={statisticsType}
                web={isWebSurface}
                onPeriodChange={(period) =>
                  void navigate({ to: path, search: { ...search, period } })
                }
                onAnchorChange={(anchor) =>
                  void navigate({
                    to: path,
                    search: { ...search, month: anchor.slice(0, 7), anchor },
                  })
                }
                onMonthChange={setMonth}
                onTypeChange={setStatisticsType}
              />
            ) : primarySection === "budget" ? (
              <BudgetEditor key={`${workspace.id}:${month}`} web={isWebSurface} changeMonth={setMonth} />
            ) : primarySection === "settings" ? (
              settingsSubpage === "ledgers" ? (
                <LedgerDirectoryPanel />
              ) : settingsSubpage === "categories" ? (
                <Categories />
              ) : settingsSubpage === "budget" ? (
                <BudgetEditor key={`${workspace.id}:${month}`} web={isWebSurface} changeMonth={setMonth} />
              ) : settingsSubpage === "account" ? (
                <AccountPanel navigate={goto} />
              ) : settingsSubpage === "sync" ? (
                path === "/settings/sync/advanced" ? (
                  <Settings section="advanced" />
                ) : server ? (
                  <ServerSyncPanel navigate={goto} />
                ) : (
                  <LedgerTools page="sync" active navigate={goto} />
                )
              ) : settingsSubpage === "backup" ? (
                <LedgerTools page="backup" active />
              ) : settingsSubpage === "conflicts" ? (
                <LedgerTools page="conflicts" active />
              ) : settingsSubpage === "preferences" ? (
                <Settings section="preferences" />
              ) : (
                <Settings section="overview" navigate={goto} web={isWebSurface} />
              )
            ) : null
          ) : (
            <>
              {path === "/settings/backup" || path === "/settings/account" ? (
                <>
                  <Button id="setup-back" variant="outline" onClick={() => goto("/")}>
                    {m("setupBack")}
                  </Button>
                  {path === "/settings/backup" ? (
                    <LedgerTools page="backup" active />
                  ) : (
                    <AccountPanel navigate={goto} />
                  )}
                </>
              ) : (
                <Setup navigate={goto} />
              )}
            </>
          )}
          {snapshotQuery.error && snapshotReady && (
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

function WebSidebar({
  active,
  locale,
  message,
  navigate,
  announcement,
  web,
}: {
  active: string;
  locale: import("../../shared/settings").AppLocale;
  message: (
    key: MessageKey,
    params?: Readonly<Record<string, string | number>>,
  ) => string;
  navigate: (to: string) => void;
  announcement: string;
  web: boolean;
}) {
  return (
    <aside className="web-sidebar" aria-label={message("primaryNavigation")}>
      <div className="web-sidebar-header">
        <a
          className="brand"
          href="/luna"
          aria-label={message("homeLabel")}
          onClick={(event) => {
            event.preventDefault();
            navigate("/luna");
          }}
        >
          <BrandMark />
          <span>{message("appTitle")}</span>
        </a>
      </div>
      <PrimaryNavigation
        active={active}
        locale={locale}
        navigate={navigate}
        settingsControlId="open-secondary-menu"
        web={web}
        message={message}
      />
      <span className="visually-hidden" id="live-status" aria-live="polite">
        {announcement}
      </span>
    </aside>
  );
}

function PrimaryNavigation({
  active,
  locale,
  navigate,
  record,
  settingsControlId,
  web = false,
  message,
}: {
  active: string;
  locale: import("../../shared/settings").AppLocale;
  navigate: (to: string) => void;
  record?: () => void;
  settingsControlId?: string;
  web?: boolean;
  message: (
    key: MessageKey,
    params?: Readonly<Record<string, string | number>>,
  ) => string;
}) {
  const mobile = getClientSurface() === "mobile";
  const items = [
    {
      key: "ledger",
      path: "/luna",
      label: message(mobile ? "ledgerNav" : "recentLedger"),
      icon: BookOpen,
    },
    {
      key: "statistics",
      path: "/statistics",
      label: message(mobile ? "statisticsNav" : "categoryBreakdown"),
      icon: BarChart3,
    },
    ...(!web
      ? [
          {
            key: "budget",
            path: "/budget",
            label: message(mobile ? "budgetNav" : "monthlyLimit"),
            icon: Wallet,
          },
        ]
      : []),
    {
      key: "settings",
      path: "/settings",
      label: message("settingsTitle"),
      icon: SettingsIcon,
    },
  ];
  return (
    <nav
      className="primary-navigation"
      aria-label={message("primaryNavigation")}
    >
      <div className="primary-navigation-links">
        {items.map(({ key, path, label, icon: Icon }) => (
          <button
            key={key}
            id={key === "settings" ? settingsControlId : undefined}
            type="button"
            className={`primary-navigation-link${active === key ? " is-active" : ""}`}
            aria-current={active === key ? "page" : undefined}
            aria-label={
              key === "settings" && settingsControlId
                ? message("settingsTitle")
                : undefined
            }
            onClick={() => navigate(path)}
          >
            <Icon
              className={
                key === "settings" && settingsControlId
                  ? "settings-navigation-icon"
                  : undefined
              }
              size={19}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {record && (
        <button
          id="primary-record"
          type="button"
          className="primary-record-button"
          onClick={record}
        >
          <span className="primary-record-icon">
            <Plus size={24} strokeWidth={2.3} aria-hidden="true" />
          </span>
          <span>{message(mobile ? "mobileRecord" : "addTransaction")}</span>
        </button>
      )}
    </nav>
  );
}

function SettingsNavigation({
  active,
  navigate,
  message,
  web,
}: {
  active: string;
  navigate: (to: string) => void;
  message: (
    key: MessageKey,
    params?: Readonly<Record<string, string | number>>,
  ) => string;
  web: boolean;
}) {
  const items = settingsNavigationItems(web);
  if (getClientSurface() === "mobile")
    return (
      <nav className="mobile-settings-back" aria-label={message("settingsTitle")}>
        <Button id="settings-back" type="button" variant="ghost" onClick={() => navigate("/settings")}>
          <ArrowLeft aria-hidden="true" />{message("settingsTitle")}
        </Button>
      </nav>
    );
  if (!web)
    return (
      <nav className="settings-navigation" aria-label={message("settingsTitle")}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={active === item.key ? "is-active" : undefined}
            aria-current={active === item.key ? "page" : undefined}
            onClick={() => navigate(item.path)}
          >
            {message(item.titleKey)}
          </button>
        ))}
      </nav>
    );
  const home = items[0];
  const groups = settingsAreaGroups(true);
  const groupLinks = groups.map((group) => (
    <div className="settings-navigation-group" key={group.key}>
      <span className="settings-navigation-group-label">{message(group.labelKey)}</span>
      <div className="settings-navigation-group-links">
        {group.areas.map((item) => (
          <button key={item.key} type="button"
            className={active === item.key ? "is-active" : undefined}
            aria-current={active === item.key ? "page" : undefined}
            onClick={() => navigate(item.path)}>
            {message(item.titleKey)}
          </button>
        ))}
      </div>
    </div>
  ));
  const homeButton = home && (
    <button type="button" onClick={() => navigate(home.path)}>
      {message(home.titleKey)}
    </button>
  );
  return (
    <>
      <nav className="settings-navigation settings-navigation-desktop" aria-label={message("settingsTitle")}>
        {homeButton}{groupLinks}
      </nav>
      <nav className="settings-navigation-mobile" aria-label={message("settingsTitle")}>
        {homeButton}
        <details id="settings-section-switcher" key={active}>
          <summary>{message("switchSettingsSection")}</summary>
          <div className="settings-mobile-sections">{groupLinks}</div>
        </details>
      </nav>
    </>
  );
}

function StartupLedgerPicker({
  profiles,
  activeId,
  busy,
  locale,
  onChoose,
  onCreate,
}: {
  profiles: ProfileSummary[];
  activeId: string;
  busy: boolean;
  locale: import("../../shared/settings").AppLocale;
  onChoose: (id: string) => Promise<void>;
  onCreate: (importBackup: boolean) => Promise<void>;
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
                <p className="helper">
                  {profile.binding
                    ? m("serverCopy")
                    : m(profile.id === "legacy-local" ? "originalLocal" : "local")}
                </p>
                <p className="helper">{m("storageLabel")}: {serverStorageMessage(locale, profile.storageKind)}</p>
                <p className="helper">{m("lastOpened")}: {serverLastOpenedMessage(locale, profile.lastOpenedAt)}</p>
                <p className="helper">{m("syncStateLabel")}: {serverSyncStateMessage(locale, profile.syncState)}</p>
                {!profile.available && <p className="helper" role="status">{m("unavailableProfile")}</p>}
              </div>
              <Button
                type="button"
                variant={profile.id === activeId ? "secondary" : "default"}
                disabled={busy || !profile.available}
                aria-current={profile.id === activeId ? "true" : undefined}
                onClick={() => void onChoose(profile.id)}
              >
                {profile.id === activeId ? m("active") : m("chooseProfile")}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void onCreate(false)}>
            {m("createLocalLedger")}
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void onCreate(true)}>
            {m("importBackupIntoNewLedger")}
          </Button>
        </div>
      </section>
    </main>
  );
}
