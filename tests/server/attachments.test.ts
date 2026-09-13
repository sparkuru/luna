import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../../src/server/app";
import { setAccount } from "../../src/server/auth";
import { ApiError } from "../../src/server/errors";
import {
  ATTACHMENT_ORPHAN_GRACE_MS,
  publishAttachment,
  reconcileAttachmentOrphans,
  reserveAttachment,
} from "../../src/server/db/operations";
import { MemoryServerObjectStore } from "../../src/server/storage/object-store";
import { openTestDatabase } from "./support";

function digest(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

class FailFirstImmutableStore extends MemoryServerObjectStore {
  private failed = false;

  override async putImmutable(key: string, body: Buffer, signal?: AbortSignal) {
    if (!this.failed) {
      this.failed = true;
      throw new Error("fixture-upload-failed");
    }
    signal?.throwIfAborted();
    return super.putImmutable(key, body);
  }
}

class GateFirstImmutableStore extends MemoryServerObjectStore {
  readonly firstPutEntered: Promise<void>;
  private resolveFirstPut!: () => void;
  private releaseFirstPut!: () => void;
  private first = true;

  constructor() {
    super();
    this.firstPutEntered = new Promise((resolve) => {
      this.resolveFirstPut = resolve;
    });
    this.firstPutGate = new Promise((resolve) => {
      this.releaseFirstPut = resolve;
    });
  }

  private readonly firstPutGate: Promise<void>;

  release(): void {
    this.releaseFirstPut();
  }

  override async putImmutable(key: string, body: Buffer, signal?: AbortSignal) {
    if (this.first) {
      this.first = false;
      this.resolveFirstPut();
      await this.firstPutGate;
    }
    signal?.throwIfAborted();
    return super.putImmutable(key, body);
  }
}

test("attachment HTTP objects are immutable, scoped, quota-accounted, and idempotent", async () => {
  const database = await openTestDatabase();
  const objectStore = new FailFirstImmutableStore();
  const app = await createApp({
    database,
    objectStore,
    origins: ["https://luna.example"],
  });
  const username = `attachment_${randomUUID().slice(0, 8)}`;
  const password = "attachment-fixture-password";
  await setAccount(database, username, password);
  try {
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/sessions",
      payload: { username, password, deviceLabel: "attachment-test" },
    });
    assert.equal(login.statusCode, 201, login.body);
    const token = login.json().token as string;
    const authorization = `Bearer ${token}`;
    const ledger = await app.inject({
      method: "POST",
      url: "/api/v1/ledgers",
      headers: { authorization, "idempotency-key": randomUUID() },
      payload: {},
    });
    assert.equal(ledger.statusCode, 201, ledger.body);
    const ledgerId = ledger.json().id as string;
    const attachmentId = randomUUID();
    const bytes = Buffer.from("synthetic-encrypted-attachment");
    const headers = {
      authorization,
      "content-type": "application/octet-stream",
      "if-none-match": "*",
      "idempotency-key": randomUUID(),
      "x-luna-cipher-sha256": digest(bytes),
    };
    const usageBefore = await app.inject({
      url: `/api/v1/ledgers/${ledgerId}/attachments/usage`,
      headers: { authorization, origin: "https://luna.example" },
    });
    assert.equal(usageBefore.statusCode, 200, usageBefore.body);
    assert.equal(
      usageBefore.headers["access-control-expose-headers"],
      "ETag, Content-Length, Retry-After, X-Request-Id, X-Luna-Cipher-SHA256",
    );
    assert.deepEqual(usageBefore.json(), {
      usedBytes: 0,
      reservedBytes: 0,
      maxBytes: 512 * 1024 * 1024,
      count: 0,
      maxCount: 10_000,
      accountUsedBytes: 0,
      accountReservedBytes: 0,
      accountMaxBytes: 2 * 1024 * 1024 * 1024,
    });

    const abandonedId = randomUUID();
    const abandonedHeaders = {
      ...headers,
      "idempotency-key": randomUUID(),
    };
    const abandoned = await app.inject({
      method: "PUT",
      url: `/api/v1/ledgers/${ledgerId}/attachments/${abandonedId}`,
      headers: abandonedHeaders,
      payload: bytes,
    });
    assert.equal(abandoned.statusCode, 503, abandoned.body);
    const abandonedRow = database.sqlite
      .prepare(
        "SELECT object_key, reservation_id FROM attachments WHERE ledger_id = ? AND attachment_id = ?",
      )
      .get(ledgerId, abandonedId) as { object_key: string; reservation_id: string };
    database.sqlite
      .prepare("UPDATE attachments SET lease_until = ? WHERE ledger_id = ? AND attachment_id = ?")
      .run(new Date(0).toISOString(), ledgerId, abandonedId);
    const retry = await app.inject({
      method: "PUT",
      url: `/api/v1/ledgers/${ledgerId}/attachments/${abandonedId}`,
      headers: { ...abandonedHeaders, "idempotency-key": randomUUID() },
      payload: bytes,
    });
    assert.equal(retry.statusCode, 200, retry.body);
    const retriedRow = database.sqlite
      .prepare(
        "SELECT object_key, reservation_id, status FROM attachments WHERE ledger_id = ? AND attachment_id = ?",
      )
      .get(ledgerId, abandonedId) as { object_key: string; reservation_id: string | null; status: string };
    assert.notEqual(retriedRow.object_key, abandonedRow.object_key);
    assert.equal(retriedRow.reservation_id, null);
    assert.equal(retriedRow.status, "published");

    const written = await app.inject({
      method: "PUT",
      url: `/api/v1/ledgers/${ledgerId}/attachments/${attachmentId}`,
      headers,
      payload: bytes,
    });
    assert.equal(written.statusCode, 200, written.body);
    assert.ok(written.headers.etag);

    const replay = await app.inject({
      method: "PUT",
      url: `/api/v1/ledgers/${ledgerId}/attachments/${attachmentId}`,
      headers,
      payload: bytes,
    });
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(replay.headers.etag, written.headers.etag);

    const sameBytes = await app.inject({
      method: "PUT",
      url: `/api/v1/ledgers/${ledgerId}/attachments/${attachmentId}`,
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: bytes,
    });
    assert.equal(sameBytes.statusCode, 200, sameBytes.body);
    assert.equal(sameBytes.headers.etag, written.headers.etag);

    const differentBytes = Buffer.from("different-encrypted-attachment");
    const collision = await app.inject({
      method: "PUT",
      url: `/api/v1/ledgers/${ledgerId}/attachments/${attachmentId}`,
      headers: {
        ...headers,
        "idempotency-key": randomUUID(),
        "x-luna-cipher-sha256": digest(differentBytes),
      },
      payload: differentBytes,
    });
    assert.equal(collision.statusCode, 409, collision.body);

    const wrongDigestId = randomUUID();
    const wrongDigest = await app.inject({
      method: "PUT",
      url: `/api/v1/ledgers/${ledgerId}/attachments/${wrongDigestId}`,
      headers: {
        ...headers,
        "idempotency-key": randomUUID(),
        "x-luna-cipher-sha256": digest(differentBytes),
      },
      payload: bytes,
    });
    assert.equal(wrongDigest.statusCode, 400, wrongDigest.body);
    const wrongDigestRow = database.sqlite
      .prepare(
        "SELECT attachment_id FROM attachments WHERE ledger_id = ? AND attachment_id = ?",
      )
      .get(ledgerId, wrongDigestId);
    assert.equal(wrongDigestRow, undefined);

    const read = await app.inject({
      url: `/api/v1/ledgers/${ledgerId}/attachments/${attachmentId}`,
      headers: { authorization, origin: "https://luna.example" },
    });
    assert.equal(read.statusCode, 200, read.body);
    assert.deepEqual(read.rawPayload, bytes);
    assert.equal(read.headers["x-luna-cipher-sha256"], digest(bytes));
    assert.equal(
      read.headers["access-control-expose-headers"],
      "ETag, Content-Length, Retry-After, X-Request-Id, X-Luna-Cipher-SHA256",
    );

    const preflight = await app.inject({
      method: "OPTIONS",
      url: `/api/v1/ledgers/${ledgerId}/attachments/${attachmentId}`,
      headers: {
        origin: "https://luna.example",
        "access-control-request-method": "PUT",
        "access-control-request-headers": "authorization, content-type, idempotency-key, x-luna-cipher-sha256",
      },
    });
    assert.equal(preflight.statusCode, 204, preflight.body);
    assert.match(
      preflight.headers["access-control-allow-headers"] ?? "",
      /X-Luna-Cipher-SHA256/i,
    );

    const head = await app.inject({
      method: "HEAD",
      url: `/api/v1/ledgers/${ledgerId}/attachments/${attachmentId}`,
      headers: { authorization },
    });
    assert.equal(head.statusCode, 200, head.body);
    assert.equal(head.headers["content-length"], String(bytes.byteLength));
    assert.equal(head.rawPayload.byteLength, 0);

    const storedRow = database.sqlite
      .prepare("SELECT object_key, etag FROM attachments WHERE ledger_id = ? AND attachment_id = ?")
      .get(ledgerId, attachmentId) as { object_key: string; etag: string };
    await objectStore.remove(storedRow.object_key);
    await objectStore.putImmutable(
      storedRow.object_key,
      Buffer.alloc(bytes.byteLength, 0x5a),
    );
    const damagedHead = await app.inject({
      method: "HEAD",
      url: `/api/v1/ledgers/${ledgerId}/attachments/${attachmentId}`,
      headers: { authorization },
    });
    assert.equal(damagedHead.statusCode, 503, damagedHead.body);
    await objectStore.remove(storedRow.object_key);
    const wrongRepair = await app.inject({
      method: "POST",
      url: `/api/v1/ledgers/${ledgerId}/attachments/${attachmentId}/repair`,
      headers: {
        authorization,
        "content-type": "application/octet-stream",
        "if-match": storedRow.etag,
        "idempotency-key": randomUUID(),
        "x-luna-cipher-sha256": digest(bytes),
      },
      payload: differentBytes,
    });
    assert.equal(wrongRepair.statusCode, 400, wrongRepair.body);
    const repaired = await app.inject({
      method: "POST",
      url: `/api/v1/ledgers/${ledgerId}/attachments/${attachmentId}/repair`,
      headers: {
        authorization,
        "content-type": "application/octet-stream",
        "if-match": storedRow.etag,
        "idempotency-key": randomUUID(),
        "x-luna-cipher-sha256": digest(bytes),
      },
      payload: bytes,
    });
    assert.equal(repaired.statusCode, 200, repaired.body);
    assert.notEqual(repaired.headers.etag, storedRow.etag);
    const restored = await app.inject({
      url: `/api/v1/ledgers/${ledgerId}/attachments/${attachmentId}`,
      headers: { authorization },
    });
    assert.equal(restored.statusCode, 200, restored.body);
    assert.deepEqual(restored.rawPayload, bytes);

    const usageAfter = await app.inject({
      url: `/api/v1/ledgers/${ledgerId}/attachments/usage`,
      headers: { authorization },
    });
    assert.equal(usageAfter.statusCode, 200);
    assert.equal(usageAfter.json().usedBytes, 2 * bytes.byteLength);
    assert.equal(usageAfter.json().count, 2);

    const otherDatabase = await openTestDatabase();
    const otherApp = await createApp({ database: otherDatabase });
    try {
      const otherName = `other_${randomUUID().slice(0, 8)}`;
      await setAccount(otherDatabase, otherName, password);
      const otherLogin = await otherApp.inject({
        method: "POST",
        url: "/api/v1/auth/sessions",
        payload: { username: otherName, password, deviceLabel: "other" },
      });
      const missing = await otherApp.inject({
        url: `/api/v1/ledgers/${ledgerId}/attachments/${attachmentId}`,
        headers: { authorization: `Bearer ${otherLogin.json().token}` },
      });
      assert.equal(missing.statusCode, 404);
    } finally {
      await otherApp.close();
      otherDatabase.close();
    }
  } finally {
    await app.close();
    database.close();
  }
});

test("concurrent attachment requests serialize one idempotency key before object publication", async () => {
  const database = await openTestDatabase();
  const objectStore = new GateFirstImmutableStore();
  const app = await createApp({ database, objectStore });
  const username = `attachment_race_${randomUUID().slice(0, 8)}`;
  const password = "attachment-race-password";
  await setAccount(database, username, password);
  try {
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/sessions",
      payload: { username, password, deviceLabel: "attachment-race" },
    });
    const authorization = `Bearer ${login.json().token as string}`;
    const ledger = await app.inject({
      method: "POST",
      url: "/api/v1/ledgers",
      headers: { authorization, "idempotency-key": randomUUID() },
      payload: {},
    });
    const ledgerId = ledger.json().id as string;
    const attachmentId = randomUUID();
    const bytes = Buffer.from("synthetic-concurrent-encrypted-attachment");
    const headers = {
      authorization,
      "content-type": "application/octet-stream",
      "if-none-match": "*",
      "idempotency-key": `attachment-race-${randomUUID()}`,
      "x-luna-cipher-sha256": digest(bytes),
    };
    const first = app.inject({
      method: "PUT",
      url: `/api/v1/ledgers/${ledgerId}/attachments/${attachmentId}`,
      headers,
      payload: bytes,
    });
    await objectStore.firstPutEntered;
    const second = app.inject({
      method: "PUT",
      url: `/api/v1/ledgers/${ledgerId}/attachments/${attachmentId}`,
      headers,
      payload: bytes,
    });
    objectStore.release();
    const responses = await Promise.all([first, second]);
    assert.deepEqual(responses.map((response) => response.statusCode).sort(), [200, 200]);
    assert.equal(responses[0]?.headers.etag, responses[1]?.headers.etag);
    assert.equal(
      (
        database.sqlite
          .prepare("SELECT count(*) AS count FROM idempotency_records WHERE operation_scope LIKE 'PUT attachment %'")
          .get() as { count: number }
      ).count,
      1,
    );
    const different = Buffer.from("different-concurrent-encrypted-attachment");
    const conflict = await app.inject({
      method: "PUT",
      url: `/api/v1/ledgers/${ledgerId}/attachments/${attachmentId}`,
      headers: { ...headers, "x-luna-cipher-sha256": digest(different) },
      payload: different,
    });
    assert.equal(conflict.statusCode, 409, conflict.body);
  } finally {
    await app.close();
    database.close();
  }
});

test("expired attachment generations are fenced and reconciled by exact key", async () => {
  const database = await openTestDatabase();
  const objectStore = new MemoryServerObjectStore();
  const app = await createApp({ database, objectStore });
  const username = `attachment_gc_${randomUUID().slice(0, 8)}`;
  const password = "attachment-gc-password";
  await setAccount(database, username, password);
  try {
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/sessions",
      payload: { username, password, deviceLabel: "attachment-gc-test" },
    });
    assert.equal(login.statusCode, 201, login.body);
    const token = login.json().token as string;
    const ledger = await app.inject({
      method: "POST",
      url: "/api/v1/ledgers",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": randomUUID() },
      payload: {},
    });
    assert.equal(ledger.statusCode, 201, ledger.body);
    const ledgerId = ledger.json().id as string;
    const attachmentId = randomUUID();
    const bytes = Buffer.from("synthetic-gc-attachment");
    const cipherSha256 = digest(bytes);
    const first = database.transaction(() =>
      reserveAttachment(
        database,
        login.json().user.id as string,
        ledgerId,
        attachmentId,
        cipherSha256,
        bytes.byteLength,
      ),
    );
    await objectStore.putImmutable(first.objectKey, bytes);
    database.sqlite
      .prepare("UPDATE attachments SET lease_until = ? WHERE ledger_id = ? AND attachment_id = ?")
      .run(new Date(0).toISOString(), ledgerId, attachmentId);

    const revoked = await reconcileAttachmentOrphans(database, objectStore);
    assert.equal(revoked.revokedReservations, 1);
    assert.equal(revoked.candidates, 0);
    assert.deepEqual(
      database.sqlite
        .prepare("SELECT reservation_id FROM attachments WHERE ledger_id = ? AND attachment_id = ?")
        .get(ledgerId, attachmentId),
      { reservation_id: null },
    );

    const second = database.transaction(() =>
      reserveAttachment(
        database,
        login.json().user.id as string,
        ledgerId,
        attachmentId,
        cipherSha256,
        bytes.byteLength,
      ),
    );
    assert.notEqual(second.reservationId, first.reservationId);
    await objectStore.putImmutable(second.objectKey, bytes);
    const published = database.transaction(() =>
      publishAttachment(
        database,
        login.json().user.id as string,
        ledgerId,
        second.reservationId!,
        '"new-generation"',
      ),
    );
    assert.equal(published.status, "published");
    await assert.rejects(
      async () =>
        database.transaction(() =>
          publishAttachment(
            database,
            login.json().user.id as string,
            ledgerId,
            first.reservationId!,
            '"late-generation"',
          ),
        ),
      (error: unknown) => error instanceof ApiError && error.code === "attachment-reservation-expired",
    );

    const sweepAt = new Date(Date.now() + ATTACHMENT_ORPHAN_GRACE_MS + 1000);
    const swept = await reconcileAttachmentOrphans(database, objectStore, sweepAt);
    assert.equal(swept.removed, 1);
    assert.equal(await objectStore.get(first.objectKey), null);
    assert.notEqual(await objectStore.get(second.objectKey), null);

    // A canceled upload may finish after the first DELETE. The durable orphan
    // row makes the next reconcile remove that exact late generation too.
    await objectStore.putImmutable(first.objectKey, bytes);
    const lateSwept = await reconcileAttachmentOrphans(
      database,
      objectStore,
      new Date(sweepAt.getTime() + 1000),
    );
    assert.equal(lateSwept.removed, 1);
    assert.equal(await objectStore.get(first.objectKey), null);
    assert.notEqual(await objectStore.get(second.objectKey), null);
  } finally {
    await app.close();
    database.close();
  }
});
