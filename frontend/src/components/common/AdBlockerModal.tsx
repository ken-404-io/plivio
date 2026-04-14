import { useState } from 'react';
import { Ban, RefreshCw, ShieldOff } from 'lucide-react';
import { useAdBlockDetector } from '../../hooks/useAdBlockDetector.ts';

/**
 * AdBlockerModal
 *
 * Full-screen, non-dismissible gate rendered above the entire app
 * (mounted outside the router in App.tsx) when an ad blocker or
 * filtering DNS is detected. The user must disable the blocker and
 * click "Check Again" — or the hook's auto-poll will drop the gate
 * on its own as soon as the probes start succeeding.
 *
 * Visibility rules:
 *   • 'checking' on initial mount → render nothing (no flash of gate)
 *   • 'allowed'                   → render nothing
 *   • 'blocked'                   → render gate
 *   • user clicks Check Again     → gate stays visible with a spinner
 *                                   until detection resolves
 */
export default function AdBlockerModal() {
  const { status, recheck } = useAdBlockDetector();
  const [rechecking, setRechecking] = useState(false);

  if (status !== 'blocked' && !rechecking) return null;

  async function handleRecheck() {
    setRechecking(true);
    try {
      await recheck();
    } finally {
      setRechecking(false);
    }
  }

  return (
    <div
      className="adblocker-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adblocker-title"
    >
      <div className="adblocker-modal">
        <div className="adblocker-icon">
          <Ban size={52} strokeWidth={1.5} />
        </div>

        <h2 className="adblocker-title" id="adblocker-title">
          Ad Blocker Detected
        </h2>

        <p className="adblocker-desc">
          Plivio is a free platform funded by ads. We detected an ad
          blocker, browser shield, or private DNS filter that is
          preventing ads from loading. Please disable it to continue.
        </p>

        <ol className="adblocker-steps">
          <li>
            <span className="adblocker-step-num">1</span>
            <span>
              Disable your ad blocker extension{' '}
              <span className="adblocker-muted">
                (uBlock&nbsp;Origin, AdBlock Plus, Brave Shields…)
              </span>
            </span>
          </li>
          <li>
            <span className="adblocker-step-num">2</span>
            <span>
              If you use a filtering DNS{' '}
              <span className="adblocker-muted">
                (Pi&#x2011;hole, NextDNS, AdGuard DNS, Cloudflare for Families)
              </span>
              , switch back to your default DNS.
            </span>
          </li>
          <li>
            <span className="adblocker-step-num">3</span>
            <span>
              Click <strong>Check Again</strong> — or just wait, the
              page will unlock automatically.
            </span>
          </li>
        </ol>

        <button
          type="button"
          className={`btn btn-primary btn-full adblocker-btn${
            rechecking ? ' adblocker-btn--loading' : ''
          }`}
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
          Thank you for supporting Plivio by keeping ads enabled.
        </p>
      </div>
    </div>
  );
}
