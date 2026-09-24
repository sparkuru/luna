import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

if (process.argv.includes("--help")) {
  console.log(
    "Usage: node scripts/smoke-server-restore.mjs\nRequires Docker and built luna-api:local and luna-bucket-init:local images. Creates disposable labeled MinIO/API containers and a copied data/ boundary.",
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

function startMinio(name, network, directory) {
  const dataStat = statSync(directory);
  runContainer(name, network, [
    "--network-alias",
    "minio",
    "--user", `${dataStat.uid}:${dataStat.gid}`,
    "--mount",
    `type=bind,source=${directory},target=/data`,
    "-e", "MINIO_CONFIG_ENV_FILE=/data/.luna/minio.env",
    "--read-only", "--tmpfs", "/tmp:size=16m,mode=1777",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    minioImage,
    "server",
    "/data/minio",
    "--address",
    ":9000",
    "--console-address",
    ":9001",
  ]);
}

function initBucket(network, directory) {
  const dataStat = statSync(directory);
  docker([
    "run", "--rm", "--label", label, "--network", network,
    "--user", `${dataStat.uid}:${dataStat.gid}`,
    "--read-only", "--tmpfs", "/tmp:size=16m,mode=1777",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--mount", `type=bind,source=${directory},target=/data`,
    "luna-bucket-init:local", "/data",
  ]);
}

function startApi(name, network, directory) {
  const dataStat = statSync(directory);
  runContainer(name, network, [
    "--network-alias",
    "api",
    "--user", `${dataStat.uid}:${dataStat.gid}`,
    "--mount",
    `type=bind,source=${directory},target=/data`,
    "--mount",
    "type=bind,source=/dev/null,target=/data/.luna/minio.env,readonly",
    "--read-only",
    "--tmpfs",
    "/tmp:size=16m,mode=1777",
    "--tmpfs",
    "/data/minio:size=1m,mode=000",
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
  const binaryBody = body instanceof Uint8Array || body instanceof ArrayBuffer;
  const serializedBody =
    typeof body === "string" || binaryBody ? body : JSON.stringify(body);
  return fetch(`${base}${path}`, {
    method,
    signal: AbortSignal.timeout(15_000),
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined && !binaryBody ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: serializedBody }),
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
  const legacyData = join(root, "legacy-data");
  const interruptedData = join(root, "interrupted-data");
  const sourceNetwork = `${runId}-source`;
  const restoredNetwork = `${runId}-restored`;
  const legacyNetwork = `${runId}-legacy`;
  const interruptedNetwork = `${runId}-interrupted`;
  createNetwork(sourceNetwork);
  createNetwork(restoredNetwork);
  createNetwork(legacyNetwork);
  createNetwork(interruptedNetwork);
  mkdirSync(sourceData, { recursive: true, mode: 0o700 });
  initData(sourceData);
  const sourceMinio = `${runId}-source-minio`;
  const sourceApi = `${runId}-source-api`;
  startMinio(sourceMinio, sourceNetwork, sourceData);
  initBucket(sourceNetwork, sourceData);
  const runtime = JSON.parse(readFileSync(join(sourceData, ".luna", "runtime.json"), "utf8"));
  const rootEnv = readFileSync(join(sourceData, ".luna", "minio.env"), "utf8");
  assert.ok(!rootEnv.includes(runtime.s3AccessKeyId));
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
  const attachmentFixture = runFixture(sourceApi, { action: "encrypt-with-attachment" });
  const raw = attachmentFixture.raw;
  const attachmentId = attachmentFixture.descriptor.id;
  const attachmentPath = `/api/v1/ledgers/${ledgerId}/attachments/${attachmentId}`;
  const attachmentUsagePath = `/api/v1/ledgers/${ledgerId}/attachments/usage`;
  const attachmentBytes = Buffer.from(attachmentFixture.ciphertext, "base64");
  assert.equal(attachmentBytes.byteLength, attachmentFixture.descriptor.cipherByteLength);
  const attachmentIdempotencyKey = crypto.randomUUID();
  const attachmentPut = await request(sourceBase, attachmentPath, {
    token,
    method: "PUT",
    body: attachmentBytes,
    headers: {
      "content-type": "application/octet-stream",
      "if-none-match": "*",
      "idempotency-key": attachmentIdempotencyKey,
      "x-luna-cipher-sha256": attachmentFixture.descriptor.cipherSha256,
    },
  });
  assert.equal(attachmentPut.status, 200);
  const originalAttachmentEtag = attachmentPut.headers.get("etag");
  assert.ok(originalAttachmentEtag);
  const sourceAttachmentUsage = await request(sourceBase, attachmentUsagePath, { token });
  assert.equal(sourceAttachmentUsage.status, 200);
  const sourceUsage = await sourceAttachmentUsage.json();
  assert.deepEqual(
    {
      usedBytes: sourceUsage.usedBytes,
      reservedBytes: sourceUsage.reservedBytes,
      count: sourceUsage.count,
    },
    { usedBytes: attachmentBytes.byteLength, reservedBytes: 0, count: 1 },
  );
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
  checks.push("fresh SQLite/MinIO installation creates an account, ledger graph, attachment metadata, ciphertext object, usage and ETags");

  docker(["stop", "--time", "15", sourceApi]);
  docker(["stop", "--time", "15", sourceMinio]);
  cpSync(sourceData, restoredData, { recursive: true, errorOnExist: true });
  assert.ok(existsSync(join(restoredData, "server.sqlite")));
  assert.ok(existsSync(join(restoredData, "minio")));
  checks.push("the complete data boundary is copied only after API and MinIO stop");

  const restoredMinio = `${runId}-restored-minio`;
  const restoredApi = `${runId}-restored-api`;
  startMinio(restoredMinio, restoredNetwork, restoredData);
  initBucket(restoredNetwork, restoredData);
  assert.deepEqual(JSON.parse(readFileSync(join(restoredData, ".luna", "runtime.json"), "utf8")), runtime);
  const restoredBase = startApi(restoredApi, restoredNetwork, restoredData);
  await until(async () => (await fetch(`${restoredBase}/readyz`)).ok, "restored API readiness");
  const restoredMeta = await (await request(restoredBase, "/api/v1/meta")).json();
  assert.equal(restoredMeta.instanceId, sourceMeta.instanceId);
  const restored = await request(restoredBase, objectPath, { token });
  assert.equal(restored.status, 200);
  assert.equal(restored.headers.get("etag"), originalEtag);
  assert.equal(await restored.text(), raw);
  const restoredAttachment = await request(restoredBase, attachmentPath, { token });
  assert.equal(restoredAttachment.status, 200);
  assert.equal(restoredAttachment.headers.get("etag"), originalAttachmentEtag);
  assert.equal(
    restoredAttachment.headers.get("x-luna-cipher-sha256"),
    attachmentFixture.descriptor.cipherSha256,
  );
  assert.equal(
    restoredAttachment.headers.get("content-length"),
    String(attachmentBytes.byteLength),
  );
  assert.deepEqual(Buffer.from(await restoredAttachment.arrayBuffer()), attachmentBytes);
  const restoredAttachmentUsage = await request(restoredBase, attachmentUsagePath, { token });
  assert.equal(restoredAttachmentUsage.status, 200);
  const restoredUsage = await restoredAttachmentUsage.json();
  assert.equal(restoredUsage.usedBytes, attachmentBytes.byteLength);
  assert.equal(restoredUsage.reservedBytes, 0);
  assert.equal(restoredUsage.count, 1);
  const attachmentReplay = await request(restoredBase, attachmentPath, {
    token,
    method: "PUT",
    body: attachmentBytes,
    headers: {
      "content-type": "application/octet-stream",
      "if-none-match": "*",
      "idempotency-key": attachmentIdempotencyKey,
      "x-luna-cipher-sha256": attachmentFixture.descriptor.cipherSha256,
    },
  });
  assert.equal(attachmentReplay.status, 200);
  assert.equal(attachmentReplay.headers.get("etag"), originalAttachmentEtag);
  const replay = await request(restoredBase, objectPath, {
    token,
    method: "PUT",
    body: raw,
    headers: { "if-none-match": "*", "idempotency-key": idempotencyKey },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get("etag"), originalEtag);
  checks.push("restored data retains instance identity, account session, graph and attachment ciphertext/metadata, exact ETags, usage and idempotency replays");

  const secondToken = await login(restoredBase, username, accountPassword, "restored-client-b");
  const editA = runFixture(restoredApi, { action: "encrypt-v2", records: ["first", "client-a"] });
  const editB = runFixture(restoredApi, { action: "encrypt-v2", records: ["first", "client-b"] });
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
  assert.equal(latest.status, 200);
  assert.equal(latest.headers.get("etag"), writeA.headers.get("etag"));
  const merged = runFixture(restoredApi, { action: "merge", a: await latest.text(), b: editB });
  const mergedDocument = runFixture(restoredApi, { action: "decrypt", raw: merged });
  const expectedDocuments = [editA, editB].map((raw) =>
    runFixture(restoredApi, { action: "decrypt", raw }),
  );
  const expectedRevisions = new Map(
    expectedDocuments.flatMap((document) => document.revisions.map((revision) => [revision.id, revision])),
  );
  assert.deepEqual(mergedDocument.workspace, expectedDocuments[0].workspace);
  assert.equal(mergedDocument.revisions.length, expectedRevisions.size);
  for (const revision of mergedDocument.revisions) {
    assert.deepEqual(revision, expectedRevisions.get(revision.id));
  }
  assert.deepEqual(
    mergedDocument.revisions.filter((revision) => revision.kind === "transaction").map((revision) => revision.entityId).sort(),
    ["client-a", "client-b", "first"],
  );
  const mergedWrite = await request(restoredBase, objectPath, {
    token: secondToken,
    method: "PUT",
    body: merged,
    headers: { "if-match": latest.headers.get("etag"), "idempotency-key": crypto.randomUUID() },
  });
  assert.equal(mergedWrite.status, 200);
  const mergedEtag = mergedWrite.headers.get("etag");
  assert.ok(mergedEtag);
  assert.notEqual(mergedEtag, originalEtag);
  for (const sessionToken of [token, secondToken]) {
    const committed = await request(restoredBase, objectPath, { token: sessionToken });
    assert.equal(committed.status, 200);
    assert.equal(committed.headers.get("etag"), mergedEtag);
    assert.equal(await committed.text(), merged);
  }
  checks.push("two authenticated clients reject stale CAS, retain both decoded revision sets and read identical merged ciphertext/ETag");

  docker(["stop", "--time", "15", restoredApi]);
  docker(["start", restoredApi]);
  const restartedBase = apiBase(restoredApi);
  await until(async () => (await fetch(`${restartedBase}/readyz`)).ok, "API restart readiness");
  const restartedMeta = await (await request(restartedBase, "/api/v1/meta")).json();
  assert.equal(restartedMeta.instanceId, sourceMeta.instanceId);
  for (const sessionToken of [token, secondToken]) {
    const final = await request(restartedBase, objectPath, { token: sessionToken });
    assert.equal(final.status, 200);
    assert.equal(final.headers.get("etag"), mergedEtag);
    const finalRaw = await final.text();
    assert.equal(finalRaw, merged);
    assert.deepEqual(runFixture(restoredApi, { action: "decrypt", raw: finalRaw }), mergedDocument);
  }
  const finalAttachment = await request(restartedBase, attachmentPath, { token });
  assert.equal(finalAttachment.status, 200);
  assert.equal(finalAttachment.headers.get("etag"), originalAttachmentEtag);
  assert.deepEqual(Buffer.from(await finalAttachment.arrayBuffer()), attachmentBytes);
  const finalAttachmentUsage = await request(restartedBase, attachmentUsagePath, { token });
  assert.equal(finalAttachmentUsage.status, 200);
  const finalUsage = await finalAttachmentUsage.json();
  assert.equal(finalUsage.usedBytes, attachmentBytes.byteLength);
  assert.equal(finalUsage.reservedBytes, 0);
  assert.equal(finalUsage.count, 1);
  checks.push("API restart retains instance identity, both sessions, exact merged ciphertext/ETag and decoded revision graph");

  cpSync(sourceData, legacyData, { recursive: true, errorOnExist: true });
  const legacyRoot = Object.fromEntries(
    readFileSync(join(legacyData, ".luna", "minio.env"), "utf8")
      .trim().split("\n").map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  writeFileSync(join(legacyData, ".luna", "runtime.json"), JSON.stringify({
    ...runtime,
    s3AccessKeyId: legacyRoot.MINIO_ROOT_USER,
    s3SecretAccessKey: legacyRoot.MINIO_ROOT_PASSWORD,
  }) + "\n");
  const legacyMinio = `${runId}-legacy-minio`;
  const legacyApi = `${runId}-legacy-api`;
  startMinio(legacyMinio, legacyNetwork, legacyData);
  initBucket(legacyNetwork, legacyData);
  assert.equal(readFileSync(join(legacyData, ".luna", "minio.env"), "utf8"), rootEnv);
  const upgraded = JSON.parse(readFileSync(join(legacyData, ".luna", "runtime.json"), "utf8"));
  assert.notEqual(upgraded.s3AccessKeyId, legacyRoot.MINIO_ROOT_USER);
  assert.notEqual(upgraded.s3SecretAccessKey, legacyRoot.MINIO_ROOT_PASSWORD);
  const legacyBase = startApi(legacyApi, legacyNetwork, legacyData);
  await until(async () => (await fetch(`${legacyBase}/readyz`)).ok, "legacy upgrade API readiness");
  const legacyObject = await request(legacyBase, objectPath, { token });
  assert.equal(legacyObject.status, 200);
  assert.equal(legacyObject.headers.get("etag"), originalEtag);
  assert.equal(await legacyObject.text(), raw);
  checks.push("legacy root-backed API runtime upgrades to a limited key without losing ciphertext or instance identity");

  mkdirSync(interruptedData, { recursive: true, mode: 0o700 });
  initData(interruptedData);
  startMinio(`${runId}-interrupted-minio`, interruptedNetwork, interruptedData);
  initBucket(interruptedNetwork, interruptedData);
  const firstKey = JSON.parse(readFileSync(join(interruptedData, ".luna", "runtime.json"), "utf8"));
  unlinkSync(join(interruptedData, ".luna", "runtime.json"));
  unlinkSync(join(interruptedData, ".luna", "bucket-initialized"));
  initData(interruptedData);
  initBucket(interruptedNetwork, interruptedData);
  const replacementKey = JSON.parse(readFileSync(join(interruptedData, ".luna", "runtime.json"), "utf8"));
  assert.notEqual(replacementKey.s3AccessKeyId, firstKey.s3AccessKeyId);
  const denied = docker([
    "run", "--rm", "-i", "--network", interruptedNetwork,
    "--entrypoint", "node", apiImage, "-e",
    "const fs=require('node:fs');const {S3Client,HeadBucketCommand}=require('@aws-sdk/client-s3');const r=JSON.parse(fs.readFileSync(0,'utf8'));const c=new S3Client({endpoint:r.s3Endpoint,region:r.s3Region,forcePathStyle:true,credentials:{accessKeyId:r.s3AccessKeyId,secretAccessKey:r.s3SecretAccessKey}});c.send(new HeadBucketCommand({Bucket:r.s3Bucket})).then(()=>process.exit(1),e=>{if(e.$metadata?.httpStatusCode!==403)process.exit(1);console.log('old-key-denied')});",
  ], JSON.stringify(firstKey)).toString().trim();
  assert.equal(denied, "old-key-denied");
  checks.push("interrupted credential publication removes the orphan key before creating a replacement");

  const interruptedRoot = Object.fromEntries(
    readFileSync(join(interruptedData, ".luna", "minio.env"), "utf8")
      .trim().split("\n").map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  docker([
    "run", "--rm", "-i", "--network", interruptedNetwork,
    "--entrypoint", "node", apiImage, "-e",
    "const fs=require('node:fs');const {S3Client,DeleteBucketCommand}=require('@aws-sdk/client-s3');const r=JSON.parse(fs.readFileSync(0,'utf8'));const c=new S3Client({endpoint:r.s3Endpoint,region:r.s3Region,forcePathStyle:true,credentials:{accessKeyId:r.s3AccessKeyId,secretAccessKey:r.s3SecretAccessKey}});c.send(new DeleteBucketCommand({Bucket:r.s3Bucket})).catch(()=>process.exit(1));",
  ], JSON.stringify({
    ...replacementKey,
    s3AccessKeyId: interruptedRoot.MINIO_ROOT_USER,
    s3SecretAccessKey: interruptedRoot.MINIO_ROOT_PASSWORD,
  }));
  assert.throws(() => initBucket(interruptedNetwork, interruptedData), /Docker run failed/);
  assert.deepEqual(JSON.parse(readFileSync(join(interruptedData, ".luna", "runtime.json"), "utf8")), replacementKey);
  checks.push("missing bucket on an initialized installation fails without creating an empty replacement");
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
