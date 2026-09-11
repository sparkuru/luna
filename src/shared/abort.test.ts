import test from "node:test";
import assert from "node:assert/strict";
import { assertNotAborted } from "./abort";

test("abort checks work without AbortSignal.throwIfAborted", () => {
  const active = { aborted: false } as AbortSignal;
  assert.doesNotThrow(() => assertNotAborted(active));

  const reason = new Error("cancelled");
  const aborted = { aborted: true, reason } as AbortSignal;
  assert.throws(() => assertNotAborted(aborted), (error: unknown) => error === reason);
});
