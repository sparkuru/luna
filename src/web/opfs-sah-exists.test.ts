import test from "node:test";
import assert from "node:assert/strict";
import { hasSahDatabase, isSahDatabaseHeader } from "./opfs-sah-exists";

function physicalDeviceHeader(): Uint8Array {
  // Android 16 / SQLite-WASM 3.53 SAH metadata from a synthetic ledger.
  // Only the virtual path, flags, association digest and SQLite magic remain.
  const bytes = new Uint8Array(4112);
  bytes.set(new TextEncoder().encode("/luna-ledger-legacy-local.sqlite3\0"));
  bytes.set(Buffer.from("0000018602ddcb0a82c98192", "hex"), 512);
  bytes.set(new TextEncoder().encode("SQLite format 3\0"), 4096);
  return bytes;
}

test("SAH probe accepts real Android association and rejects another virtual name", () => {
  const bytes = physicalDeviceHeader();
  assert.equal(isSahDatabaseHeader(bytes, "luna-ledger-legacy-local.sqlite3"), true);
  assert.equal(isSahDatabaseHeader(bytes, "luna-ledger-other.sqlite3"), false);
  assert.equal(isSahDatabaseHeader(bytes, "luna-ledger-legacy-local.sqlite"), false);
});

test("SAH probe rejects empty pool slots, missing payload, corrupt association and journal flags", () => {
  const filename = "luna-ledger-legacy-local.sqlite3";
  assert.equal(isSahDatabaseHeader(new Uint8Array(4112), filename), false);
  assert.equal(isSahDatabaseHeader(physicalDeviceHeader().slice(0, 4096), filename), false);
  for (const offset of [515, 516, 520, 4096]) {
    const bytes = physicalDeviceHeader();
    bytes[offset] = bytes[offset]! ^ 1;
    assert.equal(isSahDatabaseHeader(bytes, filename), false);
  }
  const journal = physicalDeviceHeader();
  new DataView(journal.buffer).setUint32(512, 0x206);
  assert.equal(isSahDatabaseHeader(journal, filename), false);
});

test("SAH probe accepts v1 zero digests but rejects delete-on-close and unterminated paths", () => {
  const filename = "luna-ledger-legacy-local.sqlite3";
  const bytes = physicalDeviceHeader();
  const view = new DataView(bytes.buffer);
  view.setUint32(512, 0x106);
  bytes.fill(0, 516, 524);
  assert.equal(isSahDatabaseHeader(bytes, filename), true);
  view.setUint32(512, 0x10e);
  assert.equal(isSahDatabaseHeader(bytes, filename), false);
  view.setUint32(512, 0x106);
  bytes[new TextEncoder().encode(`/${filename}`).length] = 1;
  assert.equal(isSahDatabaseHeader(bytes, filename), false);
});

test("SAH discovery reads bounded headers without creating files or acquiring write handles", async () => {
  const slices: Array<[number, number]> = [];
  const opaque = {
    async *values() {
      yield { kind: "directory", name: "ignored" };
      yield { kind: "file", name: "unused-slot" };
      yield { kind: "file", name: "random-backing-name" };
    },
    async getFileHandle(name: string, options?: FileSystemGetFileOptions) {
      assert.equal(options?.create, undefined);
      return {
        async getFile() {
          return {
            size: name === "unused-slot" ? 4096 : 1_000_000,
            slice(start: number, end: number) {
              slices.push([start, end]);
              return new Blob([physicalDeviceHeader().buffer as ArrayBuffer]);
            },
          };
        },
      };
    },
  };
  const directory = {
    async getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions) {
      assert.equal(name, ".opaque");
      assert.equal(options?.create, undefined);
      return opaque;
    },
  } as unknown as FileSystemDirectoryHandle;
  assert.equal(await hasSahDatabase(directory, "luna-ledger-legacy-local.sqlite3"), true);
  assert.deepEqual(slices, [[0, 4112]]);
});

test("SAH discovery propagates read permission and lock failures", async () => {
  for (const name of ["NotAllowedError", "NoModificationAllowedError", "NotReadableError"]) {
    const error = new DOMException("Synthetic storage failure", name);
    const directory = {
      async getDirectoryHandle() {
        return {
          async *values() { yield { kind: "file", name: "locked" }; },
          async getFileHandle() {
            return { async getFile() { throw error; } };
          },
        };
      },
    } as unknown as FileSystemDirectoryHandle;
    await assert.rejects(hasSahDatabase(directory, "ledger.sqlite3"), (actual) => actual === error);
  }
});
