import { useState, useEffect, useCallback } from 'react';

export type AdBlockStatus = 'checking' | 'blocked' | 'allowed';

/**
 * Known ad/tracking endpoints that appear on every major DNS filter
 * list (Pi-hole default, NextDNS ads, AdGuard DNS, Control D, Quad9, …)
 * *and* every browser filter list (EasyList, uBlock, ABP, Brave).
 *
 * Picked to be diverse (different TLDs / CDNs) so a single upstream
 * outage doesn't trip the detector for everyone.
 */
const AD_NETWORK_PROBES = [
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
  'https://static.doubleclick.net/instream/ad_status.js',
  'https://securepubads.g.doubleclick.net/tag/js/gpt.js',
] as const;

const NETWORK_PROBE_TIMEOUT_MS = 3500;

/**
 * DNS / network-level ad-blocker check.
 *
 * Browser ad-blocker extensions are caught by the bait-element heuristic
 * below, but they miss users who block ads upstream at the DNS layer
 * (Pi-hole, NextDNS, AdGuard DNS, Control D, ISP-level filtering, …).
 * Those resolvers either return NXDOMAIN or a null IP (0.0.0.0 /
 * 127.0.0.1), so an HTTPS request to a blocked hostname never
 * completes — `fetch` rejects with a TypeError.
 *
 * We fire off three independent probes in parallel and only declare the
 * user "blocked" when **all** of them fail.  A single flaky CDN (or an
 * aborted tab-switch) therefore can't trigger a false positive.
 *
 *   • mode: 'no-cors'     — opaque response is fine; we only care whether
 *                           the request reached the origin at all.
 *   • credentials: 'omit' — no cookies sent to ad networks from the gate.
 *   • cache: 'no-store'   — never reuse a cached response; we need to
 *                           observe the *current* network state.
 *   • AbortController     — bound execution time even when the browser
 *                           silently hangs the socket (some DNS blockers
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
          resolve(false); // reached the origin → not blocked
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(true);  // DNS fail / extension block / network error
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

export function useAdBlockDetector() {
  const [status, setStatus] = useState<AdBlockStatus>('checking');

  const detect = useCallback(async () => {
    setStatus('checking');
    // Run both probes in parallel. The user is gated if *either* signal
    // fires: a DOM-level extension block OR a DNS/network-level block.
    const [baitBlocked, networkBlocked] = await Promise.all([
      checkBaitElement(),
      checkNetworkBlocked(),
    ]);
    setStatus(baitBlocked || networkBlocked ? 'blocked' : 'allowed');
  }, []);

  useEffect(() => {
    detect();
  }, [detect]);

  return { status, recheck: detect };
}
