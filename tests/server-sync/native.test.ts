import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/server/app";
import { setAccount } from "../../src/server/auth";
import { openTestDatabase } from "../server/support";
import { SQLiteLocalStore } from "../../src/main/store";
import { SettingsStore } from "../../src/main/settings-store";
import {
  ConfigSyncService,
  SessionConfigSecrets,
} from "../../src/sync/config-service";
import { createS3ConfigObjectStore } from "../../src/sync/s3-config-store";
import { NativeProfiles } from "../../src/main/profile-host";
import { ServerHost } from "../../src/sync/server-host";
import { serverProfileId } from "../../src/shared/server-api";

test(
  "SQLite profile migration reopens durably, retains original database and secret files",
  { timeout: 30000 },
  async () => {
    const database = await openTestDatabase();
    const username = `native_${randomUUID().slice(0, 8)}`;
    await setAccount(database, username, "fixture-account-password");
    const app = await createApp({ database });
    const baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
    const directory = await mkdtemp(
      path.join(tmpdir(), "luna-native-profile-"),
    );
    const store = new SQLiteLocalStore(path.join(directory, "luna.sqlite"));
    const settings = new SettingsStore(directory, {
      deviceId: randomUUID,
      systemLocale: "en",
      now: () => new Date().toISOString(),
    });
    await settings.initialize();
    const config = new ConfigSyncService(
      settings,
      new SessionConfigSecrets(),
      createS3ConfigObjectStore,
      { now: () => new Date().toISOString() },
    );
    const repository = new NativeProfiles(directory, store, config);
    const host = new ServerHost(repository);
    try {
      await writeFile(
        path.join(directory, "secret-original.fixture"),
        "private-secret-original",
        "utf8",
      );
      await host.api.createWorkspace({
        name: "Native original",
        currency: "CNY",
        precision: 2,
        monthlyBudgetMinor: "9007199254740993",
      });
      const original = store.getLedgerDocument();
      const originalSettings = await settings.get();
      await host.login({
        baseUrl,
        username,
        password: "fixture-account-password",
        deviceLabel: "native",
      });
      const status = await host.connect({
        passphrase: "native-ledger-passphrase",
        sourceProfileId: "legacy-local",
        allowLocalOnlyMigration: false,
      });
      const selected = await repository.open(status.profile.id);
      assert.deepEqual(await selected.readDurable(), original);
      assert.deepEqual(store.getLedgerDocument(), original);
      assert.notEqual(
        (await selected.config.getSettingsPort().get()).deviceId,
        originalSettings.deviceId,
      );
      assert.equal(
        (await selected.config.getSettingsPort().get()).syncConnection,
        null,
      );
      assert.equal(
        await readFile(path.join(directory, "secret-original.fixture"), "utf8"),
        "private-secret-original",
      );
      assert.equal(
        (
          await readdir(path.join(directory, "profiles", status.profile.id))
        ).includes("secret-original.fixture"),
        false,
      );
      await host.logout();
      await repository.closeAll();
      const restarted = new NativeProfiles(directory, store, config);
      const reopened = await restarted.open(status.profile.id);
      assert.deepEqual(await reopened.readDurable(), original);
      assert.deepEqual(await reopened.binding(), status.profile.binding);
      await restarted.closeAll();
    } finally {
      await host.dispose();
      store.close();
      await app.close();
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("native local copy removal deletes only an inactive profile directory", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "luna-native-remove-"));
  const store = new SQLiteLocalStore(path.join(directory, "luna.sqlite"));
  const settings = new SettingsStore(directory, {
    deviceId: randomUUID,
    systemLocale: "en",
    now: () => new Date().toISOString(),
  });
  await settings.initialize();
  const config = new ConfigSyncService(
    settings,
    new SessionConfigSecrets(),
    createS3ConfigObjectStore,
    { now: () => new Date().toISOString() },
  );
  const repository = new NativeProfiles(directory, store, config);
  const host = new ServerHost(repository);
  const id = serverProfileId(randomUUID(), randomUUID());
  try {
    await repository.open(id);
    assert.ok(
      (await readdir(path.join(directory, "profiles", id))).length >= 1,
    );
    await assert.rejects(host.removeProfile("legacy-local"), /active-profile/);
    await host.removeProfile(id);
    await assert.rejects(
      readdir(path.join(directory, "profiles", id)),
      (error: NodeJS.ErrnoException) => error.code === "ENOENT",
    );
    assert.equal((await repository.list()).some((profile) => profile.id === id), false);
  } finally {
    await host.dispose();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
