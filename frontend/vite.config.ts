import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Minimal `process` declaration so we don't need @types/node just to read env.
declare const process: { env: Record<string, string | undefined> };

/**
 * Build version — identifies the current deployment. Used by the client-side
 * `useVersionCheck` hook to detect a new deploy and hard-reload every open tab.
 * Prefer the git SHA exposed by Vercel/CI so re-deploys of the same commit
 * are idempotent; fall back to a build timestamp for local builds.
 */
function computeBuildVersion(): string {
  const envSha =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.COMMIT_SHA;
  if (envSha) return envSha.slice(0, 12);
  return String(Date.now());
}

/**
 * Emits `/version.json` into the build output so the running client can poll
 * it and detect a new deployment. The file is tiny and always served fresh.
 */
function emitVersionJsonPlugin(version: string): Plugin {
  return {
    name: 'emit-version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version, builtAt: new Date().toISOString() }) + '\n',
      });
    },
  };
}

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

const BUILD_VERSION = computeBuildVersion();

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  plugins: [react(), removeCrossOriginPlugin(), emitVersionJsonPlugin(BUILD_VERSION)],

  // In dev, proxy /api requests to the local backend so you don't need CORS.
  // Also mirror the Vercel rewrites for the Monetag ad tags so /js/p1.js
  // and /js/p2.js resolve to real JavaScript during `vite dev` instead of
  // falling through to the SPA fallback and triggering
  // "Uncaught SyntaxError: Unexpected token '<'" in the console.
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/js/p1.js': {
        target:       'https://nap5k.com',
        changeOrigin: true,
        secure:       true,
        rewrite:      () => '/tag.min.js',
      },
      '/js/p2.js': {
        target:       'https://quge5.com',
        changeOrigin: true,
        secure:       true,
        rewrite:      () => '/88/tag.min.js',
      },
    },
  },

  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    target: ['es2020', 'safari14'],
  },
});
