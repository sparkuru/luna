import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/** Precache only the complete, immutable application release, never user data. */
export function webOfflinePlugin(): Plugin {
  return {
    name: 'luna-offline-shell',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#4338ca"/><path d="M180 120v272h176v-56H240V120z" fill="white"/></svg>';
      const manifest = JSON.stringify({
        id: '/', name: 'Luna', short_name: 'Luna', lang: 'zh-CN',
        start_url: '/', scope: '/', display: 'standalone',
        background_color: '#f4f7fb', theme_color: '#4338ca',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      });
      this.emitFile({ type: 'asset', fileName: 'icon.svg', source: icon });
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest });
      const assets = [...new Set([...Object.keys(bundle), 'icon.svg', 'manifest.webmanifest'])]
        .filter((name) => !name.endsWith('.map')).sort();
      const body = `
const ASSETS = ${JSON.stringify(assets.map((name) => `/${name}`))};
const APP_ROUTES = new Set(['/','/index.html','/setup','/ledger','/statistics','/budget','/settings','/settings/account','/settings/sync','/settings/backup','/settings/conflicts','/settings/ledgers','/settings/preferences','/settings/sync/advanced','/ledger/menu','/ledger/menu/settings','/ledger/menu/budget','/ledger/menu/statistics','/ledger/menu/sync','/ledger/menu/backup','/ledger/menu/conflicts','/ledger/menu/account']);
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('luna-shell-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const path = request.mode === 'navigate' && APP_ROUTES.has(url.pathname)
    ? '/index.html' : url.pathname;
  if (!ASSETS.includes(path) || (request.mode !== 'navigate' && url.search)) return;
  event.respondWith((async () => {
    const cached = await (await caches.open(CACHE)).match(path);
    return cached || fetch(request);
  })());
});
`;
      const hash = createHash('sha256').update(body).update(icon).update(manifest);
      for (const name of Object.keys(bundle).sort()) {
        const entry = bundle[name];
        if (entry !== undefined) hash.update(name).update(entry.type === 'chunk' ? entry.code : entry.source);
      }
      this.emitFile({
        type: 'asset', fileName: 'sw.js',
        source: `const CACHE = 'luna-shell-${hash.digest('hex').slice(0, 24)}';\n${body}`,
      });
    },
  };
}
