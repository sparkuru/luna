import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/** Precache only the complete, immutable application release, never user data. */
export function webOfflinePlugin(): Plugin {
  return {
    name: 'luna-offline-shell',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const icon = readFileSync(new URL('../src/renderer/assets/luna-icon.svg', import.meta.url), 'utf8');
      const manifest = JSON.stringify({
        id: '/', name: 'Luna', short_name: 'Luna', lang: 'zh-CN',
        start_url: '/', scope: '/', display: 'standalone',
        background_color: '#f7f8fc', theme_color: '#3048bd',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      });
      this.emitFile({ type: 'asset', fileName: 'icon.svg', source: icon });
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest });
      const assets = [...new Set([...Object.keys(bundle), 'icon.svg', 'manifest.webmanifest'])]
        .filter((name) => !name.endsWith('.map')).sort();
      const body = `
const ASSETS = ${JSON.stringify(assets.map((name) => `/${name}`))};
const APP_ROUTES = new Set(['/','/index.html','/setup','/luna','/statistics','/budget','/settings','/settings/account','/settings/sync','/settings/backup','/settings/conflicts','/settings/ledgers','/settings/categories','/settings/preferences','/settings/sync/advanced']);
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
