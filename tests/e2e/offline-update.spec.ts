import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';

test('updates wait for open forms and failed releases leave the working shell intact', async ({ page, context, request }) => {
  test.skip(!process.env.LUNA_TEST_BASE_URL && process.env.LUNA_TEST_PRODUCTION !== '1', 'Production build only');
  const swResponse = await request.get('/sw.js');
  expect(swResponse.ok()).toBe(true);
  const worker = await swResponse.text();
  const match = /const ASSETS = (\[[^\n]+\]);/.exec(worker);
  if (match?.[1] === undefined) throw new Error('Release worker has no asset manifest');
  const paths: unknown = JSON.parse(match[1]);
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string')) throw new Error('Invalid asset manifest');
  const assets = new Map<string, { body: Buffer; type: string }>();
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    assets.set(path, { body: await response.body(), type: response.headers()['content-type'] ?? 'application/octet-stream' });
  }
  let release = 1;
  let missingRequests = 0;
  const server = createServer((incoming, response) => {
    const path = new URL(incoming.url ?? '/', 'http://localhost').pathname;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    if (path === '/sw.js') {
      response.setHeader('Content-Type', 'text/javascript');
      let source = worker.replace(/luna-shell-[a-f0-9]+/, `luna-shell-test-release-${release}`);
      if (release === 3) source = source.replace('const ASSETS = [', 'const ASSETS = ["/missing-release-asset.js",');
      response.end(source);
    } else {
      const asset = assets.get(path === '/' ? '/index.html' : path);
      if (asset === undefined) {
        if (path === '/missing-release-asset.js') missingRequests += 1;
        response.writeHead(503).end();
        return;
      }
      response.setHeader('Content-Type', asset.type);
      response.end(path === '/' || path === '/index.html'
        ? asset.body.toString().replace('</head>', `<meta name="luna-test-release" content="${release}"></head>`)
        : asset.body);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Test server has no port');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    await page.goto(url);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.getByLabel('Ledger name').fill('Unsaved household');
    release = 2;
    await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state)).toBe('installed');
    await expect(page.getByLabel('Ledger name')).toHaveValue('Unsaved household');
    await expect(page.locator('meta[name="luna-test-release"]')).toHaveAttribute('content', '1');
    await page.close();
    const updated = await context.newPage();
    await expect.poll(async () => {
      await updated.goto(url);
      return updated.locator('meta[name="luna-test-release"]').getAttribute('content');
    }).toBe('2');
    await updated.waitForFunction(() => navigator.serviceWorker.controller !== null);
    expect(await updated.evaluate(() => caches.keys())).toEqual(['luna-shell-test-release-2']);
    release = 3;
    await updated.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
    await expect.poll(() => missingRequests).toBeGreaterThan(0);
    await expect.poll(() => updated.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.installing == null)).toBe(true);
    expect(await updated.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting)).toBeNull();
    await context.setOffline(true);
    await updated.reload();
    await expect(updated.locator('meta[name="luna-test-release"]')).toHaveAttribute('content', '2');
    await expect(updated.getByLabel('Ledger name')).toBeVisible();
    await context.setOffline(false);
    await updated.close();
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
