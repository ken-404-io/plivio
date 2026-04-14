import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Strip the `crossorigin` attribute from every <script> and <link> tag that
 * Vite injects into index.html at build time.
 *
 * Without this, Vite emits:
 *   <link rel="stylesheet" crossorigin href="/assets/index-xxx.css">
 *
 * When the page is served from a plain static-file host (nginx, Apache, etc.)
 * that does NOT return an Access-Control-Allow-Origin response header, the
 * browser silently drops the stylesheet, leaving the page completely unstyled.
 * Vercel and similar CDNs add that header automatically, but the attribute is
 * still unnecessary there — removing it is the safest universal default.
 */
function removeCrossOriginPlugin(): Plugin {
  return {
    name: 'remove-crossorigin',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script([^>]*)\scrossorigin([^>]*)>/g, '<script$1$2>')
        .replace(/<link([^>]*)\scrossorigin([^>]*)>/g,   '<link$1$2>');
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), removeCrossOriginPlugin()],

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
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    target: ['es2020', 'safari14'],
  },
});
