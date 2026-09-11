import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { webOfflinePlugin } from './scripts/web-offline-plugin';

function loadHttpsOptions(): { cert: Buffer; key: Buffer } | undefined {
  const certificatePath = process.env.LUNA_PREVIEW_HTTPS_CERT;
  const keyPath = process.env.LUNA_PREVIEW_HTTPS_KEY;
  if (!certificatePath && !keyPath) return undefined;
  if (!certificatePath || !keyPath)
    throw new Error('LUNA_PREVIEW_HTTPS_CERT and LUNA_PREVIEW_HTTPS_KEY must be set together');
  return {
    cert: fs.readFileSync(certificatePath),
    key: fs.readFileSync(keyPath),
  };
}

const httpsOptions = loadHttpsOptions();
const httpsConfig = httpsOptions ? { https: httpsOptions } : {};

function androidDebugLanCspPlugin(): Plugin {
  const enabled = process.env.LUNA_ANDROID_DEBUG === 'true';
  return {
    name: 'luna-android-debug-lan-csp',
    transformIndexHtml(html) {
      if (!enabled) return html;
      const connectSource = "connect-src 'self' https:";
      if (!html.includes(connectSource)) {
        throw new Error('Luna Android debug CSP marker is missing');
      }
      return html.replace(connectSource, `${connectSource} http:`);
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), webOfflinePlugin(), androidDebugLanCspPlugin()],
  root: path.join(__dirname, 'src/web'),
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    ...httpsConfig,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      allow: [
        path.join(__dirname, 'src'),
        path.join(__dirname, 'node_modules/@sqlite.org/sqlite-wasm/dist'),
      ],
    },
  },
  preview: {
    host: '127.0.0.1',
    ...httpsConfig,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    outDir: path.join(__dirname, 'dist-web'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: path.join(__dirname, 'src/web/index.html'),
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
});
