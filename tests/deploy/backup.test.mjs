import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const script = resolve("deploy/backup.mjs");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "luna-backup-test-"));
  const data = join(root, "data");
  const destination = join(root, "backup");
  const bin = join(root, "bin");
  const state = join(root, "docker.json");
  mkdirSync(join(data, ".luna"), { recursive: true, mode: 0o700 });
  mkdirSync(join(data, "minio"), { mode: 0o700 });
  mkdirSync(bin);
  for (const name of ["initialized", "bucket-initialized", "runtime.json", "minio.env"])
    writeFileSync(join(data, ".luna", name), name.endsWith("initialized") ? "initialized\n" : "synthetic-secret", { mode: 0o600 });
  writeFileSync(join(data, "server.sqlite"), "synthetic-database", { mode: 0o600 });
  writeFileSync(join(data, "minio", "ciphertext"), "synthetic-ciphertext", { mode: 0o600 });
  writeFileSync(state, JSON.stringify({ ids: [], mounts: [] }));
  writeFileSync(join(bin, "docker"), `#!${process.execPath}\nconst fs=require('node:fs');const s=JSON.parse(fs.readFileSync(process.env.BACKUP_TEST_STATE));if(s.fail)process.exit(1);console.log(process.argv[2]==='context'?(s.endpoint??'unix:///var/run/docker.sock'):process.argv[2]==='ps'?s.ids.join('\\n'):JSON.stringify(s.mounts));\n`, { mode: 0o700 });
  return {
    root, data, destination, bin, state,
    run: (dockerEnv = {}) => spawnSync(process.execPath, [script, data, destination], { encoding: "utf8", env: { ...process.env, DOCKER_HOST: "", DOCKER_CONTEXT: "", ...dockerEnv, PATH: `${bin}:${process.env.PATH}`, BACKUP_TEST_STATE: state } }),
    docker: (value) => writeFileSync(state, JSON.stringify(value)),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("stopped full boundary backup retains secret permissions, ciphertext and numeric owner", () => {
  const f = fixture();
  try {
    assert.equal(f.run().status, 0);
    assert.deepEqual(readFileSync(join(f.destination, "minio", "ciphertext")), readFileSync(join(f.data, "minio", "ciphertext")));
    assert.deepEqual(readFileSync(join(f.destination, ".luna", "runtime.json")), readFileSync(join(f.data, ".luna", "runtime.json")));
    assert.equal(statSync(join(f.destination, ".luna", "runtime.json")).mode & 0o777, 0o600);
    assert.equal(statSync(f.destination).uid, statSync(f.data).uid);
    assert.equal(statSync(f.destination).gid, statSync(f.data).gid);
    assert.equal(statSync(f.destination).mode & 0o777, 0o700);
  } finally { f.cleanup(); }
});

test("remote Docker contexts, hosts and conflicting overrides refuse before copying", () => {
  const f = fixture();
  try {
    f.docker({ ids: [], mounts: [], endpoint: "ssh://remote" });
    assert.match(f.run({ DOCKER_CONTEXT: "remote", DOCKER_HOST: "unix:///var/run/docker.sock" }).stderr, /local Unix-socket/);
    f.docker({ ids: [], mounts: [] });
    assert.match(f.run({ DOCKER_HOST: "tcp://remote:2375" }).stderr, /local Unix-socket/);
    assert.equal(existsSync(f.destination), false);
    assert.match(f.run({ DOCKER_CONTEXT: "local", DOCKER_HOST: "tcp://conflicting:2375" }).stderr, /local Unix-socket/);
    assert.equal(f.run({ DOCKER_CONTEXT: "local", DOCKER_HOST: "unix:///var/run/docker.sock" }).status, 0);
  } finally { f.cleanup(); }
});

test("running API, parent data mount, nested object mount and read-only mount all refuse without copying", () => {
  const f = fixture();
  try {
    for (const [source, type] of [[f.data, "bind"], [f.root, "bind"], [join(f.data, "minio"), "bind"], [f.data, "volume"]]) {
      f.docker({ ids: ["running"], mounts: [{ Type: type, Source: source, RW: false }] });
      const result = f.run();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /running container/);
      assert.equal(existsSync(f.destination), false);
      assert.equal(readFileSync(join(f.data, "server.sqlite"), "utf8"), "synthetic-database");
    }
  } finally { f.cleanup(); }
});

test("copy failure removes owned staging but retains an unexpected destination file", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.bin, "cp"), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(join(f.destination, "unexpected"))},'keep-concurrent-file');process.exit(1);\n`, { mode: 0o700 });
    assert.match(f.run().stderr, /cp command failed/);
    assert.equal(readFileSync(join(f.destination, "unexpected"), "utf8"), "keep-concurrent-file");
    assert.equal(readdirSync(f.root).some((name) => name.startsWith(".luna-backup-")), false);
    assert.equal(readFileSync(join(f.data, "server.sqlite"), "utf8"), "synthetic-database");
  } finally { f.cleanup(); }
});

test("unrelated mounted tree does not prevent a stopped backup", () => {
  const f = fixture();
  try {
    const unrelated = join(f.root, "other-data");
    mkdirSync(unrelated);
    f.docker({ ids: ["other"], mounts: [{ Type: "bind", Source: unrelated }, { Type: "volume", Source: "/var/lib/docker/volumes/unrelated-fixture/_data" }] });
    assert.equal(f.run().status, 0);
  } finally { f.cleanup(); }
});

test("missing runtime, wrong secret permissions and symlink reject while preserving original data", () => {
  const f = fixture();
  try {
    const runtime = join(f.data, ".luna", "runtime.json");
    unlinkSync(runtime);
    assert.notEqual(f.run().status, 0);
    writeFileSync(runtime, "synthetic-secret", { mode: 0o644 });
    assert.match(f.run().stderr, /permissions/);
    assert.equal(statSync(runtime).mode & 0o777, 0o644);
    chmodSync(runtime, 0o600);
    symlinkSync(join(f.data, "server.sqlite"), join(f.data, "linked"));
    assert.match(f.run().stderr, /symbolic link/);
    assert.equal(existsSync(f.destination), false);
    assert.equal(readFileSync(join(f.data, "server.sqlite"), "utf8"), "synthetic-database");
  } finally { f.cleanup(); }
});

test("existing destination is preserved and Docker failure refuses closed", () => {
  const f = fixture();
  try {
    mkdirSync(f.destination);
    writeFileSync(join(f.destination, "keep"), "unknown-existing-file");
    assert.match(f.run().stderr, /already exists/);
    assert.equal(readFileSync(join(f.destination, "keep"), "utf8"), "unknown-existing-file");
    f.docker({ fail: true });
    assert.match(f.run().stderr, /Docker|docker/);
    assert.equal(readFileSync(join(f.destination, "keep"), "utf8"), "unknown-existing-file");
  } finally { f.cleanup(); }
});

test("container restart during copy discards only this run's staging and empty reservation", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.bin, "cp"), `#!${process.execPath}\nconst fs=require('node:fs');const r=require('node:child_process').spawnSync('/bin/cp',process.argv.slice(2));fs.writeFileSync(process.env.BACKUP_TEST_STATE,JSON.stringify({ids:['restarted'],mounts:[{Type:'bind',Source:${JSON.stringify(f.data)}}]}));process.exit(r.status);\n`, { mode: 0o700 });
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /running container/);
    assert.equal(existsSync(f.destination), false);
    assert.equal(readdirSync(f.root).some((name) => name.startsWith(".luna-backup-")), false);
    assert.equal(readFileSync(join(f.data, "server.sqlite"), "utf8"), "synthetic-database");
  } finally { f.cleanup(); }
});
