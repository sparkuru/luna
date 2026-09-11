import type { SessionVault, SessionVaultRecord } from "../sync/session-vault";

type RequestMessage =
  | { id: number; operation: "load" }
  | { id: number; operation: "save"; record: SessionVaultRecord }
  | { id: number; operation: "clear" };
type ResponseMessage = {
  id: number;
  ok: true;
  record?: SessionVaultRecord | null;
} | {
  id: number;
  ok: false;
};

const TAB_SESSION_KEY = "luna.session.v1";

/**
 * Keep account tokens and ledger passphrases available for this browser tab.
 * sessionStorage survives a normal reload, but is discarded when the tab is
 * closed and is never used as the ledger/catalog store. It is deliberately a
 * fallback for runtimes where a SharedWorker is not available or is reaped
 * while the last page is reloading.
 */
export class TabSessionVault implements SessionVault {
  constructor(
    private readonly storage: Storage,
    private readonly key = TAB_SESSION_KEY,
  ) {}

  async load(): Promise<SessionVaultRecord | null> {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as SessionVaultRecord;
    } catch {
      this.storage.removeItem(this.key);
      return null;
    }
  }

  async save(record: SessionVaultRecord): Promise<void> {
    this.storage.setItem(this.key, JSON.stringify(record));
  }

  async clear(): Promise<void> {
    this.storage.removeItem(this.key);
  }
}

/**
 * Prefer the SharedWorker for same-origin tabs, while mirroring the current
 * tab's session so a worker lifetime gap cannot log the user out on reload.
 */
export class HybridSessionVault implements SessionVault {
  constructor(
    private readonly tab: SessionVault | undefined,
    private readonly worker: SessionVault | undefined,
  ) {}

  async load(): Promise<SessionVaultRecord | null> {
    const tabRecord = await this.tab?.load().catch(() => null);
    if (tabRecord) {
      await this.worker?.save(tabRecord).catch(() => undefined);
      return tabRecord;
    }
    const workerRecord = await this.worker?.load().catch(() => null);
    if (workerRecord)
      await this.tab?.save(workerRecord).catch(() => undefined);
    return workerRecord ?? null;
  }

  async save(record: SessionVaultRecord): Promise<void> {
    await Promise.all([
      this.tab?.save(record).catch(() => undefined),
      this.worker?.save(record).catch(() => undefined),
    ]);
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.tab?.clear().catch(() => undefined),
      this.worker?.clear().catch(() => undefined),
    ]);
  }

  close(): void {
    this.worker?.close?.();
  }
}

export class SharedWorkerSessionVault implements SessionVault {
  private readonly worker: SharedWorker;
  private readonly pending = new Map<
    number,
    { resolve: (record: SessionVaultRecord | null) => void; reject: (error: unknown) => void }
  >();
  private nextId = 0;

  constructor(
    worker = new SharedWorker(
      new URL("./session-vault.worker.ts", import.meta.url),
      { type: "module", name: "luna-session-vault" },
    ),
  ) {
    this.worker = worker;
    this.worker.port.onmessage = (event: MessageEvent<ResponseMessage>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (!response.ok) pending.reject(new Error("LUNA_ERROR:session-vault"));
      else pending.resolve(response.record ?? null);
    };
    this.worker.port.start();
  }

  load(): Promise<SessionVaultRecord | null> {
    return this.request({ id: this.id(), operation: "load" });
  }

  async save(record: SessionVaultRecord): Promise<void> {
    await this.request({ id: this.id(), operation: "save", record });
  }

  async clear(): Promise<void> {
    await this.request({ id: this.id(), operation: "clear" });
  }

  close(): void {
    this.worker.port.close();
    for (const pending of this.pending.values())
      pending.reject(new Error("LUNA_ERROR:session-vault-closed"));
    this.pending.clear();
  }

  private id(): number {
    this.nextId = (this.nextId + 1) % Number.MAX_SAFE_INTEGER;
    return this.nextId;
  }

  private request(
    message: RequestMessage,
  ): Promise<SessionVaultRecord | null> {
    return new Promise<SessionVaultRecord | null>((resolve, reject) => {
      this.pending.set(message.id, { resolve, reject });
      try {
        this.worker.port.postMessage(message);
      } catch (error) {
        this.pending.delete(message.id);
        reject(error);
      }
    });
  }
}

export function createWebSessionVault(): SessionVault | undefined {
  if (typeof window === "undefined") return undefined;
  const tabStorage = safeSessionStorage();
  const tab = tabStorage ? new TabSessionVault(tabStorage) : undefined;
  let worker: SessionVault | undefined;
  if (typeof SharedWorker !== "undefined") {
    try {
      worker = new SharedWorkerSessionVault();
    } catch {
      // Some embedded WebViews expose the name but disallow module workers.
    }
  }
  if (!tab && !worker) return undefined;
  return new HybridSessionVault(tab, worker);
}

function safeSessionStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}
