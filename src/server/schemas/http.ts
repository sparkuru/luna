export const LIMITS = {
  ledgerBytes: 12 * 1024 * 1024,
  preferenceBytes: 1024 * 1024,
  attachmentBytes: 2 * 1024 * 1024 + 16,
  ledgerAttachmentBytes: 512 * 1024 * 1024,
  accountAttachmentBytes: 2 * 1024 * 1024 * 1024,
  attachmentCount: 10_000,
};
export const uuid = { type: "string", format: "uuid" } as const;
export const string = { type: "string" } as const;
export const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: "object", additionalProperties: false, properties, required });
export const userSchema = object({ id: uuid, username: string });
export const ledgerSchema = object({
  id: uuid,
  createdAt: { type: "string", format: "date-time" },
});
export const ledgerObjectStatusSchema = object({
  etag: string,
  version: { type: "integer", minimum: 1 },
  updatedAt: { type: "string", format: "date-time" },
});
export const attachmentUsageSchema = object({
  usedBytes: { type: "integer", minimum: 0 },
  reservedBytes: { type: "integer", minimum: 0 },
  maxBytes: { type: "integer", minimum: 1 },
  count: { type: "integer", minimum: 0 },
  maxCount: { type: "integer", minimum: 1 },
});
export const errorSchema = object({
  code: string,
  requestId: string,
  retryable: { type: "boolean" },
});
export const errors = Object.fromEntries(
  [400, 401, 403, 404, 409, 412, 413, 415, 428, 429, 503].map((status) => [
    status,
    errorSchema,
  ]),
);
const base64 = {
  type: "string",
  // Canonical padding/decoded lengths are checked by the shared envelope decoder.
  // Avoid repeated capture groups: V8 exhausts its stack on valid large objects.
  pattern: "^[A-Za-z0-9+/]+={0,2}$",
};
export const ledgerEnvelope = object({
  format: { const: "luna-ledger-envelope" },
  version: { type: "integer", enum: [1, 2, 3] },
  payloadSchemaVersion: { type: "integer", enum: [1, 2, 3] },
  kdf: object({
    name: { const: "PBKDF2" },
    hash: { const: "SHA-256" },
    iterations: { const: 600000 },
    salt: { ...base64, minLength: 24, maxLength: 24 },
  }),
  cipher: object({
    name: { const: "AES-GCM" },
    iv: { ...base64, minLength: 16, maxLength: 16 },
    tagLength: { const: 128 },
  }),
  ciphertext: { ...base64, minLength: 24, maxLength: 11184832 },
});
export const preferenceEnvelope = object({
  format: { const: "luna-config-envelope" },
  version: { const: 1 },
  payloadSchemaVersion: { const: 1 },
  kdf: object({
    name: { const: "scrypt" },
    salt: { ...base64, minLength: 24, maxLength: 24 },
    N: { type: "integer", enum: [16384, 32768, 65536, 131072] },
    r: { const: 8 },
    p: { const: 1 },
    maxmem: { type: "integer", minimum: 33554432, maximum: 268435456 },
  }),
  cipher: object({
    name: { const: "aes-256-gcm" },
    iv: { ...base64, minLength: 16, maxLength: 16 },
    tag: { ...base64, minLength: 24, maxLength: 24 },
  }),
  ciphertext: { ...base64, minLength: 4, maxLength: 87424 },
});
export const idempotencyHeaders = object({
  "idempotency-key": {
    type: "string",
    minLength: 8,
    maxLength: 128,
    pattern: "^[A-Za-z0-9_-]+$",
  },
});
export const conditionHeaders = {
  type: "object",
  required: ["idempotency-key"],
  properties: {
    ...idempotencyHeaders.properties,
    "if-match": { type: "string", minLength: 3, maxLength: 128 },
    "if-none-match": { const: "*" },
  },
};
