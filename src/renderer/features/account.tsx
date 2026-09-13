import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApp, formString, formChecked } from "../data/local";
import { serverMessage } from "./server-i18n";
import { ledgerToolsMessage } from "../ledger-tools-i18n";
import { syncStatusMessageKey } from "../i18n";
import {
  CONFIG_SYNC_STATUS_CODES,
  type ConfigSyncStatusCode,
  type LedgerSyncMode,
} from "../../shared/settings";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Field } from "../components/form";
function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
function useProfiles() {
  const app = useApp();
  const server = window.lunaLedger.server;
  return useQuery({
    queryKey: [
      "server-safe",
      app.scope.profileId,
      app.scope.generation,
      "profiles",
    ],
    queryFn: () => server!.profiles(),
    enabled: !!server,
  });
}
function ServerFeedback() {
  const app = useApp();
  const m = (key: Parameters<typeof serverMessage>[1]) =>
    serverMessage(app.locale, key);
  return (
    <p
      id="server-alert"
      className="form-alert"
      role={app.serverError ? "alert" : "status"}
      aria-live="polite"
    >
      {app.serverError
        ? app.errorMessage(app.serverError)
        : app.serverBusy
          ? m("working")
          : ""}
    </p>
  );
}

/** Focused settings view for profile and local-ledger management. */
export function LedgerDirectoryPanel() {
  const app = useApp();
  const server = window.lunaLedger.server;
  const status = app.serverStatus;
  const profiles = useProfiles();
  const m = (key: Parameters<typeof serverMessage>[1]) =>
    serverMessage(app.locale, key);
  if (!server)
    return (
      <section className="panel" aria-labelledby="ledger-directory-title">
        <h1 id="ledger-directory-title">{app.message("ledgersTitle")}</h1>
        <p>{app.message("ledgersHelp")}</p>
        <p className="helper">
          {app.message("localLedger")}: {app.scope.profileId}
        </p>
      </section>
    );
  const removeProfile = async (id: string) => {
    if (
      id === status?.profile.id ||
      !window.confirm(m("removeLocalCopyConfirm"))
    )
      return;
    if (await app.runServer(() => server.removeProfile(id)))
      await profiles.refetch();
  };
  return (
    <section
      className="panel space-y-4"
      aria-labelledby="ledger-directory-title"
    >
      <div className="section-heading">
        <div>
          <span className="kicker">{m("profiles")}</span>
          <h1 id="ledger-directory-title">{app.message("ledgersTitle")}</h1>
          <p>{app.message("ledgersHelp")}</p>
        </div>
      </div>
      <p className="helper">{m("removeLocalCopyWarning")}</p>
      {profiles.error && (
        <p role="alert">{app.errorMessage(profiles.error)}</p>
      )}
      <ul className="profile-directory-list">
        {profiles.data?.map((profile) => (
          <li
            className="profile-card rounded-lg border border-border p-4"
            key={profile.id}
          >
            <div className="profile-card-copy">
              <strong>{profile.displayName}</strong>
              <span className="helper">
                {profile.binding ? m("serverCopy") : m("local")}
              </span>
            </div>
            <div className="profile-card-actions">
              <Button
                type="button"
                variant="outline"
                disabled={app.serverBusy || profile.id === status?.profile.id}
                aria-current={
                  profile.id === status?.profile.id ? "true" : undefined
                }
                onClick={() =>
                  void app.runServer(
                    () => server.selectProfile(profile.id),
                    true,
                  )
                }
              >
                {profile.id === status?.profile.id
                  ? m("active")
                  : m("chooseProfile")}
              </Button>
              {profile.id !== "legacy-local" &&
                profile.id !== status?.profile.id && (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={app.serverBusy}
                    onClick={() => void removeProfile(profile.id)}
                  >
                    {m("removeLocalCopy")}
                  </Button>
                )}
            </div>
          </li>
        ))}
      </ul>
      {profiles.data?.length === 0 && <p>{m("local")}</p>}
    </section>
  );
}

function SyncOnboarding({
  account,
  bound,
  connected,
  mode,
  locale,
}: {
  account: boolean;
  bound: boolean;
  connected: boolean;
  mode: LedgerSyncMode;
  locale: import("../../shared/settings").AppLocale;
}) {
  const m = (key: Parameters<typeof serverMessage>[1]) =>
    serverMessage(locale, key);
  return (
    <div className="sync-onboarding-block">
      <h3>{m("syncSteps")}</h3>
      <ol
        id="server-sync-steps"
        className="sync-onboarding"
        aria-label={m("syncSteps")}
      >
        <li className={account ? "is-complete" : "is-current"}>
          <span className="sync-step-number" aria-hidden="true">
            1
          </span>
          <div>
            <strong>{m("stepLogin")}</strong>
            <p className="helper">{m("stepLoginHelp")}</p>
            {account ? (
              <p className="sync-step-status">{m("signedIn")}</p>
            ) : (
              <Button asChild variant="link" className="sync-step-link">
                <a href="/settings/account#server-login-form">
                  {m("goToAccount")}
                </a>
              </Button>
            )}
          </div>
        </li>
        <li className={bound && connected ? "is-complete" : "is-current"}>
          <span className="sync-step-number" aria-hidden="true">
            2
          </span>
          <div>
            <strong>{m("stepConnect")}</strong>
            <p className="helper">{m("stepConnectHelp")}</p>
            <p className="sync-step-status">
              {!account
                ? m("needsLogin")
                : bound && connected
                  ? m("connected")
                  : bound
                    ? m("needsUnlock")
                    : m("stepConnectHelp")}
            </p>
          </div>
        </li>
        <li className="is-current">
          <span className="sync-step-number" aria-hidden="true">
            3
          </span>
          <div>
            <strong>{m("stepMode")}</strong>
            <p className="helper">{m("stepModeHelp")}</p>
            <p className="sync-step-status">
              {mode === "automatic" ? m("automatic") : m("manual")}
            </p>
          </div>
        </li>
        <li className={bound && connected ? "is-current" : ""}>
          <span className="sync-step-number" aria-hidden="true">
            4
          </span>
          <div>
            <strong>{m("stepAction")}</strong>
            <p className="helper">{m("stepActionHelp")}</p>
          </div>
        </li>
      </ol>
    </div>
  );
}

export function AccountPanel() {
  const app = useApp();
  const server = window.lunaLedger.server;
  const status = app.serverStatus;
  const m = (key: Parameters<typeof serverMessage>[1]) =>
    serverMessage(app.locale, key);
  const online = useOnline();
  const profiles = useProfiles();
  const sessions = useQuery({
    queryKey: [
      "server-safe",
      app.scope.profileId,
      app.scope.generation,
      status?.account?.instanceId ?? "",
      status?.account?.id ?? "",
      "sessions",
    ],
    queryFn: () => server!.sessions(),
    enabled: !!server && !!status?.account && online && !app.serverBusy,
    networkMode: "online",
    retry: false,
    gcTime: 0,
  });
  if (!server)
    return (
      <section className="panel">
        <h2>{app.message("accountTitle")}</h2>
        <p>{app.message("accountUnavailable")}</p>
      </section>
    );
  const clear = (form: HTMLFormElement) =>
    form
      .querySelectorAll<HTMLInputElement>('input[type="password"]')
      .forEach((input) => {
        input.value = "";
      });
  const removeProfile = async (id: string) => {
    if (id === status?.profile.id) return;
    if (!window.confirm(m("removeLocalCopyConfirm"))) return;
    if (await app.runServer(() => server.removeProfile(id))) {
      await profiles.refetch();
      app.announce(m("removeLocalCopyDone"));
    }
  };
  return (
    <>
      <section
        className="panel space-y-4"
        aria-labelledby="server-account-title"
      >
        <h2 id="server-account-title">{m("title")}</h2>
        <p>{m("help")}</p>
        <ServerFeedback />
        {!online && <p role="status">{m("offline")}</p>}
        {status?.account ? (
          <div className="space-y-3">
            <p id="server-account-name">{status.account.username}</p>
            <p>{status.account.baseUrl}</p>
            <Button
              id="server-logout"
              variant="outline"
              disabled={app.serverBusy}
              onClick={() => void app.runServer(() => server.logout())}
            >
              {m("logout")}
            </Button>
          </div>
        ) : (
          <>
            <p id="server-account-state">{m("signedOut")}</p>
            <form
              id="server-login-form"
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const input = {
                  baseUrl: formString(form, "baseUrl"),
                  username: formString(form, "username"),
                  password: formString(form, "password"),
                  deviceLabel: formString(form, "deviceLabel"),
                };
                clear(form);
                void app.runServer(() => server.login(input));
              }}
            >
              <Field
                id="server-url"
                name="baseUrl"
                label={m("server")}
                type="url"
                defaultValue={
                  status?.profile.binding?.baseUrl ?? location.origin
                }
                required
                disabled={app.serverBusy}
              />
              <div className="form-grid">
                <Field
                  id="server-username"
                  name="username"
                  label={m("username")}
                  autoComplete="username"
                  required
                  maxLength={128}
                  disabled={app.serverBusy}
                />
                <Field
                  id="server-login-password"
                  name="password"
                  label={m("password")}
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={512}
                  disabled={app.serverBusy}
                />
              </div>
              <Field
                id="server-device"
                name="deviceLabel"
                label={m("device")}
                defaultValue="Luna"
                maxLength={80}
                required
                disabled={app.serverBusy}
              />
              <Button
                id="server-login"
                type="submit"
                disabled={app.serverBusy || !online}
              >
                {m("login")}
              </Button>
            </form>
          </>
        )}
        <p className="helper">{m("localNotice")}</p>
      </section>
      <ServerSyncPanel feedback={false} />
      <section
        className="panel space-y-4"
        aria-labelledby="server-profiles-title"
      >
        <h2 id="server-profiles-title">{m("profiles")}</h2>
        <p
          id="server-profiles-removal-warning"
          className="helper profile-removal-warning"
        >
          {m("removeLocalCopyWarning")}
        </p>
        {profiles.error && (
          <p role="alert">{app.errorMessage(profiles.error)}</p>
        )}
        <ul className="grid gap-3">
          {profiles.data?.map((profile) => (
            <li
              key={profile.id}
              className="profile-card rounded-lg border border-border p-4"
            >
              <div className="profile-card-copy">
                <strong>{profile.displayName}</strong>
                <p className="helper">
                  {profile.binding ? m("serverCopy") : m("local")}
                </p>
              </div>
              <div className="profile-card-actions">
                <Button
                  type="button"
                  variant="outline"
                  disabled={app.serverBusy || profile.id === status?.profile.id}
                  aria-current={
                    profile.id === status?.profile.id ? "true" : undefined
                  }
                  onClick={() =>
                    void app.runServer(
                      () => server.selectProfile(profile.id),
                      true,
                    )
                  }
                >
                  {profile.id === status?.profile.id
                    ? m("active")
                    : m("chooseProfile")}
                </Button>
                {profile.id === "legacy-local" ? (
                  <p className="helper profile-card-warning">
                    {m("originalCopyWarning")}
                  </p>
                ) : profile.id === status?.profile.id ? (
                  <p className="helper profile-card-warning">
                    {m("activeCopyWarning")}
                  </p>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={app.serverBusy}
                    aria-describedby="server-profiles-removal-warning"
                    id={`remove-local-profile-${profile.id}`}
                    onClick={() => void removeProfile(profile.id)}
                  >
                    {m("removeLocalCopy")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      {status?.account && (
        <section
          className="panel space-y-4"
          aria-labelledby="server-sessions-title"
        >
          <h2 id="server-sessions-title">{m("sessions")}</h2>
          <Button
            id="server-sessions-refresh"
            variant="outline"
            disabled={!online || app.serverBusy || sessions.isFetching}
            onClick={() => void sessions.refetch()}
          >
            {m("reloadSessions")}
          </Button>
          {sessions.error && (
            <p role="alert">{app.errorMessage(sessions.error)}</p>
          )}
          <ul>
            {sessions.data?.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3"
              >
                <span>
                  {session.deviceLabel}{" "}
                  {session.current ? `· ${m("current")}` : ""}
                  <span className="helper">
                    {new Intl.DateTimeFormat(app.locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(session.createdAt))}
                  </span>
                </span>
                <Button
                  variant="outline"
                  disabled={app.serverBusy || !online}
                  onClick={() =>
                    void app.runServer(() => server.revokeSession(session.id))
                  }
                >
                  {m("revoke")}
                </Button>
              </li>
            ))}
          </ul>
          {sessions.data?.length === 0 && <p>{m("noSessions")}</p>}
        </section>
      )}
    </>
  );
}
export function ServerSyncPanel({ feedback = true }: { feedback?: boolean }) {
  const app = useApp();
  const server = window.lunaLedger.server;
  const status = app.serverStatus;
  const profiles = useProfiles();
  const online = useOnline();
  const m = (key: Parameters<typeof serverMessage>[1]) =>
    serverMessage(app.locale, key);
  if (!server) return null;
  const bound =
    !!status?.account &&
    status.profile.binding?.userId === status.account.id &&
    status.profile.binding?.instanceId === status.account.instanceId;
  const disabled = app.serverBusy || !online;
  const preferenceCode = status?.preferences.code ?? "disabled";
  const preferenceText = CONFIG_SYNC_STATUS_CODES.includes(
    preferenceCode as ConfigSyncStatusCode,
  )
    ? app.message(syncStatusMessageKey(preferenceCode as ConfigSyncStatusCode))
    : preferenceCode === "disabled"
      ? m("disablePrefs")
      : m("unavailable");
  return (
    <section className="panel space-y-4" aria-labelledby="server-sync-title">
      <h2 id="server-sync-title">{m("syncTitle")}</h2>
      <p>{m("syncHelp")}</p>
      <SyncOnboarding
        account={!!status?.account}
        bound={bound}
        connected={!!status?.connected}
        mode={status?.syncMode ?? "automatic"}
        locale={app.locale}
      />
      {feedback && <ServerFeedback />}
      {status?.serverCapabilities &&
        !status.serverCapabilities.supportsAttachments && (
          <p id="server-capability-warning" className="form-alert" role="status">
            {m("upgradeRequired")}
          </p>
        )}
      <p id="server-sync-status" role="status">
        {status?.sync.remoteChangeAvailable
          ? m("remoteChangeAvailable")
          : status
            ? ledgerToolsMessage(app.locale, status.sync.code)
            : m("working")}
      </p>
      <div className="field">
        <label htmlFor="server-sync-mode">{m("syncMode")}</label>
        <select
          id="server-sync-mode"
          value={status?.syncMode ?? "automatic"}
          disabled={app.serverBusy}
          onChange={(event) => {
            const mode = event.currentTarget.value as LedgerSyncMode;
            void app.runServer(() => server.setSyncMode(mode));
          }}
        >
          <option value="automatic">{m("automatic")}</option>
          <option value="manual">{m("manual")}</option>
        </select>
      </div>
      <p className="helper">{m("auto")}</p>
      {!status?.account ? (
        <p>{m("needsLogin")}</p>
      ) : (
        <>
          {bound ? (
            <>
              {!status.connected && <p>{m("needsUnlock")}</p>}
              {!status.connected && (
                <form
                  id="server-unlock-form"
                  className="grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input =
                      e.currentTarget.querySelector<HTMLInputElement>(
                        "#server-unlock-password",
                      )!;
                    const password = input.value;
                    input.value = "";
                    void app.runServer(() => server.unlock(password));
                  }}
                >
                  <Field
                    id="server-unlock-password"
                    label={m("passphrase")}
                    type="password"
                    autoComplete="off"
                    maxLength={1024}
                    required
                    disabled={disabled}
                  />
                  <Button id="server-unlock" type="submit" disabled={disabled}>
                    {m("unlock")}
                  </Button>
                </form>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  id="server-sync-now"
                  disabled={disabled || !status.connected}
                  onClick={() => void app.runServer(() => server.sync())}
                >
                  {m("sync")}
                </Button>
                <Button
                  id="server-disconnect"
                  variant="outline"
                  disabled={app.serverBusy || !status.connected}
                  onClick={() => void app.runServer(() => server.disconnect())}
                >
                  {m("disconnect")}
                </Button>
              </div>
            </>
          ) : (
            <form
              id="server-connect-form"
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const source = formString(form, "source");
                const input = {
                  sourceProfileId: source || null,
                  passphrase: formString(form, "passphrase"),
                  allowLocalOnlyMigration: formChecked(form, "allowLocalOnly"),
                };
                const password = form.querySelector<HTMLInputElement>(
                  "#server-ledger-password",
                );
                if (password) password.value = "";
                void app.runServer(() => server.connect(input), true);
              }}
            >
              <div className="field">
                <label htmlFor="server-source">{m("source")}</label>
                <select
                  id="server-source"
                  name="source"
                  defaultValue=""
                  disabled={disabled}
                >
                  <option value="">{m("remote")}</option>
                  {profiles.data?.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {m("copy")} · {profile.displayName} ·{" "}
                      {profile.binding?.baseUrl ?? m("local")}
                    </option>
                  ))}
                </select>
              </div>
              <Field
                id="server-ledger-password"
                name="passphrase"
                label={m("passphrase")}
                type="password"
                autoComplete="off"
                maxLength={1024}
                required
                disabled={disabled}
              />
              <label className="check-field" htmlFor="server-local-only">
                <Input
                  id="server-local-only"
                  name="allowLocalOnly"
                  type="checkbox"
                  disabled={disabled}
                />
                <span>{m("localOnly")}</span>
              </label>
              <p className="helper">{m("localOnlyHelp")}</p>
              <Button id="server-connect" type="submit" disabled={disabled}>
                {m("connect")}
              </Button>
            </form>
          )}
          {bound && (
            <section className="space-y-3 border-t border-border pt-4">
              <h3>{m("prefs")}</h3>
              <p>{m("prefsHelp")}</p>
              <p id="server-preferences-status" role="status">
                {preferenceText}
              </p>
              {status.preferences.enabled ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    id="server-preferences-sync"
                    disabled={disabled}
                    onClick={() =>
                      void app.runServer(() => server.syncPreferences())
                    }
                  >
                    {m("syncPrefs")}
                  </Button>
                  <Button
                    id="server-preferences-disable"
                    variant="outline"
                    disabled={app.serverBusy}
                    onClick={() =>
                      void app.runServer(() =>
                        server.configurePreferences({
                          enabled: false,
                          passphrase: "",
                        }),
                      )
                    }
                  >
                    {m("disablePrefs")}
                  </Button>
                </div>
              ) : (
                <form
                  id="server-preferences-form"
                  className="grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input =
                      e.currentTarget.querySelector<HTMLInputElement>(
                        "#server-preferences-password",
                      )!;
                    const passphrase = input.value;
                    input.value = "";
                    void app.runServer(() =>
                      server.configurePreferences({
                        enabled: true,
                        passphrase,
                      }),
                    );
                  }}
                >
                  <Field
                    id="server-preferences-password"
                    label={m("prefsPassword")}
                    type="password"
                    autoComplete="off"
                    maxLength={1024}
                    required
                    disabled={disabled}
                  />
                  <Button
                    id="server-preferences-enable"
                    type="submit"
                    disabled={disabled}
                  >
                    {m("enablePrefs")}
                  </Button>
                </form>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
