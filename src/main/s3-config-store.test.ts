import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test from 'node:test';
import { MAX_CONFIG_ENVELOPE_BYTES } from '../shared/config-crypto';
import {
  ObjectStoreError,
  createS3ConfigObjectStore,
} from './s3-config-store';

test('runtime AWS adapter signs GET and conditional PUT requests against a controlled S3 protocol endpoint', async () => {
  let body: Buffer | null = null;
  let etag: string | null = null;
  let forcedError: { status: number; code: string } | null = null;
  const requests: Array<{ method: string; ifMatch?: string; ifNoneMatch?: string }> = [];
  const server = createServer(async (request, response) => {
    if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== '/test-bucket/luna/config/v1/settings.enc.json') {
      writeS3Error(response, 404, 'NoSuchKey');
      return;
    }
    assert.match(request.headers.authorization ?? '', /^AWS4-HMAC-SHA256 /);
    assert.equal(typeof request.headers['x-amz-date'], 'string');
    if (forcedError !== null) {
      writeS3Error(response, forcedError.status, forcedError.code);
      return;
    }
    requests.push({
      method: request.method ?? '',
      ...(request.headers['if-match'] === undefined ? {} : { ifMatch: request.headers['if-match'] }),
      ...(request.headers['if-none-match'] === undefined ? {} : { ifNoneMatch: request.headers['if-none-match'] }),
    });
    if (request.method === 'GET') {
      if (body === null || etag === null) {
        writeS3Error(response, 404, 'NoSuchKey');
        return;
      }
      response.writeHead(200, { ETag: etag, 'Content-Length': body.byteLength });
      response.end(body);
      return;
    }
    if (request.method === 'PUT') {
      if (
        (request.headers['if-none-match'] === '*' && body !== null) ||
        (request.headers['if-match'] !== undefined && request.headers['if-match'] !== etag)
      ) {
        writeS3Error(response, 412, 'PreconditionFailed');
        return;
      }
      body = await readRequest(request);
      etag = `"${createHash('md5').update(body).digest('hex')}"`;
      response.writeHead(200, { ETag: etag, 'Content-Length': '0' });
      response.end();
      return;
    }
    writeS3Error(response, 405, 'MethodNotAllowed');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, 'object');
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  const store = createS3ConfigObjectStore(
    {
      endpoint: `http://127.0.0.1:${port}`,
      region: 'test-1',
      bucket: 'test-bucket',
      prefix: 'luna',
      forcePathStyle: true,
    },
    { accessKeyId: 'TEST_ACCESS', secretAccessKey: 'TEST_SECRET', passphrase: 'not-used-by-adapter' },
  );
  try {
    await assert.rejects(
      () => store.get('luna/config/v1/settings.enc.json'),
      (error: unknown) => error instanceof ObjectStoreError && error.code === 'not-found',
    );
    const created = await store.put(
      'luna/config/v1/settings.enc.json',
      Buffer.from('encrypted-config-v1'),
      { ifNoneMatch: true },
    );
    assert.equal(Buffer.from((await store.get('luna/config/v1/settings.enc.json')).body).toString(), 'encrypted-config-v1');
    await assert.rejects(
      () => store.put('luna/config/v1/settings.enc.json', Buffer.from('stale'), { ifMatch: '"stale"' }),
      (error: unknown) => error instanceof ObjectStoreError && error.code === 'conflict',
    );
    await store.put('luna/config/v1/settings.enc.json', Buffer.from('updated'), { ifMatch: created.etag });
    assert.equal(requests.some((request) => request.ifNoneMatch === '*'), true);
    assert.equal(requests.some((request) => request.ifMatch === created.etag), true);

    body = Buffer.alloc(MAX_CONFIG_ENVELOPE_BYTES + 1);
    etag = '"oversized"';
    await assert.rejects(
      () => store.get('luna/config/v1/settings.enc.json'),
      (error: unknown) => error instanceof ObjectStoreError && error.code === 'invalid-response',
    );
    await assert.rejects(
      () => store.put(
        'luna/config/v1/settings.enc.json',
        Buffer.alloc(MAX_CONFIG_ENVELOPE_BYTES + 1),
        { ifMatch: '"oversized"' },
      ),
      (error: unknown) => error instanceof ObjectStoreError && error.code === 'invalid-response',
    );

    for (const expected of [
      { status: 401, serviceCode: 'InvalidAccessKeyId', localCode: 'authentication' },
      { status: 403, serviceCode: 'AccessDenied', localCode: 'permission' },
      { status: 503, serviceCode: 'ServiceUnavailable', localCode: 'transient' },
    ] as const) {
      forcedError = { status: expected.status, code: expected.serviceCode };
      await assert.rejects(
        () => store.get('luna/config/v1/settings.enc.json'),
        (error: unknown) => error instanceof ObjectStoreError && error.code === expected.localCode,
      );
    }
    forcedError = null;
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
});

function writeS3Error(response: ServerResponse, status: number, code: string): void {
  const payload = `<Error><Code>${code}</Code><Message>${code}</Message></Error>`;
  response.writeHead(status, { 'Content-Type': 'application/xml', 'Content-Length': Buffer.byteLength(payload) });
  response.end(payload);
}

async function readRequest(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
