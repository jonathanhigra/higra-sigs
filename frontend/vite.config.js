import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  css: {
    devSourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
  build: {
    // aumenta o limite de aviso de tamanho de chunk
    chunkSizeWarningLimit: 1000, // em kB

    rollupOptions: {
      output: {
        manualChunks: {
          // separa dependências grandes em bundles próprios
          react: ['react', 'react-dom'],
          vendor: [
            'axios',
            'react-router-dom',
            'zustand',
            'recharts',
          ],
        },
      },
    },
  },
});
