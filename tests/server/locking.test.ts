import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/server/app";
import { setAccount } from "../../src/server/auth";
import {
  MemoryServerObjectStore,
  type ObjectCondition,
} from "../../src/server/storage/object-store";
import { openTestDatabase } from "./support";

const envelope = {
  format: "luna-ledger-envelope",
  version: 1,
  payloadSchemaVersion: 1,
  kdf: {
    name: "PBKDF2",
    hash: "SHA-256",
    iterations: 600000,
    salt: Buffer.alloc(16, 1).toString("base64"),
  },
  cipher: {
    name: "AES-GCM",
    iv: Buffer.alloc(12, 2).toString("base64"),
    tagLength: 128,
  },
  ciphertext: Buffer.alloc(32, 3).toString("base64"),
};

class FailFirstObjectStore extends MemoryServerObjectStore {
  private failed = false;

  override async put(
    key: string,
    body: Buffer,
    condition: ObjectCondition,
    signal?: AbortSignal,
  ) {
    if (!this.failed) {
      this.failed = true;
      throw new Error("fixture-private-database-detail");
    }
    signal?.throwIfAborted();
    return super.put(key, body, condition);
  }
}

test("SQLite authorization and object failures leave no acknowledgement", async () => {
  const database = await openTestDatabase();
  const name = `lock_${randomUUID().slice(0, 8)}`;
  await setAccount(database, name, "locking-password-123");
  const objectStore = new FailFirstObjectStore();
  const app = await createApp({ database, objectStore });
  try {
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/sessions",
      payload: {
        username: name,
        password: "locking-password-123",
        deviceLabel: "locking",
      },
    });
    const { token, user } = login.json();
    const auth = { authorization: `Bearer ${token}` };
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/ledgers",
      headers: { ...auth, "idempotency-key": randomUUID() },
      payload: {},
    });
    const id = created.json().id;
    const url = `/api/v1/ledgers/${id}/object`;
    const failedKey = randomUUID();
    const failed = await app.inject({
      method: "PUT",
      url,
      headers: {
        ...auth,
        "idempotency-key": failedKey,
        "if-none-match": "*",
      },
      payload: envelope,
    });
    assert.equal(failed.statusCode, 503);
    assert.equal(failed.body.includes("fixture-private"), false);
    assert.equal(
      (
        database.sqlite
          .prepare("SELECT count(*) AS count FROM remote_objects WHERE owner_id = ?")
          .get(id) as { count: number }
      ).count,
      0,
    );
    assert.equal(
      (
        database.sqlite
          .prepare(
            "SELECT count(*) AS count FROM idempotency_records WHERE user_id = ? AND key = ?",
          )
          .get(user.id, failedKey) as { count: number }
      ).count,
      0,
    );

    const retry = await app.inject({
      method: "PUT",
      url,
      headers: { ...auth, "idempotency-key": failedKey, "if-none-match": "*" },
      payload: envelope,
    });
    assert.equal(retry.statusCode, 200);

    for (const invalidation of ["expiry", "revocation"] as const) {
      database.sqlite
        .prepare(
          invalidation === "expiry"
            ? "UPDATE sessions SET expires_at = ? WHERE user_id = ?"
            : "UPDATE sessions SET revoked_at = ? WHERE user_id = ?",
        )
        .run(
          invalidation === "expiry"
            ? new Date(0).toISOString()
            : new Date().toISOString(),
          user.id,
        );
      const denied = await app.inject({
        method: "PUT",
        url,
        headers: {
          ...auth,
          "idempotency-key": randomUUID(),
          "if-match": String(retry.headers.etag),
        },
        payload: envelope,
      });
      assert.equal(denied.statusCode, 401, invalidation);
      assert.equal(
        (
          database.sqlite
            .prepare("SELECT etag FROM remote_objects WHERE owner_id = ?")
            .get(id) as { etag: string }
        ).etag,
        retry.headers.etag,
      );
      if (invalidation === "expiry")
        database.sqlite
          .prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?")
          .run(new Date(Date.now() + 3600000).toISOString(), user.id);
      else
        database.sqlite
          .prepare("UPDATE sessions SET revoked_at = NULL WHERE user_id = ?")
          .run(user.id);
    }
  } finally {
    await app.close();
    database.close();
  }
});
