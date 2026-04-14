import { useState } from 'react';
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
 */
export default function AdBlockerModal() {
  const { status, recheck } = useAdBlockDetector();
  const [rechecking, setRechecking] = useState(false);

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
