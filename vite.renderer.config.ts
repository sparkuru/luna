import path from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  root: path.join(__dirname, 'src/renderer'),
  build: {
    outDir: path.join(__dirname, '.vite/renderer/main_window'),
    rollupOptions: {
      input: path.join(__dirname, 'src/renderer/index.html'),
    },
  },
});
