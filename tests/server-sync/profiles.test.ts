import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { createApp } from "../../src/server/app";
import { setAccount } from "../../src/server/auth";
import {
  MemoryServerObjectStore,
} from "../../src/server/storage/object-store";
import { openTestDatabase } from "../server/support";
import { BrowserProfiles } from "../../src/web/profile-host";
import { ServerHost } from "../../src/sync/server-host";
import type { TransactionDraft } from "../../src/shared/domain";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  key(i: number) {
    return [...this.values.keys()][i] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
const passphrase = "ledger-fixture-passphrase";
const draft: TransactionDraft = {
  type: "expense",
  amountMinor: "1200",
  date: "2026-09-08",
  splits: [{ category: "Food", amountMinor: "1200" }],
  notes: "Private note fixture",
};

test(
  "two isolated profiles migrate, sync offline conflicts, preserve sources and restart without secrets",
  { timeout: 90000 },
  async () => {
    const database = await openTestDatabase();
    const username = `sync_${randomUUID().slice(0, 8)}`;
    await setAccount(database, username, "account-fixture-password");
    const objectStore = new MemoryServerObjectStore();
    const app = await createApp({ database, objectStore });
    const baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
    const db1 = new IDBFactory(),
      db2 = new IDBFactory(),
      storage1 = new MemoryStorage(),
      storage2 = new MemoryStorage();
    const profiles1 = new BrowserProfiles(db1, storage1),
      profiles2 = new BrowserProfiles(db2, storage2);
    let dropped = false;
    let preferenceDropped = false;
    const preferencePuts: Array<{ key: string | null; body: string }> = [];
    const puts: Array<{ key: string | null; body: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const request = input as Request;
      if (request.method === "PUT" && request.url.includes("/ledgers/")) {
        puts.push({
          key: request.headers.get("idempotency-key"),
          body: await request.clone().text(),
        });
        const response = await fetch(input, init);
        if (!dropped && response.ok) {
          dropped = true;
          await response.arrayBuffer();
          throw new TypeError("fixture response lost");
        }
        return response;
      }
      if (
        request.method === "PUT" &&
        request.url.endsWith("/preferences/object")
      ) {
        preferencePuts.push({
          key: request.headers.get("idempotency-key"),
          body: await request.clone().text(),
        });
        const response = await fetch(input, init);
        if (!preferenceDropped && response.ok) {
          preferenceDropped = true;
          await response.arrayBuffer();
          throw new TypeError("fixture preference response lost");
        }
        return response;
      }
      return fetch(input, init);
    };
    const first = new ServerHost(profiles1, fetcher),
      second = new ServerHost(profiles2);
    const login = {
      baseUrl,
      username,
      password: "account-fixture-password",
      deviceLabel: "test",
    };
    try {
      await first.api.createWorkspace({
        name: "Original",
        currency: "CNY",
        precision: 2,
        monthlyBudgetMinor: "10000",
      });
      const transaction = await first.api.createTransaction(draft);
      const original = await first.api.getLedgerDocument();
      const signed = await first.login(login);
      assert.equal(signed.profile.id, "legacy-local");
      assert.equal(
        (
          database.sqlite
            .prepare("SELECT count(*) AS count FROM ledgers WHERE owner_user_id = ?")
            .get(signed.account!.id) as { count: number }
        ).count,
        0,
      );
      const connected = await first.connect({
        passphrase,
        sourceProfileId: "legacy-local",
        allowLocalOnlyMigration: false,
      });
      assert.equal(connected.connected, true);
      assert.notEqual(connected.profile.id, "legacy-local");
      assert.deepEqual(
        await (await profiles1.open("legacy-local")).ledger.getLedgerDocument(),
        original,
      );
      assert.equal(puts[0]!.key, puts[1]!.key);
      assert.equal(puts[0]!.body, puts[1]!.body);
      await first.setSyncMode("manual");
      const putsBeforeManualWrite = puts.length;
      await first.api.createTransaction({
        ...draft,
        notes: "manual mode stays local",
      });
      await new Promise((resolve) => setTimeout(resolve, 700));
      assert.equal(puts.length, putsBeforeManualWrite);
      assert.equal((await first.status()).syncMode, "manual");
      assert.equal((await first.sync()).sync.code, "synced");
      assert.ok(puts.length > putsBeforeManualWrite);
      await first.setSyncMode("automatic");
      await second.login(login);
      await assert.rejects(
        second.connect({
          passphrase: "incorrect-passphrase",
          sourceProfileId: null,
          allowLocalOnlyMigration: false,
        }),
      );
      assert.equal((await second.status()).profile.id, "legacy-local");
      await second.connect({
        passphrase,
        sourceProfileId: null,
        allowLocalOnlyMigration: false,
      });
      assert.deepEqual(
        await first.api.getLedgerDocument(),
        await second.api.getLedgerDocument(),
      );
      const otherProfiles = new BrowserProfiles(
        new IDBFactory(),
        new MemoryStorage(),
      );
      const other = new ServerHost(otherProfiles);
      await other.api.createWorkspace({
        name: "Different workspace",
        currency: "CNY",
        precision: 2,
        monthlyBudgetMinor: null,
      });
      const wrongSource = await other.api.getLedgerDocument();
      const objectKey = `ledger/${connected.profile.binding!.ledgerId}/v1.enc.json`;
      const serverBefore = (await objectStore.get(objectKey))!.body;
      await other.login(login);
      await assert.rejects(
        other.connect({
          passphrase,
          sourceProfileId: "legacy-local",
          allowLocalOnlyMigration: false,
        }),
      );
      assert.deepEqual(await other.api.getLedgerDocument(), wrongSource);
      assert.deepEqual(
        (await objectStore.get(objectKey))!.body,
        serverBefore,
      );
      await other.logout();
      await other.dispose();
      await first.disconnect();
      await second.disconnect();
      const heads1 = (await first.api.getSnapshot("2026-09")).budgetHeadIds,
        heads2 = (await second.api.getSnapshot("2026-09")).budgetHeadIds;
      await first.api.setMonthlyBudget("2026-09", "20000", heads1);
      await second.api.setMonthlyBudget("2026-09", "30000", heads2);
      const created1 = await first.api.createTransaction({
        ...draft,
        notes: "created device one",
      });
      const created2 = await second.api.createTransaction({
        ...draft,
        notes: "created device two",
      });
      await first.api.updateTransaction(
        transaction.id,
        { ...draft, notes: "edited offline" },
        transaction.revision,
      );
      await second.api.deleteTransaction(transaction.id, transaction.revision);
      await first.unlock(passphrase);
      await second.unlock(passphrase);
      await first.sync();
      const conflicts = await first.api.getLedgerConflicts();
      assert.equal(conflicts.length, 2);
      assert.ok(conflicts.some((c) => c.kind === "budget"));
      assert.ok(conflicts.some((c) => c.kind === "transaction"));
      for (const conflict of conflicts)
        await first.api.resolveLedgerConflict({
          kind: conflict.kind,
          entityId: conflict.entityId,
          selectedHeadId: conflict.heads[0]!.id,
          expectedHeadIds: conflict.heads.map((h) => h.id),
        });
      await first.sync();
      await second.sync();
      assert.deepEqual(
        await first.api.getLedgerDocument(),
        await second.api.getLedgerDocument(),
      );
      assert.equal((await second.api.getLedgerConflicts()).length, 0);
      const converged = (await second.api.getSnapshot("2026-09")).transactions;
      assert.ok(converged.some((t) => t.id === created1.id));
      assert.ok(converged.some((t) => t.id === created2.id));
      await first.configurePreferences({ enabled: true, passphrase });
      await first.api.updateSettings({ locale: "en" });
      const ledgerBefore = await first.api.getLedgerDocument();
      await first.syncPreferences();
      assert.deepEqual(await first.api.getLedgerDocument(), ledgerBefore);
      assert.equal((await first.status()).preferences.code, "synced");
      assert.equal(preferencePuts[0]!.key, preferencePuts[1]!.key);
      assert.equal(preferencePuts[0]!.body, preferencePuts[1]!.body);
      await second.configurePreferences({ enabled: true, passphrase });
      await second.syncPreferences();
      assert.equal((await second.api.getSettings()).locale, "en");
      const localBeforeRevocation = await first.api.getLedgerDocument();
      database.sqlite
        .prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ?")
        .run(new Date().toISOString(), signed.account!.id);
      await assert.rejects(first.sync());
      assert.deepEqual(
        await first.api.getLedgerDocument(),
        localBeforeRevocation,
      );
      assert.equal((await first.status()).account, null);
      assert.equal((await first.status()).connected, false);
      assert.equal((await first.status()).preferences.enabled, false);
      const invalidated = new Promise<void>((resolve) => {
        const off = second.api.onChange!(() => {
          void second.status().then((status) => {
            if (!status.account) {
              off();
              resolve();
            }
          });
        });
      });
      second.scheduleSync();
      await invalidated;
      assert.equal((await second.status()).connected, false);
      const profileId = (await first.status()).profile.id;
      await first.logout();
      assert.equal((await first.status()).account, null);
      assert.ok(
        (await first.profiles()).some(
          (p) => p.id === profileId && p.displayName === "Original",
        ),
      );
      const restarted = new ServerHost(new BrowserProfiles(db1, storage1));
      assert.equal((await restarted.status()).account, null);
      assert.equal((await restarted.status()).profile.id, profileId);
      await restarted.selectProfile(profileId);
      assert.deepEqual(
        await restarted.api.getLedgerDocument(),
        await first.api.getLedgerDocument(),
      );
      assert.equal((await restarted.status()).connected, false);
      assert.deepEqual(
        await (await profiles1.open("legacy-local")).ledger.getLedgerDocument(),
        original,
      );
    } finally {
      await first.logout();
      await second.logout();
      await app.close();
      database.close();
    }
  },
);
