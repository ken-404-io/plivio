import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // In dev, proxy /api requests to the local backend so you don't need CORS
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  build: {
    // Produce source maps for easier debugging on Vercel
    sourcemap: false,
    // Warn if a single chunk exceeds 600 kB
    chunkSizeWarningLimit: 600,
    // Target Safari 14+ for broader iOS/macOS compatibility
    target: ['es2020', 'safari14'],
  },
});
