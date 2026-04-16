import { useEffect, useRef } from 'react';

/**
 * Polls `/version.json` and hard-reloads the page when a newer deployment is
 * detected, so every open tab picks up the latest build without the user
 * having to press refresh themselves.
 *
 * Lifecycle:
 *   - On mount: fetch /version.json once.
 *   - Every {@link POLL_INTERVAL_MS}: fetch again.
 *   - Whenever the tab regains visibility / window focus: fetch again.
 *   - On mismatch: `window.location.reload()` — a hard reload that bypasses
 *     the in-memory cache and pulls the fresh index.html + hashed bundles.
 *
 * The baked-in `__APP_VERSION__` comes from `vite.config.ts` and matches the
 * `version` field of `/version.json` emitted during the same build.
 */

const POLL_INTERVAL_MS = 60_000; // 1 minute — balances freshness vs. noise
const VERSION_URL      = '/version.json';

type VersionPayload = { version?: string };

async function fetchRemoteVersion(): Promise<string | null> {
  try {
    // `cache: 'no-store'` + cachebust query string together defeat any CDN or
    // service-worker cache that might otherwise return a stale version file.
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as VersionPayload;
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    // Network blips, offline users, etc. — try again on the next tick.
    return null;
  }
}

export function useVersionCheck(): void {
  // Prevents a reload-loop in the unlikely case the just-reloaded page still
  // reports an old version (e.g. CDN propagation lag). We only trigger one
  // reload per tab session.
  const reloadedRef = useRef(false);

  useEffect(() => {
    // In dev, __APP_VERSION__ is a fresh timestamp each `vite dev` start and
    // there's no /version.json to compare against — skip the check entirely.
    if (import.meta.env.DEV) return;

    let cancelled = false;

    async function check() {
      if (cancelled || reloadedRef.current) return;
      const remote = await fetchRemoteVersion();
      if (!remote) return;
      if (remote !== __APP_VERSION__) {
        reloadedRef.current = true;
        // Hard reload — the browser discards the in-memory bundle and pulls
        // the fresh index.html, which in turn references the new hashed JS.
        window.location.reload();
      }
    }

    // Initial check a few seconds after mount so we don't race the page's
    // own startup network traffic.
    const initialTimer = window.setTimeout(check, 5_000);

    // Periodic check.
    const interval = window.setInterval(check, POLL_INTERVAL_MS);

    // Check on tab re-focus — catches users who leave the app open overnight.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);
}
