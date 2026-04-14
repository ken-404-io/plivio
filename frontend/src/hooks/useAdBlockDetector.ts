import { useState, useEffect, useCallback } from 'react';

export type AdBlockStatus = 'checking' | 'blocked' | 'allowed';

/**
 * Bait element check — the only check used.
 *
 * We inject a <div> whose class names appear in every major ad-blocker
 * filter list (EasyList, uBlock filters, ABP list, etc.).  If an active
 * extension is hiding or collapsing ad elements, it will zero-out or
 * hide this element.
 *
 * Why not a network fetch?
 * Fetching an ad-network URL (nap5k.com, etc.) produces false positives
 * whenever the external server is slow, down, or unreachable from the
 * user's region — regardless of whether an ad blocker is running.
 * The DOM check is accurate and instant.
 */
async function checkBaitElement(): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.innerHTML = '&nbsp;';
    // Class names that trigger virtually every ad-blocker filter list
    el.className =
      'adsbox ad-unit ad-placement doubleclick ads advertisement ad textAd pub_300x250';
    el.setAttribute('data-ad', 'true');
    // Place off-screen but still in layout so offsetHeight is reliable
    el.style.cssText =
      'position:fixed;top:-999px;left:-999px;width:1px;height:1px;' +
      'opacity:0;pointer-events:none;';
    document.body.appendChild(el);

    // Two rAF frames + 200 ms gives extensions enough time to apply
    // their CSS/DOM rules even after the user just disabled them.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          const cs = window.getComputedStyle(el);
          const blocked =
            el.offsetHeight === 0 ||
            el.offsetWidth === 0 ||
            cs.display === 'none' ||
            cs.visibility === 'hidden' ||
            cs.opacity === '0';
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
    const blocked = await checkBaitElement();
    setStatus(blocked ? 'blocked' : 'allowed');
  }, []);

  useEffect(() => {
    detect();
  }, [detect]);

  return { status, recheck: detect };
}
