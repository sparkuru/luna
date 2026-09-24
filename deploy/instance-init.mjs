import { chmod, chown, lstat, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve, join } from "node:path";

const root = resolve(process.argv[2] ?? "/data");
const state = join(root, ".luna");
const runtimeFile = join(state, "runtime.json");
const minioEnvFile = join(state, "minio.env");
const readyFile = join(state, "initialized");
const bucketReadyFile = join(state, "bucket-initialized");
const ownerUid = Number(process.env.LUNA_DATA_UID ?? "1000");
const ownerGid = Number(process.env.LUNA_DATA_GID ?? "1000");
if (![ownerUid, ownerGid].every((value) => Number.isInteger(value) && value >= 0))
  throw new Error("Invalid data owner");

await mkdir(root, { recursive: true, mode: 0o700 });
const rootStat = await lstat(root);
if (!rootStat.isDirectory()) throw new Error("Data path must be a directory");
const stateAlreadyExists = await exists(state);
if (stateAlreadyExists) {
  await validateOwnerAndMode(root, 0o700, true);
  await validateOwnerAndMode(state, 0o700, true);
} else {
  if ((await readdir(root)).length)
    throw new Error("Non-empty Luna data directory has no initialization state");
  await chmod(root, 0o700);
  await chown(root, ownerUid, ownerGid);
  await mkdir(state, { mode: 0o700 });
  await chmod(state, 0o700);
  await chown(state, ownerUid, ownerGid);
}

const runtimeExists = await exists(runtimeFile);
const minioEnvExists = await exists(minioEnvFile);
const readyExists = await exists(readyFile);
const bucketReadyExists = await exists(bucketReadyFile);
if (runtimeExists && !minioEnvExists)
  throw new Error("Partial Luna initialization; restore or remove the data directory");
if (minioEnvExists !== readyExists)
  throw new Error("Partial Luna initialization; restore or remove the data directory");
if (bucketReadyExists && !runtimeExists)
  throw new Error("Missing API credential from initialized Luna data directory");
if (minioEnvExists && !runtimeExists && !bucketReadyExists &&
    (await readdir(root)).some((entry) => entry !== ".luna" && entry !== "minio"))
  throw new Error("Existing Luna data is missing its API credential");
if (readyExists && await readFile(readyFile, "utf8") !== "initialized\n")
  throw new Error("Invalid Luna initialization marker");
if (bucketReadyExists && await readFile(bucketReadyFile, "utf8") !== "initialized\n")
  throw new Error("Invalid Luna bucket initialization marker");
for (const file of [readyFile, minioEnvFile, runtimeFile, bucketReadyFile]) {
  if (await exists(file)) await validateOwnerAndMode(file, 0o600, false);
}

if (!minioEnvExists) {
  const rootEntries = (await readdir(root)).filter((entry) => entry !== ".luna");
  if (rootEntries.length || (await readdir(state)).length)
    throw new Error("Non-empty Luna data directory has no initialization state");
  const accessKey = `luna-${randomBytes(12).toString("hex")}`;
  const secretKey = randomBytes(32).toString("base64url");
  await atomicText(
    minioEnvFile,
    `MINIO_ROOT_USER=${accessKey}\nMINIO_ROOT_PASSWORD=${secretKey}\n`,
  );
} else if (runtimeExists) {
  const raw = JSON.parse(await readFile(runtimeFile, "utf8"));
  if (
    raw?.schemaVersion !== 1 ||
    typeof raw.s3AccessKeyId !== "string" ||
    typeof raw.s3SecretAccessKey !== "string"
  )
    throw new Error("Invalid existing Luna runtime configuration");
}

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

async function validateOwnerAndMode(path, mode, directory) {
  const stat = await lstat(path);
  if ((directory ? !stat.isDirectory() : !stat.isFile()) ||
      stat.uid !== ownerUid || stat.gid !== ownerGid ||
      (stat.mode & 0o777) !== mode)
    throw new Error("Invalid Luna data ownership or permissions");
}

async function atomicText(file, value) {
  const temporary = `${file}.tmp-${randomBytes(8).toString("hex")}`;
  await writeFile(temporary, value, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, file);
}
