import { LedgerSessionError } from "../shared/ledger-session";
import type { StateChange, StateStore } from "./browser-state-store";

interface WorkerState {
  raw: string | null;
  metadata: string | null;
}

type WorkerRequest =
  | { id: number; op: "init"; name: string }
  | { id: number; op: "read" }
  | {
      id: number;
      op: "commit";
      expectedRaw: string | null;
      expectedMetadata: string | null;
      raw?: string;
      metadata?: string;
    }
  | { id: number; op: "delete" }
  | { id: number; op: "close" };

type WorkerOperation =
  | { op: "init"; name: string }
  | { op: "read" }
  | {
      op: "commit";
      expectedRaw: string | null;
      expectedMetadata: string | null;
      raw?: string;
      metadata?: string;
    }
  | { op: "delete" }
  | { op: "close" };

type WorkerReply =
  | { id: number; ok: true; raw: string | null; metadata: string | null }
  | { id: number; ok: true }
  | { id: number; ok: false; error: string };

interface Pending {
  resolve(value: unknown): void;
  reject(error: unknown): void;
  cancel: () => void;
  signal?: AbortSignal;
}

/** SQLite-WASM + OPFS worker-backed state store used by Web and Android. */
export class SqliteWasmStateStore implements StateStore {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private closed = false;

  constructor(databaseName: string) {
    if (typeof Worker === "undefined")
      throw new Error("LUNA_ERROR:sqlite-worker-unavailable");
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(databaseName))
      throw new Error("LUNA_ERROR:sqlite-invalid-name");
    this.worker = new Worker(
      new URL("./sqlite-wasm.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      const pending = this.pending.get(reply.id);
      if (!pending) return;
      this.pending.delete(reply.id);
      pending.signal?.removeEventListener("abort", pending.cancel);
      if (!reply.ok) pending.reject(new Error(normalizeError(reply.error)));
      else if ("raw" in reply)
        pending.resolve({ raw: reply.raw, metadata: reply.metadata });
      else pending.resolve(undefined);
    };
    this.worker.onerror = () => {
      const error = new Error("LUNA_ERROR:sqlite-worker-failed");
      for (const [id, pending] of this.pending) {
        this.pending.delete(id);
        pending.signal?.removeEventListener("abort", pending.cancel);
        pending.reject(error);
      }
    };
    void this.rpc({ op: "init", name: databaseName }).catch(() => undefined);
  }

  async read(): Promise<string | null> {
    return (await this.rpc({ op: "read" })).raw;
  }

  async metadata(): Promise<string | null> {
    return (await this.rpc({ op: "read" })).metadata;
  }

  async update<T>(
    change: (raw: string | null) => { result: T; value: string },
    signal?: AbortSignal,
  ): Promise<T> {
    return this.updateWithMetadata((raw) => {
      const next = change(raw);
      return { result: next.result, value: next.value };
    }, signal);
  }

  async updateWithMetadata<T>(
    change: (raw: string | null, metadata: string | null) => StateChange<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      assertNotCancelled(signal);
      const current = await this.rpc({ op: "read" }, signal);
      const next = change(current.raw, current.metadata);
      assertNotCancelled(signal);
      try {
        await this.rpc(
          {
            op: "commit",
            expectedRaw: current.raw,
            expectedMetadata: current.metadata,
            ...(next.value === undefined ? {} : { raw: next.value }),
            ...(next.metadata === undefined ? {} : { metadata: next.metadata }),
          },
          signal,
        );
        assertNotCancelled(signal);
        return next.result;
      } catch (error) {
        if (error instanceof Error && error.message === "LUNA_ERROR:sqlite-write-conflict")
          continue;
        throw error;
      }
    }
    throw new Error("LUNA_ERROR:sqlite-write-busy");
  }

  async close(): Promise<void> {
    if (this.closed) return;
    try {
      await this.rpc({ op: "close" });
    } finally {
      this.closed = true;
      this.worker.terminate();
      for (const pending of this.pending.values())
        pending.reject(new Error("LUNA_ERROR:sqlite-worker-closed"));
      this.pending.clear();
    }
  }

  async destroy(): Promise<void> {
    if (this.closed) return;
    try {
      await this.rpc({ op: "delete" });
    } finally {
      this.closed = true;
      this.worker.terminate();
      for (const pending of this.pending.values())
        pending.reject(new Error("LUNA_ERROR:sqlite-worker-closed"));
      this.pending.clear();
    }
  }

  private rpc(operation: { op: "read" }, signal?: AbortSignal): Promise<WorkerState>;
  private rpc(operation: { op: "init"; name: string }, signal?: AbortSignal): Promise<void>;
  private rpc(
    operation:
      | {
          op: "commit";
          expectedRaw: string | null;
          expectedMetadata: string | null;
          raw?: string;
          metadata?: string;
        }
      | { op: "delete" }
      | { op: "close" },
    signal?: AbortSignal,
  ): Promise<void>;
  private rpc(
    operation: WorkerOperation,
    signal?: AbortSignal,
  ): Promise<WorkerState | void> {
    if (this.closed) return Promise.reject(new Error("LUNA_ERROR:sqlite-closed"));
    const id = this.nextId++;
    const request = { id, ...operation } as WorkerRequest;
    return new Promise((resolve, reject) => {
      const cancel = () => {
        this.pending.delete(id);
        reject(new LedgerSessionError("ledger-sync-cancelled"));
      };
      this.pending.set(id, {
        resolve,
        reject,
        cancel,
        ...(signal ? { signal } : {}),
      });
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
      else this.worker.postMessage(request);
    });
  }
}

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new LedgerSessionError("ledger-sync-cancelled");
}

function normalizeError(value: string): string {
  return value.startsWith("LUNA_ERROR:") ? value : `LUNA_ERROR:${value}`;
}
