import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      // better-sqlite3 is external to the Vite main bundle and contains a
      // native addon. Keep its runtime files in the app and unpack them so
      // Electron can load the addon outside app.asar.
      unpack: '**/node_modules/better-sqlite3/**/*.node',
    },
    ignore: (file) => {
      if (file === '' || file === '/.vite' || file.startsWith('/.vite/')) return false;
      if (file === '/package.json' || file === '/license' || file === '/node_modules') return false;
      if (file === '/node_modules/better-sqlite3' || file.startsWith('/node_modules/better-sqlite3/')) {
        return false;
      }
      if (file === '/node_modules/node-addon-api' || file.startsWith('/node_modules/node-addon-api/')) {
        return false;
      }
      return true;
    },
    name: 'luna',
    executableName: 'luna',
  },
  rebuildConfig: process.env.LUNA_NATIVE_FROM_SOURCE === '1'
    ? { force: true, buildFromSource: true }
    : {},
  hooks: {
    packageAfterPrune: async (
      _forgeConfig,
      buildPath,
      _electronVersion,
      platform,
      arch,
    ) => {
      const prebuildDirectory = path.join(
        buildPath,
        'node_modules',
        'better-sqlite3',
        'prebuilds',
      );
      const targetPrebuild = `${platform}-${arch}.node`;
      for (const entry of await readdir(prebuildDirectory)) {
        if (entry.endsWith('.node') && entry !== targetPrebuild) {
          await unlink(path.join(prebuildDirectory, entry));
        }
      }
    },
  },
  makers: [new MakerZIP({}, ['linux', 'darwin', 'win32'])],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
