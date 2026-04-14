import { useState, useEffect, useRef } from 'react';
import { ShieldOff, RefreshCw, Ban } from 'lucide-react';
import { useAdBlockDetector } from '../../hooks/useAdBlockDetector.ts';

/**
 * AdBlockerModal
 *
 * Full-screen, non-dismissible gate shown when an ad blocker or private
 * DNS is detected.  The user must disable it and click "Check Again".
 *
 * Guard logic:
 *  - status 'checking'  (initial auto-detect)  → hidden, no flash
 *  - status 'allowed'                           → hidden, never shown
 *  - status 'blocked'                           → shown
 *  - user clicks Check Again (rechecking=true)  → modal stays visible
 *    with a spinner; hides only once allowed, or re-shows if still blocked
 *
 * Post-unblock reload:
 *  The Monetag tags in index.html (/js/p1.js, /js/p2.js — proxied via
 *  Vercel rewrites to nap5k.com / quge5.com) run at initial page-load.
 *  If they executed while the network was blocked, they failed silently
 *  and do not re-initialise on their own — no banners appear even after
 *  the user disables the blocker. A single reload gives those tags a
 *  fresh, unblocked request cycle, which is the only universally
 *  reliable way to restore ad rendering across third-party ad scripts.
 *  We only reload when status actually went 'blocked' → 'allowed' during
 *  this session; a user who was never blocked never sees a reload.
 */
export default function AdBlockerModal() {
  const { status, recheck } = useAdBlockDetector();
  const [rechecking, setRechecking] = useState(false);
  const wasBlockedRef = useRef(false);

  useEffect(() => {
    if (status === 'blocked') {
      wasBlockedRef.current = true;
      return;
    }
    if (status === 'allowed' && wasBlockedRef.current) {
      // Reset the flag in case the reload is somehow cancelled, so we
      // don't loop on a subsequent allowed → blocked → allowed cycle.
      wasBlockedRef.current = false;
      window.location.reload();
    }
  }, [status]);

  // Keep modal visible while the user-initiated re-check runs,
  // but hide it during the silent initial detection (status='checking').
  if (status !== 'blocked' && !rechecking) return null;

  async function handleRecheck() {
    setRechecking(true);
    await recheck();
    setRechecking(false);
  }

  return (
    <div className="adblocker-overlay" role="dialog" aria-modal="true" aria-labelledby="adblocker-title">
      <div className="adblocker-modal">

        {/* Icon */}
        <div className="adblocker-icon">
          <Ban size={52} strokeWidth={1.5} />
        </div>

        {/* Heading */}
        <h2 className="adblocker-title" id="adblocker-title">
          Ad Blocker Detected
        </h2>

        {/* Body */}
        <p className="adblocker-desc">
          Plivio is a free platform that pays you real money by monetising ads.
          An ad blocker or private DNS is preventing ads from loading, which
          means <strong>we cannot reward your earnings</strong>.
        </p>

        {/* Steps */}
        <ol className="adblocker-steps">
          <li>
            <span className="adblocker-step-num">1</span>
            <span>
              Disable your ad blocker extension&nbsp;
              <span className="adblocker-muted">(uBlock&nbsp;Origin, AdBlock Plus, Brave&nbsp;Shields, etc.)</span>
            </span>
          </li>
          <li>
            <span className="adblocker-step-num">2</span>
            <span>
              If you use a private or filtering DNS&nbsp;
              <span className="adblocker-muted">(Pi&#x2011;hole, NextDNS, AdGuard&nbsp;DNS)</span>,
              switch back to your default DNS.
            </span>
          </li>
          <li>
            <span className="adblocker-step-num">3</span>
            <span>Click <strong>Check Again</strong> below.</span>
          </li>
        </ol>

        {/* CTA */}
        <button
          className={`btn btn-primary btn-full adblocker-btn${rechecking ? ' adblocker-btn--loading' : ''}`}
          onClick={handleRecheck}
          disabled={rechecking}
        >
          {rechecking ? (
            <>
              <RefreshCw size={16} className="adblocker-spin" />
              Checking…
            </>
          ) : (
            <>
              <ShieldOff size={16} />
              Check Again
            </>
          )}
        </button>

        <p className="adblocker-footer-note">
          Ads fund the rewards you earn. Thank you for keeping them enabled.
        </p>
      </div>
    </div>
  );
}
