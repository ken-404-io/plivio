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
 * Bait element check.
 *
 * Injects a <div> whose class names appear in every major ad-blocker
 * filter list (EasyList, uBlock, ABP, etc.).  Active extensions hide or
 * collapse such elements via CSS rules like `display:none !important`.
 *
 * On its own this signal is too aggressive — browser built-in shields
 * (Brave Shields, Samsung Internet ad block, Firefox ETP strict, Opera
 * ad block) and some accessibility/reader-mode extensions hide
 * ad-shaped DOM without actually blocking the ad network requests, so
 * a user whose ads are verifiably rendering can still trip the bait.
 * We therefore combine this signal with the network probe using AND
 * logic (see detectOnce below): the gate only fires when BOTH the ad
 * DOM is suppressed AND the ad script cannot be fetched, which is the
 * signature of a real ad-blocker extension and not a cosmetic-only
 * shield.
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

/**
 * Run one combined detection cycle.
 *
 * Returns true iff BOTH signals agree that the user is blocking ads —
 * the ad-shaped DOM is suppressed AND the ad script URL can't be
 * fetched. Either signal alone is not enough:
 *
 *  - Bait hidden, network OK:  cosmetic shield / tracking-protection /
 *                              content-script overlay. Ads actually
 *                              render; don't gate.
 *  - Bait visible, network fails: usually a transient network error
 *                              (also caught by the two-phase retry
 *                              below). A true ad-blocker extension
 *                              would also hide the bait DOM, so if
 *                              bait is fine but fetch is failing,
 *                              it's very unlikely to be ad-blocking.
 *  - Both signals fire together: signature of a real ad-blocker
 *                              (uBlock Origin, AdBlock Plus, etc.).
 *                              Gate is warranted.
 */
async function detectOnce(): Promise<boolean> {
  const [baitBlocked, networkBlocked] = await Promise.all([
    checkBaitElement(),
    checkNetworkBlocked(),
  ]);
  return baitBlocked && networkBlocked;
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
