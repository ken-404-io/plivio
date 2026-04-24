import { useState, useEffect, useCallback, useRef } from 'react';

export type AdBlockStatus = 'checking' | 'allowed' | 'blocked';

// Module-level singleton so the heartbeat in authStore can read the latest
// detection result without prop-drilling or context.
let _latestAdBlockStatus: 'allowed' | 'blocked' | null = null;
export function getLatestAdBlockStatus(): 'allowed' | 'blocked' | null {
  return _latestAdBlockStatus;
}

const PROBE_TIMEOUT_MS = 5000;

/**
 * Script-tag probes.
 *
 * This is the gold standard for ad-blocker detection because it
 * mirrors how ad networks actually load their code, which is what
 * filter lists are written to catch.
 *
 *   • If an extension blocks the request, `script.onerror` fires
 *     and the global never gets defined.
 *   • If a filtering DNS (AdGuard, NextDNS, Pi-hole, Cloudflare for
 *     Families) sinkholes the host with NXDOMAIN, the request fails
 *     at the network layer and `script.onerror` fires.
 *   • If the sinkhole instead redirects to a 200 OK with empty
 *     body (some corporate filters do this), `script.onload` fires
 *     normally — but the script body never ran, so the expected
 *     global is undefined. The `expect()` check catches this case.
 *
 * Each probe pairs the script URL with a function that returns
 * `true` once the script's bootstrap global is present.
 */
type ScriptProbe = { url: string; expect: () => boolean };

const SCRIPT_PROBES: readonly ScriptProbe[] = [
  {
    url: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
    // adsbygoogle.js sets window.adsbygoogle = window.adsbygoogle || [].
    expect: () => Array.isArray((window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle),
  },
  {
    url: 'https://www.googletagservices.com/tag/js/gpt.js',
    // gpt.js installs the googletag command queue.
    expect: () => {
      const g = (window as unknown as { googletag?: { cmd?: unknown } }).googletag;
      return !!g && typeof g === 'object';
    },
  },
  {
    // Google Tag Manager — on every major filter list (EasyPrivacy,
    // Fanboy's, AdGuard Tracking, uBlock Privacy). Script loader sets
    // a global called `google_tag_manager` on the window.
    url: 'https://www.googletagmanager.com/gtm.js?id=GTM-PLIVIO',
    expect: () => {
      const g = (window as unknown as { google_tag_manager?: object }).google_tag_manager;
      return !!g && typeof g === 'object';
    },
  },
];

/**
 * DNS / hostname probes — fetch requests to known ad and tracking
 * hosts. Failure (rejection or timeout) signals a DNS-layer block.
 *
 * Every host below appears on the default blocklists of Pi-hole,
 * NextDNS, AdGuard DNS, Cloudflare for Families (malware+adult),
 * Quad9, Mullvad DNS, and Control D. Real filtering resolvers
 * sinkhole ALL of these consistently, so the "all must fail" gate
 * strengthens (not weakens) with more hosts here.
 */
const DNS_PROBE_HOSTS: readonly string[] = [
  'https://static.doubleclick.net/instream/ad_status.js',
  'https://securepubads.g.doubleclick.net/tag/js/gpt.js',
  'https://www.google-analytics.com/analytics.js',
  'https://www.googletagmanager.com/gtm.js',
  'https://adservice.google.com/adsid/integrator.js',
  'https://pagead2.googlesyndication.com/pagead/show_ads.js',
];

/**
 * Tracking pixel probes — 1×1 <img> requests to tracker endpoints.
 *
 * This is a complementary transport to fetch(). Some blockers (Brave
 * Shields "standard" mode, Firefox Enhanced Tracking Protection,
 * Safari Intelligent Tracking Prevention, DuckDuckGo app browser,
 * Ghostery, Privacy Badger) allow cross-origin fetch but still
 * cancel image beacons to known tracker hosts, so the pixel channel
 * can flag a blocker that slipped past the fetch DNS gate.
 *
 * Every host is on the major tracker blocklists (Disconnect, EasyPrivacy,
 * Peter Lowe's list, AdGuard Tracking Protection).
 */
const TRACKER_PIXEL_HOSTS: readonly string[] = [
  'https://www.google-analytics.com/collect',
  'https://stats.g.doubleclick.net/dc.js',
  'https://www.facebook.com/tr/',
  'https://www.scorecardresearch.com/beacon.js',
];

/**
 * Bait class groups — each group is a distinct set of class names
 * pulled from the element-hiding (cosmetic) sections of the major
 * filter lists. Different blockers target different names, so we
 * test multiple groups and treat ANY hidden bait as a positive.
 *
 *   Group 1: EasyList generic ad containers
 *   Group 2: AdGuard / uBlock specialized placement names
 *   Group 3: Fanboy's Enhanced + newer native-ad / sponsored-content
 *   Group 4: Brave Shields + mobile-first / stream-ad patterns
 */
const BAIT_CLASS_GROUPS: readonly string[] = [
  'adsbox ad-unit ad-banner ads advertisement ad-placement doubleclick google-ads pub_300x250',
  'ad-slot banner-ad sponsored promoted-content ad-container textads banner_ad adsbygoogle',
  'sponsored-post sponsor-content native-ad prebid pub-ad-placeholder ad-header ad-sidebar',
  'ima-ad-container video-ads stream-ad mobile-ad-slot ad-interstitial ad-wrapper ad-iframe',
];

/**
 * Bait DOM check — extensions hide DIVs whose class names appear
 * on EasyList / uBlock / ABP. Position must be `absolute`, never
 * `fixed` (fixed elements always have offsetParent === null), and
 * we must not set our own opacity/visibility on the element since
 * those are exactly the properties we measure.
 *
 * Multi-bait: we inject ONE element per bait group in parallel and
 * flag the whole check as blocked if ANY bait is hidden. Different
 * filter lists target different class names, so one group may pass
 * while another is caught — testing multiple catches more cosmetic
 * filters (uBlock Origin, AdBlock Plus, AdGuard, Brave Shields,
 * Ghostery, Privacy Badger, Total AdBlock, AdLock, Stands Fair).
 */
function singleBaitBlocked(className: string): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = className;
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
        }, 250);
      });
    });
  });
}

async function baitBlocked(): Promise<{ blocked: boolean; details: boolean[] }> {
  const details = await Promise.all(BAIT_CLASS_GROUPS.map(singleBaitBlocked));
  return { blocked: details.some(Boolean), details };
}

/**
 * Tracking pixel probe. Uses Image() rather than fetch() so we catch
 * blockers that only intercept image-beacon requests (classic filter-
 * list behaviour) while letting fetch() pass.
 *
 * Resolves true when the image fails to load or times out.
 */
function pixelFails(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    let resolved = false;
    const finish = (blocked: boolean) => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(blocked);
    };
    const timer = window.setTimeout(() => finish(true), PROBE_TIMEOUT_MS);
    img.onload = () => finish(false);
    img.onerror = () => finish(true);
    img.referrerPolicy = 'no-referrer';
    img.src = `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`;
  });
}

/**
 * Inject a <script> tag and report whether the script truly loaded.
 *
 * "Truly loaded" means BOTH:
 *   1. The browser fired `onload` (no extension/DNS block at the
 *      transport layer), AND
 *   2. The script's expected bootstrap global is present (catches
 *      DNS sinkholes that return 200 OK with empty body).
 */
function scriptProbeFails(probe: ScriptProbe): Promise<boolean> {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `${probe.url}?_=${Date.now()}`;

    let resolved = false;
    const finish = (blocked: boolean) => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timer);
      try { script.remove(); } catch { /* ignore */ }
      resolve(blocked);
    };

    const timer = window.setTimeout(() => finish(true), PROBE_TIMEOUT_MS);

    script.onload = () => {
      // One tick for the loaded script body to execute and
      // install its global (adsbygoogle, googletag, …).
      window.setTimeout(() => {
        try {
          finish(!probe.expect());
        } catch {
          finish(true);
        }
      }, 60);
    };
    script.onerror = () => finish(true);

    document.head.appendChild(script);
  });
}

/**
 * Cross-origin fetch probe. Resolves `true` on any failure.
 * Uses `mode:'no-cors'` so we observe transport-layer failure
 * (DNS rejection, connection refused, extension abort) without
 * tripping CORS preflight.
 */
function fetchFails(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
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
      .then(() => { window.clearTimeout(timer); resolve(false); })
      .catch(() => { window.clearTimeout(timer); resolve(true); });
  });
}

async function adScriptBlocked(): Promise<{ blocked: boolean; details: boolean[] }> {
  const details = await Promise.all(SCRIPT_PROBES.map(scriptProbeFails));
  return { blocked: details.some(Boolean), details };
}

async function dnsBlocked(): Promise<{ blocked: boolean; details: boolean[] }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { blocked: false, details: [] };
  }
  const details = await Promise.all(DNS_PROBE_HOSTS.map(fetchFails));
  // Require ALL probes to fail before flagging DNS as blocked.
  // A single unreachable host can be a CDN outage or geo-restriction,
  // not a filtering DNS. Real resolvers (AdGuard, NextDNS, Pi-hole)
  // block every ad domain consistently.
  return { blocked: details.length > 0 && details.every(Boolean), details };
}

async function pixelBlocked(): Promise<{ blocked: boolean; details: boolean[] }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { blocked: false, details: [] };
  }
  const details = await Promise.all(TRACKER_PIXEL_HOSTS.map(pixelFails));
  // Same "all must fail" gate as DNS — any single reachable tracker
  // means the transport isn't being blocked wholesale.
  return { blocked: details.length > 0 && details.every(Boolean), details };
}

/**
 * Run one detection pass. Returns true (blocked) when:
 *
 *   • Any bait element is hidden — a cosmetic filter is active on
 *     this page (uBlock Origin, AdBlock Plus, AdGuard, Brave Shields,
 *     Ghostery, Privacy Badger, Total AdBlock). This is the most
 *     reliable signal and the primary gate.
 *
 *   OR
 *
 *   • At least one ad-network script failed AND either the fetch-
 *     DNS probes or the image-pixel probes agree at the network
 *     layer — two independent transports pointing at the same story
 *     is the fingerprint of a DNS-level / tracking-protection filter
 *     (Pi-hole, NextDNS, AdGuard DNS, Cloudflare for Families,
 *     Quad9, Mullvad DNS, Firefox ETP, Safari ITP, DuckDuckGo,
 *     Brave Shields "standard").
 *
 * A script-only failure with both network transports passing is NOT
 * flagged. This handles the common case where an extension is
 * "paused" for this site but still intercepts requests to Google/
 * Doubleclick globally — the user has made a good-faith effort to
 * allow ads, so we let them through.
 */
async function detectOnce(): Promise<boolean> {
  const [bait, script, dns, pixel] = await Promise.all([
    baitBlocked(),
    adScriptBlocked(),
    dnsBlocked(),
    pixelBlocked(),
  ]);

  // eslint-disable-next-line no-console
  console.debug('[AdBlock] probe', {
    baitBlocked: bait.blocked,
    baitGroups: BAIT_CLASS_GROUPS.map((c, i) => ({
      group: c,
      blocked: bait.details[i],
    })),
    scriptBlocked: script.blocked,
    scriptUrls: SCRIPT_PROBES.map((p, i) => ({
      url: p.url,
      blocked: script.details[i],
    })),
    dnsBlocked: dns.blocked,
    dnsHosts: DNS_PROBE_HOSTS.map((u, i) => ({
      url: u,
      blocked: dns.details[i],
    })),
    pixelBlocked: pixel.blocked,
    pixelHosts: TRACKER_PIXEL_HOSTS.map((u, i) => ({
      url: u,
      blocked: pixel.details[i],
    })),
  });

  // Primary: cosmetic filter hiding bait elements on this page.
  // Secondary: network-level filter confirmed by script + any other transport.
  const result = bait.blocked || (script.blocked && (dns.blocked || pixel.blocked));
  _latestAdBlockStatus = result ? 'blocked' : 'allowed';
  return result;
}

const AUTO_RECHECK_INTERVAL_MS = 3000;

export function useAdBlockDetector() {
  const [status, setStatus] = useState<AdBlockStatus>('checking');
  const inFlightRef = useRef(false);

  const runDetect = useCallback(async (silent: boolean) => {
    // Auto-polls (silent) are skipped when a check is already running.
    // Manual rechecks (not silent) always proceed so the button is responsive.
    if (silent && inFlightRef.current) return;
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

  useEffect(() => {
    runDetect(false);
  }, [runDetect]);

  // While the gate is visible, silently re-probe so the overlay
  // dismisses the moment the user disables their blocker.
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
