import { createDatabase } from "../../src/server/config";
import { migrate } from "../../src/server/db/migration";
import { setAccount } from "../../src/server/auth";
import type { ServerDatabase } from "../../src/server/db/database";

export async function openTestDatabase(): Promise<ServerDatabase> {
  const database = createDatabase(":memory:");
  await migrate(database);
  return database;
}

export async function createTestAccount(
  database: ServerDatabase,
  username: string,
  password: string,
  disabled = false,
): Promise<void> {
  await setAccount(database, username, password, disabled);
}
