import assert from "node:assert/strict";
import test from "node:test";
import { secureRandomId, secureRandomUuid } from "./secure-random";

test("secure random UUID fallback sets UUID v4 and RFC variant bits", () => {
  const cryptoApi = {
    getRandomValues<T extends ArrayBufferView>(array: T): T {
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(0xff);
      return array;
    },
  } as Crypto;

  assert.equal(
    secureRandomUuid(cryptoApi),
    "ffffffff-ffff-4fff-bfff-ffffffffffff",
  );
  assert.equal(
    secureRandomId("entry", cryptoApi),
    "entry-ffffffff-ffff-4fff-bfff-ffffffffffff",
  );
});

test("secure random UUID prefers the native randomUUID implementation", () => {
  const cryptoApi = {
    randomUUID: () => "123e4567-e89b-42d3-a456-426614174000",
    getRandomValues: () => {
      throw new Error("fallback should not run");
    },
  } as unknown as Crypto;

  assert.equal(secureRandomUuid(cryptoApi), "123e4567-e89b-42d3-a456-426614174000");
});

test("secure random UUID fails explicitly when cryptographic APIs are unavailable", () => {
  assert.throws(
    () => secureRandomUuid({} as Crypto),
    /LUNA_ERROR:secure-random-unavailable/,
  );
});
