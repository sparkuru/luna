import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ServerDatabase } from "./db/database";
import {
  isLoopbackHostname,
  isPrivateIpv4Hostname,
} from "../shared/server-api";
import {
  FileServerObjectStore,
  S3ServerObjectStore,
  type ServerObjectStore,
} from "./storage/object-store";

export interface ServerS3Config {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export interface ServerEnvironment {
  dataDir: string;
  databaseFile: string;
  runtimeConfigFile: string;
  s3?: ServerS3Config;
  origins: string[];
  port: number;
  host: string;
}

export function createDatabase(filePath: string): ServerDatabase {
  return new ServerDatabase(filePath);
}

export function createServerObjectStore(
  config: Pick<ServerEnvironment, "dataDir" | "s3">,
): ServerObjectStore {
  return config.s3
    ? new S3ServerObjectStore(config.s3.bucket, config.s3.prefix, {
        endpoint: config.s3.endpoint,
        region: config.s3.region,
        forcePathStyle: config.s3.forcePathStyle,
        credentials: {
          accessKeyId: config.s3.accessKeyId,
          secretAccessKey: config.s3.secretAccessKey,
        },
      })
    : new FileServerObjectStore(`${config.dataDir}/objects`);
}

export function environment(env: NodeJS.ProcessEnv = process.env): ServerEnvironment {
  const dataDir = path.resolve(env.LUNA_DATA_DIR ?? "./data");
  const databaseFile = path.resolve(
    env.LUNA_DATABASE_FILE ?? path.join(dataDir, "server.sqlite"),
  );
  const runtimeConfigFile = path.resolve(
    env.LUNA_RUNTIME_CONFIG_FILE ?? path.join(dataDir, "runtime.json"),
  );
  const origins = (env.LUNA_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowInsecureLan = env.LUNA_ALLOW_INSECURE_LAN === "true";
  for (const origin of origins) {
    const url = new URL(origin);
    const loopbackHttp =
      url.protocol === "http:" && isLoopbackHostname(url.hostname);
    const privateLanHttp =
      allowInsecureLan &&
      url.protocol === "http:" &&
      isPrivateIpv4Hostname(url.hostname);
    if (
      url.origin !== origin ||
      (url.protocol !== "https:" && !loopbackHttp && !privateLanHttp)
    )
      throw new Error("Invalid origin configuration");
  }
  const port = Number(env.LUNA_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid port configuration");
  return {
    dataDir,
    databaseFile,
    runtimeConfigFile,
    ...((() => {
      const s3 = readS3Config(runtimeConfigFile);
      return s3 === undefined ? {} : { s3 };
    })()),
    origins,
    port,
    host: env.LUNA_HOST ?? "127.0.0.1",
  };
}

function readS3Config(file: string): ServerS3Config | undefined {
  if (!existsSync(file)) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error("Invalid server runtime configuration");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid server runtime configuration");
  const record = value as Record<string, unknown>;
  if (
    typeof record.s3Endpoint !== "string" ||
    typeof record.s3Region !== "string" ||
    typeof record.s3Bucket !== "string" ||
    typeof record.s3Prefix !== "string" ||
    typeof record.s3AccessKeyId !== "string" ||
    typeof record.s3SecretAccessKey !== "string"
  )
    throw new Error("Invalid server runtime configuration");
  const endpoint = new URL(record.s3Endpoint);
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
    throw new Error("Invalid server runtime configuration");
  return {
    endpoint: endpoint.origin,
    region: record.s3Region,
    bucket: record.s3Bucket,
    prefix: record.s3Prefix,
    accessKeyId: record.s3AccessKeyId,
    secretAccessKey: record.s3SecretAccessKey,
    forcePathStyle: record.s3ForcePathStyle !== false,
  };
}
