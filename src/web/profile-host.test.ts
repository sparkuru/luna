import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { BrowserProfiles } from "./profile-host";
import { ServerHost } from "../sync/server-host";
import { serverProfileId, type ServerBinding } from "../shared/server-api";
import { seedLedgerDocument } from "../shared/ledger-sync";
import { encryptLedgerDocument } from "../shared/ledger-crypto";
import type {
  SessionVault,
  SessionVaultRecord,
} from "../sync/session-vault";

const storage: Storage = {
  length: 0,
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
};
const instanceId = "11111111-1111-4111-8111-111111111111",
  userId = "22222222-2222-4222-8222-222222222222";
const binding: ServerBinding = {
  instanceId,
  userId,
  ledgerId: "33333333-3333-4333-8333-333333333333",
  baseUrl: "https://luna.example.test",
};
const document = () =>
  seedLedgerDocument(
    {
      id: "workspace-copy",
      name: "Source",
      currency: "CNY",
      precision: 2,
      createdAt: "2026-09-08T00:00:00.000Z",
    },
    [],
    { "2026-09": "9007199254740993" },
  );

class MemorySessionVault implements SessionVault {
  constructor(public record: SessionVaultRecord | null) {}
  async load(): Promise<SessionVaultRecord | null> {
    return this.record;
  }
  async save(record: SessionVaultRecord): Promise<void> {
    this.record = record;
  }
  async clear(): Promise<void> {
    this.record = null;
  }
}

test("IDB graph and binding commit together; metadata abort rolls back both", async () => {
  const database = new IDBFactory();
  const profiles = new BrowserProfiles(database, storage);
  const profile = await profiles.open(serverProfileId(instanceId, userId));
  const controller = new AbortController();
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
    if (key === "profile") controller.abort();
    return original.call(this, value, key);
  };
  try {
    await assert.rejects(profile.bind(document(), binding, controller.signal));
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  assert.equal(await profile.binding(), null);
  assert.equal(await profile.readDurable(), null);
  await profile.bind(document(), binding, new AbortController().signal);
  const reopened = await new BrowserProfiles(database, storage).open(
    profile.id,
  );
  assert.deepEqual(await reopened.binding(), binding);
  assert.deepEqual(await reopened.readDurable(), document());
  const before = await reopened.readDurable();
  await assert.rejects(
    reopened.bind(
      document(),
      { ...binding, ledgerId: instanceId },
      new AbortController().signal,
    ),
  );
  assert.deepEqual(await reopened.readDurable(), before);
  assert.deepEqual(await reopened.binding(), binding);
});

test("deleting a local copy removes its catalog entry and never deletes the active original", async () => {
  const database = new IDBFactory();
  const profiles = new BrowserProfiles(database, storage);
  const host = new ServerHost(profiles);
  const id = serverProfileId(instanceId, userId);
  await host.api.createWorkspace({
    name: "Original",
    currency: "CNY",
    precision: 2,
    monthlyBudgetMinor: null,
  });
  const original = await host.api.getLedgerDocument();
  const copy = await profiles.open(id);
  await copy.bind(document(), binding, new AbortController().signal);
  assert.ok((await profiles.list()).some((profile) => profile.id === id));
  await assert.rejects(host.removeProfile("legacy-local"), /active-profile/);
  await host.removeProfile(id);
  assert.equal(
    (await profiles.list()).some((profile) => profile.id === id),
    false,
  );
  assert.deepEqual(await (await profiles.open("legacy-local")).readDurable(), original);
  assert.equal(await copy.readDurable(), null);
  await host.dispose();
});

test("late backup decrypt cannot import into either profile after switching", async () => {
  const profiles = new BrowserProfiles(new IDBFactory(), storage);
  const host = new ServerHost(profiles);
  const id = serverProfileId(instanceId, userId);
  await profiles.open(id);
  const raw = await encryptLedgerDocument(
    document(),
    "backup-fixture-passphrase",
  );
  let arrived!: () => void, release!: () => void;
  const entered = new Promise<void>((r) => (arrived = r)),
    gate = new Promise<void>((r) => (release = r));
  const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
  crypto.subtle.decrypt = async (...args) => {
    const result = await decrypt(...args);
    arrived();
    await gate;
    return result;
  };
  try {
    const pending = host.api.importLedgerBackup(
      raw,
      "backup-fixture-passphrase",
    );
    const rejected = assert.rejects(pending);
    await entered;
    await host.selectProfile(id);
    release();
    await rejected;
    assert.equal(await host.api.getLedgerDocument(), null);
    assert.equal(
      await (await profiles.open("legacy-local")).ledger.getLedgerDocument(),
      null,
    );
  } finally {
    release();
    crypto.subtle.decrypt = decrypt;
    await host.dispose();
  }
});

test("status refuses a mixed generation and unsupported server version makes no login request", async () => {
  const profiles = new BrowserProfiles(new IDBFactory(), storage);
  const host = new ServerHost(profiles);
  const profile = await profiles.open("legacy-local");
  const binding = profile.binding;
  let entered!: () => void, release!: () => void;
  const arrived = new Promise<void>((r) => (entered = r)),
    gate = new Promise<void>((r) => (release = r));
  profile.binding = async () => {
    profile.binding = binding;
    entered();
    await gate;
    return binding();
  };
  const reading = host.status();
  const rejected = assert.rejects(reading, /cancelled/);
  await arrived;
  await host.disconnect();
  release();
  await rejected;
  let logins = 0;
  const untrusted = new ServerHost(
    new BrowserProfiles(new IDBFactory(), storage),
    async (input) => {
      if ((input as Request).url.endsWith("/auth/sessions")) logins++;
      return new Response(
        JSON.stringify({
          apiVersion: 2,
          instanceId,
          limits: { ledgerBytes: 12582912, preferenceBytes: 1048576 },
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  );
  await assert.rejects(
    untrusted.login({
      baseUrl: "https://luna.example.test",
      username: "fixture",
      password: "fixture-account-password",
      deviceLabel: "test",
    }),
    /unsupported-version/,
  );
  assert.equal(logins, 0);
  assert.equal((await untrusted.status()).account, null);
  await host.dispose();
  await untrusted.dispose();
});

test("host preserves S3 credentials and joins concurrent sync for the same profile", async () => {
  const profiles = new BrowserProfiles(new IDBFactory(), storage);
  const host = new ServerHost(profiles);
  const local = await profiles.open("legacy-local");
  let clears = 0;
  const configure = local.config.configureTarget.bind(local.config);
  local.config.configureTarget = (target) => {
    clears++;
    configure(target);
  };
  local.api.syncConfigNow = async () => ({
    settings: await local.api.getSettings(),
    code: "synced",
  });
  await host.api.syncConfigNow();
  assert.equal(clears, 0, "using S3 must not clear its session credentials");
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let calls = 0;
  local.api.syncLedgerNow = async () => {
    calls++;
    await gate;
    return {
      enabled: true,
      configured: true,
      code: "synced",
      lastSyncedAt: null,
    };
  };
  const first = host.api.syncLedgerNow();
  const second = host.api.syncLedgerNow();
  finish();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  await host.dispose();
});

test("concurrent profile consumers share a stable local catalog read", async () => {
  const host = new ServerHost(new BrowserProfiles(new IDBFactory(), storage));
  try {
    await host.api.createWorkspace({
      name: "Concurrent catalog household",
      currency: "CNY",
      precision: 2,
      monthlyBudgetMinor: null,
    });
    const [first, second] = await Promise.all([
      host.profiles(),
      host.profiles(),
    ]);
    assert.deepEqual(second, first);
    assert.deepEqual(first.map((profile) => profile.id), ["legacy-local"]);
  } finally {
    await host.dispose();
  }
});

test("web host restores its volatile session and detects a remote marker in manual mode", async () => {
  const database = new IDBFactory();
  const profiles = new BrowserProfiles(database, storage);
  const id = serverProfileId(instanceId, userId);
  const profile = await profiles.open(id);
  await profile.bind(document(), binding, new AbortController().signal);
  await profile.api.updateSettings({ ledgerSyncMode: "manual" });
  await profiles.activate(id, new AbortController().signal);
  const vault = new MemorySessionVault({
    account: {
      token: "a".repeat(43),
      expiresAt: "2099-01-01T00:00:00.000Z",
      baseUrl: binding.baseUrl,
      instanceId,
      id: userId,
      username: "fixture",
    },
    ledger: {
      profileId: id,
      ledgerId: binding.ledgerId,
      passphrase: "restore-fixture-passphrase",
      remoteEtag: null,
    },
  });
  let markerCalls = 0;
  const host = new ServerHost(
    profiles,
    async (input) => {
      markerCalls++;
      assert.match((input as Request).url, /\/object\/status$/);
      return new Response(
        JSON.stringify({
          etag: '"remote-version-2"',
          version: 2,
          updatedAt: "2026-09-10T00:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
    vault,
  );
  try {
    const restored = await host.status();
    assert.equal(restored.account?.username, "fixture");
    assert.equal(restored.connected, true);
    assert.equal(restored.sync.remoteChangeAvailable, undefined);
    await host.checkRemoteNow();
    const marked = await host.status();
    assert.equal(marked.sync.remoteChangeAvailable, true);
    assert.equal(markerCalls, 1);
  } finally {
    await host.dispose();
  }
  assert.equal(vault.record, null);
});

test("account transport calls fetch without a host object receiver", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async function (this: unknown, input) {
    assert.equal(
      this,
      undefined,
      "browser fetch must not receive ServerHost as its receiver",
    );
    calls++;
    const login = (input as Request).url.endsWith("/auth/sessions");
    return new Response(
      JSON.stringify(
        login
          ? {
              token: "a".repeat(43),
              expiresAt: "2099-01-01T00:00:00.000Z",
              user: { id: userId, username: "fixture" },
            }
          : {
              apiVersion: 1,
              instanceId,
              limits: { ledgerBytes: 12582912, preferenceBytes: 1048576 },
            },
      ),
      { headers: { "content-type": "application/json" } },
    );
  };
  const host = new ServerHost(
    new BrowserProfiles(new IDBFactory(), storage),
    fetcher,
  );
  try {
    const result = await host.login({
      baseUrl: "https://luna.example.test",
      username: "fixture",
      password: "fixture-account-password",
      deviceLabel: "test",
    });
    assert.equal(result.account?.username, "fixture");
    assert.equal(calls, 2);
  } finally {
    await host.dispose();
  }
});
