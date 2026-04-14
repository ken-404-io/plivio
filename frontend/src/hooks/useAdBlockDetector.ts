import { useState, useEffect, useCallback } from 'react';

export type AdBlockStatus = 'checking' | 'blocked' | 'allowed';

/**
 * Bait element check — catches CSS/DOM-based ad blockers
 * (uBlock Origin, AdBlock Plus, Brave Shields, etc.)
 *
 * We inject a div with class names that appear in every major
 * ad-blocker filter list.  If the element is hidden or collapsed
 * the blocker is active.
 */
async function checkBaitElement(): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.innerHTML = '&nbsp;';
    el.className =
      'adsbox ad-unit ad-placement doubleclick ads advertisement ad textAd';
    el.setAttribute('data-ad', 'true');
    el.style.cssText =
      'position:absolute;top:-10px;left:-10px;width:1px;height:1px;' +
      'opacity:0;pointer-events:none;';
    document.body.appendChild(el);

    requestAnimationFrame(() => {
      setTimeout(() => {
        const cs = window.getComputedStyle(el);
        const blocked =
          el.offsetParent === null ||
          el.offsetHeight === 0 ||
          el.offsetWidth === 0 ||
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          cs.opacity === '0';
        try { document.body.removeChild(el); } catch { /* ignore */ }
        resolve(blocked);
      }, 150);
    });
  });
}

/**
 * Network bait check — catches DNS-level / network-level blocking
 * (Pi-hole, NextDNS, private DNS, etc.)
 *
 * We attempt a no-cors fetch to the ad network already embedded in
 * index.html.  A successful request returns an opaque response
 * (no error).  DNS/network blocking throws a TypeError.
 */
async function checkNetworkBait(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    await fetch('https://nap5k.com/tag.min.js?_t=' + Date.now(), {
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return false; // opaque success → not blocked
  } catch {
    return true; // network error / DNS block → blocked
  }
}

export function useAdBlockDetector() {
  const [status, setStatus] = useState<AdBlockStatus>('checking');

  const detect = useCallback(async () => {
    setStatus('checking');
    const [baitBlocked, networkBlocked] = await Promise.all([
      checkBaitElement(),
      checkNetworkBait(),
    ]);
    setStatus(baitBlocked || networkBlocked ? 'blocked' : 'allowed');
  }, []);

  useEffect(() => {
    detect();
  }, [detect]);

  return { status, recheck: detect };
}
