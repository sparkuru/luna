import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { createApp } from "../../src/server/app";
import { setAccount } from "../../src/server/auth";
import { openTestDatabase } from "../server/support";
import { BrowserProfiles } from "../../src/web/profile-host";
import { ServerHost } from "../../src/sync/server-host";
import { serverProfileId } from "../../src/shared/server-api";

const emptyStorage: Storage = {
  get length() {
    return 0;
  },
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
test(
  "superseded login cannot activate and transitions freeze/drain accepted local writes",
  { timeout: 30000 },
  async () => {
    const database = await openTestDatabase();
    const first = `race_${randomUUID().slice(0, 8)}`,
      second = `race_${randomUUID().slice(0, 8)}`;
    await setAccount(database, first, "fixture-account-password");
    await setAccount(database, second, "fixture-account-password");
    const app = await createApp({ database });
    const baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
    const profiles = new BrowserProfiles(new IDBFactory(), emptyStorage);
    const entered = deferred(),
      release = deferred();
    let hold = true;
    let holdUnauthorized = false;
    const unauthorized = deferred(),
      releaseUnauthorized = deferred();
    const fetcher: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (hold && (input as Request).url.endsWith("/auth/sessions")) {
        hold = false;
        entered.resolve();
        await release.promise;
      }
      if (holdUnauthorized && response.status === 401) {
        holdUnauthorized = false;
        unauthorized.resolve();
        await releaseUnauthorized.promise;
      }
      return response;
    };
    const host = new ServerHost(profiles, fetcher);
    try {
      const old = host.login({
        baseUrl,
        username: first,
        password: "fixture-account-password",
        deviceLabel: "old",
      });
      const oldRejected = assert.rejects(old);
      await entered.promise;
      const next = host.login({
        baseUrl,
        username: second,
        password: "fixture-account-password",
        deviceLabel: "new",
      });
      await assert.rejects(
        host.api.createWorkspace({
          name: "Blocked",
          currency: "CNY",
          precision: 2,
          monthlyBudgetMinor: null,
        }),
        /busy/,
      );
      release.resolve();
      await oldRejected;
      assert.equal((await next).account!.username, second);
      const current = (await host.status()).account!;
      database.sqlite
        .prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ?")
        .run(new Date().toISOString(), current.id);
      holdUnauthorized = true;
      const listing = host.sessions();
      const listingRejected = assert.rejects(listing);
      await unauthorized.promise;
      await host.login({
        baseUrl,
        username: first,
        password: "fixture-account-password",
        deviceLabel: "replacement",
      });
      releaseUnauthorized.resolve();
      await listingRejected;
      assert.equal((await host.status()).account!.username, first);
      database.sqlite
        .prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ?")
        .run(new Date().toISOString(), (await host.status()).account!.id);
      const localBeforeExpiry = await profiles.open("legacy-local");
      const updateSettings = localBeforeExpiry.api.updateSettings.bind(
        localBeforeExpiry.api,
      );
      const committed = deferred(),
        receipt = deferred();
      localBeforeExpiry.api.updateSettings = async (input) => {
        const result = await updateSettings(input);
        committed.resolve();
        await receipt.promise;
        return result;
      };
      const saved = host.api.updateSettings({ locale: "en" });
      await committed.promise;
      await assert.rejects(host.sessions());
      assert.equal((await host.status()).account, null);
      receipt.resolve();
      assert.equal(
        (await saved).locale,
        "en",
        "401 must not discard a committed local receipt",
      );
      localBeforeExpiry.api.updateSettings = updateSettings;
      const targetId = serverProfileId(randomUUID(), randomUUID());
      await profiles.open(targetId);
      const local = await profiles.open("legacy-local");
      const originalCreate = local.api.createWorkspace.bind(local.api);
      const writing = deferred(),
        finish = deferred();
      local.api.createWorkspace = async (input) => {
        writing.resolve();
        await finish.promise;
        return originalCreate(input);
      };
      const accepted = host.api.createWorkspace({
        name: "Accepted original",
        currency: "CNY",
        precision: 2,
        monthlyBudgetMinor: null,
      });
      await writing.promise;
      const switching = host.selectProfile(targetId);
      await assert.rejects(host.api.getSnapshot("2026-09"), /busy/);
      finish.resolve();
      await accepted;
      await switching;
      assert.equal(await host.api.getLedgerDocument(), null);
      assert.equal(
        (await local.ledger.getLedgerDocument())!.workspace.name,
        "Accepted original",
      );
      assert.equal((await host.status()).profile.id, targetId);
    } finally {
      release.resolve();
      releaseUnauthorized.resolve();
      await host.logout();
      await profiles.closeAll();
      await app.close();
      database.close();
    }
  },
);

test(
  "unconfirmed S3 status stops migration and logout during final clear cannot activate",
  { timeout: 30000 },
  async () => {
    const database = await openTestDatabase();
    const username = `final_${randomUUID().slice(0, 8)}`;
    await setAccount(database, username, "fixture-account-password");
    const app = await createApp({ database });
    const baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
    const profiles = new BrowserProfiles(new IDBFactory(), emptyStorage);
    const host = new ServerHost(profiles);
    const gate = deferred(),
      entered = deferred();
    try {
      await host.api.createWorkspace({
        name: "Keep original",
        currency: "CNY",
        precision: 2,
        monthlyBudgetMinor: null,
      });
      const original = await host.api.getLedgerDocument();
      const source = await profiles.open("legacy-local");
      const oldStatus = source.api.getLedgerSyncStatus.bind(source.api);
      const oldSync = source.api.syncLedgerNow.bind(source.api);
      source.api.getLedgerSyncStatus = async () => ({
        enabled: true,
        configured: true,
        code: "failed",
        lastSyncedAt: null,
      });
      source.api.syncLedgerNow = source.api.getLedgerSyncStatus;
      const originalClear = source.api.clearLedgerSync.bind(source.api);
      source.api.clearLedgerSync = async () => {
        source.api.getLedgerSyncStatus = oldStatus;
        source.api.syncLedgerNow = oldSync;
        return originalClear();
      };
      await host.login({
        baseUrl,
        username,
        password: "fixture-account-password",
        deviceLabel: "race",
      });
      await assert.rejects(
        host.connect({
          passphrase: "fixture-ledger-passphrase",
          sourceProfileId: "legacy-local",
          allowLocalOnlyMigration: false,
        }),
        /source-unconfirmed/,
      );
      const account = (await host.status()).account!;
      assert.equal(
        (
          database.sqlite
            .prepare("SELECT count(*) AS count FROM ledgers WHERE owner_user_id = ?")
            .get(account.id) as { count: number }
        ).count,
        0,
      );
      source.api.getLedgerSyncStatus = oldStatus;
      source.api.syncLedgerNow = oldSync;
      source.api.clearLedgerSync = originalClear;
      const clear = source.api.clearLedgerSync.bind(source.api);
      source.api.clearLedgerSync = async () => {
        source.api.clearLedgerSync = clear;
        entered.resolve();
        await gate.promise;
        return clear();
      };
      const connecting = host.connect({
        passphrase: "fixture-ledger-passphrase",
        sourceProfileId: "legacy-local",
        allowLocalOnlyMigration: true,
      });
      const rejected = assert.rejects(connecting);
      await entered.promise;
      const logout = host.logout();
      gate.resolve();
      await rejected;
      await logout;
      assert.equal((await host.status()).profile.id, "legacy-local");
      assert.equal((await host.status()).account, null);
      assert.equal((await host.status()).connected, false);
      assert.deepEqual(await host.api.getLedgerDocument(), original);
    } finally {
      gate.resolve();
      await host.dispose();
      await app.close();
      database.close();
    }
  },
);
