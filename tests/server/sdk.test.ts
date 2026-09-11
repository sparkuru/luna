import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { QueryClient } from "@tanstack/react-query";
import { createApp } from "../../src/server/app";
import { setAccount } from "../../src/server/auth";
import { openTestDatabase } from "./support";
import { createApiClient } from "../../src/api-client/runtime/client";
import { accountQueries } from "../../src/api-client/runtime/account-queries";
import {
  createSession,
  createLedger,
  putLedgerObject,
  getLedgerObject,
  getServerMeta,
  logoutSession,
} from "../../src/api-client/generated/sdk.gen";

const envelope = {
  format: "luna-ledger-envelope" as const,
  version: 1 as const,
  payloadSchemaVersion: 1 as const,
  kdf: {
    name: "PBKDF2" as const,
    hash: "SHA-256" as const,
    iterations: 600000 as const,
    salt: Buffer.alloc(16, 1).toString("base64"),
  },
  cipher: {
    name: "AES-GCM" as const,
    iv: Buffer.alloc(12, 2).toString("base64"),
    tagLength: 128 as const,
  },
  ciphertext: Buffer.alloc(32, 3).toString("base64"),
};
test("actual generated SDK + scoped Query options through listening HTTP and SQLite", async () => {
  const database = await openTestDatabase();
  const name = `sdk_${randomUUID().slice(0, 8)}`;
  await setAccount(database, name, "sdk-fixture-password");
  const logs: unknown[] = [];
  const app = await createApp({ database, log: (event) => logs.push(event) });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  let token: string | undefined;
  const client = createApiClient(address, () => token);
  const query = new QueryClient();
  try {
    const login = await createSession({
      client,
      body: {
        username: name,
        password: "sdk-fixture-password",
        deviceLabel: "sdk",
      },
    });
    assert.equal(login.response!.status, 201);
    token = login.data!.token;
    const meta = await getServerMeta({ client });
    assert.equal(meta.response!.status, 200);
    const options = accountQueries(client, {
      instanceId: meta.data!.instanceId,
      userId: login.data!.user.id,
      generation: 1,
    });
    const current = await query.fetchQuery(options.currentUser);
    assert.equal(current.id, login.data!.user.id);
    assert.equal(
      JSON.stringify(
        query
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ).includes(token!),
      false,
    );
    const created = await createLedger({
      client,
      body: {},
      headers: { "idempotency-key": randomUUID() },
    });
    assert.equal(created.response!.status, 201);
    const path = { id: created.data!.id };
    const headers = {
      "idempotency-key": randomUUID(),
      "if-none-match": "*" as const,
    };
    const written = await putLedgerObject({
      client,
      path,
      headers,
      body: envelope,
    });
    assert.equal(written.response!.status, 200, JSON.stringify(written.error));
    const replay = await putLedgerObject({
      client,
      path,
      headers,
      body: envelope,
    });
    assert.equal(
      replay.response!.headers.get("etag"),
      written.response!.headers.get("etag"),
    );
    const read = await getLedgerObject({ client, path, parseAs: "text" });
    assert.equal(read.data, JSON.stringify(envelope));
    assert.equal(
      read.response!.headers.get("etag"),
      written.response!.headers.get("etag"),
    );
    assert.equal((await logoutSession({ client })).response!.status, 204);
    assert.equal(
      (await getLedgerObject({ client, path })).response!.status,
      401,
    );
    assert.equal(JSON.stringify(logs).includes(token!), false);
    assert.equal(JSON.stringify(logs).includes("sdk-fixture-password"), false);
    assert.equal(JSON.stringify(logs).includes(envelope.ciphertext), false);
  } finally {
    query.clear();
    await app.close();
    database.close();
  }
});
