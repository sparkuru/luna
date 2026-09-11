import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { environment } from "../../src/server/config";

const missingRuntimeConfig = path.join(
  tmpdir(),
  `luna-config-test-${randomUUID()}.json`,
);

function readEnvironment(
  origins: string,
  allowInsecureLan?: string,
) {
  return environment({
    LUNA_DATA_DIR: path.join(tmpdir(), `luna-config-data-${randomUUID()}`),
    LUNA_RUNTIME_CONFIG_FILE: missingRuntimeConfig,
    LUNA_ALLOWED_ORIGINS: origins,
    ...(allowInsecureLan === undefined
      ? {}
      : { LUNA_ALLOW_INSECURE_LAN: allowInsecureLan }),
  });
}

test("private LAN HTTP origins require explicit opt-in", () => {
  assert.throws(
    () => readEnvironment("http://192.168.9.3:18080"),
    /Invalid origin configuration/,
  );
  assert.deepEqual(
    readEnvironment("http://192.168.9.3:18080", "true").origins,
    ["http://192.168.9.3:18080"],
  );
});

test("LAN opt-in still rejects public and hostname HTTP origins", () => {
  for (const origin of [
    "http://8.8.8.8:18080",
    "http://luna.example:18080",
    "http://172.32.0.1:18080",
  ])
    assert.throws(
      () => readEnvironment(origin, "true"),
      /Invalid origin configuration/,
    );
});

test("loopback HTTP remains valid without LAN opt-in", () => {
  assert.deepEqual(
    readEnvironment("http://127.0.0.1:8080,http://localhost:8080").origins,
    ["http://127.0.0.1:8080", "http://localhost:8080"],
  );
});
