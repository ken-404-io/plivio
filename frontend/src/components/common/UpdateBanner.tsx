import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const COUNTDOWN_SECONDS = 10;

/**
 * Sticky bottom banner shown when a new app deployment is detected.
 * Auto-reloads after a countdown so users always run the latest version.
 */
export default function UpdateBanner({ show }: { show: boolean }) {
  const [seconds, setSeconds] = useState(COUNTDOWN_SECONDS);
  const [visible, setVisible] = useState(false);
  const reloadedRef = useRef(false);

  // Slide in after a short delay once shown.
  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(() => setVisible(true), 50);
    return () => window.clearTimeout(t);
  }, [show]);

  // Countdown timer — ticks every second while the banner is visible.
  useEffect(() => {
    if (!show) return;

    const interval = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          window.clearInterval(interval);
          if (!reloadedRef.current) {
            reloadedRef.current = true;
            window.location.reload();
          }
          return 0;
        }
        return s - 1;
      });
    }, 1_000);

    return () => window.clearInterval(interval);
  }, [show]);

  function reloadNow() {
    if (reloadedRef.current) return;
    reloadedRef.current = true;
    window.location.reload();
  }

  if (!show) return null;

  const progress = ((COUNTDOWN_SECONDS - seconds) / COUNTDOWN_SECONDS) * 100;

  return (
    <div className={`update-banner${visible ? ' update-banner--visible' : ''}`} role="alert" aria-live="assertive">
      <div className="update-banner__progress" style={{ width: `${progress}%` }} />
      <div className="update-banner__body">
        <RefreshCw size={16} className="update-banner__icon" />
        <span className="update-banner__text">
          A new version is available — reloading in <strong>{seconds}s</strong>
        </span>
        <button className="update-banner__btn" onClick={reloadNow}>
          Reload now
        </button>
      </div>
    </div>
  );
}
