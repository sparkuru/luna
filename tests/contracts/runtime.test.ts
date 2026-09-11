import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  boundedFetch,
  createApiClient,
  ResponseLimitError,
} from "../../src/api-client/runtime/client";
import {
  getLedgerObject,
  putLedgerObject,
} from "../../src/api-client/generated/sdk.gen";
import { decodeServerUrl } from "../../src/shared/server-api";

test("server URLs allow trusted private LAN HTTP but reject public HTTP", () => {
  assert.equal(
    decodeServerUrl("http://192.168.9.3:18080/"),
    "http://192.168.9.3:18080",
  );
  assert.doesNotThrow(() =>
    createApiClient("http://192.168.9.3:18080", () => undefined, async () =>
      new Response("{}"),
    ),
  );
  for (const value of ["http://8.8.8.8:18080/", "http://luna.example/"])
    assert.throws(() => decodeServerUrl(value), /ledger-insecure-connection/);
});

test("bounded fetch rejects dishonest and missing lengths before SDK parsing", async () => {
  let cancelled = false;
  const fetcher: typeof fetch = async () =>
    new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(new Uint8Array(9));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "content-length": "1" } },
    );
  await assert.rejects(
    boundedFetch(fetcher, 8)("http://localhost"),
    ResponseLimitError,
  );
  assert.equal(cancelled, true);
});
test("generated SDK preserves conditions, idempotency, ETag, status and AbortSignal", async () => {
  const controller = new AbortController();
  let seen: Request | undefined;
  const fetcher: typeof fetch = async (input) => {
    seen = input as Request;
    return new Response(
      '{"code":"precondition-failed","requestId":"a","retryable":false}',
      {
        status: 412,
        headers: { etag: '"one"', "content-type": "application/json" },
      },
    );
  };
  const client = createApiClient(
    "http://localhost",
    () => "opaque-test-token",
    fetcher,
  );
  const result = await putLedgerObject({
    client,
    path: { id: "00000000-0000-4000-8000-000000000001" },
    body: {} as never,
    headers: { "Idempotency-Key": "12345678", "If-Match": '"old"' } as never,
    signal: controller.signal,
  });
  assert.equal(result.response!.status, 412);
  assert.equal(result.response!.headers.get("etag"), '"one"');
  assert.equal(result.error?.code, "precondition-failed");
  assert.equal(seen?.headers.get("if-match"), '"old"');
  assert.equal(seen?.headers.get("idempotency-key"), "12345678");
  assert.equal(seen?.headers.get("authorization"), "Bearer opaque-test-token");
  controller.abort();
  assert.equal(seen?.signal.aborted, true);
});
test("SDK text parsing permits exact encrypted bytes with ETag", async () => {
  const client = createApiClient(
    "http://localhost",
    () => undefined,
    async () =>
      new Response('{ "ciphertext": "opaque" }', {
        headers: { etag: '"raw"', "content-type": "application/json" },
      }),
  );
  const result = await getLedgerObject({
    client,
    path: { id: "00000000-0000-4000-8000-000000000001" },
    parseAs: "text",
  });
  assert.equal(result.data, '{ "ciphertext": "opaque" }');
  assert.equal(result.response!.headers.get("etag"), '"raw"');
});

test("bounded fetch rejects chunked HTTP overflow and aborts an unfinished response", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.write("123456789");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  try {
    await assert.rejects(boundedFetch(fetch, 8)(url), ResponseLimitError);
    const controller = new AbortController();
    const fetcher: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      // Headers and the first chunk arrived, but the body remains unfinished.
      controller.abort();
      return response;
    };
    await assert.rejects(
      boundedFetch(fetcher)(url, { signal: controller.signal }),
      { name: "AbortError" },
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
