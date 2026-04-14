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
 *   • mode: 'no-cors'     — makes fetch behave the way a <script> tag
 *                           loading the same URL behaves: it doesn't
 *                           care about CORS headers, follows redirects
 *                           transparently, and resolves on *any* HTTP
 *                           response as an opaque success. This matters
 *                           here because Vercel rewrites to external
 *                           origins (nap5k.com / quge5.com) can surface
 *                           cross-origin behaviour to the browser in
 *                           some configurations; a default CORS fetch
 *                           then rejects with a TypeError while the
 *                           script tag at /js/p1.js loads fine and ads
 *                           render. Matching the script tag's fetch
 *                           semantics avoids gating users whose ads
 *                           are verifiably loading.
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
        mode:        'no-cors',
        cache:       'no-store',
        credentials: 'omit',
        redirect:    'follow',
        signal:      controller.signal,
      })
        .then(() => {
          clearTimeout(timer);
          // Any HTTP response — even 4xx/5xx — means the request
          // *reached* the origin. That rules out extension blocking
          // (which aborts the request outright) and DNS filtering
          // (which fails at resolve time). Upstream HTTP errors from
          // the Vercel rewrite (Monetag auth/rate-limit/zone config,
          // CDN hiccups) are server-side issues that do not indicate
          // the user is filtering anything, so we must not gate them.
          resolve(false);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(true);  // extension block / DNS fail / network error
        });
    });

  const results = await Promise.all(AD_NETWORK_PROBES.map(probe));
  return results.every(Boolean);
}

/**
 * Bait element check — REMOVED.
 *
 * The bait element (a hidden div carrying ad-shaped class names) used
 * to act as a corroborating signal for browser extensions. In practice
 * it produced false positives for users whose ads were provably
 * loading (screenshots showed ad banners rendered behind the gate
 * modal) because:
 *
 *  - Built-in browser shields (Brave Shields, Samsung Internet ad
 *    block, Firefox tracking-protection-strict, Opera ad block) hide
 *    ad-shaped DOM by default even when they don't block this site's
 *    ad network, so the bait was "hidden" while ads still rendered.
 *  - Incidental user styles (reader-mode helpers, accessibility
 *    extensions, content-script overlays) can hide elements by class.
 *  - The bait check had no way to distinguish "hidden because of an
 *    active extension" from "hidden for an unrelated reason".
 *
 * The network probe below is the ground truth that matches the user's
 * actual experience: if /js/p1.js can be fetched, the ad script runs
 * and ads render; if it can't, they don't. Relying on that single
 * signal eliminates the bait false-positive class entirely.
 */

/**
 * Poll interval for the silent re-check that runs while the gate is
 * visible. Short enough that the modal dismisses "instantly" after the
 * user disables their blocker, long enough that we don't spam ad-network
 * endpoints with probe traffic.
 */
const AUTO_RECHECK_INTERVAL_MS = 2500;

/**
 * Run one network probe cycle, returning true iff the user's browser
 * cannot fetch any of the proxied ad script URLs.
 */
async function detectOnce(): Promise<boolean> {
  return checkNetworkBlocked();
}

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

      // Two-phase detection to eliminate single-blip false positives.
      //
      // Users with no ad blocker almost always short-circuit after the
      // first probe (it reports 'allowed' and we're done). Only if the
      // first probe reports 'blocked' do we run a second, confirming
      // probe — that way a dropped request during network switching, a
      // brief service-worker stall, or a tab that was backgrounded
      // mid-fetch can't by itself trigger the modal. Real blockers
      // persist across both probes, so they still get gated.
      const firstBlocked = await detectOnce();
      if (!firstBlocked) {
        setStatus('allowed');
        return;
      }
      const secondBlocked = await detectOnce();
      setStatus(secondBlocked ? 'blocked' : 'allowed');
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
