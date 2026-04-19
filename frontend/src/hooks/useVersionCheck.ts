import { useEffect } from 'react';

declare const __BUILD_TIME__: string;

const POLL_MS = 5 * 60 * 1000; // check every 5 minutes

async function checkVersion(): Promise<void> {
  try {
    const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const { v } = await res.json() as { v: string };
    if (v && v !== __BUILD_TIME__) {
      window.location.reload();
    }
  } catch { /* network error — skip silently */ }
}

export function useVersionCheck(): void {
  useEffect(() => {
    void checkVersion();

    const interval = setInterval(() => { void checkVersion(); }, POLL_MS);

    // Re-check whenever the user returns to the tab (works on mobile too)
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
}

function handleVisibility(): void {
  if (document.visibilityState === 'visible') void checkVersion();
}
