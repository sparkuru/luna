import test from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { createApp } from "../../src/server/app";
import { openTestDatabase } from "./support";

test("upload admission rejects overflow and releases aborted and invalid requests", async () => {
  const database = await openTestDatabase();
  const app = await createApp({ database });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const open: ReturnType<typeof request>[] = [];
  try {
    let requests = 0;
    app.server.on("request", () => requests++);
    for (let i = 0; i < 4; i++) {
      const req = request(`${address}/api/v1/preferences/object`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "content-length": "100",
        },
      });
      req.on("error", () => undefined);
      req.write("{");
      open.push(req);
    }
    for (let i = 0; i < 100 && requests < 4; i++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(requests, 4);
    await new Promise((resolve) => setImmediate(resolve));
    const overflow = await fetch(`${address}/api/v1/preferences/object`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(overflow.status, 429);
    assert.equal(overflow.headers.get("retry-after"), "60");
    assert.equal(
      overflow.headers.get("cache-control"),
      "no-store, no-transform",
    );
    await overflow.arrayBuffer();
    for (const req of open) req.destroy();
    await new Promise((resolve) => setTimeout(resolve, 30));
    for (let i = 0; i < 6; i++) {
      const invalid = await fetch(`${address}/api/v1/preferences/object`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(invalid.status, 400);
      await invalid.arrayBuffer();
    }
  } finally {
    for (const req of open) req.destroy();
    await app.close();
    database.close();
  }
});
