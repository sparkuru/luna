import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test(
  "server entrypoint exposes database readiness and drains on SIGTERM",
  { timeout: 15000 },
  async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "luna-server-"));
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((resolve, reject) =>
      reservation.close((error) => (error ? reject(error) : resolve())),
    );
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/server/main.ts"],
      {
        env: {
          ...process.env,
          LUNA_DATA_DIR: dataDir,
          LUNA_PORT: String(port),
          LUNA_HOST: "127.0.0.1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    const exited = once(child, "exit");
    try {
      for (
        let i = 0;
        i < 200 &&
        !output.includes("LUNA_API_READY") &&
        child.exitCode === null;
        i++
      )
        await new Promise((resolve) => setTimeout(resolve, 20));
      assert.ok(output.includes("LUNA_API_READY"), output);
      const readiness = await fetch(`http://127.0.0.1:${port}/readyz`);
      assert.equal(readiness.status, 200);
      assert.deepEqual(await readiness.json(), { ok: true });
      child.kill("SIGTERM");
      const [code, signal] = await exited;
      assert.equal(code, 0);
      assert.equal(signal, null);
      assert.equal(output.includes(dataDir), false);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        await exited;
      }
      await rm(dataDir, { recursive: true, force: true });
    }
  },
);
