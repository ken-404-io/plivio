import { useState, useEffect } from 'react';

const COOKIE = 'plivio_v';

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function setCookie(name: string, value: string): void {
  document.cookie =
    `${name}=${encodeURIComponent(value)}; max-age=31536000; path=/; SameSite=Strict`;
}

async function fetchServerVersion(): Promise<string | null> {
  try {
    const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return null;
    const { v } = await res.json() as { v: string };
    return v || null;
  } catch {
    return null;
  }
}

export function useVersionCheck(): boolean {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    async function check(): Promise<void> {
      const v = await fetchServerVersion();
      if (!v) return;
      const saved = getCookie(COOKIE);
      if (saved === v) return;
      setCookie(COOKIE, v);
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      setOutdated(true);
    }

    void check();
    const interval = setInterval(() => { void check(); }, 2 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return outdated;
}
