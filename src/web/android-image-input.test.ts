import assert from "node:assert/strict";
import test from "node:test";
import {
  pickAndroidImages,
  readAndroidSelectedImage,
  type AndroidImageInputPlugin,
} from "./android-image-input";

function base64(bytes: readonly number[]): string {
  return Buffer.from(bytes).toString("base64");
}

test("Android image input preserves selection order and closes handles after bounded reads", async () => {
  const calls: number[] = [];
  let closed = 0;
  const plugin: AndroidImageInputPlugin = {
    async selectImages() {
      return {
        images: [
          { handle: "first", mime: "image/png", size: 3 },
          { handle: "second", mime: "image/jpeg", size: null },
        ],
      };
    },
    async readSelectedImageChunk({ sequence }) {
      calls.push(sequence);
      return sequence === 0
        ? { base64: base64([1, 2, 3]), eof: false, receivedBytes: 3 }
        : { base64: base64([4]), eof: true, receivedBytes: 4 };
    },
    async closeSelectedImage() {
      closed += 1;
    },
  };

  const selected = await pickAndroidImages(plugin);
  assert.deepEqual(selected.map((image) => image.handle), ["first", "second"]);
  assert.deepEqual(await readAndroidSelectedImage(selected[0]!, plugin), new Uint8Array([1, 2, 3]));
  assert.deepEqual(calls, [0]);
  assert.equal(closed, 1);
});

test("Android image input rejects a dishonest chunk receipt and still releases the handle", async () => {
  let closed = 0;
  const plugin: AndroidImageInputPlugin = {
    async selectImages() {
      return { images: [{ handle: "bad", mime: "image/png", size: null }] };
    },
    async readSelectedImageChunk() {
      return { base64: base64([1]), eof: true, receivedBytes: 2 };
    },
    async closeSelectedImage() {
      closed += 1;
    },
  };
  const [selected] = await pickAndroidImages(plugin);
  await assert.rejects(
    readAndroidSelectedImage(selected!, plugin),
    /attachment-source-too-large/,
  );
  assert.equal(closed, 1);
});
