import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/server/app";
import { setAccount } from "../../src/server/auth";
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

test("SQLite authentication, account isolation, CAS, replay, quotas and revocation", async (t) => {
  const database = await openTestDatabase();
  const name = `user_${randomUUID().slice(0, 8)}`;
  const other = `user_${randomUUID().slice(0, 8)}`;
  const password = "fixture-password-123";
  await setAccount(database, name, password);
  await setAccount(database, other, password);
  const app = await createApp({ database, origins: ["http://localhost"] });
  try {
    const login = async (username: string) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/sessions",
        payload: { username, password, deviceLabel: "test" },
      });
      assert.equal(response.statusCode, 201, response.body);
      return response.json() as { token: string; user: { id: string } };
    };
    const a = await login(name),
      b = await login(other);
    const auth = { authorization: `Bearer ${a.token}` };
    const key = () => randomUUID();
    const createKey = key();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/ledgers",
      headers: { ...auth, "idempotency-key": createKey },
      payload: {},
    });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().id as string;
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/ledgers",
          headers: { ...auth, "idempotency-key": createKey },
          payload: {},
        })
      ).body,
      created.body,
    );
    const url = `/api/v1/ledgers/${id}/object`;
    const put = (
      headers: Record<string, string>,
      payload: unknown = envelope,
    ) =>
      app.inject({
        method: "PUT",
        url,
        headers: { ...auth, ...headers },
        payload: payload as object,
      });
    await t.test(
      "missing/invalid conditions and invisible ledger do not create objects",
      async () => {
        assert.equal((await put({ "idempotency-key": key() })).statusCode, 428);
        assert.equal(
          (await put({ "idempotency-key": key(), "if-none-match": "invalid" }))
            .statusCode,
          400,
        );
        assert.equal(
          (
            await put({
              "idempotency-key": key(),
              "if-none-match": "*",
              "if-match": '"wrong"',
            })
          ).statusCode,
          400,
        );
        assert.equal(
          (
            await app.inject({
              url,
              headers: { authorization: `Bearer ${b.token}` },
            })
          ).statusCode,
          404,
        );
        assert.equal(
          (
            await app.inject({
              method: "PUT",
              url,
              headers: {
                authorization: `Bearer ${b.token}`,
                "idempotency-key": key(),
                "if-none-match": "*",
              },
              payload: envelope,
            })
          ).statusCode,
          404,
        );
        assert.equal(
          (await app.inject({ url, headers: auth })).statusCode,
          404,
        );
      },
    );
    await t.test(
      "strict envelope base64 lengths and canonical encoding are checked before persistence",
      async () => {
        const invalids = [
          {
            ...envelope,
            kdf: {
              ...envelope.kdf,
              salt: Buffer.alloc(18, 1).toString("base64"),
            },
          },
          {
            ...envelope,
            kdf: {
              ...envelope.kdf,
              salt: envelope.kdf.salt.slice(0, -4) + "AR==",
            },
          },
          {
            ...envelope,
            cipher: {
              ...envelope.cipher,
              iv: Buffer.alloc(11, 2).toString("base64"),
            },
          },
          { ...envelope, ciphertext: "not base64" },
        ];
        for (const body of invalids)
          assert.equal(
            (
              await put(
                { "idempotency-key": key(), "if-none-match": "*" },
                body,
              )
            ).statusCode,
            400,
          );
        assert.equal(
          (await app.inject({ url, headers: auth })).statusCode,
          404,
        );
      },
    );
    await t.test(
      "preferences have independent CAS and account ownership",
      async () => {
        const preference = {
          format: "luna-config-envelope",
          version: 1,
          payloadSchemaVersion: 1,
          kdf: {
            name: "scrypt",
            salt: Buffer.alloc(16, 1).toString("base64"),
            N: 16384,
            r: 8,
            p: 1,
            maxmem: 33554432,
          },
          cipher: {
            name: "aes-256-gcm",
            iv: Buffer.alloc(12, 2).toString("base64"),
            tag: Buffer.alloc(16, 3).toString("base64"),
          },
          ciphertext: Buffer.alloc(32, 4).toString("base64"),
        };
        const headers = {
          ...auth,
          "idempotency-key": key(),
          "if-none-match": "*",
        };
        const written = await app.inject({
          method: "PUT",
          url: "/api/v1/preferences/object",
          headers,
          payload: preference,
        });
        assert.equal(written.statusCode, 200, written.body);
        const replay = await app.inject({
          method: "PUT",
          url: "/api/v1/preferences/object",
          headers,
          payload: preference,
        });
        assert.equal(replay.headers.etag, written.headers.etag);
        assert.equal(
          (
            await app.inject({
              url: "/api/v1/preferences/object",
              headers: { authorization: "Bearer " + b.token },
            })
          ).statusCode,
          404,
        );
        assert.equal(
          (await app.inject({ url, headers: auth })).statusCode,
          404,
        );
        assert.equal(
          (
            await app.inject({
              url: "/api/v1/preferences/object",
              headers: auth,
            })
          ).body,
          JSON.stringify(preference),
        );
      },
    );
    let etag: string;
    await t.test("concurrent first CAS has exactly one winner", async () => {
      const responses = await Promise.all([
        put({ "idempotency-key": key(), "if-none-match": "*" }),
        put({ "idempotency-key": key(), "if-none-match": "*" }),
      ]);
      assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 412]);
      etag = responses.find((r) => r.statusCode === 200)!.headers
        .etag as string;
    });
    await t.test("object status exposes only the safe remote marker", async () => {
      const response = await app.inject({
        url: `${url}/status`,
        headers: auth,
      });
      assert.equal(response.statusCode, 200, response.body);
      assert.deepEqual(Object.keys(response.json()).sort(), [
        "etag",
        "updatedAt",
        "version",
      ]);
      assert.equal(response.json().etag, etag);
      assert.equal(typeof response.json().version, "number");
      assert.equal(typeof response.json().updatedAt, "string");
      assert.equal(
        (
          await app.inject({
            url: `${url}/status`,
            headers: { authorization: `Bearer ${b.token}` },
          })
        ).statusCode,
        404,
      );
    });
    await t.test(
      "same key concurrent replay and response loss retain committed ETag",
      async () => {
        const headers = { "idempotency-key": key(), "if-match": etag };
        const [first, second] = await Promise.all([put(headers), put(headers)]);
        assert.equal(first.statusCode, 200);
        assert.equal(second.statusCode, 200);
        assert.equal(first.headers.etag, second.headers.etag);
        const retry = await put(headers);
        assert.equal(retry.headers.etag, first.headers.etag);
        assert.equal(
          (
            await put(headers, {
              ...envelope,
              ciphertext: Buffer.alloc(32, 4).toString("base64"),
            })
          ).statusCode,
          409,
        );
        assert.equal(
          (await put({ ...headers, "idempotency-key": key() })).statusCode,
          412,
        );
        etag = first.headers.etag as string;
      },
    );
    await t.test(
      "raw envelope bytes round trip and invalid/oversized content cannot overwrite",
      async () => {
        const raw = JSON.stringify(envelope, null, 2);
        const response = await app.inject({
          method: "PUT",
          url,
          headers: {
            ...auth,
            "idempotency-key": key(),
            "if-match": etag,
            "content-type": "application/json",
          },
          payload: raw,
        });
        assert.equal(response.statusCode, 200, response.body);
        const read = await app.inject({ url, headers: auth });
        assert.equal(read.body, raw);
        assert.equal(read.headers.etag, response.headers.etag);
        assert.equal(
          (
            await put(
              {
                "idempotency-key": key(),
                "if-match": String(response.headers.etag),
              },
              { ...envelope, notes: "plaintext" },
            )
          ).statusCode,
          400,
        );
        assert.equal(
          (
            await app.inject({
              method: "PUT",
              url,
              headers: {
                ...auth,
                "idempotency-key": key(),
                "if-none-match": "*",
                "content-type": "application/json",
              },
              payload: " ".repeat(12 * 1024 * 1024 + 1),
            })
          ).statusCode,
          413,
        );
        assert.equal(
          (
            await app.inject({
              method: "PUT",
              url,
              headers: {
                ...auth,
                "content-type": "application/json",
                "content-encoding": "gzip",
              },
              payload: "{}",
            })
          ).statusCode,
          415,
        );
        assert.equal(
          (await app.inject({ url, headers: auth })).headers.etag,
          response.headers.etag,
        );
      },
    );
    await t.test(
      "maximum valid ledger ciphertext survives schema validation",
      async () => {
        const previous = await app.inject({ url, headers: auth });
        const raw = JSON.stringify({
          ...envelope,
          ciphertext: Buffer.alloc(8 * 1024 * 1024 + 16).toString("base64"),
        });
        const response = await app.inject({
          method: "PUT",
          url,
          headers: {
            ...auth,
            "idempotency-key": key(),
            "if-match": String(previous.headers.etag),
            "content-type": "application/json",
          },
          payload: raw,
        });
        assert.equal(response.statusCode, 200, response.body);
        const read = await app.inject({ url, headers: auth });
        assert.equal(read.body, raw);
        assert.equal(read.headers.etag, response.headers.etag);
      },
    );
    await t.test(
      "v2 publication fences a later v1 write",
      async () => {
        const previous = await app.inject({ url, headers: auth });
        const v2 = { ...envelope, version: 2, payloadSchemaVersion: 2 };
        const upgraded = await put(
          {
            "idempotency-key": key(),
            "if-match": String(previous.headers.etag),
          },
          v2,
        );
        assert.equal(upgraded.statusCode, 200, upgraded.body);
        const rejected = await put(
          {
            "idempotency-key": key(),
            "if-match": String(upgraded.headers.etag),
          },
          envelope,
        );
        assert.equal(rejected.statusCode, 409, rejected.body);
      },
    );
    await t.test(
      "stored authentication contains only token digest and no password",
      async () => {
        const session = database.sqlite
          .prepare("SELECT token_hash FROM sessions WHERE user_id = ?")
          .get(a.user.id) as { token_hash: string };
        assert.equal(session.token_hash.length, 64);
        assert.notEqual(session.token_hash, a.token);
        const user = database.sqlite
          .prepare(
            "SELECT password_hash,password_salt,password_params FROM users WHERE id = ?",
          )
          .get(a.user.id) as {
          password_hash: Buffer;
          password_salt: Buffer;
          password_params: string;
        };
        assert.equal(user.password_hash.length, 64);
        assert.equal(user.password_salt.length, 16);
        assert.equal(JSON.parse(user.password_params).N, 131072);
      },
    );
    await t.test(
      "revoke then write is rejected and reset revokes every session",
      async () => {
        const sessions = await app.inject({
          url: "/api/v1/auth/sessions",
          headers: auth,
        });
        const sessionId = sessions.json()[0].id;
        assert.equal(
          (
            await app.inject({
              method: "DELETE",
              url: `/api/v1/auth/sessions/${sessionId}`,
              headers: auth,
            })
          ).statusCode,
          204,
        );
        assert.equal(
          (await put({ "idempotency-key": key(), "if-none-match": "*" }))
            .statusCode,
          401,
        );
        const next = await login(name);
        await setAccount(database, name, "replacement-password-123", true);
        assert.equal(
          (
            await app.inject({
              url: "/api/v1/auth/me",
              headers: { authorization: `Bearer ${next.token}` },
            })
          ).statusCode,
          401,
        );
      },
    );
    await t.test("precise CORS and no-store headers", async () => {
      assert.equal(
        (
          await app.inject({
            url: "/api/v1/meta",
            headers: { origin: "https://untrusted.example" },
          })
        ).statusCode,
        400,
      );
      const allowed = await app.inject({
        url: "/api/v1/meta",
        headers: { origin: "http://localhost" },
      });
      assert.equal(
        allowed.headers["access-control-allow-origin"],
        "http://localhost",
      );
      assert.equal(allowed.headers["cache-control"], "no-store");
    });
  } finally {
    await app.close();
    database.close();
  }
});
