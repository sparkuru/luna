import { randomUUID } from "node:crypto";
import type { ServerDatabase } from "./database";
import { authorize, digest, type Identity } from "../auth";
import { ApiError } from "../errors";
import type {
  ObjectCondition,
  ServerObjectStore,
} from "../storage/object-store";
import { LIMITS } from "../schemas/http";

const now = () => new Date().toISOString();
export const ATTACHMENT_RESERVATION_TTL_MS = 24 * 60 * 60 * 1000;
export const ATTACHMENT_ORPHAN_GRACE_MS = 60 * 1000;
const idempotencyQueues = new WeakMap<
  ServerDatabase,
  Map<string, Promise<void>>
>();

function isExpired(leaseUntil: string | null, at = Date.now()): boolean {
  return leaseUntil !== null && (Date.parse(leaseUntil) || 0) <= at;
}

function rememberAttachmentOrphan(
  database: ServerDatabase,
  objectKey: string,
  ledgerId: string,
  attachmentId: string,
  eligibleAt: string,
  createdAt = now(),
): void {
  database.sqlite
    .prepare(
      `INSERT INTO attachment_orphans
        (object_key, ledger_id, attachment_id, eligible_at, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(object_key) DO NOTHING`,
    )
    .run(objectKey, ledgerId, attachmentId, eligibleAt, createdAt);
}

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
  return withIdempotencyLock(
    database,
    `${userId}\u0000${scope}\u0000${key}`,
    async () => {
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
    },
  );
}

async function withIdempotencyLock<T>(
  database: ServerDatabase,
  key: string,
  work: () => T | Promise<T>,
): Promise<T> {
  let queue = idempotencyQueues.get(database);
  if (queue === undefined) {
    queue = new Map();
    idempotencyQueues.set(database, queue);
  }
  const previous = queue.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  queue.set(key, current);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (queue.get(key) === current) queue.delete(key);
  }
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

export function assertLedgerPayloadVersion(
  database: ServerDatabase,
  ledgerId: string,
  payloadVersion: 1 | 2 | 3,
): void {
  const row = database.sqlite
    .prepare("SELECT min_payload_version FROM ledgers WHERE id = ?")
    .get(ledgerId) as { min_payload_version?: number } | undefined;
  if (row === undefined) throw new ApiError(404, "not-found");
  if (payloadVersion < (row.min_payload_version ?? 1))
    throw new ApiError(409, "ledger-upgrade-required");
}

interface RemoteObjectRow {
  object_key: string;
  etag: string;
  sha256: string;
  byte_length: number;
  version: number;
  updated_at: string;
}

export interface AttachmentUsageResult {
  usedBytes: number;
  reservedBytes: number;
  maxBytes: number;
  count: number;
  maxCount: number;
}

export interface AttachmentReservation {
  attachmentId: string;
  objectKey: string;
  reservationId: string | null;
  cipherSha256: string;
  byteLength: number;
  status: "reserved" | "published";
  etag: string | null;
}

interface AttachmentRow extends AttachmentReservation {
  ledgerId: string;
  leaseUntil: string | null;
}

export function getAttachmentUsage(
  database: ServerDatabase,
  ledgerId: string,
): AttachmentUsageResult {
  const current = now();
  const row = database.sqlite
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'published' THEN byte_length ELSE 0 END), 0) AS used_bytes,
         COALESCE(SUM(CASE WHEN status = 'reserved' AND reservation_id IS NOT NULL
                                AND lease_until > ? THEN byte_length ELSE 0 END), 0) AS reserved_bytes,
         COUNT(CASE WHEN status = 'published' OR
                         (status = 'reserved' AND reservation_id IS NOT NULL AND lease_until > ?)
                    THEN 1 END) AS count
       FROM attachments WHERE ledger_id = ?`,
    )
    .get(current, current, ledgerId) as {
      used_bytes: number;
      reserved_bytes: number;
      count: number;
    };
  return {
    usedBytes: row.used_bytes,
    reservedBytes: row.reserved_bytes,
    maxBytes: LIMITS.ledgerAttachmentBytes,
    count: row.count,
    maxCount: LIMITS.attachmentCount,
  };
}

export function getAccountAttachmentUsage(
  database: ServerDatabase,
  userId: string,
): AttachmentUsageResult {
  const current = now();
  const row = database.sqlite
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN a.status = 'published' THEN a.byte_length ELSE 0 END), 0) AS used_bytes,
         COALESCE(SUM(CASE WHEN a.status = 'reserved' AND a.reservation_id IS NOT NULL
                                AND a.lease_until > ? THEN a.byte_length ELSE 0 END), 0) AS reserved_bytes,
         COUNT(CASE WHEN a.status = 'published' OR
                         (a.status = 'reserved' AND a.reservation_id IS NOT NULL AND a.lease_until > ?)
                    THEN 1 END) AS count
       FROM attachments a JOIN ledgers l ON l.id = a.ledger_id
       WHERE l.owner_user_id = ?`,
    )
    .get(current, current, userId) as {
      used_bytes: number;
      reserved_bytes: number;
      count: number;
    };
  return {
    usedBytes: row.used_bytes,
    reservedBytes: row.reserved_bytes,
    maxBytes: LIMITS.accountAttachmentBytes,
    count: row.count,
    maxCount: LIMITS.attachmentCount,
  };
}

/** Reserve quota without holding the process mutex across the object-store PUT. */
export function reserveAttachment(
  database: ServerDatabase,
  userId: string,
  ledgerId: string,
  attachmentId: string,
  cipherSha256: string,
  byteLength: number,
): AttachmentReservation {
  const existing = database.sqlite
    .prepare(
      `SELECT ledger_id AS ledgerId, attachment_id AS attachmentId, object_key AS objectKey,
              reservation_id AS reservationId, cipher_sha256 AS cipherSha256,
              byte_length AS byteLength, status, etag, lease_until AS leaseUntil
       FROM attachments WHERE ledger_id = ? AND attachment_id = ?`,
    )
    .get(ledgerId, attachmentId) as AttachmentRow | undefined;
  if (existing !== undefined) {
    if (
      existing.cipherSha256 !== cipherSha256 ||
      existing.byteLength !== byteLength
    )
      throw new ApiError(409, "attachment-conflict");
    if (
      existing.status === "reserved" &&
      (existing.reservationId === null || isExpired(existing.leaseUntil))
    ) {
      // Fence a stale upload with a fresh generation. The old physical key is
      // recorded before the pointer changes so a late PUT can be removed by a
      // later exact-key reconcile and can never finalize this row.
      const reservationId = randomUUID();
      const objectKey = `attachments/v1/${ledgerId}/${attachmentId}/${reservationId}`;
      const timestamp = now();
      const leaseUntil = new Date(
        Date.now() + ATTACHMENT_RESERVATION_TTL_MS,
      ).toISOString();
      rememberAttachmentOrphan(
        database,
        existing.objectKey,
        ledgerId,
        attachmentId,
        new Date(Date.now() + ATTACHMENT_ORPHAN_GRACE_MS).toISOString(),
        timestamp,
      );
      const result =
        existing.reservationId === null
          ? database.sqlite
              .prepare(
                `UPDATE attachments
                 SET object_key = ?, reservation_id = ?, lease_until = ?, etag = NULL,
                     updated_at = ?
                 WHERE ledger_id = ? AND attachment_id = ? AND status = 'reserved'
                   AND reservation_id IS NULL`,
              )
              .run(
                objectKey,
                reservationId,
                leaseUntil,
                timestamp,
                ledgerId,
                attachmentId,
              )
          : database.sqlite
              .prepare(
                `UPDATE attachments
                 SET object_key = ?, reservation_id = ?, lease_until = ?, etag = NULL,
                     updated_at = ?
                 WHERE ledger_id = ? AND attachment_id = ? AND status = 'reserved'
                   AND reservation_id = ?`,
              )
              .run(
                objectKey,
                reservationId,
                leaseUntil,
                timestamp,
                ledgerId,
                attachmentId,
                existing.reservationId,
              );
      if (result.changes !== 1) throw new ApiError(409, "attachment-conflict");
      return {
        attachmentId,
        objectKey,
        reservationId,
        cipherSha256,
        byteLength,
        status: "reserved",
        etag: null,
      };
    }
    return existing;
  }
  const ledger = getAttachmentUsage(database, ledgerId);
  const account = getAccountAttachmentUsage(database, userId);
  if (
    ledger.usedBytes + ledger.reservedBytes + byteLength > ledger.maxBytes ||
    ledger.count + 1 > ledger.maxCount ||
    account.usedBytes + account.reservedBytes + byteLength > account.maxBytes ||
    account.count + 1 > account.maxCount
  )
    throw new ApiError(409, "attachment-quota-exceeded");
  const reservationId = randomUUID();
  const objectKey = `attachments/v1/${ledgerId}/${attachmentId}/${reservationId}`;
  const timestamp = now();
  database.sqlite
    .prepare(
      `INSERT INTO attachments
        (ledger_id, attachment_id, object_key, cipher_sha256, byte_length, status,
         reservation_id, lease_until, etag, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?, NULL, ?, ?)`,
    )
    .run(
      ledgerId,
      attachmentId,
      objectKey,
      cipherSha256,
      byteLength,
      reservationId,
      new Date(Date.now() + ATTACHMENT_RESERVATION_TTL_MS).toISOString(),
      timestamp,
      timestamp,
    );
  return {
    attachmentId,
    objectKey,
    reservationId,
    cipherSha256,
    byteLength,
    status: "reserved",
    etag: null,
  };
}

export function publishAttachment(
  database: ServerDatabase,
  userId: string,
  ledgerId: string,
  reservationId: string,
  etag: string,
): AttachmentReservation {
  requireLedger(database, userId, ledgerId);
  const current = database.sqlite
    .prepare(
      `SELECT ledger_id AS ledgerId, attachment_id AS attachmentId, object_key AS objectKey,
              reservation_id AS reservationId, cipher_sha256 AS cipherSha256,
              byte_length AS byteLength, status, etag, lease_until AS leaseUntil
       FROM attachments WHERE ledger_id = ? AND reservation_id = ?`,
    )
    .get(ledgerId, reservationId) as AttachmentRow | undefined;
  if (current === undefined) throw new ApiError(409, "attachment-reservation-expired");
  if (current.status === "published") return current;
  if (isExpired(current.leaseUntil))
    throw new ApiError(409, "attachment-reservation-expired");
  const result = database.sqlite
    .prepare(
      `UPDATE attachments SET status = 'published', reservation_id = NULL,
         lease_until = NULL, etag = ?, updated_at = ?
       WHERE ledger_id = ? AND attachment_id = ? AND status = 'reserved' AND reservation_id = ?`,
    )
    .run(etag, now(), ledgerId, current.attachmentId, reservationId);
  if (result.changes !== 1)
    throw new ApiError(409, "attachment-reservation-expired");
  return {
    ...current,
    status: "published",
    reservationId: "",
    etag,
  };
}

function readAttachmentRow(
  database: ServerDatabase,
  ledgerId: string,
  attachmentId: string,
): AttachmentRow {
  const row = database.sqlite
    .prepare(
      `SELECT ledger_id AS ledgerId, attachment_id AS attachmentId, object_key AS objectKey,
              reservation_id AS reservationId, cipher_sha256 AS cipherSha256,
              byte_length AS byteLength, status, etag, lease_until AS leaseUntil
       FROM attachments WHERE ledger_id = ? AND attachment_id = ? AND status = 'published'`,
    )
    .get(ledgerId, attachmentId) as AttachmentRow | undefined;
  if (row === undefined) throw new ApiError(404, "attachment-not-found");
  return row;
}

export async function getAttachment(
  database: ServerDatabase,
  objectStore: ServerObjectStore,
  ledgerId: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<{ body: Buffer; etag: string; sha256: string; byteLength: number }> {
  const row = readAttachmentRow(database, ledgerId, attachmentId);
  const object = await objectStore.get(row.objectKey, signal);
  if (
    object === null ||
    object.etag !== row.etag ||
    object.body.byteLength !== row.byteLength ||
    digest(object.body) !== row.cipherSha256
  )
    throw new ApiError(503, "attachment-unavailable", true);
  return {
    body: object.body,
    etag: object.etag,
    sha256: row.cipherSha256,
    byteLength: row.byteLength,
  };
}

export async function headAttachment(
  database: ServerDatabase,
  objectStore: ServerObjectStore,
  ledgerId: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<{ etag: string; sha256: string; byteLength: number }> {
  const row = readAttachmentRow(database, ledgerId, attachmentId);
  // A HEAD response has no body digest. Read the bounded ciphertext through
  // the same integrity gate as GET so a same-length damaged object cannot be
  // reported healthy merely because its storage metadata still exists.
  const object = await objectStore.get(row.objectKey, signal);
  if (
    object === null ||
    object.etag !== row.etag ||
    object.body.byteLength !== row.byteLength ||
    digest(object.body) !== row.cipherSha256
  )
    throw new ApiError(503, "attachment-unavailable", true);
  return { etag: object.etag, sha256: row.cipherSha256, byteLength: object.body.byteLength };
}

export async function repairAttachment(
  database: ServerDatabase,
  objectStore: ServerObjectStore,
  ledgerId: string,
  attachmentId: string,
  body: Buffer,
  cipherSha256: string,
  observedEtag: string,
  signal?: AbortSignal,
  authorizeAtCommit?: () => void,
): Promise<{ etag: string; sha256: string; byteLength: number }> {
  const row = readAttachmentRow(database, ledgerId, attachmentId);
  if (row.etag !== observedEtag) throw new ApiError(412, "precondition-failed");
  if (row.cipherSha256 !== cipherSha256 || row.byteLength !== body.byteLength)
    throw new ApiError(409, "attachment-conflict");
  if (digest(body) !== cipherSha256)
    throw new ApiError(400, "invalid-input");
  const current = await objectStore.get(row.objectKey, signal);
  if (
    current !== null &&
    current.body.byteLength === body.byteLength &&
    digest(current.body) === cipherSha256
  )
    return { etag: current.etag, sha256: cipherSha256, byteLength: body.byteLength };
  const replacementKey = `${row.objectKey}/repair-${randomUUID()}`;
  const stored = await objectStore.putImmutable(replacementKey, body, signal);
  try {
    const timestamp = now();
    const result = await database.writes.runExclusive(() =>
      database.transaction(() => {
        authorizeAtCommit?.();
        const updated = database.sqlite
          .prepare(
            `UPDATE attachments SET object_key = ?, etag = ?, updated_at = ?
             WHERE ledger_id = ? AND attachment_id = ? AND status = 'published' AND etag = ?`,
          )
          .run(replacementKey, stored.etag, timestamp, ledgerId, attachmentId, observedEtag);
        if (updated.changes === 1) {
          rememberAttachmentOrphan(
            database,
            row.objectKey,
            ledgerId,
            attachmentId,
            timestamp,
            timestamp,
          );
        }
        return updated;
      }),
    );
    if (result.changes !== 1) throw new ApiError(412, "precondition-failed");
    return { etag: stored.etag, sha256: cipherSha256, byteLength: body.byteLength };
  } catch (error) {
    // A failed CAS leaves the replacement unreferenced. Remove it now; if
    // storage is unavailable, retain an exact-key orphan for admin reconcile.
    try {
      await objectStore.remove(replacementKey);
    } catch {
      try {
        database.transaction(() =>
          rememberAttachmentOrphan(
            database,
            replacementKey,
            ledgerId,
            attachmentId,
            now(),
          ),
        );
      } catch {
        // Preserve the original request error; the physical object remains
        // bounded to this random repair generation for later operator action.
      }
    }
    throw error;
  }
}

interface ExpiredAttachmentRow {
  ledgerId: string;
  attachmentId: string;
  objectKey: string;
  reservationId: string;
  leaseUntil: string | null;
}

interface AttachmentOrphanRow {
  objectKey: string;
  ledgerId: string;
  attachmentId: string;
}

export interface AttachmentReconcileResult {
  revokedReservations: number;
  candidates: number;
  removed: number;
  skippedPublished: number;
  failed: number;
}

/**
 * Revoke expired reservation generations, then remove only exact physical
 * keys that are no longer published. Orphan rows intentionally remain so a
 * canceled upload that finishes after the first sweep is caught next time.
 */
export async function reconcileAttachmentOrphans(
  database: ServerDatabase,
  objectStore: ServerObjectStore,
  at = new Date(),
): Promise<AttachmentReconcileResult> {
  const atMs = at.getTime();
  const timestamp = at.toISOString();
  const eligibleAt = new Date(
    atMs + ATTACHMENT_ORPHAN_GRACE_MS,
  ).toISOString();
  const revokedReservations = database.transaction(() => {
    const rows = database.sqlite
      .prepare(
        `SELECT ledger_id AS ledgerId, attachment_id AS attachmentId,
                object_key AS objectKey, reservation_id AS reservationId,
                lease_until AS leaseUntil
         FROM attachments
         WHERE status = 'reserved' AND reservation_id IS NOT NULL`,
      )
      .all() as ExpiredAttachmentRow[];
    let revoked = 0;
    for (const row of rows) {
      if (!isExpired(row.leaseUntil, atMs)) continue;
      rememberAttachmentOrphan(
        database,
        row.objectKey,
        row.ledgerId,
        row.attachmentId,
        eligibleAt,
        timestamp,
      );
      const result = database.sqlite
        .prepare(
          `UPDATE attachments
           SET reservation_id = NULL, lease_until = NULL, etag = NULL,
               updated_at = ?
           WHERE ledger_id = ? AND attachment_id = ? AND status = 'reserved'
             AND reservation_id = ?`,
        )
        .run(timestamp, row.ledgerId, row.attachmentId, row.reservationId);
      revoked += result.changes;
    }
    return revoked;
  });

  const candidates = database.sqlite
    .prepare(
      `SELECT object_key AS objectKey, ledger_id AS ledgerId,
              attachment_id AS attachmentId
       FROM attachment_orphans
       WHERE eligible_at <= ?
       ORDER BY eligible_at, object_key`,
    )
    .all(timestamp) as AttachmentOrphanRow[];
  let removed = 0;
  let skippedPublished = 0;
  let failed = 0;
  for (const orphan of candidates) {
    const published = database.sqlite
      .prepare(
        "SELECT 1 FROM attachments WHERE object_key = ? AND status = 'published' LIMIT 1",
      )
      .get(orphan.objectKey);
    if (published !== undefined) {
      skippedPublished++;
      continue;
    }
    try {
      await objectStore.remove(orphan.objectKey);
      database.sqlite
        .prepare("UPDATE attachment_orphans SET last_swept_at = ? WHERE object_key = ?")
        .run(timestamp, orphan.objectKey);
      removed++;
    } catch {
      failed++;
    }
  }
  return {
    revokedReservations,
    candidates: candidates.length,
    removed,
    skippedPublished,
    failed,
  };
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
  payloadVersion?: 1 | 2 | 3,
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
    if (!preferences && payloadVersion !== undefined) {
      const ledger = database.sqlite
        .prepare("SELECT min_payload_version FROM ledgers WHERE id = ?")
        .get(id) as { min_payload_version: number } | undefined;
      if (ledger === undefined) throw new ApiError(404, "not-found");
      if (payloadVersion < ledger.min_payload_version)
        throw new ApiError(409, "ledger-upgrade-required");
      if (payloadVersion > ledger.min_payload_version)
        database.sqlite
          .prepare(
            "UPDATE ledgers SET min_payload_version = ? WHERE id = ? AND min_payload_version < ?",
          )
          .run(payloadVersion, id, payloadVersion);
    }
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
