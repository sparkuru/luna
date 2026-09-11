import {
  decryptLedgerDocument,
  encryptLedgerDocument,
  validateLedgerPassword,
} from "../shared/ledger-crypto";
import {
  decodeLedgerSessionInput,
  LedgerSessionError,
  type LedgerSessionStatus,
} from "../shared/ledger-session";
import type { ConfigureConfigSyncInput } from "../shared/settings";
import type { LedgerDocument } from "../shared/ledger-sync";
import {
  LedgerObjectError,
  S3LedgerObjectStore,
  type LedgerObjectStore,
} from "./s3-ledger-store";

export interface LedgerDataPort {
  getLedgerDocument(): LedgerDocument | null | Promise<LedgerDocument | null>;
  mergeLedgerDocument(
    input: LedgerDocument,
    signal?: AbortSignal,
  ): LedgerDocument | Promise<LedgerDocument>;
}

/** Credentials and passphrase never enter persistent settings or renderer projections. */
export class LedgerSyncSession {
  private session: {
    passphrase: string;
    key: string;
    remote: LedgerObjectStore;
  } | null = null;
  private running: AbortController | null = null;
  private syncedDocument: string | null = null;
  private status: LedgerSessionStatus = {
    enabled: false,
    configured: false,
    code: "disabled",
    lastSyncedAt: null,
  };

  constructor(
    private readonly local: LedgerDataPort,
    private readonly createRemote: (
      input: ConfigureConfigSyncInput,
    ) => LedgerObjectStore = (input) =>
      new S3LedgerObjectStore(input.connection, input.credentials),
  ) {}

  getStatus(): LedgerSessionStatus {
    return { ...this.status };
  }

  /** Mark a safe remote-marker change without downloading the encrypted body. */
  markRemoteChangeAvailable(): void {
    if (!this.status.remoteChangeAvailable)
      this.status = { ...this.status, remoteChangeAvailable: true };
  }

  /** Clear the manual-mode marker after an explicit or automatic sync. */
  markRemoteChangeSynced(): void {
    if (this.status.remoteChangeAvailable) {
      const { remoteChangeAvailable: _remoteChangeAvailable, ...status } =
        this.status;
      this.status = status;
    }
  }

  async getCurrentStatus(): Promise<LedgerSessionStatus> {
    const acknowledged = this.syncedDocument;
    const session = this.session;
    if (this.status.code === "synced" && acknowledged !== null) {
      const current = JSON.stringify(await this.local.getLedgerDocument());
      if (
        session === this.session &&
        acknowledged === this.syncedDocument &&
        this.status.code === "synced" &&
        current !== acknowledged
      )
        this.status.code = "pending";
    }
    return this.getStatus();
  }

  async configure(
    value: ConfigureConfigSyncInput,
  ): Promise<LedgerSessionStatus> {
    const input = decodeLedgerSessionInput(value);
    validateLedgerPassword(input.credentials.passphrase);
    this.clear();
    const prefix = input.connection.prefix;
    this.session = {
      passphrase: input.credentials.passphrase,
      key: `${prefix === "" ? "" : `${prefix}/`}ledger-v1.enc.json`,
      remote: this.createRemote(input),
    };
    this.status = {
      enabled: true,
      configured: true,
      code: "ready",
      lastSyncedAt: null,
    };
    return this.getStatus();
  }

  configureTarget(
    remote: LedgerObjectStore,
    passphrase: string,
    key = "ledger-v1.enc.json",
  ): LedgerSessionStatus {
    validateLedgerPassword(passphrase);
    this.clear();
    this.session = { remote, passphrase, key };
    this.status = {
      enabled: true,
      configured: true,
      code: "ready",
      lastSyncedAt: null,
    };
    return this.getStatus();
  }

  clear(): LedgerSessionStatus {
    this.running?.abort();
    this.running = null;
    this.session?.remote.close();
    this.session = null;
    this.syncedDocument = null;
    this.status = {
      enabled: false,
      configured: false,
      code: "disabled",
      lastSyncedAt: null,
    };
    return this.getStatus();
  }

  async syncNow(): Promise<LedgerSessionStatus> {
    const session = this.session;
    if (session === null) return this.getStatus();
    if (this.running !== null) throw new LedgerSessionError("ledger-sync-busy");
    const controller = new AbortController();
    this.running = controller;
    const timeout = setTimeout(() => controller.abort(), 60_000);
    this.status.code = "syncing";
    const assertCurrent = (): void => {
      if (this.session !== session || controller.signal.aborted)
        throw new LedgerSessionError("ledger-sync-cancelled");
    };
    const key = session.key;
    try {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        assertCurrent();
        const object = await session.remote.get(key, controller.signal);
        assertCurrent();
        let remoteDocument: LedgerDocument | null = null;
        if (object !== null) {
          remoteDocument = await decryptLedgerDocument(
            object.body,
            session.passphrase,
          );
          assertCurrent();
        }
        // The adapter merges against the latest committed local graph, not a pre-download copy.
        const document =
          remoteDocument === null
            ? await this.local.getLedgerDocument()
            : await this.local.mergeLedgerDocument(
                remoteDocument,
                controller.signal,
              );
        assertCurrent();
        if (document === null) throw new LedgerSessionError("ledger-empty");
        const canonical = JSON.stringify(document);
        if (
          remoteDocument === null ||
          canonical !== JSON.stringify(remoteDocument)
        ) {
          const encrypted = await encryptLedgerDocument(
            document,
            session.passphrase,
          );
          assertCurrent();
          try {
            await session.remote.put(
              key,
              encrypted,
              object?.etag ?? null,
              controller.signal,
            );
          } catch (error) {
            assertCurrent();
            if (
              error instanceof LedgerObjectError &&
              (error.code === "conflict" || error.code === "not-found")
            )
              continue;
            throw error;
          }
        }
        assertCurrent();
        const latest = await this.local.getLedgerDocument();
        assertCurrent();
        if (JSON.stringify(latest) !== canonical) continue;
        this.markRemoteChangeSynced();
        this.status = {
          enabled: true,
          configured: true,
          code: "synced",
          lastSyncedAt: new Date().toISOString(),
        };
        this.syncedDocument = canonical;
        return this.getStatus();
      }
      this.status.code = "pending";
      return this.getStatus();
    } catch (error) {
      if (this.session === session) this.status.code = "failed";
      throw error;
    } finally {
      clearTimeout(timeout);
      if (this.running === controller) this.running = null;
    }
  }
}
