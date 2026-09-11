import test from "node:test";
import assert from "node:assert/strict";
import { TabSessionVault } from "./session-vault";
import type { SessionVaultRecord } from "../sync/session-vault";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const record: SessionVaultRecord = {
  account: {
    token: "a".repeat(43),
    expiresAt: "2099-01-01T00:00:00.000Z",
    baseUrl: "https://luna.example.test",
    instanceId: "11111111-1111-4111-8111-111111111111",
    id: "22222222-2222-4222-8222-222222222222",
    username: "fixture",
  },
  ledger: {
    profileId:
      "server-11111111-1111-4111-8111-111111111111-22222222-2222-4222-8222-222222222222",
    ledgerId: "33333333-3333-4333-8333-333333333333",
    passphrase: "fixture-ledger-passphrase",
    remoteEtag: '"fixture-etag"',
  },
};

test("tab session vault restores a session after a host is recreated", async () => {
  const storage = new MemoryStorage();
  await new TabSessionVault(storage).save(record);
  assert.deepEqual(await new TabSessionVault(storage).load(), record);
  await new TabSessionVault(storage).clear();
  assert.equal(await new TabSessionVault(storage).load(), null);
});

test("tab session vault discards malformed session data", async () => {
  const storage = new MemoryStorage();
  storage.setItem("luna.session.v1", "not-json");
  assert.equal(await new TabSessionVault(storage).load(), null);
  assert.equal(storage.getItem("luna.session.v1"), null);
});
