import { serverMessage } from "./server-i18n";
import { Fragment, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LedgerSessionStatus } from "../../shared/ledger-session";
import type { ConfigureConfigSyncInput } from "../../shared/settings";
import { MAX_LEDGER_ENVELOPE_BYTES } from "../../shared/ledger-crypto";
import { formatDate, formatMoney, formatMonth } from "../i18n";
import {
  ledgerToolsMessage,
  type LedgerToolsMessageKey,
} from "../ledger-tools-i18n";
import {
  useApp,
  localKeys,
  scopedRead,
  queryClient,
  formString,
  formChecked,
} from "../data/local";
import { Field } from "../components/form";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
export type ToolsPage = "all" | "sync" | "backup" | "conflicts";
export function LedgerTools({
  page = "all",
  active = true,
}: {
  page?: ToolsPage;
  active?: boolean;
}) {
  const app = useApp();
  const api = window.lunaLedger;
  const serverBacked = api.server !== undefined;
  const m = (key: LedgerToolsMessageKey) => ledgerToolsMessage(app.locale, key);
  const statusQuery = useQuery({
    queryKey: [...localKeys(app.scope).root, "sync-status"],
    queryFn: () => scopedRead(app.scope, () => api.getLedgerSyncStatus()),
  });
  const conflictsQuery = useQuery({
    queryKey: [...localKeys(app.scope).root, "conflicts"],
    queryFn: () => scopedRead(app.scope, () => api.getLedgerConflicts()),
  });
  useEffect(() => {
    if (active) {
      void statusQuery.refetch();
      void conflictsQuery.refetch();
    }
  }, [active]);
  const session = statusQuery.data ?? {
    enabled: false,
    configured: false,
    code: "disabled",
    lastSyncedAt: null,
  };
  const syncLedger = async (): Promise<LedgerSessionStatus> => {
    if (serverBacked) {
      await api.server!.sync();
      return api.getLedgerSyncStatus();
    }
    return api.syncLedgerNow();
  };
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [announcement, setAnnouncement] =
    useState<LedgerToolsMessageKey | null>(null);
  const [error, setError] = useState<unknown>();
  const generation = useRef(0);
  const running = useRef(false);
  const mounted = useRef(true);
  const connectionRef = useRef<HTMLFormElement>(null);
  const exportRef = useRef<HTMLFormElement>(null);
  const importRef = useRef<HTMLFormElement>(null);
  const downloads = useRef(new Map<string, number>());
  useEffect(
    () => () => {
      mounted.current = false;
      generation.current++;
      for (const [url, timer] of downloads.current) {
        window.clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      app.setDirty("tools", false);
    },
    [],
  );
  const clearSecrets = () => {
    connectionRef.current
      ?.querySelectorAll<HTMLInputElement>('input[type="password"]')
      .forEach((input) => {
        input.value = "";
      });
    app.setDirty("tools", false);
  };
  async function perform(
    action: (current: () => boolean) => Promise<LedgerSessionStatus | void>,
    success: LedgerToolsMessageKey,
    changes = false,
    cancel = false,
  ) {
    if ((running.current && (!cancel || !syncing)) || clearing) return;
    const currentGeneration = ++generation.current;
    const current = () =>
      mounted.current && generation.current === currentGeneration;
    running.current = true;
    setBusy(true);
    setClearing(cancel);
    setSyncing(success === "synced" && !cancel);
    setError(undefined);
    setAnnouncement("working");
    let failure: unknown;
    let result: LedgerSessionStatus | void;
    try {
      result = await action(current);
      if (current() && result)
        queryClient.setQueryData(
          [...localKeys(app.scope).root, "sync-status"],
          result,
        );
    } catch (cause) {
      failure = cause;
    }
    if (!current()) return;
    if (changes) {
      try {
        await app.refresh();
      } catch (cause) {
        failure ??= cause;
      }
    }
    if (!current()) return;
    try {
      const [status] = await Promise.all([
        statusQuery.refetch({ throwOnError: true }),
        conflictsQuery.refetch({ throwOnError: true }),
      ]);
      if (!failure && success === "synced")
        success = status.data?.code ?? "synced";
    } catch (cause) {
      failure ??= cause;
    }
    if (!current()) return;
    running.current = false;
    setBusy(false);
    setClearing(false);
    setSyncing(false);
    setError(failure);
    setAnnouncement(failure ? null : success);
    if (failure) document.getElementById("ledger-tools-alert")?.focus();
  }
  useEffect(() => {
    const online = () => {
      const automatic =
        !serverBacked || app.serverStatus?.syncMode === "automatic";
      if (automatic && session.enabled && session.configured)
        void perform(syncLedger, "synced", true);
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [
    app.serverStatus?.syncMode,
    clearing,
    serverBacked,
    session.configured,
    session.enabled,
    syncing,
  ]);
  async function connect(form: HTMLFormElement, current: () => boolean) {
    const token = formString(form, "token");
    const value: ConfigureConfigSyncInput = {
      connection: {
        endpoint: formString(form, "endpoint"),
        region: formString(form, "region"),
        bucket: formString(form, "bucket"),
        prefix: formString(form, "prefix"),
        forcePathStyle: formChecked(form, "pathStyle"),
      },
      credentials: {
        accessKeyId: formString(form, "access"),
        secretAccessKey: formString(form, "secret"),
        passphrase: formString(form, "password"),
        ...(token ? { sessionToken: token } : {}),
      },
      rememberSecrets: false,
    };
    const configured = await api.configureLedgerSync(value);
    if (!current()) return;
    queryClient.setQueryData(
      [...localKeys(app.scope).root, "sync-status"],
      configured,
    );
    clearSecrets();
    return api.syncLedgerNow();
  }
  async function exportBackup(form: HTMLFormElement) {
    const password = formString(form, "password");
    if (api.saveLedgerBackup) {
      try {
        await api.saveLedgerBackup(password);
      } finally {
        form.reset();
      }
      return;
    }
    const raw = await api.exportLedgerBackup(password);
    const url = URL.createObjectURL(
      new Blob([raw], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `luna-ledger-${new Date().toISOString().slice(0, 10)}.encrypted.json`;
    document.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      downloads.current.set(
        url,
        window.setTimeout(() => {
          URL.revokeObjectURL(url);
          downloads.current.delete(url);
        }, 1000),
      );
    }
    form.reset();
    app.setDirty("tools", false);
  }
  async function importBackup(form: HTMLFormElement) {
    const password = formString(form, "password");
    const file = new FormData(form).get("file");
    if (
      !formChecked(form, "confirm") ||
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > MAX_LEDGER_ENVELOPE_BYTES
    )
      throw new Error("LUNA_ERROR:ledger-file-invalid");
    await api.importLedgerBackup(await file.text(), password);
    form.reset();
    app.setDirty("tools", false);
  }
  const fields: {
    id: string;
    name: string;
    key: LedgerToolsMessageKey;
    type?: string;
    value?: string;
    optional?: boolean;
  }[] = [
    { id: "endpoint", name: "endpoint", key: "endpoint", type: "url" },
    { id: "region", name: "region", key: "region", value: "us-east-1" },
    { id: "bucket", name: "bucket", key: "bucket" },
    {
      id: "prefix",
      name: "prefix",
      key: "prefix",
      value: "luna",
      optional: true,
    },
    { id: "access-key", name: "access", key: "accessKey", type: "password" },
    { id: "secret-key", name: "secret", key: "secretKey", type: "password" },
    {
      id: "session-token",
      name: "token",
      key: "token",
      type: "password",
      optional: true,
    },
    {
      id: "sync-password",
      name: "password",
      key: "syncPassword",
      type: "password",
    },
  ];
  const lastError = error ?? statusQuery.error ?? conflictsQuery.error;
  const workspace = app.snapshot.workspace;
  const money = (v: string) =>
    workspace
      ? formatMoney(app.locale, v, workspace.currency, workspace.precision)
      : v;
  const visible = (name: ToolsPage) => page === "all" || page === name;
  // ServerHost owns this flow. Keeping the legacy local-S3 controls visible
  // here would expose a misleading disconnect action beside the server panel.
  const showSyncTools = !serverBacked && visible("sync");
  if (serverBacked && page === "sync") return null;
  return (
    <section
      className="panel ledger-tools-panel"
      aria-labelledby="ledger-tools-title"
      aria-busy={busy}
    >
      <h2 id="ledger-tools-title">{m("title")}</h2>
      <p className="helper">
        {serverBacked ? serverMessage(app.locale, "syncHelp") : m("help")}
      </p>
      <p id="ledger-session-status" className="ledger-tools-session">
        {m(session.code)}
        {session.lastSyncedAt &&
        Number.isFinite(new Date(session.lastSyncedAt).getTime())
          ? ` ${m("lastSync")}: ${new Intl.DateTimeFormat(app.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.lastSyncedAt))}`
          : ""}
      </p>
      <p
        id="ledger-tools-alert"
        tabIndex={-1}
        className="form-alert ledger-tools-alert"
        role={lastError ? "alert" : "status"}
        aria-live={lastError ? "assertive" : "polite"}
        aria-atomic="true"
      >
        {lastError
          ? app.errorMessage(lastError)
          : announcement
            ? m(announcement)
            : ""}
      </p>
      {showSyncTools && (
        <>
          <div className="form-actions ledger-tools-actions">
            <Button
              id="ledger-sync-now"
              variant="outline"
              disabled={busy || !session.configured || !session.enabled}
              onClick={() => void perform(syncLedger, "synced", true)}
            >
              {m("syncNow")}
            </Button>
            <Button
              id="ledger-sync-clear"
              variant="outline"
              disabled={
                clearing ||
                (busy && !syncing) ||
                (!session.configured && !syncing)
              }
              onClick={() =>
                void perform(
                  async () => {
                    const status = await api.clearLedgerSync();
                    clearSecrets();
                    return status;
                  },
                  "disconnected",
                  true,
                  true,
                )
              }
            >
              {m("disconnect")}
            </Button>
          </div>
          {!serverBacked && (
            <details
              id="ledger-connection-details"
              className="ledger-tools-details"
              open={page === "sync" ? true : undefined}
            >
              <summary>{m("connection")}</summary>
              <p className="helper">{m("connectionHelp")}</p>
              <form
                ref={connectionRef}
                id="ledger-connection-form"
                className="form-grid ledger-tools-form"
                aria-describedby="ledger-tools-alert"
                onChange={() => app.setDirty("tools", true)}
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  void perform(
                    (current) => connect(form, current),
                    "synced",
                    true,
                  );
                }}
              >
                {fields.map((f) => (
                  <Field
                    key={f.id}
                    id={`ledger-${f.id}`}
                    name={f.name}
                    label={m(f.key)}
                    type={f.type ?? "text"}
                    defaultValue={f.value ?? ""}
                    autoComplete="off"
                    required={!f.optional}
                    disabled={busy}
                    maxLength={f.type === "password" ? 1024 : undefined}
                  />
                ))}
                <div className="field ledger-tools-check">
                  <label htmlFor="ledger-path-style">{m("pathStyle")}</label>
                  <Input
                    id="ledger-path-style"
                    name="pathStyle"
                    type="checkbox"
                    defaultChecked
                    disabled={busy}
                  />
                </div>
                <p className="helper full" id="ledger-password-help">
                  {m("passwordHelp")}
                </p>
                <Button id="ledger-connect-submit" type="submit" disabled={busy}>
                  {m("configure")}
                </Button>
              </form>
            </details>
          )}
        </>
      )}
      {visible("backup") && (
        <details
          id="ledger-backup-details"
          className="ledger-tools-details"
          open={page === "backup" ? true : undefined}
        >
          <summary>{m("backup")}</summary>
          <p className="helper">{m("backupHelp")}</p>
          <form
            ref={exportRef}
            id="ledger-export-form"
            className="form-grid ledger-tools-form"
            aria-describedby="ledger-tools-alert"
            onChange={() => app.setDirty("tools", true)}
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              void perform(
                () => exportBackup(form),
                api.saveLedgerBackup ? "saved" : "exported",
              );
            }}
          >
            <Field
              id="ledger-export-password"
              name="password"
              label={m("exportPassword")}
              type="password"
              autoComplete="off"
              maxLength={1024}
              required
              disabled={busy || !workspace}
              aria-describedby="ledger-export-password-help ledger-tools-alert"
            />
            <p className="helper full" id="ledger-export-password-help">
              {m("passwordHelp")}
            </p>
            <Button
              id="ledger-export-submit"
              type="submit"
              disabled={busy || !workspace}
            >
              {m(api.saveLedgerBackup ? "saveBackup" : "exportBackup")}
            </Button>
          </form>
          <form
            ref={importRef}
            id="ledger-import-form"
            className="form-grid ledger-tools-form"
            aria-describedby="ledger-tools-alert"
            onChange={() => app.setDirty("tools", true)}
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              void perform(() => importBackup(form), "imported", true);
            }}
          >
            <Field
              id="ledger-import-file"
              name="file"
              label={m("importFile")}
              type="file"
              accept=".json,application/json"
              required
              disabled={busy}
            />
            <Field
              id="ledger-import-password"
              name="password"
              label={m("importPassword")}
              type="password"
              autoComplete="off"
              maxLength={1024}
              required
              disabled={busy}
              aria-describedby="ledger-import-password-help ledger-tools-alert"
            />
            <p className="helper full" id="ledger-import-password-help">
              {m("passwordHelp")}
            </p>
            <div className="field ledger-tools-check">
              <label htmlFor="ledger-import-confirm">
                {m("confirmImport")}
              </label>
              <Input
                id="ledger-import-confirm"
                name="confirm"
                type="checkbox"
                required
                disabled={busy}
              />
            </div>
            <Button id="ledger-import-submit" type="submit" disabled={busy}>
              {m("importBackup")}
            </Button>
          </form>
        </details>
      )}
      {visible("conflicts") && (
        <section
          id="ledger-conflict-inbox"
          className="ledger-conflict-inbox"
          aria-labelledby="ledger-conflicts-title"
          hidden={!conflictsQuery.data?.length}
        >
          <h3 id="ledger-conflicts-title">{m("conflictTitle")}</h3>
          <p className="ledger-conflict-warning">{m("conflictWarning")}</p>
          <div className="ledger-conflict-list">
            {workspace &&
              conflictsQuery.data?.map((conflict) => (
                <fieldset
                  key={`${conflict.kind}:${conflict.entityId}`}
                  className="ledger-conflict"
                >
                  <legend>
                    {conflict.kind === "budget"
                      ? `${m("budgetConflict")} · ${formatMonth(app.locale, conflict.entityId)}`
                      : m("transactionConflict")}
                  </legend>
                  <div className="ledger-conflict-candidates">
                    {conflict.heads.map((head, index) => {
                      const details: [LedgerToolsMessageKey, string][] =
                        head.kind === "budget"
                          ? [
                              [
                                "amount",
                                head.value === null
                                  ? m("noLimit")
                                  : money(head.value),
                              ],
                            ]
                          : [
                              ["date", formatDate(app.locale, head.value.date)],
                              ["type", m(head.value.type)],
                              ["amount", money(head.value.amountMinor)],
                              [
                                "splits",
                                head.value.splits
                                  .map(
                                    (s) =>
                                      `${s.category}: ${money(s.amountMinor)}`,
                                  )
                                  .join("\n"),
                              ],
                              ["merchant", head.value.merchant],
                              ["payment", head.value.paymentMethod],
                              ["notes", head.value.notes],
                              [
                                "deletion",
                                m(
                                  head.value.deletedAt === null
                                    ? "active"
                                    : "deleted",
                                ),
                              ],
                            ];
                      return (
                        <article
                          key={head.id}
                          className="ledger-conflict-candidate"
                        >
                          <h4>
                            {m("candidate")} {index + 1}
                          </h4>
                          <dl className="ledger-conflict-data">
                            {details.map(([key, value]) => (
                              <Fragment key={key}>
                                <dt>{m(key)}</dt>
                                <dd>{value || m("emptyValue")}</dd>
                              </Fragment>
                            ))}
                          </dl>
                          <Button
                            variant="outline"
                            disabled={busy}
                            className={
                              head.kind === "transaction" &&
                              head.value.deletedAt !== null
                                ? "danger-button"
                                : ""
                            }
                            onClick={() => {
                              const expectedHeadIds = conflict.heads.map(
                                (h) => h.id,
                              );
                              void perform(
                                async () => {
                                  await api.resolveLedgerConflict({
                                    kind: conflict.kind,
                                    entityId: conflict.entityId,
                                    selectedHeadId: head.id,
                                    expectedHeadIds,
                                  });
                                },
                                "resolved",
                                true,
                              );
                            }}
                          >
                            {m("choose")} {index + 1}
                          </Button>
                        </article>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
          </div>
        </section>
      )}
    </section>
  );
}
