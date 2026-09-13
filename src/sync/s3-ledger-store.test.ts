import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import {
  LedgerObjectError,
  MAX_LEDGER_OBJECT_BYTES,
  readBoundedLedgerBody,
  S3LedgerAttachmentStore,
  S3LedgerObjectStore,
} from './s3-ledger-store';
import { decodeLedgerSessionInput } from '../shared/ledger-session';

test('S3 ledger adapter signs requests and uses conditional create/update with exact ETags', async () => {
  let object: string | null = null;
  let revision = 0;
  const seen: Array<{ method: string; path: string; condition: string | undefined }> = [];
  const server = createServer(async (request, response) => {
    assert.match(request.headers.authorization ?? '', /^AWS4-HMAC-SHA256 /);
    assert.match(request.headers.authorization ?? '', /Credential=synthetic-access\//);
    const condition = request.headers['if-match'] ?? request.headers['if-none-match'];
    seen.push({ method: request.method ?? '', path: request.url ?? '', condition: typeof condition === 'string' ? condition : undefined });
    if (request.url?.includes('forbidden')) { response.writeHead(403); response.end('<Error><Code>AccessDenied</Code></Error>'); return; }
    if (request.method === 'GET') {
      if (object === null) { response.writeHead(404); response.end('<Error><Code>NoSuchKey</Code></Error>'); }
      else { response.writeHead(200, { ETag: `"revision-${revision}"` }); response.end(object); }
      return;
    }
    if ((request.headers['if-none-match'] === '*' && object !== null) ||
        (request.headers['if-match'] !== undefined && request.headers['if-match'] !== `"revision-${revision}"`)) {
      response.writeHead(412); response.end('<Error><Code>PreconditionFailed</Code></Error>'); return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    object = Buffer.concat(chunks).toString('utf8');
    revision++;
    response.writeHead(200, { ETag: `"revision-${revision}"` }); response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');
  const adapter = new S3LedgerObjectStore({ endpoint: `http://127.0.0.1:${address.port}`, region: 'us-east-1',
    bucket: 'ledger-test', prefix: '', forcePathStyle: true },
  { accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret', passphrase: 'not-used-by-adapter' });
  const signal = AbortSignal.timeout(10_000);
  try {
    assert.equal(await adapter.get('household/ledger-v1.enc.json', signal), null);
    await adapter.put('household/ledger-v1.enc.json', '{"ciphertext":"first"}', null, signal);
    const first = await adapter.get('household/ledger-v1.enc.json', signal);
    assert.deepEqual(first, { body: '{"ciphertext":"first"}', etag: '"revision-1"' });
    await assert.rejects(adapter.put('household/ledger-v1.enc.json', 'bad', null, signal), /ledger-remote-conflict/);
    await adapter.put('household/ledger-v1.enc.json', '{"ciphertext":"second"}', first.etag, signal);
    await assert.rejects(adapter.put('household/ledger-v1.enc.json', 'bad', first.etag, signal), /ledger-remote-conflict/);
    await assert.rejects(adapter.get('forbidden', signal), /ledger-remote-permission/);
    assert.ok(seen.some((item) => item.method === 'PUT' && item.condition === '*'));
    assert.ok(seen.some((item) => item.method === 'PUT' && item.condition === '"revision-1"'));
    assert.ok(seen.every((item) => item.path.startsWith('/ledger-test/')));
    assert.equal(object, '{"ciphertext":"second"}');
  } finally {
    adapter.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('bounded streaming handles split UTF8, cancels oversized responses and rejects malformed bytes', async () => {
  const bytes = new TextEncoder().encode('账本');
  assert.equal(await readBoundedLedgerBody(new ReadableStream({ start(controller) {
    controller.enqueue(bytes.slice(0, 1)); controller.enqueue(bytes.slice(1)); controller.close();
  } })), '账本');
  let cancelled = false;
  await assert.rejects(readBoundedLedgerBody(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(MAX_LEDGER_OBJECT_BYTES + 1));
  }, cancel() { cancelled = true; } })), LedgerObjectError);
  assert.equal(cancelled, true);
  await assert.rejects(readBoundedLedgerBody(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array([0xff])); controller.close();
  } })), LedgerObjectError);
});

test('ledger session rejects plaintext network endpoints and persistent secret requests', () => {
  const input = { connection: { endpoint: 'https://example.invalid', region: 'us-east-1', bucket: 'ledger-test', prefix: 'household/', forcePathStyle: true },
    credentials: { accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret', passphrase: 'a-long-test-password' }, rememberSecrets: false };
  assert.equal(decodeLedgerSessionInput(input).connection.prefix, 'household');
  assert.throws(() => decodeLedgerSessionInput({ ...input, rememberSecrets: true }), /ledger-insecure-connection/);
  assert.throws(() => decodeLedgerSessionInput({ ...input, connection: { ...input.connection, endpoint: 'http://example.invalid' } }), /ledger-insecure-connection/);
  assert.equal(decodeLedgerSessionInput({ ...input, connection: { ...input.connection, endpoint: 'http://127.0.0.1:19000' } }).connection.endpoint, 'http://127.0.0.1:19000');
});

test('S3 attachment adapter uses immutable exact keys and narrow digest repair', async () => {
  const attachmentId = '11111111-1111-4111-8111-111111111111';
  const correct = Buffer.alloc(32, 7);
  let object: Buffer | null = Buffer.alloc(32, 3);
  let revision = 0;
  let putCount = 0;
  const conditions: string[] = [];
  const server = createServer(async (request, response) => {
    const expectedPath = `/ledger-test/household/attachments/v1/${attachmentId}`;
    assert.equal(
      new URL(request.url ?? '/', 'http://fixture').pathname,
      expectedPath,
    );
    if (request.method === 'GET') {
      if (object === null) {
        response.writeHead(404);
        response.end('<Error><Code>NoSuchKey</Code></Error>');
        return;
      }
      response.writeHead(200, {
        ETag: `"etag-${revision}"`,
        'Content-Length': String(object.byteLength),
        'x-amz-meta-sha256': createHash('sha256').update(object).digest('hex'),
      });
      response.end(object);
      return;
    }
    assert.equal(request.method, 'PUT');
    const condition = request.headers['if-match'] ?? request.headers['if-none-match'];
    assert.equal(typeof condition, 'string');
    conditions.push(condition as string);
    if (
      (condition === '*' && object !== null) ||
      (condition !== '*' && condition !== `"etag-${revision}"`)
    ) {
      response.writeHead(412);
      response.end('<Error><Code>PreconditionFailed</Code></Error>');
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    object = Buffer.concat(chunks);
    revision += 1;
    putCount += 1;
    response.writeHead(200, { ETag: `"etag-${revision}"` });
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');
  const store = new S3LedgerObjectStore(
    {
      endpoint: `http://127.0.0.1:${address.port}`,
      region: 'us-east-1',
      bucket: 'ledger-test',
      prefix: 'household/',
      forcePathStyle: true,
    },
    {
      accessKeyId: 'synthetic-access',
      secretAccessKey: 'synthetic-secret',
      passphrase: 'not-used-by-adapter',
    },
  );
  const signal = AbortSignal.timeout(10_000);
  try {
    const first = await store.attachments.get(attachmentId, signal);
    assert.ok(first);
    assert.notEqual(first.sha256, createHash('sha256').update(correct).digest('hex'));
    const repaired = await store.attachments.repairExpectedCiphertext(
      attachmentId,
      correct,
      createHash('sha256').update(correct).digest('hex'),
      first.etag,
      signal,
    );
    assert.equal(repaired.etag, '"etag-1"');
    assert.deepEqual(await store.attachments.get(attachmentId, signal), {
      body: new Uint8Array(correct),
      etag: '"etag-1"',
      sha256: createHash('sha256').update(correct).digest('hex'),
    });
    const writesAfterRepair = putCount;
    await store.attachments.repairExpectedCiphertext(
      attachmentId,
      correct,
      createHash('sha256').update(correct).digest('hex'),
      '"etag-1"',
      signal,
    );
    assert.equal(putCount, writesAfterRepair);
    object = null;
    const created = await store.attachments.repairExpectedCiphertext(
      attachmentId,
      correct,
      createHash('sha256').update(correct).digest('hex'),
      '"ignored-when-missing"',
      signal,
    );
    assert.equal(created.etag, '"etag-2"');
    assert.deepEqual(conditions, ['"etag-0"', '*']);
    await assert.rejects(
      store.attachments.repairExpectedCiphertext(
        attachmentId,
        Buffer.alloc(16),
        createHash('sha256').update(Buffer.alloc(16)).digest('hex'),
        created.etag,
        signal,
      ),
      /ledger-remote-invalid-response/,
    );
  } finally {
    store.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
