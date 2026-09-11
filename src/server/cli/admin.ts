import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createDatabase, environment } from "../config";
import { migrate } from "../db/migration";
import { setAccount } from "../auth";

async function main() {
  const action = process.argv[2];
  if (
    !["migrate", "create-account", "reset-password", "cleanup"].includes(
      action ?? "",
    )
  )
    throw new Error("Invalid action");
  const database = createDatabase(environment().databaseFile);
  try {
    await migrate(database);
    if (action === "cleanup") {
      const now = new Date().toISOString();
      const oldEvents = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      database.transaction(() => {
        database.sqlite
          .prepare("DELETE FROM idempotency_records WHERE expires_at < ?")
          .run(now);
        database.sqlite
          .prepare("DELETE FROM sessions WHERE expires_at < ?")
          .run(now);
        database.sqlite
          .prepare("DELETE FROM security_events WHERE created_at < ?")
          .run(oldEvents);
      });
    } else if (action !== "migrate") {
      if (!process.stdin.isTTY) throw new Error("Interactive terminal required");
      let muted = false;
      const output = new Writable({
        write(chunk, encoding, callback) {
          if (!muted) process.stdout.write(chunk, encoding);
          callback();
        },
      });
      const rl = createInterface({ input: process.stdin, output, terminal: true });
      try {
        const name = await rl.question("Username: ");
        process.stdout.write("Password (hidden): ");
        muted = true;
        const password = await rl.question("");
        muted = false;
        process.stdout.write("\nConfirm password (hidden): ");
        muted = true;
        const confirm = await rl.question("");
        muted = false;
        process.stdout.write("\n");
        if (password !== confirm) throw new Error("Password mismatch");
        await setAccount(database, name, password, action === "reset-password");
      } finally {
        rl.close();
      }
    }
    console.log("LUNA_ADMIN_OK");
  } finally {
    database.close();
  }
}
main().catch(() => {
  console.error("LUNA_ADMIN_FAILED");
  process.exitCode = 1;
});
