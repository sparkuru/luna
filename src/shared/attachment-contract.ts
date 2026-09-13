import { secureRandomUuid } from "./secure-random";

/**
 * The attachment protocol is deliberately independent from the ledger graph.
 * A graph stores an internal descriptor, while the renderer only receives the
 * safe projection returned by `toAttachmentMetadata`.
 */
export const ATTACHMENT_PROTOCOL_VERSION = 1 as const;
export const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_SOURCE_IMAGE_PIXELS = 40_000_000;
export const MAX_NORMALIZED_IMAGE_EDGE = 2048;
export const MAX_NORMALIZED_IMAGE_BYTES = 2 * 1024 * 1024;
export const ATTACHMENT_GCM_TAG_BYTES = 16;
export const MAX_CIPHER_ATTACHMENT_BYTES =
  MAX_NORMALIZED_IMAGE_BYTES + ATTACHMENT_GCM_TAG_BYTES;
export const MAX_ATTACHMENTS_PER_TRANSACTION = 9;
export const MAX_LEDGER_ATTACHMENT_BYTES = 512 * 1024 * 1024;
export const MAX_LEDGER_ATTACHMENT_COUNT = 10_000;
export const MAX_BACKUP_MANIFEST_BYTES = 16 * 1024 * 1024;
export const MAX_BACKUP_FILE_BYTES = 544 * 1024 * 1024;
export const MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES = 1024 * 1024;
export const ATTACHMENT_SYNC_CONCURRENCY = 2;
export const ATTACHMENT_SYNC_MAX_ATTEMPTS = 3;
export const ATTACHMENT_SYNC_TIMEOUT_MS = 60_000;

export const NORMALIZED_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
] as const;
export const SOURCE_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type NormalizedAttachmentMime =
  (typeof NORMALIZED_ATTACHMENT_MIME_TYPES)[number];
export type SourceAttachmentMime =
  (typeof SOURCE_ATTACHMENT_MIME_TYPES)[number];

export type AttachmentAvailability =
  | "local"
  | "downloading"
  | "unavailable"
  | "error";

/** This is the only attachment shape allowed across the public renderer API. */
export interface AttachmentMetadata {
  id: string;
  mime: NormalizedAttachmentMime;
  width: number;
  height: number;
  byteLength: number;
  availability: AttachmentAvailability;
}

export function decodeAttachmentMetadata(value: unknown): AttachmentMetadata {
  if (!isRecord(value)) fail("attachment-invalid-reference");
  const keys = ["id", "mime", "width", "height", "byteLength", "availability"] as const;
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    fail("attachment-invalid-reference");
  if (typeof value.id !== "string" || value.id.length === 0 || value.id.length > 200)
    fail("attachment-invalid-reference");
  if (!isNormalizedMime(value.mime)) fail("attachment-invalid-reference");
  if (!isDimension(value.width) || !isDimension(value.height))
    fail("attachment-invalid-reference");
  if (
    !isSafeInteger(value.byteLength) ||
    value.byteLength < 1 ||
    value.byteLength > MAX_NORMALIZED_IMAGE_BYTES
  )
    fail("attachment-invalid-reference");
  if (!isAvailability(value.availability)) fail("attachment-invalid-reference");
  return {
    id: value.id,
    mime: value.mime,
    width: value.width,
    height: value.height,
    byteLength: value.byteLength,
    availability: value.availability,
  };
}

export interface AttachmentRef {
  /** A committed attachment already present in the current transaction. */
  attachmentId?: string;
  /** A token returned by the current host's staging session. */
  draftToken?: string;
}

/** Host-only descriptor. Never put this type on LunaLedgerApi. */
export interface StoredAttachmentDescriptor {
  id: string;
  workspaceId: string;
  mime: NormalizedAttachmentMime;
  width: number;
  height: number;
  byteLength: number;
  cipherByteLength: number;
  cipherSha256: string;
  cryptoVersion: typeof ATTACHMENT_PROTOCOL_VERSION;
  key: string;
  iv: string;
}

export interface AttachmentCiphertext {
  descriptor: StoredAttachmentDescriptor;
  ciphertext: Uint8Array<ArrayBuffer>;
}

export interface ValidatedSourceImage {
  mime: SourceAttachmentMime;
  width: number;
  height: number;
  hasAlpha: boolean;
}

export type AttachmentContractErrorCode =
  | "attachment-invalid-source"
  | "attachment-unsupported-mime"
  | "attachment-source-too-large"
  | "attachment-image-too-large"
  | "attachment-normalized-too-large"
  | "attachment-invalid-descriptor"
  | "attachment-invalid-reference"
  | "attachment-ciphertext-too-large"
  | "attachment-quota-exceeded"
  | "attachment-merge-quota-exceeded"
  | "attachment-incomplete"
  | "attachment-digest-mismatch"
  | "attachment-authentication-failed"
  | "attachment-crypto-unavailable";

export interface AttachmentQuotaDetails {
  requiredBytes: number;
  requiredCount: number;
  maxBytes: number;
  maxCount: number;
}

export class AttachmentContractError extends Error {
  constructor(
    readonly code: AttachmentContractErrorCode,
    readonly quota?: AttachmentQuotaDetails,
  ) {
    super(`LUNA_ERROR:${code}`);
    this.name = "AttachmentContractError";
  }
}

/** Parse the real image signature and dimensions before a decoder sees bytes. */
export function validateSourceImage(
  bytes: Uint8Array,
  declaredMime: string,
): ValidatedSourceImage {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SOURCE_IMAGE_BYTES) {
    fail(
      bytes.byteLength > MAX_SOURCE_IMAGE_BYTES
        ? "attachment-source-too-large"
        : "attachment-invalid-source",
    );
  }
  const mime = normalizeSourceMime(declaredMime);
  const actual = detectImage(bytes);
  if (actual.mime !== mime) fail("attachment-invalid-source");
  if (actual.width < 1 || actual.height < 1) fail("attachment-invalid-source");
  if (actual.width * actual.height > MAX_SOURCE_IMAGE_PIXELS)
    fail("attachment-image-too-large");
  return actual;
}

/** Validate bytes after the host's image decoder/normalizer has produced them. */
export function validateNormalizedImage(
  bytes: Uint8Array,
  mime: string,
  width: number,
  height: number,
): { mime: NormalizedAttachmentMime; width: number; height: number } {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_NORMALIZED_IMAGE_EDGE ||
    height > MAX_NORMALIZED_IMAGE_EDGE
  )
    fail("attachment-image-too-large");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_NORMALIZED_IMAGE_BYTES)
    fail("attachment-normalized-too-large");
  const normalizedMime = normalizeNormalizedMime(mime);
  const actual = detectImage(bytes);
  if (actual.mime !== normalizedMime || actual.width !== width || actual.height !== height)
    fail("attachment-invalid-source");
  return { mime: normalizedMime, width, height };
}

export function toAttachmentMetadata(
  descriptor: StoredAttachmentDescriptor,
  availability: AttachmentAvailability = "local",
): AttachmentMetadata {
  validateAttachmentDescriptor(descriptor);
  return {
    id: descriptor.id,
    mime: descriptor.mime,
    width: descriptor.width,
    height: descriptor.height,
    byteLength: descriptor.byteLength,
    availability,
  };
}

export function validateAttachmentDescriptor(
  value: unknown,
): asserts value is StoredAttachmentDescriptor {
  if (!isRecord(value)) fail("attachment-invalid-descriptor");
  const keys = [
    "id",
    "workspaceId",
    "mime",
    "width",
    "height",
    "byteLength",
    "cipherByteLength",
    "cipherSha256",
    "cryptoVersion",
    "key",
    "iv",
  ] as const;
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    fail("attachment-invalid-descriptor");
  if (
    typeof value.id !== "string" ||
    !UUID_V4.test(value.id) ||
    value.id !== value.id.toLowerCase()
  )
    fail("attachment-invalid-descriptor");
  if (
    typeof value.workspaceId !== "string" ||
    value.workspaceId.trim().length === 0 ||
    value.workspaceId.length > 200
  ) {
    fail("attachment-invalid-descriptor");
  }
  if (!isNormalizedMime(value.mime)) fail("attachment-invalid-descriptor");
  if (
    !isDimension(value.width) ||
    !isDimension(value.height) ||
    value.width > MAX_NORMALIZED_IMAGE_EDGE ||
    value.height > MAX_NORMALIZED_IMAGE_EDGE
  )
    fail("attachment-invalid-descriptor");
  const byteLength = value.byteLength;
  if (
    !isSafeInteger(byteLength) ||
    byteLength < 1 ||
    byteLength > MAX_NORMALIZED_IMAGE_BYTES
  )
    fail("attachment-invalid-descriptor");
  const cipherByteLength = value.cipherByteLength;
  if (
    !isSafeInteger(cipherByteLength) ||
    cipherByteLength !== byteLength + ATTACHMENT_GCM_TAG_BYTES ||
    cipherByteLength > MAX_CIPHER_ATTACHMENT_BYTES
  )
    fail("attachment-invalid-descriptor");
  if (
    typeof value.cipherSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.cipherSha256)
  )
    fail("attachment-invalid-descriptor");
  if (value.cryptoVersion !== ATTACHMENT_PROTOCOL_VERSION)
    fail("attachment-invalid-descriptor");
  decodeCanonicalBase64(value.key, 32, "attachment-invalid-descriptor");
  decodeCanonicalBase64(value.iv, 12, "attachment-invalid-descriptor");
}

/** Fixed-key-order AAD. The digest is intentionally not part of the AAD. */
export function attachmentAad(
  descriptor: Pick<
    StoredAttachmentDescriptor,
    "workspaceId" | "id" | "mime" | "width" | "height" | "byteLength"
  >,
): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    JSON.stringify({
      format: "luna-attachment",
      version: ATTACHMENT_PROTOCOL_VERSION,
      workspaceId: descriptor.workspaceId,
      attachmentId: descriptor.id,
      mime: descriptor.mime,
      width: descriptor.width,
      height: descriptor.height,
      byteLength: descriptor.byteLength,
    }),
  );
}

/** Encrypt once; retrying transport must reuse the returned ciphertext bytes. */
export async function encryptAttachmentBytes(
  bytes: Uint8Array,
  descriptor: StoredAttachmentDescriptor,
): Promise<Uint8Array<ArrayBuffer>> {
  validateAttachmentDescriptor(descriptor);
  if (bytes.byteLength !== descriptor.byteLength)
    fail("attachment-invalid-descriptor");
  const cryptoApi = requireCrypto();
  try {
    const ciphertext = await encryptRawAttachmentBytes(bytes, descriptor, cryptoApi);
    if (ciphertext.byteLength !== descriptor.cipherByteLength)
      fail("attachment-invalid-descriptor");
    if ((await sha256Hex(ciphertext)) !== descriptor.cipherSha256)
      fail("attachment-digest-mismatch");
    return ciphertext;
  } catch (error) {
    if (error instanceof AttachmentContractError) throw error;
    throw new AttachmentContractError("attachment-crypto-unavailable");
  }
}

/** Normalize first, then create the one immutable encrypted payload for a new image. */
export async function createEncryptedAttachment(
  bytes: Uint8Array,
  workspaceId: string,
  mime: string,
  width: number,
  height: number,
): Promise<AttachmentCiphertext> {
  const normalized = validateNormalizedImage(bytes, mime, width, height);
  const id = generateAttachmentId();
  const key = randomAttachmentBytes(32);
  const iv = randomAttachmentBytes(12);
  const provisional: StoredAttachmentDescriptor = {
    id,
    workspaceId,
    mime: normalized.mime,
    width: normalized.width,
    height: normalized.height,
    byteLength: bytes.byteLength,
    cipherByteLength: bytes.byteLength + ATTACHMENT_GCM_TAG_BYTES,
    cipherSha256: "0".repeat(64),
    cryptoVersion: ATTACHMENT_PROTOCOL_VERSION,
    key: encodeBase64(key),
    iv: encodeBase64(iv),
  };
  validateAttachmentDescriptor(provisional);
  const ciphertext = await encryptRawAttachmentBytes(bytes, provisional, requireCrypto());
  const descriptor = createAttachmentDescriptorInput(
    workspaceId,
    id,
    normalized.mime,
    normalized.width,
    normalized.height,
    bytes.byteLength,
    await sha256Hex(ciphertext),
    key,
    iv,
  );
  key.fill(0);
  iv.fill(0);
  return { descriptor, ciphertext };
}

export async function decryptAttachmentBytes(
  ciphertext: Uint8Array,
  descriptor: StoredAttachmentDescriptor,
): Promise<Uint8Array<ArrayBuffer>> {
  validateAttachmentDescriptor(descriptor);
  if (ciphertext.byteLength !== descriptor.cipherByteLength)
    fail("attachment-ciphertext-too-large");
  if ((await sha256Hex(ciphertext)) !== descriptor.cipherSha256)
    fail("attachment-digest-mismatch");
  const cryptoApi = requireCrypto();
  try {
    const key = await cryptoApi.subtle.importKey(
      "raw",
      toArrayBuffer(decodeCanonicalBase64(descriptor.key, 32, "attachment-invalid-descriptor")),
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const plain = await cryptoApi.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decodeCanonicalBase64(descriptor.iv, 12, "attachment-invalid-descriptor"),
        tagLength: 128,
        additionalData: attachmentAad(descriptor),
      },
      key,
      toArrayBuffer(ciphertext),
    );
    const bytes = new Uint8Array(plain);
    if (bytes.byteLength !== descriptor.byteLength)
      fail("attachment-authentication-failed");
    return bytes;
  } catch (error) {
    if (error instanceof AttachmentContractError) throw error;
    throw new AttachmentContractError(
      error instanceof Error && error.name === "OperationError"
        ? "attachment-authentication-failed"
        : "attachment-crypto-unavailable",
    );
  }
}

async function encryptRawAttachmentBytes(
  bytes: Uint8Array,
  descriptor: StoredAttachmentDescriptor,
  cryptoApi: Crypto,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await cryptoApi.subtle.importKey(
    "raw",
    toArrayBuffer(decodeCanonicalBase64(descriptor.key, 32, "attachment-invalid-descriptor")),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const encrypted = await cryptoApi.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(decodeCanonicalBase64(descriptor.iv, 12, "attachment-invalid-descriptor")),
      tagLength: 128,
      additionalData: toArrayBuffer(attachmentAad(descriptor)),
    },
    key,
    toArrayBuffer(bytes),
  );
  return new Uint8Array(encrypted);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const cryptoApi = requireCrypto();
  try {
    const digest = new Uint8Array(
      await cryptoApi.subtle.digest("SHA-256", toArrayBuffer(bytes)),
    );
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    throw new AttachmentContractError("attachment-crypto-unavailable");
  }
}

export function validateAttachmentInventoryQuota(
  inventory: ReadonlyMap<string, StoredAttachmentDescriptor>,
): void {
  const requiredBytes = [...inventory.values()].reduce(
    (total, descriptor) => total + descriptor.cipherByteLength,
    0,
  );
  const requiredCount = inventory.size;
  if (
    requiredBytes > MAX_LEDGER_ATTACHMENT_BYTES ||
    requiredCount > MAX_LEDGER_ATTACHMENT_COUNT
  )
    throw new AttachmentContractError("attachment-merge-quota-exceeded", {
      requiredBytes,
      requiredCount,
      maxBytes: MAX_LEDGER_ATTACHMENT_BYTES,
      maxCount: MAX_LEDGER_ATTACHMENT_COUNT,
    });
}

export function createAttachmentDescriptorInput(
  workspaceId: string,
  id: string,
  mime: NormalizedAttachmentMime,
  width: number,
  height: number,
  byteLength: number,
  cipherSha256: string,
  key: Uint8Array,
  iv: Uint8Array,
): StoredAttachmentDescriptor {
  const descriptor: StoredAttachmentDescriptor = {
    id,
    workspaceId,
    mime,
    width,
    height,
    byteLength,
    cipherByteLength: byteLength + ATTACHMENT_GCM_TAG_BYTES,
    cipherSha256,
    cryptoVersion: ATTACHMENT_PROTOCOL_VERSION,
    key: encodeBase64(key),
    iv: encodeBase64(iv),
  };
  validateAttachmentDescriptor(descriptor);
  return descriptor;
}

export function generateAttachmentId(randomUUID: () => string = () => {
  try {
    return secureRandomUuid();
  } catch {
    throw new AttachmentContractError("attachment-crypto-unavailable");
  }
}): string {
  const id = randomUUID();
  if (!UUID_V4.test(id) || id !== id.toLowerCase())
    fail("attachment-invalid-descriptor");
  return id;
}

export function randomAttachmentBytes(length: number): Uint8Array<ArrayBuffer> {
  if (!Number.isSafeInteger(length) || length < 1)
    fail("attachment-invalid-descriptor");
  const bytes = new Uint8Array(length);
  requireCrypto().getRandomValues(bytes);
  return bytes;
}

function detectImage(bytes: Uint8Array): ValidatedSourceImage {
  if (hasPrefix(bytes, PNG_SIGNATURE)) return parsePng(bytes);
  if (hasPrefix(bytes, JPEG_SIGNATURE)) return parseJpeg(bytes);
  if (hasPrefix(bytes, RIFF_SIGNATURE) && hasPrefix(bytes.subarray(8), WEBP_SIGNATURE))
    return parseWebp(bytes);
  fail("attachment-invalid-source");
}

function parsePng(bytes: Uint8Array): ValidatedSourceImage {
  if (bytes.byteLength < 33 || readAscii(bytes, 12, 4) !== "IHDR")
    fail("attachment-invalid-source");
  const width = readU32BE(bytes, 16);
  const height = readU32BE(bytes, 20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  if (bitDepth === undefined || colorType === undefined || ![0, 2, 3, 4, 6].includes(colorType))
    fail("attachment-invalid-source");
  if (bitDepth === 0) fail("attachment-invalid-source");
  return { mime: "image/png", width, height, hasAlpha: colorType === 4 || colorType === 6 };
}

function parseJpeg(bytes: Uint8Array): ValidatedSourceImage {
  let offset = 2;
  while (offset + 3 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) fail("attachment-invalid-source");
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined) break;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = readU16BE(bytes, offset);
    if (length < 2 || offset + length > bytes.byteLength)
      fail("attachment-invalid-source");
    if (isJpegStartOfFrame(marker)) {
      if (length < 7) fail("attachment-invalid-source");
      return {
        mime: "image/jpeg",
        height: readU16BE(bytes, offset + 3),
        width: readU16BE(bytes, offset + 5),
        hasAlpha: false,
      };
    }
    offset += length;
  }
  fail("attachment-invalid-source");
}

function parseWebp(bytes: Uint8Array): ValidatedSourceImage {
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const chunk = readAscii(bytes, offset, 4);
    const length = readU32LE(bytes, offset + 4);
    const data = offset + 8;
    if (data + length > bytes.byteLength) fail("attachment-invalid-source");
    if (chunk === "ANIM") fail("attachment-invalid-source");
    if (chunk === "VP8X") {
      if (length < 10) fail("attachment-invalid-source");
      const flags = bytes[data];
      if (flags === undefined || (flags & 0x02) !== 0) fail("attachment-invalid-source");
      return {
        mime: "image/webp",
        width: 1 + readU24LE(bytes, data + 4),
        height: 1 + readU24LE(bytes, data + 7),
        hasAlpha: (flags & 0x10) !== 0,
      };
    }
    if (chunk === "VP8 ") {
      if (length < 10 || bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a)
        fail("attachment-invalid-source");
      return {
        mime: "image/webp",
        width: readU16LE(bytes, data + 6) & 0x3fff,
        height: readU16LE(bytes, data + 8) & 0x3fff,
        hasAlpha: false,
      };
    }
    if (chunk === "VP8L") {
      if (length < 5 || bytes[data] !== 0x2f) fail("attachment-invalid-source");
      const b1 = bytes[data + 1] ?? 0;
      const b2 = bytes[data + 2] ?? 0;
      const b3 = bytes[data + 3] ?? 0;
      const b4 = bytes[data + 4] ?? 0;
      return {
        mime: "image/webp",
        width: 1 + (b1 | ((b2 & 0x3f) << 8)),
        height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0xf) << 10)),
        hasAlpha: true,
      };
    }
    offset = data + length + (length % 2);
  }
  fail("attachment-invalid-source");
}

function normalizeSourceMime(value: string): SourceAttachmentMime {
  if ((SOURCE_ATTACHMENT_MIME_TYPES as readonly string[]).includes(value))
    return value as SourceAttachmentMime;
  fail("attachment-unsupported-mime");
}

function normalizeNormalizedMime(value: string): NormalizedAttachmentMime {
  if ((NORMALIZED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(value))
    return value as NormalizedAttachmentMime;
  fail("attachment-unsupported-mime");
}

function isNormalizedMime(value: unknown): value is NormalizedAttachmentMime {
  return typeof value === "string" &&
    (NORMALIZED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(value);
}

function isAvailability(value: unknown): value is AttachmentAvailability {
  return value === "local" || value === "downloading" || value === "unavailable" || value === "error";
}

function isDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function requireCrypto(): Crypto {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function" || !cryptoApi.subtle)
    fail("attachment-crypto-unavailable");
  return cryptoApi;
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  return btoa(chunks.join(""));
}

function decodeCanonicalBase64(
  value: unknown,
  expectedBytes: number,
  errorCode: AttachmentContractErrorCode,
): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== "string" ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    fail(errorCode);
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    fail(errorCode);
  }
  if (binary.length !== expectedBytes || btoa(binary) !== value) fail(errorCode);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.byteLength) fail("attachment-invalid-source");
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readU16BE(bytes: Uint8Array, offset: number): number {
  if (offset + 2 > bytes.byteLength) fail("attachment-invalid-source");
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.byteLength) fail("attachment-invalid-source");
  return (
    ((bytes[offset] ?? 0) * 0x1000000) +
    ((bytes[offset + 1] ?? 0) << 16) +
    ((bytes[offset + 2] ?? 0) << 8) +
    (bytes[offset + 3] ?? 0)
  );
}

function readU16LE(bytes: Uint8Array, offset: number): number {
  if (offset + 2 > bytes.byteLength) fail("attachment-invalid-source");
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.byteLength) fail("attachment-invalid-source");
  return (
    (bytes[offset] ?? 0) +
    ((bytes[offset + 1] ?? 0) << 8) +
    ((bytes[offset + 2] ?? 0) << 16) +
    ((bytes[offset + 3] ?? 0) * 0x1000000)
  );
}

function readU24LE(bytes: Uint8Array, offset: number): number {
  if (offset + 3 > bytes.byteLength) fail("attachment-invalid-source");
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(code: AttachmentContractErrorCode): never {
  throw new AttachmentContractError(code);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] as const;
