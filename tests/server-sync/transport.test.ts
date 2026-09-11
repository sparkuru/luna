import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/server/app";
import { setAccount } from "../../src/server/auth";
import { openTestDatabase } from "../server/support";
import { createApiClient } from "../../src/api-client/runtime/client";
import {
  createSession,
  createLedger,
} from "../../src/api-client/generated/sdk.gen";
import { HttpLedgerObjectStore } from "../../src/sync/http-object-store";

test("HTTP adapter only treats authorized empty objects as empty, not inaccessible ledgers", async () => {
  const database = await openTestDatabase();
  const username = `empty_${randomUUID().slice(0, 8)}`;
  await setAccount(database, username, "fixture-account-password");
  const app = await createApp({ database });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  let token: string | undefined;
  const client = createApiClient(address, () => token);
  try {
    const login = await createSession({
      client,
      body: {
        username,
        password: "fixture-account-password",
        deviceLabel: "fixture",
      },
    });
    token = login.data!.token;
    const space = await createLedger({
      client,
      body: {},
      headers: { "idempotency-key": randomUUID() },
    });
    const empty = new HttpLedgerObjectStore(client, space.data!.id);
    assert.equal(
      await empty.get("ledger-v1.enc.json", new AbortController().signal),
      null,
    );
    const inaccessible = new HttpLedgerObjectStore(client, randomUUID());
    await assert.rejects(
      inaccessible.get("ledger-v1.enc.json", new AbortController().signal),
      /not-found/,
    );
    database.sqlite
      .prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?")
      .run(new Date(0).toISOString(), login.data!.user.id);
    await assert.rejects(
      empty.get("ledger-v1.enc.json", new AbortController().signal),
      /authentication/,
    );
    empty.close();
    inaccessible.close();
  } finally {
    await app.close();
    database.close();
  }
});
