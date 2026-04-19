import { useEffect } from 'react';

const COOKIE = 'plivio_v';

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function setCookie(name: string, value: string): void {
  document.cookie =
    `${name}=${encodeURIComponent(value)}; max-age=31536000; path=/; SameSite=Strict`;
}

async function checkVersion(): Promise<void> {
  try {
    const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const { v } = await res.json() as { v: string };
    if (!v) return;

    const saved = getCookie(COOKIE);
    if (saved === v) return; // already on the latest version

    // New deploy detected — persist the version then wipe caches and reload
    setCookie(COOKIE, v);
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    window.location.reload();
  } catch { /* network error — skip silently */ }
}

function handleVisibility(): void {
  if (document.visibilityState === 'visible') void checkVersion();
}

export function useVersionCheck(): void {
  useEffect(() => {
    void checkVersion();

    // Catch users who keep the tab open without switching away
    const interval = setInterval(() => { void checkVersion(); }, 2 * 60 * 1000);

    // Catch users returning from another tab / app
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
}
