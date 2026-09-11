import { randomUUID } from "node:crypto";
import type { ServerDatabase } from "./database";
import { authorize, digest, type Identity } from "../auth";
import { ApiError } from "../errors";
import type {
  ObjectCondition,
  ServerObjectStore,
} from "../storage/object-store";

const now = () => new Date().toISOString();

/**
 * Run an authorized request.  Writes are serialized for this single API
 * instance, so authorization, CAS and idempotency observe one ordering.
 */
export async function transaction<T>(
  database: ServerDatabase,
  token: string | undefined,
  work: (database: ServerDatabase, identity: Identity) => T | Promise<T>,
  exclusive = false,
): Promise<T> {
  const run = async () => {
    const identity = authorize(database, token);
    return await work(database, identity);
  };
  if (!exclusive) return run();
  return database.writes.runExclusive(run);
}

export interface StoredResult {
  status: number;
  body: Record<string, unknown>;
  etag?: string;
}

export async function idempotent(
  database: ServerDatabase,
  userId: string,
  scope: string,
  key: string,
  hash: string,
  work: () => StoredResult | Promise<StoredResult>,
): Promise<StoredResult> {
  const old = database.sqlite
    .prepare(
      `SELECT request_hash, status, result_json
       FROM idempotency_records
       WHERE user_id = ? AND operation_scope = ? AND key = ? AND expires_at > ?`,
    )
    .get(userId, scope, key, now()) as
    | { request_hash: string; status: number; result_json: string }
    | undefined;
  if (old) {
    if (old.request_hash !== hash)
      throw new ApiError(409, "idempotency-conflict");
    return JSON.parse(old.result_json) as StoredResult;
  }
  const result = await work();
  database.sqlite
    .prepare(
      `INSERT INTO idempotency_records
        (user_id, operation_scope, key, request_hash, status, result_json, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, operation_scope, key) DO UPDATE SET
         request_hash = excluded.request_hash,
         status = excluded.status,
         result_json = excluded.result_json,
         expires_at = excluded.expires_at`,
    )
    .run(
      userId,
      scope,
      key,
      hash,
      result.status,
      JSON.stringify(result),
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    );
  return result;
}

export function requireLedger(
  database: ServerDatabase,
  userId: string,
  id: string,
): void {
  const row = database.sqlite
    .prepare("SELECT id FROM ledgers WHERE id = ? AND owner_user_id = ?")
    .get(id, userId);
  if (!row) throw new ApiError(404, "not-found");
}

interface RemoteObjectRow {
  object_key: string;
  etag: string;
  sha256: string;
  byte_length: number;
  version: number;
  updated_at: string;
}

/** Return only safe synchronization metadata; never reads or exposes the encrypted body. */
export function getObjectStatus(
  database: ServerDatabase,
  id: string,
  preferences: boolean,
): { etag: string; version: number; updatedAt: string } {
  const row = database.sqlite
    .prepare(
      `SELECT etag, version, updated_at FROM remote_objects
       WHERE object_kind = ? AND owner_id = ?`,
    )
    .get(preferences ? "preference" : "ledger", id) as
    | Pick<RemoteObjectRow, "etag" | "version" | "updated_at">
    | undefined;
  if (!row) throw new ApiError(404, "object-not-found");
  return { etag: row.etag, version: row.version, updatedAt: row.updated_at };
}

export async function getObject(
  database: ServerDatabase,
  objectStore: ServerObjectStore,
  id: string,
  preferences: boolean,
  signal?: AbortSignal,
): Promise<{ body: Buffer; etag: string }> {
  const row = database.sqlite
    .prepare(
      `SELECT object_key, etag, sha256, byte_length FROM remote_objects
       WHERE object_kind = ? AND owner_id = ?`,
    )
    .get(preferences ? "preference" : "ledger", id) as
    | RemoteObjectRow
    | undefined;
  if (!row) throw new ApiError(404, "object-not-found");
  const object = await objectStore.get(row.object_key, signal);
  if (!object || object.etag !== row.etag || object.body.byteLength !== row.byte_length || digest(object.body) !== row.sha256)
    throw new ApiError(503, "unavailable", true);
  return object;
}

export async function putObject(
  database: ServerDatabase,
  objectStore: ServerObjectStore,
  id: string,
  preferences: boolean,
  body: Buffer,
  condition: ObjectCondition,
  signal?: AbortSignal,
): Promise<StoredResult> {
  const kind = preferences ? "preference" : "ledger";
  const old = database.sqlite
    .prepare(
      "SELECT object_key, etag, version FROM remote_objects WHERE object_kind = ? AND owner_id = ?",
    )
    .get(kind, id) as
    | { object_key: string; etag: string; version: number }
    | undefined;
  if (("ifNoneMatch" in condition && old) || ("ifMatch" in condition && old?.etag !== condition.ifMatch))
    throw new ApiError(412, "precondition-failed");

  const objectKey = old?.object_key ?? `${kind}/${id}/v1.enc.json`;
  let stored: { etag: string };
  try {
    stored = await objectStore.put(objectKey, body, condition, signal);
  } catch (error) {
    if (statusOf(error) === 412 || error instanceof ApiError)
      throw error instanceof ApiError
        ? error
        : new ApiError(412, "precondition-failed");
    throw error;
  }
  const etag = stored.etag;
  database.transaction(() => {
    database.sqlite
      .prepare(
        `INSERT INTO remote_objects
          (object_kind, owner_id, object_key, version, etag, sha256, byte_length, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(object_kind, owner_id) DO UPDATE SET
           object_key = excluded.object_key,
           version = excluded.version,
           etag = excluded.etag,
           sha256 = excluded.sha256,
           byte_length = excluded.byte_length,
           updated_at = excluded.updated_at`,
      )
      .run(
        kind,
        id,
        objectKey,
        old?.version === undefined ? 1 : old.version + 1,
        etag,
        digest(body),
        body.byteLength,
        now(),
      );
  });
  return { status: 200, body: { etag }, etag };
}

export function recordSecurityEvent(
  database: ServerDatabase,
  event: {
    actorId?: string;
    action: string;
    targetId?: string;
    result: string;
    requestId?: string;
  },
): void {
  database.sqlite
    .prepare(
      `INSERT INTO security_events(created_at, actor_id, action, target_id, result, request_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      now(),
      event.actorId ?? null,
      event.action,
      event.targetId ?? null,
      event.result,
      event.requestId ?? null,
    );
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : undefined;
}

export function newId(): string {
  return randomUUID();
}
