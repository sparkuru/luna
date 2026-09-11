import { QueryClient } from "@tanstack/react-query";
import { createApiClient } from "../api-client/runtime/client";
import { accountQueries } from "../api-client/runtime/account-queries";
import {
  createSession,
  getServerMeta,
  createLedger,
  getLedgerObjectStatus,
  logoutSession,
  revokeSession,
} from "../api-client/generated/sdk.gen";
import type { Client } from "../api-client/generated/client";
import type { LunaLedgerApi } from "../shared/api";
import { assertNotAborted } from "../shared/abort";
import {
  decodeLogin,
  decodeProfileId,
  decodeServerId,
  decodeServerUrl,
  serverProfileId,
  type ProfileSummary,
  type LunaServerApi,
  type ServerStatus,
  type ServerBinding,
  type ServerConnectInput,
} from "../shared/server-api";
import {
  decryptLedgerDocument,
  validateLedgerPassword,
} from "../shared/ledger-crypto";
import { mergeLedgerDocuments } from "../shared/ledger-sync";
import {
  LEDGER_SYNC_MODES,
  type LedgerSyncMode,
} from "../shared/settings";
import type { ProfileRepository, LocalProfile } from "./profile-port";
import { LedgerSyncSession } from "./ledger-service";
import {
  HttpLedgerObjectStore,
  HttpPreferenceObjectStore,
  randomRequestId,
  ServerTransportError,
} from "./http-object-store";
import type { SessionVault, SessionVaultRecord } from "./session-vault";

interface Account {
  forget: () => void;
  token: () => string | undefined;
  baseUrl: string;
  instanceId: string;
  id: string;
  username: string;
  expiresAt: string;
  client: Client;
}
export class ServerHost implements LunaServerApi {
  private currentId = "legacy-local";
  private generation = 0;
  private profilesFlight: Promise<ProfileSummary[]> | null = null;
  private account: Account | null = null;
  private controller = new AbortController();
  private ledgerSession: LedgerSyncSession | null = null;
  private readonly queries = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  private pending = new Set<Promise<unknown>>();
  private ledgerFlight: {
    key: object | string;
    promise: ReturnType<LunaLedgerApi["syncLedgerNow"]>;
  } | null = null;
  private runSync(
    key: object | string,
    operation: () => ReturnType<LunaLedgerApi["syncLedgerNow"]>,
  ) {
    if (this.ledgerFlight?.key === key) return this.ledgerFlight.promise;
    const promise = operation();
    const flight = { key, promise };
    this.ledgerFlight = flight;
    void promise
      .finally(() => {
        if (this.ledgerFlight === flight) this.ledgerFlight = null;
      })
      .catch(() => undefined);
    return promise;
  }
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  private remoteTimer: ReturnType<typeof setTimeout> | null = null;
  private remoteProbeFlight: Promise<void> | null = null;
  private remoteEtag: string | null = null;
  private remoteMarkerKnown = false;
  private ledgerVault: SessionVaultRecord["ledger"] = null;
  private syncMode: LedgerSyncMode = "automatic";
  private transitionQueue: Promise<void> = Promise.resolve();
  private transitioning = 0;
  private transitionSequence = 0;
  private transition<T>(
    operation: () => Promise<T>,
    preserveS3 = false,
  ): Promise<T> {
    const sequence = ++this.transitionSequence;
    this.transitioning++;
    this.controller.abort();
    this.ledgerSession?.clear();
    const previous = this.transitionQueue;
    let release!: () => void;
    this.transitionQueue = new Promise<void>((resolve) => (release = resolve));
    return (async () => {
      await previous;
      try {
        await this.initialized;
        if (sequence !== this.transitionSequence)
          throw new ServerTransportError("cancelled");
        await this.stop(preserveS3);
        if (sequence !== this.transitionSequence)
          throw new ServerTransportError("cancelled");
        this.controller = new AbortController();
        this.generation++;
        const result = await operation();
        return result;
      } finally {
        this.transitioning--;
        release();
        this.emit();
      }
    })();
  }
  private readonly listeners = new Set<() => void>();
  private broadcast: ((id: string) => void) | null = null;
  private transportCleanup: (() => void) | null = null;
  private readonly sessionVault: SessionVault | undefined;
  private sessionVaultFlight: Promise<void> = Promise.resolve();
  private disposed = false;
  setNotifications(send: (id: string) => void, close: () => void) {
    this.broadcast = send;
    this.transportCleanup = close;
    this.scheduleRemoteProbe();
  }
  notifyExternal(id: string) {
    if (id === this.currentId) this.emit(false);
  }
  private emit(send = true) {
    for (const listener of this.listeners) queueMicrotask(listener);
    if (send) this.broadcast?.(this.currentId);
  }
  private readonly initialized: Promise<void>;
  readonly api: LunaLedgerApi;
  constructor(
    private readonly profilesStore: ProfileRepository,
    private readonly fetcher: typeof fetch = globalThis.fetch,
    sessionVault?: SessionVault,
  ) {
    this.sessionVault = sessionVault;
    this.initialized = (async () => {
      this.currentId = decodeProfileId(
        (await this.profilesStore.active?.()) ?? "legacy-local",
      );
      await this.restoreSession();
    })();
    const invoke = <K extends keyof LunaLedgerApi>(
      method: K,
      ...args: unknown[]
    ): Promise<unknown> => {
      if (this.transitioning)
        return Promise.reject(new ServerTransportError("busy"));
      const operation = (async () => {
        await this.initialized;
        if (this.transitioning) throw new ServerTransportError("busy");
        const id = this.currentId;
        const generation = this.generation;
        const signal = this.controller.signal;
        const profile = await this.profilesStore.open(id);
        assertNotAborted(signal);
        if (method === "configureLedgerSync" || method === "clearLedgerSync")
          this.ledgerFlight = null;
        if (method === "configureLedgerSync") {
          this.ledgerSession?.clear();
          this.ledgerSession = null;
          this.ledgerVault = null;
          this.remoteEtag = null;
          this.remoteMarkerKnown = false;
          profile.config.configureTarget(null);
        }
        if (
          [
            "configureConfigSync",
            "testConfigSync",
            "syncConfigNow",
            "clearConfigSync",
          ].includes(method) &&
          profile.config.getTargetStatus().enabled
        )
          profile.config.configureTarget(null);
        const fn = profile.api[method];
        if (typeof fn !== "function")
          throw new ServerTransportError("unavailable");
        const result = await (
          fn as (...args: unknown[]) => Promise<unknown>
        ).apply(profile.api, args);
        const committedLocalWrite = [
          "createWorkspace",
          "createTransaction",
          "updateTransaction",
          "deleteTransaction",
          "setMonthlyBudget",
          "mergeLedgerDocument",
          "importLedgerBackup",
          "resolveLedgerConflict",
          "updateSettings",
        ].includes(method);
        // Authentication can expire while a captured local write commits.
        // Its successful receipt remains valid; cancellation cannot undo it.
        if (generation !== this.generation && !committedLocalWrite)
          throw new ServerTransportError("cancelled");
        if (committedLocalWrite) this.emit();
        if (method === "updateSettings") {
          const settings = result as { ledgerSyncMode?: LedgerSyncMode };
          if (
            settings.ledgerSyncMode &&
            LEDGER_SYNC_MODES.includes(settings.ledgerSyncMode)
          )
            this.syncMode = settings.ledgerSyncMode;
        }
        if (
          [
            "createTransaction",
            "updateTransaction",
            "deleteTransaction",
            "setMonthlyBudget",
            "mergeLedgerDocument",
            "importLedgerBackup",
            "resolveLedgerConflict",
          ].includes(method)
        )
          this.scheduleSync();
        return result;
      })();
      this.pending.add(operation);
      void operation
        .finally(() => this.pending.delete(operation))
        .catch(() => undefined);
      return operation;
    };
    this.api = {
      server: this,
      onChange: (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
      getLedgerSyncStatus: async () => {
        if (this.transitioning) throw new ServerTransportError("busy");
        await this.initialized;
        if (this.transitioning) throw new ServerTransportError("busy");
        return this.ledgerSession
          ? this.ledgerSession.getCurrentStatus()
          : (invoke("getLedgerSyncStatus") as ReturnType<
              LunaLedgerApi["getLedgerSyncStatus"]
            >);
      },
      configureLedgerSync: (input) =>
        invoke("configureLedgerSync", input) as ReturnType<
          LunaLedgerApi["configureLedgerSync"]
        >,
      syncLedgerNow: () => {
        if (this.transitioning)
          return Promise.reject(new ServerTransportError("busy"));
        const key = this.ledgerSession ?? `${this.currentId}:${this.generation}`;
        return this.runSync(key, async () => {
          await this.initialized;
          if (this.transitioning) throw new ServerTransportError("busy");
          const result = await (this.ledgerSession
            ? this.ledgerSession.syncNow()
            : (invoke("syncLedgerNow") as ReturnType<
                LunaLedgerApi["syncLedgerNow"]
              >));
          // Sync can merge a remote document without going through a local
          // mutation method. Notify every presentation consumer of the new
          // committed graph just like the server-backed sync path does.
          this.emit();
          return result;
        });
      },
      clearLedgerSync: async () => {
        this.ledgerSession?.clear();
        this.ledgerSession = null;
        this.ledgerVault = null;
        this.remoteEtag = null;
        this.remoteMarkerKnown = false;
        const result = await (invoke("clearLedgerSync") as ReturnType<
          LunaLedgerApi["clearLedgerSync"]
        >);
        await this.persistSession();
        return result;
      },
      getSnapshot: (month) =>
        invoke("getSnapshot", month) as ReturnType<
          LunaLedgerApi["getSnapshot"]
        >,
      createWorkspace: (input) =>
        invoke("createWorkspace", input) as ReturnType<
          LunaLedgerApi["createWorkspace"]
        >,
      createTransaction: (input) =>
        invoke("createTransaction", input) as ReturnType<
          LunaLedgerApi["createTransaction"]
        >,
      updateTransaction: (...args) =>
        invoke("updateTransaction", ...args) as ReturnType<
          LunaLedgerApi["updateTransaction"]
        >,
      deleteTransaction: (...args) =>
        invoke("deleteTransaction", ...args) as ReturnType<
          LunaLedgerApi["deleteTransaction"]
        >,
      setMonthlyBudget: (...args) =>
        invoke("setMonthlyBudget", ...args) as Promise<void>,
      getSettings: () =>
        invoke("getSettings") as ReturnType<LunaLedgerApi["getSettings"]>,
      updateSettings: (input) =>
        invoke("updateSettings", input) as ReturnType<
          LunaLedgerApi["updateSettings"]
        >,
      configureConfigSync: (input) =>
        invoke("configureConfigSync", input) as ReturnType<
          LunaLedgerApi["configureConfigSync"]
        >,
      testConfigSync: () =>
        invoke("testConfigSync") as ReturnType<LunaLedgerApi["testConfigSync"]>,
      syncConfigNow: () =>
        invoke("syncConfigNow") as ReturnType<LunaLedgerApi["syncConfigNow"]>,
      clearConfigSync: () =>
        invoke("clearConfigSync") as ReturnType<
          LunaLedgerApi["clearConfigSync"]
        >,
      getLedgerDocument: () =>
        invoke("getLedgerDocument") as ReturnType<
          LunaLedgerApi["getLedgerDocument"]
        >,
      mergeLedgerDocument: (input) =>
        invoke("mergeLedgerDocument", input) as ReturnType<
          LunaLedgerApi["mergeLedgerDocument"]
        >,
      getLedgerConflicts: () =>
        invoke("getLedgerConflicts") as ReturnType<
          LunaLedgerApi["getLedgerConflicts"]
        >,
      resolveLedgerConflict: (input) =>
        invoke("resolveLedgerConflict", input) as ReturnType<
          LunaLedgerApi["resolveLedgerConflict"]
        >,
      exportLedgerBackup: (password) =>
        invoke("exportLedgerBackup", password) as Promise<string>,
      importLedgerBackup: async (raw, password) => {
        await this.initialized;
        if (this.transitioning) throw new ServerTransportError("busy");
        const id = this.currentId;
        const signal = this.controller.signal;
        const document = await decryptLedgerDocument(raw, password);
        assertNotAborted(signal);
        const profile = await this.profilesStore.open(id);
        await profile.ledger.mergeLedgerDocument(document, signal);
        this.scheduleSync();
        this.emit();
      },
    };
  }
  private async stop(preserveS3 = false) {
    this.controller.abort();
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = null;
    if (this.remoteTimer) clearTimeout(this.remoteTimer);
    this.remoteTimer = null;
    this.remoteProbeFlight = null;
    this.remoteEtag = null;
    this.remoteMarkerKnown = false;
    this.ledgerSession?.clear();
    this.ledgerSession = null;
    this.ledgerVault = null;
    await this.queries.cancelQueries();
    this.queries.clear();
    const profile = await this.profilesStore.open(this.currentId);
    profile.config.cancelSession();
    if (!preserveS3) await profile.api.clearLedgerSync();
    await this.persistSession();
    await Promise.allSettled([...this.pending]);
  }
  private invalidateAccount(account: Account, generation: number) {
    // A late response from a superseded login must never invalidate its replacement.
    if (this.account !== account || this.generation !== generation) return;
    account.forget();
    this.account = null;
    this.controller.abort();
    this.ledgerSession?.clear();
    this.ledgerSession = null;
    this.ledgerVault = null;
    this.remoteEtag = null;
    this.remoteMarkerKnown = false;
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = null;
    if (this.remoteTimer) clearTimeout(this.remoteTimer);
    this.remoteTimer = null;
    this.generation++;
    this.controller = new AbortController();
    void this.queries.cancelQueries();
    this.queries.clear();
    const id = this.currentId;
    const invalidatedGeneration = this.generation;
    void this.profilesStore.open(id).then((profile) => {
      if (this.generation === invalidatedGeneration)
        profile.config.cancelSession();
    });
    void this.persistSession();
    // No transition await here: the failing operation may itself be a drained write.
    this.emit();
  }
  private requireAccount() {
    if (!this.account) throw new ServerTransportError("authentication");
    return this.account;
  }

  private createAccountClient(
    baseUrl: string,
    token: { value: string | undefined },
    owner: { value: Account | null },
  ): Client {
    const fetcher = this.fetcher;
    return createApiClient(
      baseUrl,
      () => token.value,
      async (request, init) => {
        const response = await fetcher(request, init);
        // The account object is retained across profile transitions, so its
        // creation generation is not a validity boundary. Identity is: a
        // late response from a superseded login has a different owner, while
        // a 401 for the current account must invalidate it even after a
        // profile switch or ledger reconnect.
        const currentOwner = owner.value;
        if (response.status === 401 && currentOwner) {
          if (currentOwner === this.account)
            this.invalidateAccount(currentOwner, this.generation);
        }
        return response;
      },
    );
  }

  private async restoreSession(): Promise<void> {
    const vault = this.sessionVault;
    if (!vault) return;
    let saved: SessionVaultRecord | null;
    try {
      saved = decodeSessionRecord(await vault.load());
    } catch {
      return;
    }
    if (!saved) {
      await vault.clear().catch(() => undefined);
      return;
    }
    const token: { value: string | undefined } = { value: saved.account.token };
    const owner: { value: Account | null } = { value: null };
    const account: Account = {
      forget: () => {
        token.value = undefined;
      },
      token: () => token.value,
      baseUrl: saved.account.baseUrl,
      instanceId: saved.account.instanceId,
      id: saved.account.id,
      username: saved.account.username,
      expiresAt: saved.account.expiresAt,
      client: this.createAccountClient(saved.account.baseUrl, token, owner),
    };
    owner.value = account;
    this.account = account;
    try {
      const profile = await this.profilesStore.open(this.currentId);
      this.syncMode = (await profile.api.getSettings()).ledgerSyncMode;
      const binding = await profile.binding();
      const ledger = saved.ledger;
      if (
        ledger &&
        ledger.profileId === this.currentId &&
        binding &&
        binding.ledgerId === ledger.ledgerId &&
        binding.instanceId === account.instanceId &&
        binding.userId === account.id &&
        binding.baseUrl === account.baseUrl
      ) {
        this.ledgerSession = new LedgerSyncSession(profile.ledger);
        this.ledgerSession.configureTarget(
          new HttpLedgerObjectStore(account.client, ledger.ledgerId),
          ledger.passphrase,
        );
        this.ledgerVault = ledger;
        this.remoteEtag = ledger.remoteEtag;
        this.remoteMarkerKnown = true;
      } else if (ledger) {
        this.ledgerVault = null;
        await this.persistSession();
      }
      this.scheduleSync();
      this.scheduleRemoteProbe();
    } catch {
      // A local profile failure must not turn a recoverable account session
      // into a credential prompt. The next explicit unlock can repair it.
      this.ledgerSession?.clear();
      this.ledgerSession = null;
      this.ledgerVault = null;
      await this.persistSession();
    }
  }

  private persistSession(): Promise<void> {
    const vault = this.sessionVault;
    if (!vault) return Promise.resolve();
    const operation = this.sessionVaultFlight.then(async () => {
      const account = this.account;
      if (!account) {
        await vault.clear().catch(() => undefined);
        return;
      }
      await vault
        .save({
          account: {
            token: accountToken(account),
            expiresAt: account.expiresAt,
            baseUrl: account.baseUrl,
            instanceId: account.instanceId,
            id: account.id,
            username: account.username,
          },
          ledger: this.ledgerVault,
        })
        .catch(() => undefined);
    });
    this.sessionVaultFlight = operation.catch(() => undefined);
    return operation;
  }
  private scope(a: Account) {
    return {
      instanceId: a.instanceId,
      userId: a.id,
      generation: this.generation,
    };
  }
  private assert(signal: AbortSignal, a?: Account) {
    assertNotAborted(signal);
    if (a && this.account !== a) throw new ServerTransportError("cancelled");
  }
  async status(): Promise<ServerStatus> {
    await this.initialized;
    const id = this.currentId,
      generation = this.generation,
      a = this.account,
      session = this.ledgerSession;
    const profile = await this.profilesStore.open(id);
    const binding = await profile.binding();
    const document = await profile.ledger.getLedgerDocument();
    const sync = session
      ? await session.getCurrentStatus()
      : await profile.api.getLedgerSyncStatus();
    const settings = await profile.api.getSettings();
    this.syncMode = settings.ledgerSyncMode;
    const result: ServerStatus = {
      generation,
      profile: { id, displayName: document?.workspace.name ?? "Luna", binding },
      account: a
        ? {
            baseUrl: a.baseUrl,
            instanceId: a.instanceId,
            id: a.id,
            username: a.username,
          }
        : null,
      connected: session !== null,
      syncMode: this.syncMode,
      sync,
      preferences: profile.config.getTargetStatus(),
    };
    if (
      id !== this.currentId ||
      generation !== this.generation ||
      a !== this.account ||
      session !== this.ledgerSession
    )
      throw new ServerTransportError("cancelled");
    return result;
  }
  async login(input: Parameters<LunaServerApi["login"]>[0]) {
    const value = decodeLogin(input);
    // Login does not select a financial target. Retain the explicitly configured
    // S3 source until connect can confirm it or accept a local-only migration.
    return this.transition(() => this.loginNow(value), true);
  }
  private async loginNow(value: Parameters<LunaServerApi["login"]>[0]) {
    this.account?.forget();
    this.account = null;
    this.ledgerVault = null;
    this.remoteEtag = null;
    this.remoteMarkerKnown = false;
    await this.persistSession();
    const signal = this.controller.signal;
    let token: string | undefined;
    let owner: Account | null = null;
    const client = this.createAccountClient(
      value.baseUrl,
      { get value() { return token; }, set value(next: string | undefined) { token = next; } },
      { get value() { return owner; }, set value(next: Account | null) { owner = next; } },
    );
    const meta = await getServerMeta({ client, signal });
    if (!meta.data) throw new ServerTransportError("unavailable");
    this.assert(signal);
    if (
      meta.data.apiVersion !== 1 ||
      !meta.data.limits ||
      !Number.isInteger(meta.data.limits.ledgerBytes) ||
      meta.data.limits.ledgerBytes <= 0 ||
      meta.data.limits.ledgerBytes > 12 * 1024 * 1024 ||
      !Number.isInteger(meta.data.limits.preferenceBytes) ||
      meta.data.limits.preferenceBytes <= 0 ||
      meta.data.limits.preferenceBytes > 1024 * 1024
    )
      throw new ServerTransportError("unsupported-version");
    const instanceId = decodeServerId(meta.data.instanceId);
    const response = await createSession({
      client,
      signal,
      body: {
        username: value.username,
        password: value.password,
        deviceLabel: value.deviceLabel,
      },
    });
    this.assert(signal);
    if (!response.data)
      throw new ServerTransportError(
        response.response?.status === 401 ? "authentication" : "unavailable",
      );
    if (
      typeof response.data.token !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(response.data.token) ||
      !response.data.user ||
      typeof response.data.user.username !== "string" ||
      !/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(response.data.user.username) ||
      typeof response.data.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(response.data.expiresAt))
    )
      throw new ServerTransportError("invalid-response");
    token = response.data.token;
    this.account = {
      forget: () => {
        token = undefined;
      },
      token: () => token,
      baseUrl: value.baseUrl,
      instanceId,
      id: decodeServerId(response.data.user.id),
      username: response.data.user.username,
      expiresAt: response.data.expiresAt,
      client,
    };
    owner = this.account;
    this.ledgerVault = null;
    await this.persistSession();
    return this.status();
  }
  async logout() {
    return this.transition(async () => {
      const a = this.account;
      this.account = null;
      if (a) {
        await logoutSession({
          client: a.client,
          signal: AbortSignal.timeout(5000),
        }).catch(() => undefined);
        a.forget();
      }
      await this.persistSession();
      return this.status();
    });
  }
  async profiles() {
    if (this.profilesFlight) return this.profilesFlight;
    const flight = this.profilesStore.list();
    this.profilesFlight = flight;
    void flight
      .finally(() => {
        if (this.profilesFlight === flight) this.profilesFlight = null;
      })
      .catch(() => undefined);
    return flight;
  }
  async selectProfile(id: string) {
    id = decodeProfileId(id);
    return this.transition(async () => {
      if (!(await this.profiles()).some((p) => p.id === id))
        throw new ServerTransportError("not-found");
      await this.profilesStore.activate?.(id, this.controller.signal);
      this.assert(this.controller.signal);
      this.currentId = id;
      return this.status();
    });
  }
  async removeProfile(value: string) {
    const id = decodeProfileId(value);
    await this.initialized;
    if (this.transitioning) throw new ServerTransportError("busy");
    if (id === this.currentId)
      throw new ServerTransportError("active-profile");
    if (!this.profilesStore.remove)
      throw new ServerTransportError("unavailable");
    await this.profilesStore.remove(id);
    this.emit();
    return this.status();
  }
  async connect(input: ServerConnectInput) {
    if (
      !input ||
      typeof input.passphrase !== "string" ||
      (input.sourceProfileId !== null &&
        typeof input.sourceProfileId !== "string") ||
      typeof input.allowLocalOnlyMigration !== "boolean"
    )
      throw new ServerTransportError("invalid-input");
    validateLedgerPassword(input.passphrase);
    return this.transition(() => this.connectNow(input), true);
  }
  private async connectNow(input: ServerConnectInput) {
    const a = this.requireAccount();
    const signal = this.controller.signal;
    const source =
      input.sourceProfileId === null
        ? null
        : await this.profilesStore.open(decodeProfileId(input.sourceProfileId));
    if (source) {
      const old = await source.api.getLedgerSyncStatus();
      if (old.configured && !input.allowLocalOnlyMigration) {
        const confirmed = await source.api.syncLedgerNow();
        if (confirmed.code !== "synced")
          throw new ServerTransportError("source-unconfirmed");
      }
    }
    this.assert(signal, a);
    let sourceDocument = source
      ? await source.ledger.getLedgerDocument()
      : null;
    const options = accountQueries(a.client, this.scope(a));
    let ledgers = await this.queries.fetchQuery(options.ledgers);
    this.assert(signal, a);
    if (!ledgers.length) {
      if (!sourceDocument) throw new ServerTransportError("empty");
      const created = await createLedger({
        client: a.client,
        body: {},
        headers: { "idempotency-key": randomRequestId() },
        signal,
      });
      this.assert(signal, a);
      if (!created.data) {
        ledgers = await this.queries.fetchQuery(options.ledgers);
        if (!ledgers.length) throw new ServerTransportError("unavailable");
      } else ledgers = [created.data];
    }
    const ledgerId = decodeServerId(ledgers[0]!.id);
    const binding: ServerBinding = {
      baseUrl: a.baseUrl,
      instanceId: a.instanceId,
      userId: a.id,
      ledgerId,
    };
    const destination = await this.profilesStore.open(
      serverProfileId(a.instanceId, a.id),
    );
    const oldBinding = await destination.binding();
    if (
      oldBinding &&
      (oldBinding.ledgerId !== ledgerId ||
        oldBinding.instanceId !== a.instanceId)
    )
      throw new ServerTransportError("binding-mismatch");
    const remote = new HttpLedgerObjectStore(a.client, ledgerId);
    try {
      const object = await remote.get("ledger-v1.enc.json", signal);
      const remoteDocument = object
        ? await decryptLedgerDocument(object.body, input.passphrase)
        : null;
      this.assert(signal, a);
      const current = await destination.ledger.getLedgerDocument();
      let candidate = current;
      for (const document of [sourceDocument, remoteDocument])
        if (document)
          candidate = candidate
            ? mergeLedgerDocuments(candidate, document)
            : document;
      if (!candidate) throw new ServerTransportError("empty");
      await destination.ledger.mergeLedgerDocument(candidate, signal);
      this.assert(signal, a);
      const session = new LedgerSyncSession(destination.ledger);
      session.configureTarget(remote, input.passphrase);
      const abort = () => session.clear();
      signal.addEventListener("abort", abort, { once: true });
      try {
        const result = await session.syncNow();
        if (result.code !== "synced") throw new ServerTransportError("pending");
        this.assert(signal, a);
        sourceDocument = source
          ? await source.ledger.getLedgerDocument()
          : null;
        if (sourceDocument) {
          await destination.ledger.mergeLedgerDocument(sourceDocument, signal);
          await session.syncNow();
        }
        const verify = await remote.get("ledger-v1.enc.json", signal);
        if (!verify) throw new ServerTransportError("verification-failed");
        const verified = await decryptLedgerDocument(
          verify.body,
          input.passphrase,
        );
        this.assert(signal, a);
        const latest = await destination.ledger.getLedgerDocument();
        if (
          !latest ||
          JSON.stringify(mergeLedgerDocuments(latest, verified)) !==
            JSON.stringify(verified)
        )
          throw new ServerTransportError("pending");
        await destination.bind(verified, binding, signal);
        this.assert(signal, a);
        if (
          JSON.stringify(await destination.readDurable()) !==
          JSON.stringify(verified)
        )
          throw new ServerTransportError("verification-failed");
        this.assert(signal, a);
        if (
          source &&
          JSON.stringify(await source.ledger.getLedgerDocument()) !==
            JSON.stringify(sourceDocument)
        )
          throw new ServerTransportError("source-changed");
        if (source) {
          await source.api.clearLedgerSync();
          this.assert(signal, a);
        }
        await destination.api.clearLedgerSync();
        this.assert(signal, a);
        await this.profilesStore.activate?.(destination.id, signal);
        this.assert(signal, a);
        this.currentId = destination.id;
        this.ledgerSession = new LedgerSyncSession(destination.ledger);
        this.ledgerSession.configureTarget(
          new HttpLedgerObjectStore(a.client, ledgerId),
          input.passphrase,
        );
        await this.ledgerSession.syncNow();
        this.assert(signal, a);
        this.remoteEtag = await this.readRemoteMarker(a, ledgerId, signal);
        this.remoteMarkerKnown = true;
        this.ledgerVault = {
          profileId: destination.id,
          ledgerId,
          passphrase: input.passphrase,
          remoteEtag: this.remoteEtag,
        };
        await this.persistSession();
        return this.status();
      } finally {
        signal.removeEventListener("abort", abort);
        session.clear();
      }
    } finally {
      remote.close();
    }
  }
  async unlock(passphrase: string) {
    validateLedgerPassword(passphrase);
    return this.transition(async () => {
      const a = this.requireAccount();
      const profile = await this.profilesStore.open(this.currentId);
      const binding = await profile.binding();
      if (
        !binding ||
        binding.userId !== a.id ||
        binding.instanceId !== a.instanceId ||
        binding.baseUrl !== a.baseUrl
      )
        throw new ServerTransportError("binding-mismatch");
      return this.connectNow({
        passphrase,
        sourceProfileId: profile.id,
        allowLocalOnlyMigration: false,
      });
    });
  }

  /**
   * Probe only the authenticated remote marker. This is intentionally public
   * for focused host tests; the renderer receives the resulting safe status
   * through `status()` and never gets an ETag or encrypted payload.
   */
  async checkRemoteNow(): Promise<void> {
    await this.initialized;
    await this.probeRemote();
  }

  private async readRemoteMarker(
    account: Account,
    ledgerId: string,
    signal: AbortSignal,
  ): Promise<string | null> {
    const result = await getLedgerObjectStatus({
      client: account.client,
      path: { id: ledgerId },
      signal,
    });
    if (
      result.response?.status === 404 &&
      typeof result.error === "object" &&
      result.error !== null &&
      (result.error as { code?: unknown }).code === "object-not-found"
    )
      return null;
    if (!result.response?.ok)
      throw new ServerTransportError(
        result.response?.status === 401
          ? "authentication"
          : result.response?.status === 403
            ? "permission"
            : "unavailable",
      );
    const value = result.data;
    if (
      !value ||
      typeof value.etag !== "string" ||
      typeof value.version !== "number" ||
      !Number.isInteger(value.version) ||
      typeof value.updatedAt !== "string"
    )
      throw new ServerTransportError("invalid-response");
    return value.etag;
  }

  private async probeRemote(): Promise<void> {
    if (this.transitioning || !this.account || !this.ledgerSession) return;
    if (this.remoteProbeFlight) return this.remoteProbeFlight;
    const flight = (async () => {
      const account = this.account;
      const session = this.ledgerSession;
      if (!account || !session || this.transitioning) return;
      if (session.getStatus().code === "syncing") return;
      const profile = await this.profilesStore.open(this.currentId);
      const binding = await profile.binding();
      if (
        !binding ||
        binding.userId !== account.id ||
        binding.instanceId !== account.instanceId ||
        binding.baseUrl !== account.baseUrl
      )
        return;
      const marker = await this.readRemoteMarker(
        account,
        binding.ledgerId,
        this.controller.signal,
      );
      this.assert(this.controller.signal, account);
      if (!this.remoteMarkerKnown) {
        this.remoteEtag = marker;
        this.remoteMarkerKnown = true;
        this.updateLedgerVaultMarker(marker);
        await this.persistSession();
        return;
      }
      if (marker === this.remoteEtag) return;
      if (this.syncMode === "manual") {
        this.remoteEtag = marker;
        this.updateLedgerVaultMarker(marker);
        session.markRemoteChangeAvailable();
        await this.persistSession();
        this.emit();
        return;
      }
      // Automatic mode keeps the old baseline until the pull/merge/upload
      // succeeds, so a transient failure is retried by the next probe.
      this.scheduleSync();
      this.emit();
    })();
    this.remoteProbeFlight = flight;
    try {
      await flight;
    } finally {
      if (this.remoteProbeFlight === flight) this.remoteProbeFlight = null;
    }
  }

  private updateLedgerVaultMarker(marker: string | null): void {
    if (this.ledgerVault)
      this.ledgerVault = { ...this.ledgerVault, remoteEtag: marker };
  }

  private async acknowledgeRemoteMarker(
    account: Account,
    ledgerId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const marker = await this.readRemoteMarker(account, ledgerId, signal);
    this.assert(signal, account);
    this.remoteEtag = marker;
    this.remoteMarkerKnown = true;
    this.updateLedgerVaultMarker(marker);
    await this.persistSession();
  }

  async sync() {
    if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
    if (this.transitioning) throw new ServerTransportError("busy");
    if (!this.ledgerSession) throw new ServerTransportError("locked");
    const session = this.ledgerSession;
    const result = await this.runSync(session, () => session.syncNow());
    const account = this.account;
    const binding = account
      ? await (await this.profilesStore.open(this.currentId)).binding()
      : null;
    if (result.code === "synced" && account && binding)
      await this.acknowledgeRemoteMarker(
        account,
        binding.ledgerId,
        this.controller.signal,
      ).catch(() => undefined);
    this.emit();
    return this.status();
  }
  async setSyncMode(mode: LedgerSyncMode) {
    if (!LEDGER_SYNC_MODES.includes(mode))
      throw new ServerTransportError("invalid-input");
    if (this.transitioning) throw new ServerTransportError("busy");
    await this.api.updateSettings({ ledgerSyncMode: mode });
    this.syncMode = mode;
    if (mode === "automatic") this.scheduleSync();
    else if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
    return this.status();
  }
  async disconnect() {
    return this.transition(() => this.status());
  }
  async configurePreferences(input: { enabled: boolean; passphrase: string }) {
    if (this.transitioning) throw new ServerTransportError("busy");
    const signal = this.controller.signal;
    if (
      !input ||
      typeof input.enabled !== "boolean" ||
      typeof input.passphrase !== "string"
    )
      throw new ServerTransportError("invalid-input");
    const a = this.requireAccount();
    const profile = await this.profilesStore.open(this.currentId);
    const binding = await profile.binding();
    this.assert(signal, a);
    if (
      !binding ||
      binding.userId !== a.id ||
      binding.instanceId !== a.instanceId
    )
      throw new ServerTransportError("binding-mismatch");
    if (input.enabled) validateLedgerPassword(input.passphrase);
    profile.config.configureTarget(
      input.enabled
        ? {
            passphrase: input.passphrase,
            objectKey: "preferences-v1.enc.json",
            createStore: () => new HttpPreferenceObjectStore(a.client),
          }
        : null,
    );
    return this.status();
  }
  async syncPreferences() {
    if (this.transitioning) throw new ServerTransportError("busy");
    const signal = this.controller.signal;
    const profile = await this.profilesStore.open(this.currentId);
    this.assert(signal);
    if (!profile.config.getTargetStatus().enabled)
      throw new ServerTransportError("locked");
    const cancel = () => profile.config.cancelSession();
    signal.addEventListener("abort", cancel, { once: true });
    try {
      await profile.config.syncNow();
      this.assert(signal);
      return this.status();
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  }
  async sessions() {
    if (this.transitioning) throw new ServerTransportError("busy");
    const a = this.requireAccount();
    const signal = this.controller.signal;
    const rows = await this.queries.fetchQuery(
      accountQueries(a.client, this.scope(a)).sessions,
    );
    this.assert(signal, a);
    return rows;
  }
  async revokeSession(id: string) {
    const a = this.requireAccount();
    const signal = this.controller.signal;
    const sessions = await this.sessions();
    this.assert(signal, a);
    const response = await revokeSession({
      client: a.client,
      path: { id: decodeServerId(id) },
      signal,
    });
    if (response.response?.status !== 204)
      throw new ServerTransportError("unavailable");
    if (sessions.some((s) => s.id === id && s.current)) return this.logout();
    return this.status();
  }
  async dispose() {
    this.disposed = true;
    await this.transition(async () => {
      this.account?.forget();
      this.account = null;
      this.ledgerVault = null;
      this.remoteEtag = null;
      this.remoteMarkerKnown = false;
      await this.persistSession();
      await this.profilesStore.closeAll?.();
      this.transportCleanup?.();
      this.sessionVault?.close?.();
      this.listeners.clear();
    });
  }
  private scheduleRemoteProbe() {
    if (this.disposed || this.remoteTimer) return;
    this.remoteTimer = setTimeout(() => {
      this.remoteTimer = null;
      void this.probeRemote()
        .catch(() => undefined)
        .finally(() => {
          if (!this.disposed) this.scheduleRemoteProbe();
        });
    }, 5000);
  }
  scheduleSync() {
    if (
      this.syncMode !== "automatic" ||
      this.transitioning ||
      !this.ledgerSession ||
      this.autoTimer
    )
      return;
    this.autoTimer = setTimeout(() => {
      this.autoTimer = null;
      if (this.ledgerSession) {
        const session = this.ledgerSession;
        void this.runSync(session, () => session.syncNow())
          .then(async (result) => {
            if (result.code !== "synced") return;
            const account = this.account;
            const binding = account
              ? await (await this.profilesStore.open(this.currentId)).binding()
              : null;
            if (account && binding)
              await this.acknowledgeRemoteMarker(
                account,
                binding.ledgerId,
                this.controller.signal,
              ).catch(() => undefined);
          }, () => undefined)
          .finally(() => {
            if (this.ledgerSession === session) this.emit();
          });
      }
    }, 500);
  }
}

function accountToken(account: Account): string {
  const token = account.token();
  if (!token) throw new ServerTransportError("authentication");
  return token;
}

function decodeSessionRecord(value: unknown): SessionVaultRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const record = value as Record<string, unknown>;
  const account = record.account;
  if (
    typeof account !== "object" ||
    account === null ||
    Array.isArray(account)
  )
    return null;
  const a = account as Record<string, unknown>;
  if (
    typeof a.token !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(a.token) ||
    typeof a.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(a.expiresAt)) ||
    Date.parse(a.expiresAt) <= Date.now() ||
    typeof a.username !== "string" ||
    !/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(a.username)
  )
    return null;
  let baseUrl: string;
  let instanceId: string;
  let id: string;
  try {
    baseUrl = decodeServerUrl(a.baseUrl);
    instanceId = decodeServerId(a.instanceId);
    id = decodeServerId(a.id);
  } catch {
    return null;
  }
  const ledgerValue = record.ledger;
  let ledger: SessionVaultRecord["ledger"] = null;
  if (ledgerValue !== null) {
    if (
      typeof ledgerValue !== "object" ||
      ledgerValue === null ||
      Array.isArray(ledgerValue)
    )
      return null;
    const l = ledgerValue as Record<string, unknown>;
    try {
      const profileId = decodeProfileId(l.profileId);
      const ledgerId = decodeServerId(l.ledgerId);
      if (
        profileId !== serverProfileId(instanceId, id) ||
        typeof l.passphrase !== "string" ||
        (l.remoteEtag !== null &&
          l.remoteEtag !== undefined &&
          typeof l.remoteEtag !== "string")
      )
        return null;
      validateLedgerPassword(l.passphrase);
      ledger = {
        profileId,
        ledgerId,
        passphrase: l.passphrase,
        remoteEtag: typeof l.remoteEtag === "string" ? l.remoteEtag : null,
      };
    } catch {
      return null;
    }
  }
  return {
    account: {
      token: a.token,
      expiresAt: a.expiresAt,
      baseUrl,
      instanceId,
      id,
      username: a.username,
    },
    ledger,
  };
}
