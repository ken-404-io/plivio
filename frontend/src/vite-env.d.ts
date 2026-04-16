/// <reference types="vite/client" />

/**
 * Build-time version string injected by `vite.config.ts` via `define`.
 * The client compares it against `/version.json` to detect new deploys.
 */
declare const __APP_VERSION__: string;
