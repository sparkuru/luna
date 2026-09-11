import test from "node:test";
import assert from "node:assert/strict";
import { scopedRead } from "./data/local";
test("old-scope reads cannot start or publish across a profile generation change", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  let status = { profile: { id: "legacy-local" }, generation: 0 };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { lunaLedger: { server: { status: async () => status } } },
  });
  try {
    const scope = { profileId: "legacy-local", generation: 0 };
    status = { profile: { id: "other-profile" }, generation: 1 };
    let reads = 0;
    await assert.rejects(
      scopedRead(scope, async () => {
        reads++;
        return "new profile data";
      }),
      /server-cancelled/,
    );
    assert.equal(reads, 0);
    status = { profile: { id: "legacy-local" }, generation: 0 };
    await assert.rejects(
      scopedRead(scope, async () => {
        status = { profile: { id: "other-profile" }, generation: 1 };
        return "old profile data";
      }),
      /server-cancelled/,
    );
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
