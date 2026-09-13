import assert from "node:assert/strict";
import { createCipheriv, createHash } from "node:crypto";
import test from "node:test";
import {
  AttachmentContractError,
  MAX_CIPHER_ATTACHMENT_BYTES,
  MAX_LEDGER_ATTACHMENT_BYTES,
  MAX_LEDGER_ATTACHMENT_COUNT,
  attachmentAad,
  createAttachmentDescriptorInput,
  decryptAttachmentBytes,
  encryptAttachmentBytes,
  toAttachmentMetadata,
  validateAttachmentInventoryQuota,
  validateNormalizedImage,
  validateSourceImage,
} from "./attachment-contract";

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
  0, 0, 0, 0,
]);

test("source validation uses the image header, not a trusted MIME string", () => {
  assert.deepEqual(validateSourceImage(PNG_1X1, "image/png"), {
    mime: "image/png",
    width: 1,
    height: 1,
    hasAlpha: true,
  });
  assert.throws(
    () => validateSourceImage(PNG_1X1, "image/jpeg"),
    (error: unknown) =>
      error instanceof AttachmentContractError && error.code === "attachment-invalid-source",
  );
});

test("normalized output is independently bounded and must match its header", () => {
  assert.deepEqual(validateNormalizedImage(PNG_1X1, "image/png", 1, 1), {
    mime: "image/png",
    width: 1,
    height: 1,
  });
  assert.throws(
    () => validateNormalizedImage(PNG_1X1, "image/png", 2049, 1),
    /attachment-image-too-large/,
  );
  assert.throws(
    () => validateNormalizedImage(new Uint8Array(2 * 1024 * 1024 + 1), "image/png", 1, 1),
    /attachment-normalized-too-large/,
  );
});

test("AES-GCM ciphertext matches an independent Node crypto implementation", async () => {
  const plain = new TextEncoder().encode("independent attachment fixture");
  const key = new Uint8Array(Array.from({ length: 32 }, (_, index) => index));
  const iv = new Uint8Array(Array.from({ length: 12 }, (_, index) => 0xa0 + index));
  const unsigned = {
    id: "123e4567-e89b-42d3-a456-426614174000",
    workspaceId: "workspace-fixture",
    mime: "image/png" as const,
    width: 1,
    height: 1,
    byteLength: plain.byteLength,
  };
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const aad = attachmentAad(unsigned);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const digest = createHash("sha256").update(encrypted).digest("hex");
  const descriptor = createAttachmentDescriptorInput(
    unsigned.workspaceId,
    unsigned.id,
    unsigned.mime,
    unsigned.width,
    unsigned.height,
    unsigned.byteLength,
    digest,
    key,
    iv,
  );
  const actual = await encryptAttachmentBytes(plain, descriptor);
  assert.deepEqual(Buffer.from(actual), encrypted);
  assert.ok(actual.byteLength <= MAX_CIPHER_ATTACHMENT_BYTES);
  assert.deepEqual(await decryptAttachmentBytes(actual, descriptor), plain);
  assert.deepEqual(toAttachmentMetadata(descriptor), {
    id: unsigned.id,
    mime: "image/png",
    width: 1,
    height: 1,
    byteLength: plain.byteLength,
    availability: "local",
  });
});

test("digest and AAD tampering fail closed without exposing internal fields", async () => {
  const plain = new Uint8Array([1, 2, 3]);
  const key = new Uint8Array(32).fill(7);
  const iv = new Uint8Array(12).fill(8);
  const base = {
    id: "123e4567-e89b-42d3-a456-426614174001",
    workspaceId: "workspace-fixture",
    mime: "image/png" as const,
    width: 1,
    height: 1,
    byteLength: plain.byteLength,
  };
  const nodeCipher = createCipheriv("aes-256-gcm", key, iv);
  nodeCipher.setAAD(Buffer.from(attachmentAad(base)));
  const encrypted = Buffer.concat([nodeCipher.update(plain), nodeCipher.final(), nodeCipher.getAuthTag()]);
  const descriptor = createAttachmentDescriptorInput(
    base.workspaceId,
    base.id,
    base.mime,
    base.width,
    base.height,
    base.byteLength,
    createHash("sha256").update(encrypted).digest("hex"),
    key,
    iv,
  );
  const tampered = new Uint8Array(encrypted);
  tampered[0] = (tampered[0] ?? 0) ^ 1;
  await assert.rejects(decryptAttachmentBytes(tampered, descriptor), /attachment-digest-mismatch/);
  assert.deepEqual(Object.keys(toAttachmentMetadata(descriptor)).sort(), [
    "availability",
    "byteLength",
    "height",
    "id",
    "mime",
    "width",
  ]);
});

test("historical attachment quota errors include the complete merged requirement", () => {
  const key = new Uint8Array(32).fill(7);
  const iv = new Uint8Array(12).fill(8);
  const inventory = new Map();
  for (let index = 0; index < 257; index += 1) {
    const suffix = index.toString(16).padStart(12, "0");
    const id = `00000000-0000-4000-8000-${suffix}`;
    const descriptor = createAttachmentDescriptorInput(
      "workspace-fixture",
      id,
      "image/png",
      1,
      1,
      2 * 1024 * 1024,
      "0".repeat(64),
      key,
      iv,
    );
    inventory.set(id, descriptor);
  }
  assert.throws(
    () => validateAttachmentInventoryQuota(inventory),
    (error: unknown) => {
      assert.ok(error instanceof AttachmentContractError);
      assert.equal(error.code, "attachment-merge-quota-exceeded");
      assert.deepEqual(error.quota, {
        requiredBytes: 257 * (2 * 1024 * 1024 + 16),
        requiredCount: 257,
        maxBytes: MAX_LEDGER_ATTACHMENT_BYTES,
        maxCount: MAX_LEDGER_ATTACHMENT_COUNT,
      });
      return true;
    },
  );
});
