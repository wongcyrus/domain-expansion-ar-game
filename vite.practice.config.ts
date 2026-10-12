import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'practice'),
  publicDir: resolve(__dirname, 'public'),
  base: process.env.PRACTICE_BASE_PATH || '/domain-expansion-ar-game/',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist-practice'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        practice: resolve(__dirname, 'practice/index.html'),
        media: resolve(__dirname, 'practice/player.html')
      }
    }
  }
});
