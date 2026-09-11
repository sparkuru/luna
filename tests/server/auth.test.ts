import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/server/app";
import { Passwords, setAccount, validatePassword } from "../../src/server/auth";
import { openTestDatabase } from "./support";

test("password KDF bounds active jobs and waiting queue without dropping accepted jobs", async () => {
  const passwords = new Passwords();
  const results = await Promise.allSettled(
    Array.from({ length: 11 }, () =>
      passwords.run("bounded-password", Buffer.alloc(16)),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 10);
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0]!.reason.code, "rate-limited");
  for (const result of results)
    if (result.status === "fulfilled") result.value.fill(0);
  const next = await passwords.run("bounded-password", Buffer.alloc(16));
  assert.equal(next.length, 64);
  next.fill(0);
  assert.throws(() => validatePassword("short"));
  assert.throws(() => validatePassword("a".repeat(129)));
  validatePassword("密".repeat(12));
});
test("unknown accounts and wrong passwords share failure; rate limit and expiry enforced", async () => {
  const database = await openTestDatabase();
  const name = `auth_${randomUUID().slice(0, 8)}`;
  await setAccount(database, name, "actual-password-123");
  const app = await createApp({ database, sessionTtlSeconds: 0 });
  try {
    const login = (username: string, password = "wrong-password-123") =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/sessions",
        payload: { username, password, deviceLabel: "test" },
      });
    const missing = await login(`absent_${randomUUID().slice(0, 8)}`);
    const wrong = await login(name);
    assert.equal(missing.statusCode, 401);
    assert.equal(wrong.statusCode, 401);
    assert.equal(missing.json().code, wrong.json().code);
    const expired = await login(name, "actual-password-123");
    assert.equal(expired.statusCode, 201);
    assert.equal(
      (
        await app.inject({
          url: "/api/v1/auth/me",
          headers: { authorization: "Bearer " + expired.json().token },
        })
      ).statusCode,
      401,
    );
    for (let i = 0; i < 3; i++)
      assert.equal((await login(name)).statusCode, 401);
    const limited = await login(name);
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.headers["retry-after"], "60");
  } finally {
    await app.close();
    database.close();
  }
});
