import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: '.',
  server: {
    host: true, // слушаем на 0.0.0.0 — важно для Radmin VPN / LAN-доступа друзей
    port: 5173,
    strictPort: false,
    proxy: {
      // WebSocket-прокси на сервер (нужно для неткода)
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
      // REST-прокси для /api/map и /api/network
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
