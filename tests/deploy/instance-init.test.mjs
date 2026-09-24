import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const script = resolve("deploy/instance-init.mjs");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "luna-instance-init-test-"));
  return { root, data: join(root, "data") };
}

function run(data) {
  return spawnSync(process.execPath, [script, data], {
    encoding: "utf8",
    env: {
      ...process.env,
      LUNA_DATA_UID: String(process.getuid()),
      LUNA_DATA_GID: String(process.getgid()),
    },
  });
}

test("fresh and repeated initialization retain root credentials", () => {
  const { root, data } = fixture();
  try {
    assert.equal(run(data).status, 0);
    const before = readFileSync(join(data, ".luna", "minio.env"));
    assert.equal(run(data).status, 0);
    assert.deepEqual(readFileSync(join(data, ".luna", "minio.env")), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("missing API credential after completed bucket setup fails without changing root", () => {
  const { root, data } = fixture();
  try {
    assert.equal(run(data).status, 0);
    const state = join(data, ".luna");
    const before = readFileSync(join(state, "minio.env"));
    writeFileSync(join(state, "bucket-initialized"), "initialized\n", { mode: 0o600 });
    const result = run(data);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing API credential/);
    assert.deepEqual(readFileSync(join(state, "minio.env")), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("nonempty data without initialization state fails without overwriting files", () => {
  const { root, data } = fixture();
  try {
    mkdirSync(data);
    const serverDb = join(data, "server.sqlite");
    writeFileSync(serverDb, "synthetic-old-data");
    const result = run(data);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Non-empty Luna data directory/);
    assert.equal(readFileSync(serverDb, "utf8"), "synthetic-old-data");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("wrong secret-file permissions fail instead of being silently repaired", () => {
  const { root, data } = fixture();
  try {
    assert.equal(run(data).status, 0);
    const rootFile = join(data, ".luna", "minio.env");
    chmodSync(rootFile, 0o644);
    const result = run(data);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid Luna data ownership or permissions/);
    assert.equal(statSync(rootFile).mode & 0o777, 0o644);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("missing runtime beside an existing server database fails", () => {
  const { root, data } = fixture();
  try {
    assert.equal(run(data).status, 0);
    const serverDb = join(data, "server.sqlite");
    writeFileSync(serverDb, "synthetic-existing-db");
    const result = run(data);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing its API credential/);
    assert.equal(readFileSync(serverDb, "utf8"), "synthetic-existing-db");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
