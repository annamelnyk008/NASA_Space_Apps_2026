import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
  configFile: false,
  root,
  base: './',
  publicDir: 'public',
  plugins: [
    {
      name: 'copy-standalone-html',
      closeBundle() {
        const dist = resolve(root, 'standalone/dist');
        if (!existsSync(dist)) mkdirSync(dist, { recursive: true });
        copyFileSync(
          resolve(root, 'standalone/index.html'),
          resolve(dist, 'index.html')
        );
      },
    },
  ],
  build: {
    outDir: 'standalone/dist',
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,         
    lib: {
      entry: resolve(root, 'src/main.js'),
      name: 'MarsExplorer',
      formats: ['iife'],
      fileName: () => 'mars-explorer.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'mars-explorer.css';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
  define: {
    'import.meta.env.BASE_URL': JSON.stringify('./'),
  },
});
