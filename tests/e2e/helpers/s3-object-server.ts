import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

/** A protocol test endpoint; browsers still use the production AWS SDK and signer. */
export async function startObjectServer(origin: string, objectPath: string, accessKey: string) {
  const state = {
    body: null as string | null, etag: null as string | null, version: 0,
    gets: 0, puts: 0, preflights: 0, signedRequests: 0, conflicts: 0,
    conflictOnce: false, denyReads: false, failures: [] as string[],
  };
  const replace = (body: string): void => {
    state.body = body;
    state.etag = `"browser-version-${++state.version}"`;
  };
  const fail = (response: ServerResponse, status: number, code: string): void => {
    response.writeHead(status, { 'Content-Type': 'application/xml' });
    response.end(`<Error><Code>${code}</Code><Message>Controlled test response</Message></Error>`);
  };
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.headers.origin !== origin) {
      state.failures.push('Unexpected request origin');
      fail(response, 403, 'AccessDenied');
      return;
    }
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', request.headers['access-control-request-headers'] ?? 'authorization, content-type, if-match, if-none-match, x-amz-date, x-amz-content-sha256');
    response.setHeader('Access-Control-Expose-Headers', 'ETag, Content-Length, x-amz-request-id');
    response.setHeader('Access-Control-Max-Age', '0');
    if (request.headers['access-control-request-private-network'] === 'true') response.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (request.method === 'OPTIONS') {
      state.preflights++;
      response.writeHead(204).end();
      return;
    }
    if (new URL(request.url ?? '/', origin).pathname !== objectPath) {
      state.failures.push('Unexpected object path');
      fail(response, 404, 'NoSuchKey');
      return;
    }
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith(`AWS4-HMAC-SHA256 Credential=${accessKey}/`) || !authorization.includes('Signature=') || !request.headers['x-amz-date']) {
      state.failures.push('Missing production SigV4 authorization');
      fail(response, 403, 'AccessDenied');
      return;
    }
    state.signedRequests++;
    if (request.method === 'GET') {
      state.gets++;
      if (state.denyReads) { fail(response, 403, 'AccessDenied'); return; }
      if (state.body === null || state.etag === null) { fail(response, 404, 'NoSuchKey'); return; }
      response.writeHead(200, { ETag: state.etag, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(state.body) });
      response.end(state.body);
      return;
    }
    if (request.method !== 'PUT') { fail(response, 405, 'MethodNotAllowed'); return; }
    state.puts++;
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.length;
      if (length > 12 * 1024 * 1024) { fail(response, 413, 'EntityTooLarge'); return; }
      chunks.push(bytes);
    }
    if (state.conflictOnce) {
      state.conflictOnce = false;
      state.conflicts++;
      fail(response, 409, 'ConditionalRequestConflict');
      return;
    }
    const validCondition = state.body === null
      ? request.headers['if-none-match'] === '*' && request.headers['if-match'] === undefined
      : request.headers['if-match'] === state.etag && request.headers['if-none-match'] === undefined;
    if (!validCondition) { state.conflicts++; fail(response, 412, 'PreconditionFailed'); return; }
    replace(Buffer.concat(chunks).toString('utf8'));
    response.writeHead(200, { ETag: state.etag ?? '', 'Content-Length': '0' });
    response.end();
  };
  const server = createServer((request, response) => {
    void handle(request, response).catch(() => {
      state.failures.push('Test endpoint failed');
      if (!response.headersSent) fail(response, 500, 'InternalError');
      else response.destroy();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing test endpoint port');
  return {
    endpoint: `http://127.0.0.1:${address.port}`, state, replace,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
