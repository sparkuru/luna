import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

if (process.argv.includes("--help")) {
  console.log(
    "Usage: node scripts/smoke-server-restore.mjs\nRequires Docker and a built luna-api:local image. Creates disposable labeled MinIO/API containers and a copied data/ boundary.",
  );
  process.exit(0);
}
if (process.argv.length !== 2) throw new Error("Unexpected arguments; use --help");

const root = mkdtempSync(join(tmpdir(), "luna-server-restore-"));
const repo = resolve(fileURLToPath(new URL("../", import.meta.url)));
const initScript = join(repo, "deploy", "instance-init.mjs");
const fixtureScript = readFileSync(join(repo, "deploy", "restore-fixture.cjs"), "utf8");
const apiImage = process.env.LUNA_RESTORE_API_IMAGE ?? "luna-api:local";
const minioImage =
  process.env.LUNA_RESTORE_MINIO_IMAGE ??
  "minio/minio:RELEASE.2025-09-07T16-13-09Z@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e";
const nodeImage = process.env.LUNA_RESTORE_INIT_IMAGE ?? "node:22.22.0-bookworm-slim";
const runId = `luna-restore-${crypto.randomUUID().slice(0, 8)}`;
const label = `luna.restore-run=${runId}`;
const containers = [];
const networks = [];
const checks = [];

function docker(args, input) {
  const result = spawnSync("docker", args, {
    input,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 180_000,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr?.toString().slice(0, 1200);
    throw new Error(`Docker ${args[0] ?? "command"} failed: ${detail}`);
  }
  return result.stdout;
}

function createNetwork(name) {
  docker(["network", "create", "--label", label, name]);
  networks.push(name);
}

function runContainer(name, network, args) {
  docker(["run", "-d", "--name", name, "--label", label, "--network", network, ...args]);
  containers.push(name);
}

function initData(directory) {
  docker([
    "run",
    "--rm",
    "--user",
    "0:0",
    "--label",
    label,
    "--mount",
    `type=bind,source=${directory},target=/data`,
    "--mount",
    `type=bind,source=${initScript},target=/init/instance-init.mjs,readonly`,
    nodeImage,
    "node",
    "/init/instance-init.mjs",
    "/data",
  ]);
}

function startMinio(name, network, directory, runtime) {
  runContainer(name, network, [
    "--network-alias",
    "minio",
    "--mount",
    `type=bind,source=${directory},target=/data`,
    "-e",
    `MINIO_ROOT_USER=${runtime.s3AccessKeyId}`,
    "-e",
    `MINIO_ROOT_PASSWORD=${runtime.s3SecretAccessKey}`,
    minioImage,
    "server",
    "/data/minio",
    "--address",
    ":9000",
    "--console-address",
    ":9001",
  ]);
}

function startApi(name, network, directory) {
  runContainer(name, network, [
    "--network-alias",
    "api",
    "--mount",
    `type=bind,source=${directory},target=/data`,
    "--read-only",
    "--tmpfs",
    "/tmp:size=16m,mode=1777",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "-e",
    "LUNA_DATA_DIR=/data",
    "-e",
    "LUNA_RUNTIME_CONFIG_FILE=/data/.luna/runtime.json",
    "-e",
    "LUNA_ALLOWED_ORIGINS=",
    "-e",
    "LUNA_HOST=0.0.0.0",
    "-e",
    "LUNA_PORT=3000",
    "-p",
    "127.0.0.1::3000",
    apiImage,
  ]);
  return apiBase(name);
}

function apiBase(name) {
  const published = docker(["port", name, "3000/tcp"]).toString().trim();
  const match = /:(\d+)$/.exec(published);
  if (!match) throw new Error("Could not determine API port");
  return `http://127.0.0.1:${match[1]}`;
}

async function until(check, description) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      /* Readiness retries are bounded and never print response bodies. */
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`Timed out: ${description}`);
}

async function request(base, path, options = {}) {
  const { token, method = "GET", body, headers = {} } = options;
  return fetch(`${base}${path}`, {
    method,
    signal: AbortSignal.timeout(15_000),
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

async function login(base, username, password, deviceLabel) {
  const response = await request(base, "/api/v1/auth/sessions", {
    method: "POST",
    body: { username, password, deviceLabel },
  });
  assert.equal(response.status, 201);
  return (await response.json()).token;
}

function runFixture(container, input) {
  return JSON.parse(
    docker(["exec", "-i", container, "node", "-e", fixtureScript], JSON.stringify(input)).toString(),
  );
}

async function main() {
  const sourceData = join(root, "source-data");
  const restoredData = join(root, "restored-data");
  const sourceNetwork = `${runId}-source`;
  const restoredNetwork = `${runId}-restored`;
  createNetwork(sourceNetwork);
  createNetwork(restoredNetwork);
  mkdirSync(sourceData, { recursive: true, mode: 0o700 });
  initData(sourceData);
  const runtime = JSON.parse(readFileSync(join(sourceData, ".luna", "runtime.json"), "utf8"));
  const sourceMinio = `${runId}-source-minio`;
  const sourceApi = `${runId}-source-api`;
  startMinio(sourceMinio, sourceNetwork, sourceData, runtime);
  const sourceBase = startApi(sourceApi, sourceNetwork, sourceData);
  await until(async () => (await fetch(`${sourceBase}/readyz`)).ok, "source API readiness");
  runFixture(sourceApi, { action: "account" });
  const username = "restore_fixture";
  const accountPassword = "restore-fixture-account-password";
  const token = await login(sourceBase, username, accountPassword, "source");
  const sourceMeta = await (await request(sourceBase, "/api/v1/meta")).json();
  const created = await request(sourceBase, "/api/v1/ledgers", {
    token,
    method: "POST",
    body: {},
    headers: { "idempotency-key": crypto.randomUUID() },
  });
  assert.equal(created.status, 201);
  const ledgerId = (await created.json()).id;
  const objectPath = `/api/v1/ledgers/${ledgerId}/object`;
  const raw = runFixture(sourceApi, { action: "encrypt" });
  const idempotencyKey = crypto.randomUUID();
  const firstPut = await request(sourceBase, objectPath, {
    token,
    method: "PUT",
    body: raw,
    headers: { "if-none-match": "*", "idempotency-key": idempotencyKey },
  });
  assert.equal(firstPut.status, 200);
  const originalEtag = firstPut.headers.get("etag");
  assert.ok(originalEtag);
  checks.push("fresh SQLite/MinIO installation creates an account, ledger, encrypted object and ETag");

  docker(["stop", "--time", "15", sourceApi]);
  docker(["stop", "--time", "15", sourceMinio]);
  cpSync(sourceData, restoredData, { recursive: true, errorOnExist: true });
  assert.ok(existsSync(join(restoredData, "server.sqlite")));
  assert.ok(existsSync(join(restoredData, "minio")));
  checks.push("the complete data boundary is copied only after API and MinIO stop");

  const restoredMinio = `${runId}-restored-minio`;
  const restoredApi = `${runId}-restored-api`;
  startMinio(restoredMinio, restoredNetwork, restoredData, runtime);
  const restoredBase = startApi(restoredApi, restoredNetwork, restoredData);
  await until(async () => (await fetch(`${restoredBase}/readyz`)).ok, "restored API readiness");
  const restoredMeta = await (await request(restoredBase, "/api/v1/meta")).json();
  assert.equal(restoredMeta.instanceId, sourceMeta.instanceId);
  const restored = await request(restoredBase, objectPath, { token });
  assert.equal(restored.status, 200);
  assert.equal(restored.headers.get("etag"), originalEtag);
  assert.equal(await restored.text(), raw);
  const replay = await request(restoredBase, objectPath, {
    token,
    method: "PUT",
    body: raw,
    headers: { "if-none-match": "*", "idempotency-key": idempotencyKey },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get("etag"), originalEtag);
  checks.push("restored data retains instance identity, account session, exact ciphertext, ETag and idempotency replay");

  const secondToken = await login(restoredBase, username, accountPassword, "restored-client-b");
  const editA = runFixture(restoredApi, { action: "encrypt", records: ["first", "client-a"] });
  const editB = runFixture(restoredApi, { action: "encrypt", records: ["first", "client-b"] });
  const writeA = await request(restoredBase, objectPath, {
    token,
    method: "PUT",
    body: editA,
    headers: { "if-match": originalEtag, "idempotency-key": crypto.randomUUID() },
  });
  assert.equal(writeA.status, 200);
  const stale = await request(restoredBase, objectPath, {
    token: secondToken,
    method: "PUT",
    body: editB,
    headers: { "if-match": originalEtag, "idempotency-key": crypto.randomUUID() },
  });
  assert.equal(stale.status, 412);
  const latest = await request(restoredBase, objectPath, { token: secondToken });
  const merged = runFixture(restoredApi, { action: "merge", a: await latest.text(), b: editB });
  const mergedWrite = await request(restoredBase, objectPath, {
    token: secondToken,
    method: "PUT",
    body: merged,
    headers: { "if-match": latest.headers.get("etag"), "idempotency-key": crypto.randomUUID() },
  });
  assert.equal(mergedWrite.status, 200);
  checks.push("two authenticated clients reject stale CAS and converge through decrypt/merge/conditional write");

  docker(["stop", "--time", "15", restoredApi]);
  docker(["start", restoredApi]);
  const restartedBase = apiBase(restoredApi);
  await until(async () => (await fetch(`${restartedBase}/readyz`)).ok, "API restart readiness");
  const final = await request(restartedBase, objectPath, { token: secondToken });
  assert.equal(final.status, 200);
  checks.push("API restart reopens the restored SQLite/MinIO boundary without changing the committed object");
  return {
    checks,
    apiImage: docker(["image", "inspect", "--format", "{{.Id}}", apiImage]).toString().trim(),
    minioImage: docker(["image", "inspect", "--format", "{{.Id}}", minioImage]).toString().trim(),
    boundary: "Disposable SQLite/MinIO/API resources and a copied data directory; not production or device evidence.",
  };
}

try {
  const report = await main();
  writeFileSync(join(root, "report.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log(`LUNA_SERVER_RESTORE_OK ${root}`);
  for (const check of report.checks) console.log(`PASS ${check}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Luna restore smoke failed");
  for (const name of containers) {
    try {
      const output = docker(["logs", "--tail", "80", name]).toString().trim();
      if (output) console.error(`--- ${name} ---\n${output}`);
    } catch {
      /* The failing container may already have been removed by Docker. */
    }
  }
  process.exitCode = 1;
} finally {
  for (const name of [...containers].reverse()) {
    try {
      const owner = docker(["inspect", "--format", "{{index .Config.Labels \"luna.restore-run\"}}", name]).toString().trim();
      if (owner === runId) docker(["rm", "-f", name]);
    } catch {
      /* Cleanup is best effort after the labeled ownership check. */
    }
  }
  for (const name of [...networks].reverse()) {
    try {
      const owner = docker(["network", "inspect", "--format", "{{index .Labels \"luna.restore-run\"}}", name]).toString().trim();
      if (owner === runId) docker(["network", "rm", name]);
    } catch {
      /* Cleanup is best effort after the labeled ownership check. */
    }
  }
}
