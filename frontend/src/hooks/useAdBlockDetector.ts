import { useState, useEffect, useCallback, useRef } from 'react';

export type AdBlockStatus = 'checking' | 'allowed' | 'blocked';

/**
 * Canonical ad-serving script URLs. A failed fetch here indicates
 * that an ad blocker extension (uBlock Origin, AdBlock Plus, Brave
 * Shields, etc.) is filtering the request by URL pattern.
 */
const AD_SCRIPT_PROBES = [
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
  'https://www.googletagservices.com/tag/js/gpt.js',
] as const;

/**
 * Well-known ad / tracking hostnames. A failed fetch here with no
 * corresponding "online: false" event indicates the hostname is
 * being blocked at the DNS layer — a filtering resolver such as
 * Pi-hole, NextDNS, AdGuard DNS or Cloudflare-for-Families.
 */
const DNS_PROBES = [
  'https://static.doubleclick.net/instream/ad_status.js',
  'https://securepubads.g.doubleclick.net/tag/js/gpt.js',
] as const;

const PROBE_TIMEOUT_MS = 5000;

/**
 * Fetch-based probe. Resolves `true` if the request fails (network
 * error, DNS failure, aborted by extension, or timeout).
 *
 * Uses `mode: 'no-cors'` so the probe behaves like a plain `<script>`
 * tag load: any HTTP response (even 4xx/5xx) counts as "reached the
 * origin", which is the signal we care about. A CORS preflight
 * rejection on a host that actually served the response would
 * otherwise false-positive.
 */
function fetchFails(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      resolve(true);
    }, PROBE_TIMEOUT_MS);

    fetch(`${url}?_=${Date.now()}`, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
    })
      .then(() => {
        clearTimeout(timer);
        resolve(false);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(true);
      });
  });
}

/**
 * Ad-blocker detection — bait element.
 *
 * Injects a DIV whose class names appear on every major filter list
 * (EasyList, uBlock, ABP). Active extensions hide or collapse the
 * element via CSS rules like `display:none !important`.
 *
 *   • position:absolute (not fixed) — fixed elements always have
 *     `offsetParent === null`, which would make the check useless.
 *   • no `opacity:0` on the element itself — doing so would make the
 *     computed-style check always report "blocked".
 *   • two rAFs + short delay — gives the extension a chance to apply
 *     its hiding stylesheet before we measure.
 */
function baitBlocked(): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className =
      'adsbox ad-unit ad-banner ads advertisement ad-placement doubleclick google-ads pub_300x250';
    el.setAttribute('data-ad', 'true');
    el.innerHTML = '&nbsp;';
    el.style.cssText =
      'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;';
    document.body.appendChild(el);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          const cs = window.getComputedStyle(el);
          const blocked =
            el.offsetParent === null ||
            el.offsetHeight === 0 ||
            el.offsetWidth === 0 ||
            cs.display === 'none' ||
            cs.visibility === 'hidden';
          try { el.remove(); } catch { /* ignore */ }
          resolve(blocked);
        }, 150);
      });
    });
  });
}

/**
 * Ad-blocker detection — any ad-serving script fetch fails.
 */
async function adScriptBlocked(): Promise<boolean> {
  const results = await Promise.all(AD_SCRIPT_PROBES.map(fetchFails));
  return results.some(Boolean);
}

/**
 * Private / filtering DNS detection — any ad/tracking domain fails to
 * resolve. Guarded by the navigator.onLine check so a device that is
 * simply offline doesn't get gated.
 */
async function dnsBlocked(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  const results = await Promise.all(DNS_PROBES.map(fetchFails));
  return results.some(Boolean);
}

/**
 * Single detection pass.
 *
 * Returns `true` (blocked) if ANY of the signals fire — per spec:
 * "if either is detected, show … overlay". A bait element that
 * extensions hide, an ad-serving script that won't load, or a
 * DNS-level filter on a tracking domain is each sufficient on its
 * own to gate the user.
 */
async function detectOnce(): Promise<boolean> {
  const [bait, adScript, dns] = await Promise.all([
    baitBlocked(),
    adScriptBlocked(),
    dnsBlocked(),
  ]);
  return bait || adScript || dns;
}

const AUTO_RECHECK_INTERVAL_MS = 3000;

/**
 * React hook: runs detection on mount, exposes a manual `recheck()`,
 * and auto-polls while the gate is visible so the overlay dismisses
 * the moment the user disables their blocker.
 */
export function useAdBlockDetector() {
  const [status, setStatus] = useState<AdBlockStatus>('checking');
  const inFlightRef = useRef(false);

  const runDetect = useCallback(async (silent: boolean) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      if (!silent) setStatus('checking');
      const blocked = await detectOnce();
      setStatus(blocked ? 'blocked' : 'allowed');
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const recheck = useCallback(() => runDetect(false), [runDetect]);

  // Initial detection.
  useEffect(() => {
    runDetect(false);
  }, [runDetect]);

  // While the gate is visible, silently poll so it auto-dismisses as
  // soon as the user disables their blocker / DNS filter.
  useEffect(() => {
    if (status !== 'blocked') return;

    const trigger = () => {
      if (!document.hidden) void runDetect(true);
    };

    const interval = window.setInterval(trigger, AUTO_RECHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', trigger);
    window.addEventListener('focus', trigger);
    window.addEventListener('online', trigger);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', trigger);
      window.removeEventListener('focus', trigger);
      window.removeEventListener('online', trigger);
    };
  }, [status, runDetect]);

  return { status, recheck };
}
