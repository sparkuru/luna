import { chmod, chown, lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve, join } from "node:path";

const root = resolve(process.argv[2] ?? "/data");
const state = join(root, ".luna");
const runtimeFile = join(state, "runtime.json");
const minioEnvFile = join(state, "minio.env");
const readyFile = join(state, "initialized");
const ownerUid = Number(process.env.LUNA_DATA_UID ?? "1000");
const ownerGid = Number(process.env.LUNA_DATA_GID ?? "1000");
if (![ownerUid, ownerGid].every((value) => Number.isInteger(value) && value >= 0))
  throw new Error("Invalid data owner");

await mkdir(root, { recursive: true, mode: 0o700 });
const rootStat = await lstat(root);
if (!rootStat.isDirectory()) throw new Error("Data path must be a directory");
await chmod(root, 0o700);
await chown(root, ownerUid, ownerGid);
await mkdir(state, { recursive: true, mode: 0o700 });
await chmod(state, 0o700);
await chown(state, ownerUid, ownerGid);

const runtimeExists = await exists(runtimeFile);
const minioEnvExists = await exists(minioEnvFile);
if (runtimeExists !== minioEnvExists)
  throw new Error("Partial Luna initialization; restore or remove the data directory");

if (!runtimeExists) {
  const accessKey = `luna-${randomBytes(12).toString("hex")}`;
  const secretKey = randomBytes(32).toString("base64url");
  await atomicJson(runtimeFile, {
    schemaVersion: 1,
    s3Endpoint: "http://minio:9000",
    s3Region: "us-east-1",
    s3Bucket: "luna-sync",
    s3Prefix: "luna",
    s3AccessKeyId: accessKey,
    s3SecretAccessKey: secretKey,
    s3ForcePathStyle: true,
  });
  await atomicText(
    minioEnvFile,
    `MINIO_ROOT_USER=${accessKey}\nMINIO_ROOT_PASSWORD=${secretKey}\n`,
  );
} else {
  const raw = JSON.parse(await readFile(runtimeFile, "utf8"));
  if (
    raw?.schemaVersion !== 1 ||
    typeof raw.s3AccessKeyId !== "string" ||
    typeof raw.s3SecretAccessKey !== "string"
  )
    throw new Error("Invalid existing Luna runtime configuration");
}

await chown(runtimeFile, ownerUid, ownerGid);
await chown(minioEnvFile, ownerUid, ownerGid);

await atomicText(readyFile, "initialized\n");
await chmod(readyFile, 0o600);
await chown(readyFile, ownerUid, ownerGid);

async function exists(file) {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function atomicJson(file, value) {
  await atomicText(file, JSON.stringify(value) + "\n");
}

async function atomicText(file, value) {
  const temporary = `${file}.tmp-${randomBytes(8).toString("hex")}`;
  await writeFile(temporary, value, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, file);
}
