import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      '/auth': 'http://127.0.0.1:4000',
      '/realtime': {
        target: 'ws://127.0.0.1:4000',
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      '@raidrelay/contracts': path.resolve(__dirname, '../../packages/contracts/src'),
      '@raidrelay/fixtures': path.resolve(__dirname, '../../packages/fixtures/src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

