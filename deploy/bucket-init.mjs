import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "/data");
const state = join(root, ".luna");
const runtimeFile = join(state, "runtime.json");
const bucketReadyFile = join(state, "bucket-initialized");
const rootCredentials = parseRootEnv(await readFile(join(state, "minio.env"), "utf8"));
const scratch = await mkdtemp(join(tmpdir(), "luna-bucket-init-"));
await chmod(scratch, 0o700);
try {
  const mcConfig = join(scratch, "mc");
  const mcEnv = { ...process.env, MC_CONFIG_DIR: mcConfig, MC_DISABLE_PAGER: "1", MC_NO_COLOR: "1" };
  const rootAlias = JSON.stringify({
    url: "http://minio:9000",
    accessKey: rootCredentials.user,
    secretKey: rootCredentials.password,
    api: "s3v4",
    path: "on",
  });
  await importAlias("root", rootAlias, mcEnv, scratch);

  let existing = await readRuntime(runtimeFile);
  const markerExists = await readMarker(bucketReadyFile);
  if (markerExists && !existing)
    throw new Error("Missing API credential from initialized Luna data directory");

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (tryMc(["ready", "root"], mcEnv)) {
      ready = true;
      break;
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  if (!ready) throw new Error("MinIO did not become ready");
  if (!tryMc(["stat", "root/luna-sync"], mcEnv)) {
    if (existing || markerExists)
      throw new Error("Existing Luna data is missing its object-store bucket");
    mc(["mb", "--ignore-existing", "root/luna-sync"], mcEnv);
  }

  const policy = {
    Version: "2012-10-17",
    Statement: [
      { Effect: "Allow", Action: ["s3:ListBucket"], Resource: ["arn:aws:s3:::luna-sync"] },
      { Effect: "Allow", Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource: ["arn:aws:s3:::luna-sync/luna/*"] },
    ],
  };
  const policyFile = join(scratch, "policy.json");
  await writeFile(policyFile, JSON.stringify(policy), { mode: 0o600 });

  if (existing && !isRootCredential(existing, rootCredentials)) {
    verifyRuntime(existing);
    await verifyLimitedAccess(existing, mcEnv, scratch, policy);
    console.log("Luna limited object-store credential reused");
  } else {
    removeInterruptedBootstrapKeys(mcEnv, policy);
    const created = parseCreatedKey(mc(["admin", "accesskey", "create", "--json", "--policy", policyFile, "--name", "luna-sync-api", "root"], mcEnv));
    existing = {
      schemaVersion: 1,
      s3Endpoint: "http://minio:9000",
      s3Region: "us-east-1",
      s3Bucket: "luna-sync",
      s3Prefix: "luna",
      s3AccessKeyId: created.accessKey,
      s3SecretAccessKey: created.secretKey,
      s3ForcePathStyle: true,
    };
    await verifyLimitedAccess(existing, mcEnv, scratch, policy);
    const temporary = `${runtimeFile}.tmp-${randomBytes(8).toString("hex")}`;
    await writeFile(temporary, JSON.stringify(existing) + "\n", { mode: 0o600, flag: "wx" });
    await rename(temporary, runtimeFile);
    console.log("Luna limited object-store credential installed");
  }
  if (!markerExists) {
    const marker = `${bucketReadyFile}.tmp-${randomBytes(8).toString("hex")}`;
    await writeFile(marker, "initialized\n", { mode: 0o600, flag: "wx" });
    await rename(marker, bucketReadyFile);
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}

function parseRootEnv(content) {
  const lines = Object.fromEntries(content.trim().split("\n").map((line) => {
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error("Invalid MinIO root credential file");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
  if (!lines.MINIO_ROOT_USER || !lines.MINIO_ROOT_PASSWORD)
    throw new Error("Invalid MinIO root credential file");
  return { user: lines.MINIO_ROOT_USER, password: lines.MINIO_ROOT_PASSWORD };
}

function mc(args, env) {
  const result = spawnSync("/usr/local/bin/mc", args, {
    env, encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(`MinIO ${args.slice(0, 3).join(" ")} failed`);
  return result.stdout;
}

function tryMc(args, env) {
  const result = spawnSync("/usr/local/bin/mc", args, {
    env, encoding: "utf8", timeout: 5_000, maxBuffer: 1024 * 1024,
  });
  return !result.error && result.status === 0;
}

function parseCreatedKey(output) {
  for (const line of output.trim().split("\n").reverse()) {
    let value;
    try { value = JSON.parse(line); } catch { continue; }
    const accessKey = value.accessKey ?? value.accessKeyId;
    const secretKey = value.secretKey ?? value.secretAccessKey;
    if (typeof accessKey === "string" && typeof secretKey === "string" && accessKey && secretKey)
      return { accessKey, secretKey };
  }
  throw new Error("MinIO did not return a credential pair");
}

function removeInterruptedBootstrapKeys(env, expectedPolicy) {
  const rows = mc(["admin", "accesskey", "list", "--json", "--self", "root"], env)
    .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const keys = rows.flatMap((row) => Array.isArray(row.svcaccs) ? row.svcaccs : []);
  if (keys.length > 1000) throw new Error("Too many MinIO access keys to inspect safely");
  for (const key of keys) {
    if (typeof key.accessKey !== "string") continue;
    const info = JSON.parse(mc(["admin", "accesskey", "info", "--json", "root", key.accessKey], env));
    if (info.name === "luna-sync-api" && canonical(info.policy) === canonical(expectedPolicy))
      mc(["admin", "accesskey", "remove", "root", key.accessKey], env);
  }
}

async function readRuntime(file) {
  try {
    const stat = await lstat(file);
    if (!stat.isFile()) throw new Error("Invalid Luna runtime configuration path");
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readMarker(file) {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || await readFile(file, "utf8") !== "initialized\n")
      throw new Error("Invalid Luna bucket initialization marker");
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function verifyRuntime(value) {
  if (value?.schemaVersion !== 1 || value.s3Endpoint !== "http://minio:9000" ||
      value.s3Region !== "us-east-1" || value.s3Bucket !== "luna-sync" ||
      value.s3Prefix !== "luna" || value.s3ForcePathStyle !== true ||
      typeof value.s3AccessKeyId !== "string" || !value.s3AccessKeyId ||
      typeof value.s3SecretAccessKey !== "string" || !value.s3SecretAccessKey)
    throw new Error("Invalid existing Luna runtime configuration");
}

function isRootCredential(value, rootCredential) {
  verifyRuntime(value);
  return value.s3AccessKeyId === rootCredential.user && value.s3SecretAccessKey === rootCredential.password;
}

async function importAlias(name, content, env, scratch) {
  const file = join(scratch, `${name}-alias.json`);
  await writeFile(file, content, { mode: 0o600 });
  try { mc(["alias", "import", name, file], env); }
  finally { await rm(file, { force: true }); }
}

async function verifyLimitedAccess(runtime, env, scratch, expectedPolicy) {
  const info = JSON.parse(mc(["admin", "accesskey", "info", "--json", "root", runtime.s3AccessKeyId], env));
  if (canonical(info.policy) !== canonical(expectedPolicy))
    throw new Error("API object-store credential has an unexpected policy");
  const alias = JSON.stringify({
    url: runtime.s3Endpoint, accessKey: runtime.s3AccessKeyId,
    secretKey: runtime.s3SecretAccessKey, api: "s3v4", path: "on",
  });
  await importAlias("limited", alias, env, scratch);
  mc(["stat", "limited/luna-sync"], env);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
