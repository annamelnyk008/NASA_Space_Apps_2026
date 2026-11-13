import { defineConfig } from 'vite';

// Заменяет server.py: на localhost код ходит за тайлами на '/trek/...',
// а прокси перенаправляет это на NASA Mars Trek.
// (См. var TREK в src/data/tiles.js — вне localhost используется прямой URL NASA.)
const trekProxy = {
  '/trek': {
    target: 'https://trek.nasa.gov',
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/trek/, '/tiles/Mars/EQ'),
  },
};

export default defineConfig({
  base: './',                       // относительные пути: сборка работает из любой папки/подпути
  server: { proxy: trekProxy },     // npm run dev
  preview: { proxy: trekProxy },    // npm run preview (тоже на localhost)
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,    // three.js целиком (~0.6 МБ) — пока без tree-shaking
  },
});
