import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5179, strictPort: true },
  build: { rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), copilot: resolve(import.meta.dirname, 'copilot.html') } } },
});
