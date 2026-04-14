import { useState, useEffect, useCallback, useRef } from 'react';

export type AdBlockStatus = 'checking' | 'blocked' | 'allowed';

/**
 * Same-origin probe endpoints — the exact Monetag script URLs the app
 * itself loads in index.html, served through the Vercel rewrites
 * (/js/p1.js → nap5k.com, /js/p2.js → quge5.com).
 *
 * Why same-origin rather than hitting third-party ad CDNs directly:
 *
 *  - Probing external domains (pagead2.googlesyndication.com,
 *    doubleclick.net, …) produced large numbers of false positives for
 *    users who are NOT running any blocker: regional CDN restrictions,
 *    carrier/ISP filters, corporate firewalls, privacy browsers that
 *    partition third-party requests (Safari ITP, Brave Shields default,
 *    Firefox ETP strict), transient CDN errors, or slow mobile links
 *    hitting the short request timeout. Those requests fail for reasons
 *    that have nothing to do with ad blocking, yet trip the gate and
 *    lock the user out of the app.
 *
 *  - The same-origin proxy URLs are the resources whose success or
 *    failure actually determines whether ads load for this user. If
 *    /js/p1.js returns, the Monetag bootstrap can run; if it doesn't,
 *    ads won't load regardless of the reason, so gating is warranted.
 *
 *  - Browser ad-blocker extensions still catch and block these URLs
 *    (EasyList and similar filter lists pattern-match paths like
 *    /js/p*.js with ad-zone query params), and network/DNS-level
 *    blockers that intercept the Vercel rewrite targets will still
 *    surface as a failed fetch here.
 */
const AD_NETWORK_PROBES = [
  '/js/p1.js',
  '/js/p2.js',
] as const;

const NETWORK_PROBE_TIMEOUT_MS = 6000;

/**
 * Network-level ad-blocker check.
 *
 * We fire the probes in parallel and only declare the user "blocked"
 * when **all** of them fail. A single transient error therefore can't
 * trigger the gate.
 *
 *   • cache: 'no-store'   — never reuse a cached response; we need to
 *                           observe the *current* network state.
 *   • credentials: 'omit' — don't send app cookies on the probe request.
 *   • AbortController     — bound execution time even when the browser
 *                           silently hangs the socket (some blockers
 *                           blackhole packets instead of refusing them).
 */
async function checkNetworkBlocked(): Promise<boolean> {
  const probe = (url: string): Promise<boolean> =>
    new Promise((resolve) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
        resolve(true); // timeout → treat as blocked
      }, NETWORK_PROBE_TIMEOUT_MS);

      fetch(`${url}?_=${Date.now()}`, {
        method:      'GET',
        cache:       'no-store',
        credentials: 'omit',
        redirect:    'follow',
        signal:      controller.signal,
      })
        .then((res) => {
          clearTimeout(timer);
          // Same-origin fetch: a 2xx/3xx response means the proxy
          // delivered the ad script. A 4xx/5xx means the edge rewrite
          // failed upstream (e.g. the ad CDN is unreachable from the
          // Vercel edge, or the resource was blocked en route).
          resolve(!res.ok);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(true);  // extension block / network error
        });
    });

  const results = await Promise.all(AD_NETWORK_PROBES.map(probe));
  return results.every(Boolean);
}

/**
 * Bait element check.
 *
 * Injects a <div> whose class names appear in every major ad-blocker
 * filter list (EasyList, uBlock, ABP, etc.).  Active extensions hide or
 * collapse such elements via CSS rules like `display:none !important`.
 *
 * Key implementation notes
 * ─────────────────────────
 * 1. Use `position:absolute`, NOT `position:fixed`.
 *    For fixed elements `offsetParent` is always null (browser spec),
 *    making that signal useless.  For absolute elements `offsetParent`
 *    is only null when the element or an ancestor has `display:none`.
 *
 * 2. Do NOT set `opacity:0` on the element itself.
 *    If we do, `getComputedStyle(el).opacity` is always '0' and the
 *    opacity check produces a false positive for every user.
 *
 * 3. Two rAF frames + 200 ms lets extensions re-apply their rules after
 *    the user has just paused/disabled the blocker.
 */
async function checkBaitElement(): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.innerHTML = '&nbsp;';
    el.className =
      'adsbox ad-unit ad-placement doubleclick ads advertisement ad textAd pub_300x250';
    el.setAttribute('data-ad', 'true');
    // Absolute + far off-screen: visible to layout but invisible to user.
    // No opacity/visibility overrides — those are what we're measuring.
    el.style.cssText =
      'position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;';
    document.body.appendChild(el);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          const cs = window.getComputedStyle(el);
          const blocked =
            el.offsetParent === null ||  // display:none makes offsetParent null
            el.offsetHeight === 0 ||     // blocker may force height to 0
            el.offsetWidth === 0 ||      // blocker may force width to 0
            cs.display === 'none' ||
            cs.visibility === 'hidden';
          try { document.body.removeChild(el); } catch { /* ignore */ }
          resolve(blocked);
        }, 200);
      });
    });
  });
}

/**
 * Poll interval for the silent re-check that runs while the gate is
 * visible. Short enough that the modal dismisses "instantly" after the
 * user disables their blocker, long enough that we don't spam ad-network
 * endpoints with probe traffic.
 */
const AUTO_RECHECK_INTERVAL_MS = 2500;

export function useAdBlockDetector() {
  const [status, setStatus] = useState<AdBlockStatus>('checking');
  // Keep the latest status in a ref so the poll loop (captured at mount)
  // sees current values without having to re-subscribe every render.
  const statusRef = useRef<AdBlockStatus>('checking');
  statusRef.current = status;
  // Prevent overlapping detections — if the previous probe is still in
  // flight when a visibilitychange/focus event fires, skip the new one.
  const inFlightRef = useRef(false);

  const runDetect = useCallback(async (silent: boolean) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      // Silent path: don't flip to 'checking' — that would briefly hide
      // the modal mid-poll and make it flicker while still blocked.
      if (!silent) setStatus('checking');
      const [baitBlocked, networkBlocked] = await Promise.all([
        checkBaitElement(),
        checkNetworkBlocked(),
      ]);
      setStatus(baitBlocked || networkBlocked ? 'blocked' : 'allowed');
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // Explicit recheck (e.g. the "Check Again" button) — visible state
  // transition via 'checking', which the modal shows as a spinner.
  const detect = useCallback(() => runDetect(false), [runDetect]);

  // Initial detection on mount.
  useEffect(() => {
    runDetect(false);
  }, [runDetect]);

  // While the gate is showing, auto-recheck so the modal dismisses on
  // its own the moment the user disables their extension or switches
  // off their private DNS — no "Check Again" click required.
  //
  // Triggers:
  //   • periodic poll       (catches inline extension toggles)
  //   • visibilitychange    (user alt-tabbed to disable, then back)
  //   • window focus        (same, on browsers that don't fire
  //                          visibilitychange for window blur)
  //   • online              (user reconnected / switched network)
  //
  // All listeners are torn down once status flips to 'allowed' so we
  // don't keep hammering ad-network endpoints after the gate clears.
  useEffect(() => {
    if (status !== 'blocked') return;

    const trigger = () => {
      if (statusRef.current === 'blocked' && !document.hidden) {
        void runDetect(true);
      }
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

  return { status, recheck: detect };
}
