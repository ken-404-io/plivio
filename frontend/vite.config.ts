import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Strip the `crossorigin` attribute from every <script> and <link> tag in
 * index.html at build time.
 *
 * Why this matters: Vite injects
 *   <link rel="stylesheet" crossorigin href="/assets/index-xxx.css">
 * When the page is served from a static host that does NOT return an
 * Access-Control-Allow-Origin response header, the browser silently drops the
 * stylesheet and the page renders completely unstyled. Vercel and similar CDNs
 * add the header automatically, but the attribute is still unnecessary there —
 * removing it is the safest universal default.
 *
 * Historical bug (fixed): the original regex used two capture groups to
 * re-emit the tag minus the `crossorigin` keyword, which left an orphaned
 * ="anonymous" token behind for valued attributes (e.g. the Google AdSense
 * <script>). That malformed attribute caused Chrome to terminate the <head>
 * early, pushing the subsequent stylesheet <link> into <body> — where it was
 * silently ignored. Result: completely unstyled page.
 *
 * Current approach: a single targeted replacement that matches the whole
 * attribute (name + optional value in double quotes, single quotes, or
 * unquoted) and removes it cleanly, for every shape browsers accept.
 *
 * The `transformIndexHtml` hook is declared with `order: 'post'` so it runs
 * after Vite's built-in HTML injection — guaranteeing we see (and can clean)
 * every crossorigin attribute Vite adds.
 */
function removeCrossOriginPlugin(): Plugin {
  // Matches:
  //   crossorigin                       (boolean)
  //   crossorigin="anonymous"           (double-quoted)
  //   crossorigin='anonymous'           (single-quoted)
  //   crossorigin=anonymous             (unquoted, terminated by whitespace or '>')
  // Leading \s+ anchors to an attribute boundary so we never match inside a
  // URL or string literal.
  const CROSSORIGIN_ATTR =
    /\s+crossorigin(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/g;

  return {
    name: 'remove-crossorigin',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const cleaned = html.replace(CROSSORIGIN_ATTR, '');

        // ── Sanity check (fail the build on regressions) ────────────────
        // If any of these show up in the final HTML, the "unstyled page"
        // bug is back. Fail loudly now instead of letting it ship.
        const headEnd = cleaned.indexOf('</head>');
        const headHtml = headEnd >= 0 ? cleaned.slice(0, headEnd) : cleaned;
        const bodyHtml = headEnd >= 0 ? cleaned.slice(headEnd) : '';

        // 1. No orphaned ="..."  tokens (previous regression signature).
        const orphan = /<script[^>]*\s=(?:"[^"]*"|'[^']*'|[^\s>]+)/i;
        if (orphan.test(cleaned)) {
          throw new Error(
            '[remove-crossorigin] orphaned attribute value detected in ' +
            'built index.html — CSS would fail to apply. See vite.config.ts.',
          );
        }

        // 2. The Vite-injected stylesheet MUST live inside <head>. If it
        //    lands in <body>, Chrome's strict parsing drops it silently.
        if (!/<link\s[^>]*rel=["']stylesheet["'][^>]*>/i.test(headHtml)) {
          // Only enforce if Vite actually emitted a stylesheet link at all.
          if (/<link\s[^>]*rel=["']stylesheet["']/i.test(bodyHtml)) {
            throw new Error(
              '[remove-crossorigin] stylesheet <link> ended up in <body>, ' +
              'not <head>. Page would render unstyled.',
            );
          }
        }

        return cleaned;
      },
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), removeCrossOriginPlugin()],

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
