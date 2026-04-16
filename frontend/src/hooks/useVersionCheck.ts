import { useEffect, useRef, useState } from 'react';

/**
 * Polls `/version.json` and signals when a newer deployment is detected so
 * the UI can show an update banner and trigger a hard reload.
 *
 * Lifecycle:
 *   - On mount: fetch /version.json once (after a short delay).
 *   - Every {@link POLL_INTERVAL_MS}: fetch again.
 *   - Whenever the tab regains visibility / window focus: fetch again.
 *   - On mismatch: sets `updateAvailable = true` — the caller controls when
 *     to reload (e.g. after showing a banner with a countdown).
 *
 * The baked-in `__APP_VERSION__` comes from `vite.config.ts` and matches the
 * `version` field of `/version.json` emitted during the same build.
 */

const POLL_INTERVAL_MS = 60_000; // 1 minute
const VERSION_URL      = '/version.json';

type VersionPayload = { version?: string };

async function fetchRemoteVersion(): Promise<string | null> {
  try {
    // `cache: 'no-store'` + cachebust query string defeat any CDN or
    // service-worker cache that might return a stale version file.
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as VersionPayload;
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
}

export function useVersionCheck(): { updateAvailable: boolean } {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Once we detect an update we stop polling — no point re-checking.
  const detectedRef = useRef(false);

  useEffect(() => {
    // In dev there is no /version.json — skip entirely.
    if (import.meta.env.DEV) return;

    let cancelled = false;

    async function check() {
      if (cancelled || detectedRef.current) return;
      const remote = await fetchRemoteVersion();
      if (!remote) return;
      if (remote !== __APP_VERSION__) {
        detectedRef.current = true;
        setUpdateAvailable(true);
      }
    }

    // Small initial delay so we don't race the page's own startup traffic.
    const initialTimer = window.setTimeout(check, 5_000);

    // Periodic polling.
    const interval = window.setInterval(check, POLL_INTERVAL_MS);

    // Check when the tab regains focus — catches users who left the app open.
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

  return { updateAvailable };
}
