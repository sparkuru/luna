import Fastify, { type FastifyRequest, type FastifySchema } from "fastify";
import swagger from "@fastify/swagger";
import { randomBytes, randomUUID } from "node:crypto";
import { decodeLedgerEnvelope } from "../shared/ledger-crypto";
import { decodeConfigEnvelopeBytes } from "../shared/config-crypto";
import { authorize, digest, Passwords, verifyLogin } from "./auth";
import { ApiError } from "./errors";
import type { ServerDatabase } from "./db/database";
import {
  MemoryServerObjectStore,
  type ServerObjectStore,
} from "./storage/object-store";
import {
  transaction,
  idempotent,
  requireLedger,
  getObject,
  getObjectStatus,
  putObject,
  getAttachmentUsage,
  getAccountAttachmentUsage,
  reserveAttachment,
  publishAttachment,
  getAttachment,
  headAttachment,
  repairAttachment,
  assertLedgerPayloadVersion,
} from "./db/operations";
import {
  LIMITS,
  object,
  uuid,
  string,
  userSchema,
  ledgerSchema,
  ledgerObjectStatusSchema,
  errors,
  ledgerEnvelope,
  preferenceEnvelope,
  conditionHeaders,
  idempotencyHeaders,
} from "./schemas/http";
import {
  MAX_CIPHER_ATTACHMENT_BYTES,
} from "../shared/attachment-contract";
import { SERVER_SCHEMA_VERSION } from "./db/migration";

export interface AppOptions {
  database: ServerDatabase;
  objectStore?: ServerObjectStore;
  origins?: string[];
  sessionTtlSeconds?: number;
  log?: (event: {
    requestId: string;
    route: string;
    status: number;
    durationMs: number;
    bytes: number;
  }) => void;
}
const header = (request: FastifyRequest, name: string): string | undefined =>
  typeof request.headers[name] === "string" ? request.headers[name] : undefined;
export async function createApp(options: AppOptions) {
  const { database } = options;
  const objectStore = options.objectStore ?? new MemoryServerObjectStore();
  const app = Fastify({
    logger: false,
    exposeHeadRoutes: false,
    bodyLimit: LIMITS.ledgerBytes,
    requestTimeout: 30000,
    connectionTimeout: 10000,
    keepAliveTimeout: 5000,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  await objectStore.ensureReady();
  const passwords = new Passwords();
  let uploads = 0;
  const activeUploads = new WeakSet<FastifyRequest>();
  const releaseUpload = (request: FastifyRequest) => {
    if (activeUploads.delete(request)) uploads--;
  };
  const attempts = new Map<string, { count: number; until: number }>();
  const take = (key: string, limit: number) => {
    const now = Date.now();
    for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
    let bucket = attempts.get(key);
    if (!bucket) {
      if (attempts.size >= 10000) throw new ApiError(429, "rate-limited", true);
      bucket = { count: 0, until: now + 60000 };
      attempts.set(key, bucket);
    }
    if (++bucket.count > limit) throw new ApiError(429, "rate-limited", true);
  };
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request, body, done) => {
      try {
        const raw = body as Buffer;
        (request as FastifyRequest & { rawBody: Buffer }).rawBody = raw;
        done(
          null,
          JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)),
        );
      } catch {
        done(new ApiError(400, "invalid-input"));
      }
    },
  );
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (request, body, done) => {
      const raw = body as Buffer;
      (request as FastifyRequest & { rawBody: Buffer }).rawBody = raw;
      done(null, raw);
    },
  );
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: { title: "Luna API", version: "1.0.0" },
      components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
      },
    },
  });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Request-Id", request.id);
    if (request.method === "PUT") {
      if (uploads >= 4) throw new ApiError(429, "rate-limited", true);
      uploads++;
      activeUploads.add(request);
      request.raw.once("aborted", () => releaseUpload(request));
    }
    reply.header("Cache-Control", "no-store");
    reply.header("X-Request-Id", request.id);
    if (request.headers["content-encoding"])
      throw new ApiError(415, "unsupported-content-type");
    const origin = request.headers.origin;
    if (origin) {
      if (!options.origins?.includes(origin))
        throw new ApiError(400, "origin-not-allowed");
      reply
        .header("Access-Control-Allow-Origin", origin)
        .header("Vary", "Origin")
        .header(
          "Access-Control-Expose-Headers",
          "ETag, Content-Length, Retry-After, X-Request-Id, X-Luna-Cipher-SHA256",
        );
    }
  });
  app.addHook("onResponse", async (request, reply) => {
    releaseUpload(request);
    options.log?.({
      requestId: request.id,
      route: request.routeOptions.url ?? "unmatched",
      status: reply.statusCode,
      durationMs: reply.elapsedTime,
      bytes:
        (request as FastifyRequest & { rawBody?: Buffer }).rawBody
          ?.byteLength ?? 0,
    });
  });
  app.addHook("onError", async (request) => releaseUpload(request));
  app.options("/*", { schema: { hide: true } }, async (_request, reply) =>
    reply
      .header("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, DELETE, OPTIONS")
      .header(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, If-Match, If-None-Match, Idempotency-Key, X-Luna-Cipher-SHA256",
      )
      .code(204)
      .send(),
  );
  app.setErrorHandler((error, request, reply) => {
    const e = error as {
      validation?: unknown;
      code?: string;
      statusCode?: number;
    };
    const safe =
      error instanceof ApiError
        ? error
        : e.validation
          ? new ApiError(400, "invalid-input")
          : e.code === "FST_ERR_CTP_BODY_TOO_LARGE"
            ? new ApiError(413, "payload-too-large")
            : e.statusCode === 415
              ? new ApiError(415, "unsupported-content-type")
              : new ApiError(503, "unavailable", true);
    if (safe.status === 429) reply.header("Retry-After", "60");
    reply.code(safe.status).send({
      code: safe.code,
      requestId: request.id,
      retryable: safe.retryable,
    });
  });
  app.setNotFoundHandler((_request, reply) => {
    throw new ApiError(404, "not-found");
  });
  const schema = (
    operationId: string,
    response: Record<number, unknown>,
    extra: FastifySchema = {},
    auth = true,
  ): FastifySchema => ({
    operationId,
    ...(auth ? { security: [{ bearerAuth: [] }] } : {}),
    response: { ...errors, ...response },
    ...extra,
  });
  app.get(
    "/healthz",
    {
      schema: schema(
        "getHealth",
        { 200: object({ ok: { type: "boolean" } }) },
        {},
        false,
      ),
    },
    async () => ({ ok: true }),
  );
  app.get(
    "/readyz",
    {
      schema: schema(
        "getReadiness",
        { 200: object({ ok: { type: "boolean" } }) },
        {},
        false,
      ),
    },
    async () => {
      const result = database.sqlite
        .prepare(
          "SELECT 1 FROM server_metadata WHERE schema_version = ? AND singleton = 1",
        )
        .get(SERVER_SCHEMA_VERSION);
      if (!result) throw new ApiError(503, "unavailable", true);
      return { ok: true };
    },
  );
  app.get(
    "/api/v1/meta",
    {
      schema: schema(
        "getServerMeta",
        {
          200: object({
            instanceId: uuid,
            apiVersion: { const: 1 },
            limits: object({
              ledgerBytes: { type: "integer" },
              preferenceBytes: { type: "integer" },
              attachmentBytes: { type: "integer" },
              ledgerAttachmentBytes: { type: "integer" },
              accountAttachmentBytes: { type: "integer" },
              attachmentCount: { type: "integer" },
            }),
            ledgerEnvelopeVersions: { type: "array", items: { type: "integer" }, minItems: 1 },
            ledgerPayloadVersions: { type: "array", items: { type: "integer" }, minItems: 1 },
            attachmentProtocolVersion: { const: 1 },
          }),
        },
        {},
        false,
      ),
    },
    async () => {
      const result = database.sqlite
        .prepare(
          "SELECT instance_id FROM server_metadata WHERE schema_version = ? AND singleton = 1",
        )
        .get(SERVER_SCHEMA_VERSION) as { instance_id: string } | undefined;
      if (!result) throw new ApiError(503, "unavailable", true);
      return {
        instanceId: result.instance_id,
        apiVersion: 1,
        limits: LIMITS,
        ledgerEnvelopeVersions: [1, 2, 3],
        ledgerPayloadVersions: [1, 2, 3],
        attachmentProtocolVersion: 1,
      };
    },
  );
  app.post<{
    Body: { username: string; password: string; deviceLabel: string };
  }>(
    "/api/v1/auth/sessions",
    {
      bodyLimit: 2048,
      schema: schema(
        "createSession",
        {
          201: object({
            token: string,
            expiresAt: { type: "string", format: "date-time" },
            user: userSchema,
          }),
        },
        {
          body: object({
            username: { type: "string", maxLength: 128 },
            password: { type: "string", maxLength: 256 },
            deviceLabel: { type: "string", minLength: 1, maxLength: 80 },
          }),
        },
        false,
      ),
    },
    async (request, reply) => {
      take(`ip:${request.ip}`, 30);
      take(
        `account:${request.ip}:${request.body.username.normalize("NFKC").trim().toLowerCase()}`,
        5,
      );
      const user = await verifyLogin(
        database,
        passwords,
        request.body.username,
        request.body.password,
      );
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(
        Date.now() + (options.sessionTtlSeconds ?? 43200) * 1000,
      ).toISOString();
      await database.writes.runExclusive(() =>
        database.transaction(() => {
          const current = database.sqlite
            .prepare(
              "SELECT password_hash FROM users WHERE id = ? AND disabled_at IS NULL",
            )
            .get(user.id) as { password_hash: Buffer } | undefined;
          if (!current?.password_hash.equals(user.hash))
            throw new ApiError(401, "authentication");
          const count = database.sqlite
            .prepare(
              "SELECT count(*) AS count FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?",
            )
            .get(user.id, new Date().toISOString()) as { count: number };
          if (count.count >= 100) throw new ApiError(409, "session-limit");
          database.sqlite
            .prepare(
              `INSERT INTO sessions(id, user_id, token_hash, device_label, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .run(
              randomUUID(),
              user.id,
              digest(token),
              request.body.deviceLabel,
              new Date().toISOString(),
              expiresAt,
            );
          database.sqlite
            .prepare(
              `INSERT INTO security_events(created_at, actor_id, action, result, request_id)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(new Date().toISOString(), user.id, "login", "success", request.id);
        }),
      );
      user.hash.fill(0);
      return reply.code(201).send({
        token,
        expiresAt,
        user: { id: user.id, username: user.username },
      });
    },
  );
  app.get(
    "/api/v1/auth/me",
    { schema: schema("getCurrentUser", { 200: userSchema }) },
    async (request) =>
      transaction(
        database,
        header(request, "authorization"),
        (_database, identity) => ({
          id: identity.userId,
          username: identity.username,
        }),
      ),
  );
  app.get(
    "/api/v1/auth/sessions",
    {
      schema: schema("listSessions", {
        200: {
          type: "array",
          maxItems: 100,
          items: object({
            id: uuid,
            deviceLabel: string,
            createdAt: string,
            expiresAt: string,
            current: { type: "boolean" },
          }),
        },
      }),
    },
    async (request) =>
      transaction(database, header(request, "authorization"), (_database, i) => {
        const rows = database.sqlite
          .prepare(
            `SELECT id, device_label, created_at, expires_at FROM sessions
             WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
             ORDER BY created_at DESC LIMIT 100`,
          )
          .all(i.userId, new Date().toISOString()) as Array<{
          id: string;
          device_label: string;
          created_at: string;
          expires_at: string;
        }>;
        return rows.map((s) => ({
          id: s.id,
          deviceLabel: s.device_label,
          createdAt: s.created_at,
          expiresAt: s.expires_at,
          current: s.id === i.sessionId,
        }));
      }),
  );
  for (const path of ["/api/v1/auth/session", "/api/v1/auth/sessions/:id"])
    app.delete<{ Params: { id?: string } }>(
      path,
      {
        schema: schema(
          path.endsWith(":id") ? "revokeSession" : "logoutSession",
          { 204: { type: "null" } },
          path.endsWith(":id") ? { params: object({ id: uuid }) } : {},
        ),
      },
      async (request, reply) => {
        await transaction(
          database,
          header(request, "authorization"),
          (_database, i) => {
            const id = request.params.id ?? i.sessionId;
            database.sqlite
              .prepare(
                "UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND user_id = ?",
              )
              .run(new Date().toISOString(), id, i.userId);
            database.sqlite
              .prepare(
                `INSERT INTO security_events(created_at, actor_id, action, target_id, result, request_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
              )
              .run(
                new Date().toISOString(),
                i.userId,
                "session-revoked",
                id,
                "success",
                request.id,
              );
          },
          true,
        );
        return reply.code(204).send();
      },
    );
  app.get(
    "/api/v1/ledgers",
    {
      schema: schema("listLedgers", {
        200: { type: "array", maxItems: 1, items: ledgerSchema },
      }),
    },
    async (request) =>
      transaction(database, header(request, "authorization"), (_database, i) => {
        const rows = database.sqlite
          .prepare("SELECT id, created_at FROM ledgers WHERE owner_user_id = ?")
          .all(i.userId) as Array<{ id: string; created_at: string }>;
        return rows.map((row) => ({
          id: row.id,
          createdAt: row.created_at,
        }));
      }),
  );
  app.post(
    "/api/v1/ledgers",
    {
      bodyLimit: 1024,
      schema: schema(
        "createLedger",
        { 201: ledgerSchema },
        {
          headers: { ...idempotencyHeaders, additionalProperties: true },
          body: object({}),
        },
      ),
    },
    async (request, reply) => {
      const result = await transaction(
        database,
        header(request, "authorization"),
        (_database, i) =>
          idempotent(
            database,
            i.userId,
            "POST /ledgers",
            header(request, "idempotency-key")!,
            digest(rawBody(request)),
            () => {
              const existing = database.sqlite
                .prepare("SELECT id FROM ledgers WHERE owner_user_id = ?")
                .get(i.userId);
              if (existing) throw new ApiError(409, "ledger-exists");
              const createdAt = new Date().toISOString();
              const id = randomUUID();
              database.sqlite
                .prepare(
                  "INSERT INTO ledgers(id, owner_user_id, created_at) VALUES (?, ?, ?)",
                )
                .run(id, i.userId, createdAt);
              return {
                status: 201,
                body: {
                  id,
                  createdAt,
                },
              };
            },
          ),
        true,
      );
      return reply.code(result.status).send(result.body);
    },
  );
  const attachmentParams = {
    params: object({ id: uuid, attachmentId: uuid }),
  };
  app.get<{ Params: { id: string } }>(
    "/api/v1/ledgers/:id/attachments/usage",
    {
      schema: schema(
        "getLedgerAttachmentUsage",
        {
          200: object({
            usedBytes: { type: "integer", minimum: 0 },
            reservedBytes: { type: "integer", minimum: 0 },
            maxBytes: { type: "integer", minimum: 1 },
            count: { type: "integer", minimum: 0 },
            maxCount: { type: "integer", minimum: 1 },
            accountUsedBytes: { type: "integer", minimum: 0 },
            accountReservedBytes: { type: "integer", minimum: 0 },
            accountMaxBytes: { type: "integer", minimum: 1 },
          }),
        },
        { params: object({ id: uuid }) },
      ),
    },
    async (request) =>
      transaction(
        database,
        header(request, "authorization"),
        (_database, identity) => {
          requireLedger(database, identity.userId, request.params.id);
          const ledger = getAttachmentUsage(database, request.params.id);
          const account = getAccountAttachmentUsage(database, identity.userId);
          return {
            ...ledger,
            accountUsedBytes: account.usedBytes,
            accountReservedBytes: account.reservedBytes,
            accountMaxBytes: account.maxBytes,
          };
        },
      ),
  );
  app.put<{
    Params: { id: string; attachmentId: string };
    Body: Buffer;
  }>(
    "/api/v1/ledgers/:id/attachments/:attachmentId",
    {
      bodyLimit: LIMITS.attachmentBytes,
      schema: schema(
        "putLedgerAttachment",
        { 200: { ...object({ etag: string }), headers: { ETag: string } } },
        {
          ...attachmentParams,
          // Fastify receives a Buffer, while OpenAPI still advertises the
          // payload as binary. The object branch keeps AJV from treating a
          // valid Buffer as JSON text.
          body: {
            anyOf: [{ type: "string", format: "binary" }, { type: "object" }],
          },
          consumes: ["application/octet-stream"],
          headers: {
            type: "object",
            required: ["idempotency-key", "if-none-match", "x-luna-cipher-sha256"],
            properties: {
              "idempotency-key": {
                type: "string",
                minLength: 8,
                maxLength: 128,
                pattern: "^[A-Za-z0-9_-]+$",
              },
              "if-none-match": { const: "*" },
              "x-luna-cipher-sha256": { type: "string", pattern: "^[0-9a-f]{64}$" },
            },
          },
        },
      ),
    },
    async (request, reply) => {
      if (request.headers["content-type"] !== "application/octet-stream")
        throw new ApiError(415, "unsupported-content-type");
      if (request.headers["if-none-match"] !== "*") {
        if (request.headers["if-match"] !== undefined)
          throw new ApiError(400, "invalid-condition");
        throw new ApiError(428, "condition-required");
      }
      const body = binaryBody(request);
      if (body.byteLength < 17 || body.byteLength > MAX_CIPHER_ATTACHMENT_BYTES)
        throw new ApiError(413, "payload-too-large");
      const cipherSha256 = header(request, "x-luna-cipher-sha256");
      if (cipherSha256 === undefined || !/^[0-9a-f]{64}$/.test(cipherSha256))
        throw new ApiError(400, "invalid-input");
      if (digest(body) !== cipherSha256)
        throw new ApiError(400, "invalid-input");
      const attachmentId = decodeAttachmentId(request.params.attachmentId);
      const ledgerId = request.params.id;
      const token = header(request, "authorization");
      const idempotencyKey = header(request, "idempotency-key");
      if (idempotencyKey === undefined)
        throw new ApiError(428, "condition-required");
      const requestHash = digest(
        Buffer.concat([
          Buffer.from(
            JSON.stringify([
              "attachment",
              ledgerId,
              attachmentId,
              cipherSha256,
              body.byteLength,
              "*",
            ]),
          ),
          body,
        ]),
      );
      const identity = authorize(database, token);
      requireLedger(database, identity.userId, ledgerId);
      const result = await idempotent(
        database,
        identity.userId,
        `PUT attachment ${ledgerId}/${attachmentId}`,
        idempotencyKey,
        requestHash,
        async () => {
          const reservation = await transaction(
            database,
            token,
            (_database, currentIdentity) =>
              database.transaction(() =>
                reserveAttachment(
                  database,
                  currentIdentity.userId,
                  ledgerId,
                  attachmentId,
                  cipherSha256,
                  body.byteLength,
                ),
              ),
            true,
          );
          if (reservation.status === "published") {
            if (reservation.etag === null)
              throw new ApiError(503, "unavailable", true);
            return { status: 200, body: { etag: reservation.etag }, etag: reservation.etag };
          }
          let storedEtag: string;
          try {
            storedEtag = (
              await objectStore.putImmutable(reservation.objectKey, body)
            ).etag;
          } catch (error) {
            if (statusOf(error) !== 412) throw error;
            const existing = await objectStore.get(reservation.objectKey);
            if (
              existing === null ||
              existing.body.byteLength !== body.byteLength ||
              digest(existing.body) !== cipherSha256
            )
              throw new ApiError(409, "attachment-conflict");
            storedEtag = existing.etag;
          }
          const published = await transaction(
            database,
            token,
            (_database, currentIdentity) =>
              database.transaction(() =>
                publishAttachment(
                  database,
                  currentIdentity.userId,
                  ledgerId,
                  reservation.reservationId ?? (() => {
                    throw new ApiError(409, "attachment-reservation-expired");
                  })(),
                  storedEtag,
                ),
              ),
            true,
          );
          if (published.etag === null)
            throw new ApiError(503, "unavailable", true);
          return { status: 200, body: { etag: published.etag }, etag: published.etag };
        },
      );
      return reply.header("ETag", result.etag ?? result.body.etag).send(result.body);
    },
  );
  app.post<{
    Params: { id: string; attachmentId: string };
    Body: Buffer;
  }>(
    "/api/v1/ledgers/:id/attachments/:attachmentId/repair",
    {
      bodyLimit: LIMITS.attachmentBytes,
      schema: schema(
        "repairLedgerAttachment",
        { 200: { ...object({ etag: string }), headers: { ETag: string } } },
        {
          params: object({ id: uuid, attachmentId: uuid }),
          body: {
            anyOf: [{ type: "string", format: "binary" }, { type: "object" }],
          },
          consumes: ["application/octet-stream"],
          headers: {
            type: "object",
            required: ["idempotency-key", "if-match", "x-luna-cipher-sha256"],
            properties: {
              "idempotency-key": {
                type: "string",
                minLength: 8,
                maxLength: 128,
                pattern: "^[A-Za-z0-9_-]+$",
              },
              "if-match": { type: "string", minLength: 3, maxLength: 128 },
              "x-luna-cipher-sha256": { type: "string", pattern: "^[0-9a-f]{64}$" },
            },
          },
        },
      ),
    },
    async (request, reply) => {
      if (request.headers["content-type"] !== "application/octet-stream")
        throw new ApiError(415, "unsupported-content-type");
      const body = binaryBody(request);
      if (body.byteLength < 17 || body.byteLength > MAX_CIPHER_ATTACHMENT_BYTES)
        throw new ApiError(413, "payload-too-large");
      const attachmentId = decodeAttachmentId(request.params.attachmentId);
      const observedEtag = header(request, "if-match");
      const cipherSha256 = header(request, "x-luna-cipher-sha256");
      const idempotencyKey = header(request, "idempotency-key");
      if (observedEtag === undefined || cipherSha256 === undefined || idempotencyKey === undefined)
        throw new ApiError(428, "condition-required");
      if (!/^[0-9a-f]{64}$/.test(cipherSha256) || digest(body) !== cipherSha256)
        throw new ApiError(400, "invalid-input");
      const identity = authorize(database, header(request, "authorization"));
      requireLedger(database, identity.userId, request.params.id);
      const requestHash = digest(
        Buffer.concat([
          Buffer.from(JSON.stringify(["repair", request.params.id, attachmentId, observedEtag, cipherSha256, body.byteLength])),
          body,
        ]),
      );
      const result = await idempotent(
        database,
        identity.userId,
        `REPAIR attachment ${request.params.id}/${attachmentId}`,
        idempotencyKey,
        requestHash,
        async () => {
          const repaired = await repairAttachment(
            database,
            objectStore,
            request.params.id,
            attachmentId,
            body,
            cipherSha256,
            observedEtag,
            undefined,
            () => {
              authorize(database, header(request, "authorization"));
            },
          );
          return { status: 200, body: { etag: repaired.etag }, etag: repaired.etag };
        },
      );
      return reply.header("ETag", result.etag ?? result.body.etag).send(result.body);
    },
  );
  const attachmentReadSchema = schema(
    "getLedgerAttachment",
    {
      200: {
        type: "string",
        format: "binary",
        headers: {
          ETag: string,
          "X-Luna-Cipher-SHA256": string,
          "Content-Length": { type: "integer" },
        },
      },
    },
    attachmentParams,
  );
  app.get<{ Params: { id: string; attachmentId: string } }>(
    "/api/v1/ledgers/:id/attachments/:attachmentId",
    { schema: attachmentReadSchema },
    async (request, reply) => {
      const result = await transaction(
        database,
        header(request, "authorization"),
        (_database, identity) => {
          requireLedger(database, identity.userId, request.params.id);
          return getAttachment(
            database,
            objectStore,
            request.params.id,
            decodeAttachmentId(request.params.attachmentId),
          );
        },
      );
      return reply
        .type("application/octet-stream")
        .header("ETag", result.etag)
        .header("X-Luna-Cipher-SHA256", result.sha256)
        .header("Content-Length", result.byteLength)
        .send(result.body);
    },
  );
  app.head<{ Params: { id: string; attachmentId: string } }>(
    "/api/v1/ledgers/:id/attachments/:attachmentId",
    { schema: attachmentReadSchema },
    async (request, reply) => {
      const result = await transaction(
        database,
        header(request, "authorization"),
        (_database, identity) => {
          requireLedger(database, identity.userId, request.params.id);
          return headAttachment(
            database,
            objectStore,
            request.params.id,
            decodeAttachmentId(request.params.attachmentId),
          );
        },
      );
      return reply
        .type("application/octet-stream")
        .header("ETag", result.etag)
        .header("X-Luna-Cipher-SHA256", result.sha256)
        .header("Content-Length", result.byteLength)
        .code(200)
        .send();
    },
  );
  for (const preferences of [false, true]) {
    const path = preferences
      ? "/api/v1/preferences/object"
      : "/api/v1/ledgers/:id/object";
    const params = preferences ? {} : { params: object({ id: uuid }) };
    const envelope = preferences ? preferenceEnvelope : ledgerEnvelope;
    if (!preferences) {
      app.get<{ Params: { id: string } }>(
        "/api/v1/ledgers/:id/object/status",
        {
          schema: schema(
            "getLedgerObjectStatus",
            { 200: ledgerObjectStatusSchema },
            { params: object({ id: uuid }) },
          ),
        },
        async (request) =>
          transaction(
            database,
            header(request, "authorization"),
            (_database, i) => {
              requireLedger(database, i.userId, request.params.id);
              return getObjectStatus(database, request.params.id, false);
            },
          ),
      );
    }
    app.get<{ Params: { id: string } }>(
      path,
      {
        schema: schema(
          preferences ? "getPreferenceObject" : "getLedgerObject",
          { 200: { ...envelope, headers: { ETag: string } } },
          params,
        ),
      },
      async (request, reply) => {
        const result = await transaction(
          database,
          header(request, "authorization"),
          async (_database, i) => {
            if (!preferences)
              requireLedger(database, i.userId, request.params.id);
            return getObject(
              database,
              objectStore,
              preferences ? i.userId : request.params.id,
              preferences,
            );
          },
        );
        return reply
          .header("ETag", result.etag)
          .type("application/json")
          .send(result.body);
      },
    );
    app.put<{ Params: { id: string } }>(
      path,
      {
        bodyLimit: preferences ? LIMITS.preferenceBytes : LIMITS.ledgerBytes,
        schema: schema(
          preferences ? "putPreferenceObject" : "putLedgerObject",
          { 200: { ...object({ etag: string }), headers: { ETag: string } } },
          { ...params, body: envelope, headers: conditionHeaders },
        ),
      },
      async (request, reply) => {
        try {
          const body = rawBody(request);
          let ledgerPayloadVersion: 1 | 2 | 3 | undefined;
          try {
            if (preferences) decodeConfigEnvelopeBytes(body);
            else {
              ledgerPayloadVersion = decodeLedgerEnvelope(body.toString("utf8"))
                .envelope.payloadSchemaVersion;
            }
          } catch {
            throw new ApiError(400, "invalid-envelope");
          }
          const match = header(request, "if-match"),
            none = header(request, "if-none-match");
          const hash = digest(
            Buffer.concat([
              Buffer.from(JSON.stringify([match ?? null, none ?? null])),
              body,
            ]),
          );
          if (match && none) throw new ApiError(400, "invalid-condition");
          if (!match && !none) throw new ApiError(428, "condition-required");
          const condition = none
            ? ({ ifNoneMatch: true } as const)
            : ({ ifMatch: match! } as const);
          const result = await transaction(
            database,
            header(request, "authorization"),
            async (_database, i) => {
              const id = preferences ? i.userId : request.params.id;
              if (!preferences) {
                requireLedger(database, i.userId, id);
                assertLedgerPayloadVersion(database, id, ledgerPayloadVersion!);
              }
              return idempotent(
                database,
                i.userId,
                `PUT ${preferences ? "preferences" : id}`,
                header(request, "idempotency-key")!,
                hash,
                () =>
                  putObject(
                    database,
                    objectStore,
                    id,
                    preferences,
                    body,
                    condition,
                    ledgerPayloadVersion,
                  ),
              );
            },
            true,
          );
          return reply
            .header("ETag", result.etag!)
            .code(result.status)
            .send(result.body);
        } finally {
          releaseUpload(request);
        }
      },
    );
  }
  await app.ready();
  return app;
}
function rawBody(request: FastifyRequest): Buffer {
  return (request as FastifyRequest & { rawBody: Buffer }).rawBody;
}

function binaryBody(request: FastifyRequest): Buffer {
  const value = request.body;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new ApiError(400, "invalid-input");
}

function decodeAttachmentId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  )
    throw new ApiError(400, "invalid-input");
  return value;
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { statusCode?: unknown; $metadata?: { httpStatusCode?: unknown } };
  if (typeof record.statusCode === "number") return record.statusCode;
  return typeof record.$metadata?.httpStatusCode === "number"
    ? record.$metadata.httpStatusCode
    : undefined;
}
