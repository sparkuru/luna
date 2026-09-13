import { serverMessage } from "./server-i18n";
import { Fragment, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LedgerSessionStatus } from "../../shared/ledger-session";
import type { ConfigureConfigSyncInput } from "../../shared/settings";
import { MAX_LEDGER_ENVELOPE_BYTES } from "../../shared/ledger-crypto";
import {
  MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES,
  MAX_BACKUP_FILE_BYTES,
} from "../../shared/attachment-contract";
import { FULL_BACKUP_MAGIC } from "../../shared/full-backup";
import { secureRandomUuid } from "../../shared/secure-random";
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

type BackupWriteChunk = Parameters<FileSystemWritableFileStream["write"]>[0];
type BackupWriter = {
  write(chunk: BackupWriteChunk): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
};
type TrackedDownload = {
  timer: number;
  cleanup(): void;
};

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
  const downloads = useRef(new Map<string, TrackedDownload>());
  const trackDownload = (url: string, removeTemporary?: () => void): (() => void) => {
    let timer = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      removeTemporary?.();
      downloads.current.delete(url);
    };
    timer = window.setTimeout(cleanup, 60_000);
    downloads.current.set(url, { timer, cleanup });
    return cleanup;
  };
  const completeBackup =
    typeof api.beginBackupExport === "function" &&
    typeof api.readBackupChunk === "function" &&
    typeof api.finishBackupExport === "function" &&
    typeof api.beginBackupImport === "function" &&
    typeof api.appendBackupChunk === "function" &&
    typeof api.finishBackupImport === "function" &&
    typeof api.cancelBackupJob === "function";
  useEffect(
    () => () => {
      mounted.current = false;
      generation.current++;
      for (const download of downloads.current.values()) download.cleanup();
      downloads.current.clear();
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
      app.setDirty("tools", false);
      return;
    }
    if (completeBackup) {
      const start = await api.beginBackupExport!(password);
      let finished = false;
      let writer: BackupWriter | null = null;
      let temporaryRoot: FileSystemDirectoryHandle | null = null;
      let temporaryName: string | null = null;
      let cleanupDownload: (() => void) | null = null;
      try {
        if (
          typeof start.jobId !== "string" ||
          start.jobId.length === 0 ||
          !Number.isSafeInteger(start.totalBytes) ||
          start.totalBytes < 1 ||
          start.totalBytes > MAX_BACKUP_FILE_BYTES
        )
          throw new Error("LUNA_ERROR:backup-invalid-container");
        // Browser downloads use OPFS as a bounded temporary sink. A native
        // file picker can be exposed by Chromium, but invoking it here would
        // bypass the download contract and makes headless/browser automation
        // dependent on an OS dialog. Native hosts expose saveLedgerBackup.
        if (writer === null) {
          const storage = navigator.storage as StorageManager & {
            getDirectory?: () => Promise<FileSystemDirectoryHandle>;
          };
          if (typeof storage.getDirectory !== "function")
            throw new Error("LUNA_ERROR:backup-unsupported-container");
          temporaryRoot = await storage.getDirectory();
          temporaryName = `.luna-backup-${secureRandomUuid()}`;
          const fileHandle = await temporaryRoot.getFileHandle(temporaryName, {
            create: true,
          });
          writer = await fileHandle.createWritable();
        }
        const outputWriter = writer;
        if (outputWriter === null)
          throw new Error("LUNA_ERROR:backup-unsupported-container");
        let writtenBytes = 0;
        let reachedEof = false;
        for (let sequence = 0; sequence <= MAX_BACKUP_FILE_BYTES / MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES; sequence += 1) {
          const chunk = await api.readBackupChunk!(start.jobId, sequence);
          if (chunk.bytes.byteLength > MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES)
            throw new Error("LUNA_ERROR:backup-too-large");
          const nextWrittenBytes = writtenBytes + chunk.bytes.byteLength;
          if (nextWrittenBytes > start.totalBytes || nextWrittenBytes > MAX_BACKUP_FILE_BYTES)
            throw new Error("LUNA_ERROR:backup-invalid-container");
          await outputWriter.write(Uint8Array.from(chunk.bytes));
          writtenBytes = nextWrittenBytes;
          if (chunk.eof) {
            reachedEof = true;
            break;
          }
          if (sequence === Math.floor(MAX_BACKUP_FILE_BYTES / MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES))
            throw new Error("LUNA_ERROR:backup-invalid-container");
        }
        if (!reachedEof || writtenBytes !== start.totalBytes)
          throw new Error("LUNA_ERROR:backup-invalid-container");
        await outputWriter.close();
        if (temporaryRoot !== null && temporaryName !== null) {
          const file = await temporaryRoot.getFileHandle(temporaryName).then((handle) => handle.getFile());
          const url = URL.createObjectURL(file);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `luna-ledger-${new Date().toISOString().slice(0, 10)}.luna-backup`;
          document.body.append(anchor);
          try {
            anchor.click();
          } finally {
            anchor.remove();
            const root = temporaryRoot;
            const name = temporaryName;
            cleanupDownload = trackDownload(url, () => {
              if (root !== null && name !== null)
                void root.removeEntry(name).catch(() => undefined);
            });
          }
        }
        await api.finishBackupExport!(start.jobId);
        finished = true;
      } finally {
        if (!finished) await api.cancelBackupJob!(start.jobId).catch(() => undefined);
        if (!finished && writer?.abort) await writer.abort().catch(() => undefined);
        if (!finished && cleanupDownload !== null) {
          cleanupDownload();
          cleanupDownload = null;
        }
        if (temporaryRoot !== null && temporaryName !== null && cleanupDownload === null)
          await temporaryRoot.removeEntry(temporaryName).catch(() => undefined);
        form.reset();
      }
      app.setDirty("tools", false);
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
      trackDownload(url);
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
      file.size > MAX_BACKUP_FILE_BYTES
    )
      throw new Error("LUNA_ERROR:ledger-file-invalid");
    const prefix = new TextDecoder().decode(
      new Uint8Array(await file.slice(0, FULL_BACKUP_MAGIC.length).arrayBuffer()),
    );
    if (prefix === FULL_BACKUP_MAGIC) {
      if (!completeBackup) throw new Error("LUNA_ERROR:backup-unsupported-container");
      const { jobId } = await api.beginBackupImport!(file.size, password);
      let finished = false;
      let pending = new Uint8Array(0);
      let receivedBytes = 0;
      try {
        const reader = file.stream().getReader();
        const append = async (bytes: Uint8Array, sequence: number) => {
          const nextReceivedBytes = receivedBytes + bytes.byteLength;
          if (nextReceivedBytes > file.size || nextReceivedBytes > MAX_BACKUP_FILE_BYTES)
            throw new Error("LUNA_ERROR:backup-too-large");
          const receipt = await api.appendBackupChunk!(jobId, sequence, bytes);
          if (!Number.isSafeInteger(receipt.receivedBytes) || receipt.receivedBytes !== nextReceivedBytes)
            throw new Error("LUNA_ERROR:backup-invalid-container");
          receivedBytes = nextReceivedBytes;
        };
        let sequence = 0;
        try {
          for (;;) {
            const next = await reader.read();
            if (next.done) break;
            const chunk = new Uint8Array(next.value);
            let offset = 0;
            while (offset < chunk.byteLength) {
              const remaining = chunk.byteLength - offset;
              const capacity = MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES - pending.byteLength;
              const take = Math.min(remaining, capacity);
              const joined = new Uint8Array(pending.byteLength + take);
              joined.set(pending);
              joined.set(chunk.subarray(offset, offset + take), pending.byteLength);
              pending = joined;
              offset += take;
              if (pending.byteLength === MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES) {
                await append(pending, sequence);
                sequence += 1;
                pending = new Uint8Array(0);
              }
            }
          }
          if (pending.byteLength > 0) await append(pending, sequence);
          if (receivedBytes !== file.size)
            throw new Error("LUNA_ERROR:backup-invalid-container");
          await api.finishBackupImport!(jobId);
          finished = true;
        } finally {
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
      } finally {
        if (!finished) await api.cancelBackupJob!(jobId).catch(() => undefined);
      }
    } else {
      if (file.size > MAX_LEDGER_ENVELOPE_BYTES)
        throw new Error("LUNA_ERROR:ledger-file-invalid");
      await api.importLedgerBackup(await file.text(), password);
    }
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
              accept=".luna-backup,.json,application/octet-stream,application/json"
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
