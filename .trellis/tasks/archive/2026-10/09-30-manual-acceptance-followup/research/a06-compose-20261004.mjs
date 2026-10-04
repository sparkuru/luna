import assert from "node:assert/strict";
import { cpSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
const crypto = { randomUUID };
const repo = resolve(process.env.LUNA_A06_REPO ?? process.cwd());
const root = mkdtempSync(join(tmpdir(), "luna-a06-compose-"));
const runId = "luna-a06-" + randomUUID().slice(0, 8);
const sourceProject = runId + "-source", restoredProject = runId + "-restored";
const sourceData = join(root, "source-data"), restoredData = join(root, "restored-data");
const projects = [];
const checks = [];
const fixtureScript = readFileSync(join(repo, "deploy/restore-fixture.cjs"), "utf8");
const override = join(root, "compose.images.yaml");
writeFileSync(override, "services:\n  minio:\n    image: minio/minio:RELEASE.2025-09-07T16-13-09Z\n    pull_policy: never\n  bucket-init:\n    image: luna-bucket-init:a06-20261004\n  api:\n    image: luna-api:a06-20261003\n  web:\n    image: luna-web:a06-20261004\n");
function docker(args, input) {
  const r=spawnSync("docker",args,{input,timeout:180000,maxBuffer:8*1024*1024});
  if(r.error || r.status!==0) throw new Error("Docker command failed: "+args[0]);
  return r.stdout;
}
function compose(project,data,args,allowFailure=false) {
  if(!projects.some(p=>p.project===project)) projects.push({project,data});
  const r=spawnSync("docker",["compose","-f",join(repo,"compose.yaml"),"-f",override,"-p",project,...args],{env:{...process.env,LUNA_DATA_PATH:data,LUNA_PORT:"0",LUNA_ALLOWED_ORIGINS:"",LUNA_UID:String(process.getuid()),LUNA_GID:String(process.getgid())},encoding:"utf8",timeout:180000,maxBuffer:8*1024*1024});
  if(!allowFailure && (r.error || r.status!==0)) throw new Error("Compose stage failed: "+args[0]);
  return r;
}
function service(project,data,name) { return compose(project,data,["ps","--all","--quiet",name]).stdout.trim(); }
function webBase(project,data) {
  const p=compose(project,data,["port","web","8080"]).stdout.trim();
  assert.match(p,/^127\.0\.0\.1:\d+$/);
  return "http://"+p;
}
function digest(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
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
  mkdirSync(sourceData,{mode:0o700});
  compose(sourceProject,sourceData,["config","--quiet"]);
  compose(sourceProject,sourceData,["up","-d","--no-build"]);
  const sourceApi=service(sourceProject,sourceData,"api");
  const sourceBase=webBase(sourceProject,sourceData);
  const runtimeBytes=readFileSync(join(sourceData,".luna/runtime.json"));
  const runtime=JSON.parse(runtimeBytes);
  const rootEnv=readFileSync(join(sourceData,".luna/minio.env"),"utf8");
  assert.ok(!rootEnv.includes(runtime.s3AccessKeyId));
  await until(async()=>(await fetch(sourceBase+"/api/v1/meta")).ok,"source Web/API readiness");
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

  const refusal = spawnSync(process.execPath, [join(repo, "deploy/backup.mjs"), sourceData, restoredData], { encoding: "utf8" });
  assert.notEqual(refusal.status, 0);
  assert.match(refusal.stderr, /running container/);
  assert.equal(existsSync(restoredData), false);
  checks.push("product backup rejects running Compose data writers without creating a destination");
  compose(sourceProject, sourceData, ["stop"]);
  const saved = spawnSync(process.execPath, [join(repo, "deploy/backup.mjs"), sourceData, restoredData], { encoding: "utf8" });
  assert.equal(saved.status, 0, saved.stderr);
  assert.match(saved.stdout, /LUNA_SERVER_BACKUP_OK/);
  assert.ok(existsSync(join(restoredData, "server.sqlite")));
  assert.ok(existsSync(join(restoredData, "minio")));
  checks.push("the complete data boundary is copied only after API and MinIO stop");

  compose(restoredProject, restoredData, ["up", "-d", "--no-build"]);
  const restoredApi = service(restoredProject, restoredData, "api");
  assert.deepEqual(readFileSync(join(restoredData, ".luna", "runtime.json")), runtimeBytes);
  const restoredBase = webBase(restoredProject, restoredData);
  await until(async () => (await fetch(`${restoredBase}/api/v1/meta`)).ok, "restored API readiness");
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

  compose(restoredProject, restoredData, ["stop"]);
  compose(restoredProject, restoredData, ["up", "-d", "--no-build"]);
  const restartedBase = webBase(restoredProject, restoredData);
  await until(async () => (await fetch(`${restartedBase}/api/v1/meta`)).ok, "API restart readiness");
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

  for (const project of [sourceProject, restoredProject]) {
    const data = project === sourceProject ? sourceData : restoredData;
    const web = service(project,data,"web");
    if (project === restoredProject) {
      await until(()=>JSON.parse(docker(["inspect","--format","{{json .State.Health}}",web]).toString()).Status==="healthy","Web health with inherited proxy");
      const api = service(project,data,"api"), minio = service(project,data,"minio");
      for (const id of [api,minio,web]) {
        const host = JSON.parse(docker(["inspect","--format","{{json .HostConfig}}",id]).toString());
        assert.equal(host.ReadonlyRootfs,true);
        assert.ok(host.CapDrop.includes("ALL"));
        assert.ok(host.SecurityOpt.some(v=>v.startsWith("no-new-privileges")));
      }
      const response=await fetch(webBase(project,data)+"/");
      assert.equal(response.headers.get("cross-origin-opener-policy"),"same-origin");
      assert.equal(response.headers.get("cross-origin-embedder-policy"),"require-corp");
      assert.match(response.headers.get("content-security-policy"),/wasm-unsafe-eval/);
    }
  }
  checks.push("Compose Web healthy under inherited host proxies, loopback publishing and private API/MinIO sandbox retained");
  compose(restoredProject,restoredData,["stop"]);
  const originalDb = digest(join(sourceData,"server.sqlite"));
  for (const scenario of ["missing-runtime","wrong-permissions","half-initialized"]) {
    const data=join(root,scenario);
    if(scenario === "half-initialized") {
      mkdirSync(data,{mode:0o700});
      writeFileSync(join(data,"server.sqlite"),"synthetic-half-initialized");
    } else cpSync(sourceData,data,{recursive:true});
    const before=digest(join(data,"server.sqlite"));
    if(scenario === "missing-runtime") unlinkSync(join(data,".luna/runtime.json"));
    if(scenario === "wrong-permissions") chmodSync(join(data,".luna/minio.env"),0o644);
    const p=runId+"-"+scenario;
    const failed=compose(p,data,["up","-d","--no-build"],true);
    assert.notEqual(failed.status,0);
    assert.equal(digest(join(data,"server.sqlite")),before);
    assert.equal(compose(p,data,["ps","--status","running","--quiet","api"]).stdout.trim(),"");
    if(scenario === "wrong-permissions") assert.equal(statSync(join(data,".luna/minio.env")).mode & 0o777,0o644);
    if(scenario === "missing-runtime") assert.equal(existsSync(join(data,".luna/runtime.json")),false);
    checks.push("real Compose refuses "+scenario+" without starting API or changing original database");
  }
  assert.equal(digest(join(sourceData,"server.sqlite")),originalDb);
  const missingBucketData=join(root,"missing-bucket"), missingBucketProject=runId+"-missing-bucket";
  mkdirSync(missingBucketData,{mode:0o700});
  compose(missingBucketProject,missingBucketData,["up","-d","--no-build"]);
  compose(missingBucketProject,missingBucketData,["stop","web","api"]);
  const bucketRuntime=readFileSync(join(missingBucketData,".luna/runtime.json"));
  const bucketDb=digest(join(missingBucketData,"server.sqlite"));
  const credentials=Object.fromEntries(readFileSync(join(missingBucketData,".luna/minio.env"),"utf8").trim().split("\n").map(line=>{const i=line.indexOf("=");return [line.slice(0,i),line.slice(i+1)];}));
  const rootRuntime={...JSON.parse(bucketRuntime),s3AccessKeyId:credentials.MINIO_ROOT_USER,s3SecretAccessKey:credentials.MINIO_ROOT_PASSWORD};
  const probe="const fs=require('node:fs');const {S3Client,DeleteBucketCommand,HeadBucketCommand}=require('@aws-sdk/client-s3');const r=JSON.parse(fs.readFileSync(0,'utf8'));const c=new S3Client({endpoint:r.s3Endpoint,region:r.s3Region,forcePathStyle:true,credentials:{accessKeyId:r.s3AccessKeyId,secretAccessKey:r.s3SecretAccessKey}});";
  const args=["run","--rm","-i","--label","luna.a06-run="+runId,"--network",missingBucketProject+"_default","--entrypoint","node","luna-api:a06-20261003","-e"];
  docker([...args,probe+"c.send(new DeleteBucketCommand({Bucket:r.s3Bucket})).catch(()=>process.exit(1));"],JSON.stringify(rootRuntime));
  const bucketFailure=compose(missingBucketProject,missingBucketData,["up","-d","--no-build"],true);
  assert.notEqual(bucketFailure.status,0);
  assert.deepEqual(readFileSync(join(missingBucketData,".luna/runtime.json")),bucketRuntime);
  assert.equal(digest(join(missingBucketData,"server.sqlite")),bucketDb);
  assert.equal(compose(missingBucketProject,missingBucketData,["ps","--status","running","--quiet","api"]).stdout.trim(),"");
  docker([...args,probe+"c.send(new HeadBucketCommand({Bucket:r.s3Bucket})).then(()=>process.exit(1),e=>{if(e.$metadata?.httpStatusCode!==404)process.exit(1)});"],JSON.stringify(rootRuntime));
  checks.push("real Compose refuses missing bucket, preserves runtime/database and never recreates an empty bucket");

  return {date:"2026-10-04", acceptanceId:"A06",checks, count:checks.length, sourceProject, restoredProject, root};
}
try {
  const report=await main();
  writeFileSync(join(root,"report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});
  console.log("LUNA_A06_COMPOSE_OK "+root);
  for(const check of checks) console.log("PASS "+check);
} catch(error) { console.error(error instanceof Error?error.message:"A06 failed");process.exitCode=1; }
finally {
  for(const {project,data} of projects.reverse()) compose(project,data,["down","--remove-orphans"],true);
}
