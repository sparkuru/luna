import { createApp } from "./app";
import { createDatabase, environment } from "./config";
import { migrate } from "./db/migration";
import {
  FileServerObjectStore,
  S3ServerObjectStore,
  type ServerObjectStore,
} from "./storage/object-store";

async function main() {
  const config = environment();
  const database = createDatabase(config.databaseFile);
  let objectStore: ServerObjectStore;
  try {
    await migrate(database);
    objectStore = config.s3
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
    await waitForObjectStore(objectStore);
    const app = await createApp({
      database,
      objectStore,
      origins: config.origins,
      log: (event) => console.log(JSON.stringify(event)),
    });
    let closing = false;
    const close = async () => {
      if (closing) return;
      closing = true;
      await app.close();
      objectStore.close();
      database.close();
    };
    process.once("SIGTERM", () => void close());
    process.once("SIGINT", () => void close());
    await app.listen({ host: config.host, port: config.port });
    console.log("LUNA_API_READY");
  } catch (error) {
    database.close();
    throw error;
  }
}

async function waitForObjectStore(objectStore: ServerObjectStore): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await objectStore.ensureReady();
      return;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw last instanceof Error ? last : new Error("Object store unavailable");
}

main().catch(() => {
  console.error("LUNA_API_START_FAILED");
  process.exitCode = 1;
});
