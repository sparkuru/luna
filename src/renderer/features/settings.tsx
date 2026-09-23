import { serverMessage } from "./server-i18n";
import { useEffect, useRef, useState } from "react";
import type {
  AppLocale,
  ConfigureConfigSyncInput,
} from "../../shared/settings";
import { useApp, formString, formChecked } from "../data/local";
import { syncStatusMessageKey, type MessageKey } from "../i18n";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Field } from "../components/form";
import {
  settingsAreaDefinitions,
  settingsAreaGroups,
  type SettingsAreaDefinition,
} from "./settings-navigation";
export function LanguageSelect({ id }: { id: string }) {
  const app = useApp();
  return (
    <label className="compact-field" htmlFor={id}>
      <span>{app.message("language")}</span>
      <select
        id={id}
        value={app.locale}
        onChange={(e) => {
          void window.lunaLedger
            .updateSettings({ locale: e.target.value as AppLocale })
            .then(app.updateSettings)
            .catch((error) => app.announce(app.errorMessage(error)));
        }}
      >
        <option value="zh-CN">{app.message("languageZh")}</option>
        <option value="en">{app.message("languageEn")}</option>
      </select>
    </label>
  );
}
export type SettingsSection = "legacy" | "overview" | "preferences" | "advanced";

export function Settings({
  section = "legacy",
  navigate,
  web = false,
}: {
  section?: SettingsSection;
  navigate?: (path: string) => void;
  web?: boolean;
} = {}) {
  const app = useApp();
  const { settings, message: m } = app;
  const [error, setError] = useState("");
  const [privacy, setPrivacy] = useState(
    settings.hideSensitiveAmountsByDefault,
  );
  const [policy, setPolicy] = useState(settings.syncAllPortableSettings);
  useEffect(
    () => setPrivacy(settings.hideSensitiveAmountsByDefault),
    [settings.hideSensitiveAmountsByDefault],
  );
  useEffect(
    () => setPolicy(settings.syncAllPortableSettings),
    [settings.syncAllPortableSettings],
  );
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const unavailable = !settings.configSyncAvailable;
  const actionsDisabled =
    unavailable || !settings.syncAllPortableSettings || busy;
  useEffect(() => () => app.setDirty("config", false), []);
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(app.errorMessage(e));
      try {
        app.updateSettings(await window.lunaLedger.getSettings());
      } catch {
        /* Retain the last safe settings projection. */
      }
    } finally {
      setBusy(false);
    }
  }
  const clearSecrets = () => {
    formRef.current
      ?.querySelectorAll<HTMLInputElement>('input[type="password"]')
      .forEach((input) => {
        input.value = "";
      });
    app.setDirty("config", false);
  };
  async function configure(form: HTMLFormElement) {
    if (
      app.serverStatus?.preferences.enabled &&
      !window.confirm(serverMessage(app.locale, "confirmPreferencesS3"))
    )
      return;
    const token = formString(form, "sessionToken");
    const value: ConfigureConfigSyncInput = {
      connection: {
        endpoint: formString(form, "endpoint"),
        region: formString(form, "region"),
        bucket: formString(form, "bucket"),
        prefix: formString(form, "prefix"),
        forcePathStyle: formChecked(form, "forcePathStyle"),
      },
      credentials: {
        accessKeyId: formString(form, "accessKeyId"),
        secretAccessKey: formString(form, "secretAccessKey"),
        passphrase: formString(form, "passphrase"),
        ...(token ? { sessionToken: token } : {}),
      },
      rememberSecrets: formChecked(form, "rememberSecrets"),
    };
    await action(async () => {
      app.updateSettings(await window.lunaLedger.configureConfigSync(value));
      clearSecrets();
      await app.refresh();
      app.announce(m("connectionSaved"));
    });
  }
  const fields: {
    id: string;
    name: string;
    label: MessageKey;
    type?: string;
    required?: boolean;
  }[] = [
    {
      id: "endpoint",
      name: "endpoint",
      label: "endpoint",
      type: "url",
      required: true,
    },
    { id: "region", name: "region", label: "region", required: true },
    { id: "bucket", name: "bucket", label: "bucket", required: true },
    { id: "prefix", name: "prefix", label: "prefix" },
    {
      id: "access-key",
      name: "accessKeyId",
      label: "accessKeyId",
      type: "password",
      required: true,
    },
    {
      id: "secret-key",
      name: "secretAccessKey",
      label: "secretAccessKey",
      type: "password",
      required: true,
    },
    {
      id: "session-token",
      name: "sessionToken",
      label: "sessionToken",
      type: "password",
    },
    {
      id: "passphrase",
      name: "passphrase",
      label: "syncPassphrase",
      type: "password",
      required: true,
    },
  ];
  const showPreferences = section === "legacy" || section === "preferences";
  const showAdvanced = section === "legacy" || section === "advanced";
  if (section === "overview")
    return <SettingsOverview navigate={navigate} web={web} />;
  return (
    <section className="panel settings-panel" aria-labelledby="settings-title">
      <div className="section-heading">
        <div>
          <h2 id="settings-title">{m(section === "preferences" ? "preferencesTitle" : section === "advanced" ? "advancedSettingsTitle" : "settingsTitle")}</h2>
          <p>
            {m(
              section === "preferences"
                ? "preferencesHelp"
                : section === "advanced"
                  ? "advancedSettingsHelp"
                  : unavailable
                    ? "settingsDescriptionWeb"
                    : "settingsDescription",
            )}
          </p>
        </div>
      </div>
      <div id="settings-alert" className="form-alert" role="alert">
        {error}
      </div>
      <div className="settings-grid">
        {showPreferences && <>
        <fieldset>
          <legend>{m("language")}</legend>
          <LanguageSelect id="settings-language" />
        </fieldset>
        <fieldset>
          <legend>{m("privacyTitle")}</legend>
          <label className="check-field" htmlFor="hide-default">
            <Input
              id="hide-default"
              type="checkbox"
              checked={privacy}
              onChange={(e) => {
                const value = e.target.checked;
                setPrivacy(value);
                void action(async () => {
                  try {
                    app.updateSettings(
                      await window.lunaLedger.updateSettings({
                        hideSensitiveAmountsByDefault: value,
                      }),
                    );
                  } catch (e) {
                    setPrivacy(settings.hideSensitiveAmountsByDefault);
                    throw e;
                  }
                });
              }}
            />
            <span>{m("hideByDefault")}</span>
          </label>
          <p className="helper">{m("hideByDefaultHelp")}</p>
          <p className="helper">{m("revealAmountsHelp")}</p>
        </fieldset>
        </>}
        {showAdvanced && <fieldset className="sync-policy">
          <legend>{m("configSyncTitle")}</legend>
          <label className="check-field" htmlFor="sync-all">
            <Input
              id="sync-all"
              type="checkbox"
              checked={!unavailable && policy}
              disabled={unavailable || busy}
              onChange={(e) => {
                const value = e.target.checked;
                setPolicy(value);
                void action(async () => {
                  try {
                    app.updateSettings(
                      await window.lunaLedger.updateSettings({
                        syncAllPortableSettings: value,
                      }),
                    );
                  } catch (e) {
                    setPolicy(settings.syncAllPortableSettings);
                    throw e;
                  }
                });
              }}
            />
            <span>{m("syncMaster")}</span>
          </label>
          <p id="sync-policy-help" className="helper">
            {m(
              settings.syncAllPortableSettings
                ? "syncMasterHelpOn"
                : "syncMasterHelpOff",
            )}
          </p>
          <p className="sync-status">
            <strong>{m("statusLabel")}:</strong>{" "}
            <span id="sync-status-text">
              {m(syncStatusMessageKey(settings.lastSync.code))}
            </span>
          </p>
        </fieldset>}
      </div>
      {showAdvanced && <details id="config-sync-details" className="ledger-tools-details">
        <summary>{m("connectionTitle")}</summary>
        <form
          ref={formRef}
          id="config-sync-form"
          className={`sync-form${unavailable ? " is-unavailable" : ""}`}
          aria-disabled={unavailable}
          noValidate
          onChange={() => app.setDirty("config", true)}
          onSubmit={(e) => {
            e.preventDefault();
            if (!unavailable) void configure(e.currentTarget);
          }}
        >
          <fieldset disabled={unavailable || busy}>
            <legend>{m("connectionTitle")}</legend>
            <p id="sync-platform-note">
              {m(unavailable ? "desktopOnlySync" : "connectionHelp")}
            </p>
            <div className="form-grid sync-fields">
              {fields.map((field) => (
                <Field
                  key={field.id}
                  id={`sync-${field.id}`}
                  name={field.name}
                  label={m(field.label)}
                  type={field.type ?? "text"}
                  autoComplete="off"
                  required={field.required ?? false}
                  defaultValue={
                    field.type === "password"
                      ? ""
                      : String(
                          settings.syncConnection?.[
                            field.name as
                              | "endpoint"
                              | "region"
                              | "bucket"
                              | "prefix"
                          ] ?? "",
                        )
                  }
                  maxLength={field.name === "passphrase" ? 1024 : undefined}
                />
              ))}
              <label className="check-field full" htmlFor="sync-path-style">
                <Input
                  id="sync-path-style"
                  name="forcePathStyle"
                  type="checkbox"
                  defaultChecked={
                    settings.syncConnection?.forcePathStyle ?? false
                  }
                />
                <span>{m("forcePathStyle")}</span>
              </label>
              <p className="helper full">{m("syncPassphraseHelp")}</p>
              <label className="check-field full" htmlFor="remember-secrets">
                <Input
                  id="remember-secrets"
                  name="rememberSecrets"
                  type="checkbox"
                  disabled={settings.secretPersistence !== "secure"}
                />
                <span>{m("rememberSecrets")}</span>
              </label>
              <p className="helper full">{m("rememberSecretsHelp")}</p>
            </div>
            <p id="secret-persistence-help" className="helper">
              {m(
                settings.secretPersistence === "secure"
                  ? "secretStatusSecure"
                  : settings.secretPersistence === "session-only"
                    ? "secretStatusSession"
                    : "secretStatusUnavailable",
              )}
            </p>
            <p id="secret-availability-help" className="helper">
              {m(
                settings.hasConfigSyncSecrets
                  ? "configuredSecrets"
                  : "missingSecrets",
              )}
            </p>
            <div className="form-actions sync-actions">
              <Button id="save-sync-connection" type="submit">
                {m("saveConnection")}
              </Button>
              <Button
                id="test-sync-connection"
                type="button"
                variant="outline"
                disabled={actionsDisabled}
                onClick={() =>
                  void action(async () => {
                    const result = await window.lunaLedger.testConfigSync();
                    app.updateSettings(result.settings);
                    app.announce(m(syncStatusMessageKey(result.code)));
                  })
                }
              >
                {m("testConnection")}
              </Button>
              <Button
                id="sync-now"
                type="button"
                variant="outline"
                disabled={actionsDisabled}
                onClick={() =>
                  void action(async () => {
                    const result = await window.lunaLedger.syncConfigNow();
                    app.updateSettings(result.settings);
                    app.announce(m(syncStatusMessageKey(result.code)));
                  })
                }
              >
                {m("syncNow")}
              </Button>
              <Button
                id="clear-sync-connection"
                type="button"
                variant="ghost"
                className="danger-button"
                onClick={() => {
                  if (window.confirm(m("clearConnectionConfirm")))
                    void action(async () => {
                      app.updateSettings(
                        await window.lunaLedger.clearConfigSync(),
                      );
                      formRef.current?.reset();
                      clearSecrets();
                      app.announce(m("connectionCleared"));
                    });
                }}
              >
                {m("clearConnection")}
              </Button>
            </div>
            <p id="sync-action-help" className="helper">
              {unavailable
                ? m("desktopOnlySyncHelp")
                : actionsDisabled
                  ? m("syncDisabledActionHelp")
                  : ""}
            </p>
          </fieldset>
        </form>
      </details>}
    </section>
  );
}

export function SettingsOverview({
  navigate,
  web = false,
}: {
  navigate: ((path: string) => void) | undefined;
  web: boolean;
}) {
  const app = useApp();
  const m = app.message;
  const serverStatus = app.serverStatus;
  const sections = settingsAreaDefinitions(web);
  const groups = settingsAreaGroups(web);
  const renderCard = (item: SettingsAreaDefinition) => (
    <a
      className="settings-overview-card"
      data-settings-area={item.key}
      href={item.path}
      key={item.path}
      onClick={(event) => {
        if (
          !navigate ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) return;
        event.preventDefault();
        navigate(item.path);
      }}
    >
      <strong>{m(item.titleKey)}</strong>
      <span>
        {item.key === "conflicts"
          ? app.snapshot.conflictCount
            ? m("ledgerConflictNotice", { count: app.snapshot.conflictCount })
            : m("conflictsClear")
          : m(item.helpKey)}
      </span>
      <span className="settings-overview-action">{m("openSettingsSection")}</span>
    </a>
  );
  return (
    <section className="panel settings-panel settings-overview" aria-labelledby="settings-title">
      <div className="section-heading">
        <div>
          <span className="kicker">{m("settingsTitle")}</span>
          <h1 id="settings-title">{m("settingsTitle")}</h1>
          <p>{m("settingsOverviewHelp")}</p>
        </div>
        {web && (
          <div className="settings-overview-statuses">
            <div
              id="settings-storage-status"
              className="settings-storage-status"
              role="status"
            >
              <span className="sync-status-dot" aria-hidden="true" />
              <span>
                <strong>{m("localOnly")}</strong>
                <span>{m("storageStatusHelp")}</span>
              </span>
            </div>
            {serverStatus && navigate && (
              <Button
                id="open-sync-status"
                className="sync-status-button settings-sync-status-button"
                variant="outline"
                onClick={() => navigate("/settings/sync")}
                aria-label={serverMessage(app.locale, "openSync")}
              >
                <span>{serverMessage(app.locale, "syncStatusLabel")}</span>
                <span className="sync-status-detail">
                  {serverStatus.account
                    ? serverStatus.profile.binding
                      ? serverStatus.connected
                        ? serverStatus.profile.displayName
                        : serverMessage(app.locale, "needsUnlock")
                      : serverMessage(app.locale, "signedIn")
                    : serverMessage(app.locale, "needsLogin")}
                </span>
              </Button>
            )}
          </div>
        )}
      </div>
      {web ? (
        <div className="settings-overview-groups">
          {groups.map((group) => (
            <section className="settings-overview-group" key={group.key} aria-labelledby={`settings-group-${group.key}`}>
              <h2 id={`settings-group-${group.key}`}>{m(group.labelKey)}</h2>
              <div className="settings-overview-grid">
                {group.areas.map(renderCard)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="settings-overview-grid">{sections.map(renderCard)}</div>
      )}
    </section>
  );
}
