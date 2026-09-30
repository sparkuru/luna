import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { createApp } from "../../src/server/app";
import { setAccount } from "../../src/server/auth";
import { MemoryServerObjectStore } from "../../src/server/storage/object-store";
import { BrowserProfiles } from "../../src/web/profile-host";
import { ServerHost } from "../../src/sync/server-host";
import { openTestDatabase } from "../server/support";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test(
  "active hosts automatically publish and pull changes without renderer sync actions",
  { timeout: 90_000 },
  async () => {
    const database = await openTestDatabase();
    const username = `probe_${randomUUID().slice(0, 8)}`;
    const accountPassword = "remote-probe-account-password";
    const passphrase = "remote-probe-ledger-passphrase";
    await setAccount(database, username, accountPassword);
    const objectStore = new MemoryServerObjectStore();
    const app = await createApp({ database, objectStore });
    const baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
    const firstProfiles = new BrowserProfiles(new IDBFactory(), new MemoryStorage());
    const secondProfiles = new BrowserProfiles(new IDBFactory(), new MemoryStorage());
    const first = new ServerHost(firstProfiles);
    const second = new ServerHost(secondProfiles);
    // Production hosts start periodic probes when attaching transport notifications.
    first.setNotifications(() => undefined, () => undefined);
    second.setNotifications(() => undefined, () => undefined);
    const login = {
      baseUrl,
      username,
      password: accountPassword,
      deviceLabel: "probe",
    };
    const draft = {
      type: "expense" as const,
      amountMinor: "123",
      date: "2026-09-10",
      splits: [{ category: "expense:0", amountMinor: "123" }],
      notes: "from second device",
    };
    try {
      await first.api.createWorkspace({
        name: "Remote probe",
        currency: "CNY",
        precision: 2,
        monthlyBudgetMinor: null,
      });
      await first.login(login);
      await first.connect({
        passphrase,
        sourceProfileId: "legacy-local",
        allowLocalOnlyMigration: false,
      });
      await second.login({ ...login, deviceLabel: "probe-second" });
      await second.connect({
        passphrase,
        sourceProfileId: null,
        allowLocalOnlyMigration: false,
      });

      let emittedAfterCommit = false;
      let resolveChange!: () => void;
      const change = new Promise<void>((resolve) => {
        resolveChange = resolve;
      });
      const off = first.api.onChange!(() => {
        void first.status().then((status) => firstProfiles.open(status.profile.id)).then((profile) => profile.ledger.getLedgerDocument()).then((document) => {
          if (
            document?.revisions.some(
              (revision) => revision.kind === "transaction" &&
                revision.value.notes === draft.notes,
            )
          ) {
            emittedAfterCommit = true;
            off();
            resolveChange();
          }
        });
      });

      const senderStatus = await second.status();
      assert.equal(senderStatus.syncMode, "automatic");
      assert.ok(senderStatus.profile.binding);
      const objectKey = `ledger/${senderStatus.profile.binding.ledgerId}/v1.enc.json`;
      const beforeUpload = await objectStore.get(objectKey);
      assert.ok(beforeUpload);
      await second.api.createTransaction(draft);
      const uploadDeadline = Date.now() + 5_000;
      while (
        (await objectStore.get(objectKey))?.etag === beforeUpload.etag &&
        Date.now() < uploadDeadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const afterUpload = await objectStore.get(objectKey);
      assert.ok(afterUpload);
      assert.notEqual(afterUpload.etag, beforeUpload.etag, "Automatic local-write sync must publish a new remote object.");

      await Promise.race([
        change,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("automatic remote probe timeout")), 10_000),
        ),
      ]);
      assert.equal(emittedAfterCommit, true);
      assert.ok(
        (await first.api.getSnapshot("2026-09")).transactions.some(
          (transaction) => transaction.notes === draft.notes,
        ),
      );
    } finally {
      await first.dispose();
      await second.dispose();
      await app.close();
      database.close();
    }
  },
);
