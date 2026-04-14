import { useState, useEffect, useCallback } from 'react';

export type AdBlockStatus = 'checking' | 'blocked' | 'allowed';

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
    const blocked = await checkBaitElement();
    setStatus(blocked ? 'blocked' : 'allowed');
  }, []);

  useEffect(() => {
    detect();
  }, [detect]);

  return { status, recheck: detect };
}
