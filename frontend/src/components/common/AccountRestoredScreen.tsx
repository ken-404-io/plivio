import { useState } from 'react';
import api from '../../services/api.ts';
import { useAuth } from '../../store/authStore.tsx';

interface Props {
  restorationMessage: string;
}

function CheckIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="28" cy="28" r="28" fill="rgba(34,197,94,0.12)" />
      <circle cx="28" cy="28" r="18" stroke="#22c55e" strokeWidth="2.5" fill="none" />
      <polyline points="19,28 25,34 37,22" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function PlivioMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M16 2L4 10v12l12 8 12-8V10L16 2z" fill="var(--accent)" opacity="0.9" />
      <path d="M16 7l-8 5.33V19.67L16 25l8-5.33V12.33L16 7z" fill="var(--bg-base)" opacity="0.5" />
      <text x="16" y="21" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="system-ui">P</text>
    </svg>
  );
}

const PRESET_BULLETS: Record<string, string[]> = {
  invite_credit: [
    'Your balance has been adjusted due to an invite credit correction.',
    'You can resume earning, withdrawing, and using all features.',
    'Please review our Terms of Service to avoid future restrictions.',
  ],
  activity_cleared: [
    'Your account was cleared after a thorough review — no violations found.',
    'Your balance, coins, and earnings remain fully intact.',
    'You can resume earning, withdrawing, and using all features.',
  ],
  appeal_approved: [
    'Your appeal was approved and your account has been fully reinstated.',
    'Your balance, coins, and earnings are fully intact.',
    'You can resume earning, withdrawing, and using all features.',
  ],
};

const DEFAULT_BULLETS = [
  'Your balance, coins, and earnings are fully intact.',
  'You can resume earning, withdrawing, and using all features.',
  'Please review our Terms of Service to avoid future restrictions.',
];

export default function AccountRestoredScreen({ restorationMessage }: Props) {
  const { fetchMe } = useAuth();
  const [dismissing, setDismissing] = useState(false);

  const messageParts = restorationMessage.split('\n\n');
  const rawMain = messageParts[0] ?? '';
  const fixesMade = messageParts[1]?.replace('What was fixed: ', '') ?? null;

  const presetMatch = rawMain.match(/^\[preset:([^\]]+)\]\s*/);
  const presetType = presetMatch?.[1] ?? null;
  const mainMessage = rawMain.replace(/^\[preset:[^\]]+\]\s*/, '');
  const bullets = (presetType && PRESET_BULLETS[presetType]) ?? DEFAULT_BULLETS;

  async function handleContinue() {
    setDismissing(true);
    try {
      await api.post('/users/me/dismiss-restoration');
      await fetchMe();
    } catch {
      setDismissing(false);
    }
  }

  return (
    <div className="blocked-screen" role="alert" aria-live="assertive">
      <div className="blocked-screen-bg" aria-hidden="true" />

      <div className="blocked-screen-brand">
        <PlivioMark />
        <span className="blocked-screen-brand-name">Plivio</span>
      </div>

      <div className="blocked-screen-card blocked-screen-card--restored">
        <div className="blocked-screen-icon">
          <CheckIcon />
        </div>

        <span className="blocked-screen-badge blocked-screen-badge--restored">
          Account Restored
        </span>

        <h1 className="blocked-screen-title">
          Your account is back to normal
        </h1>

        <p className="blocked-screen-sub">
          The restriction on your account has been lifted by our moderation team. You now have full access to Plivio.
        </p>

        {mainMessage && (
          <div className="blocked-screen-reason blocked-screen-reason--restored">
            <span className="blocked-screen-reason-label">Message from the team</span>
            <p className="blocked-screen-reason-text">{mainMessage}</p>
          </div>
        )}

        {fixesMade && (
          <div className="blocked-screen-reason blocked-screen-reason--restored" style={{ marginTop: 8 }}>
            <span className="blocked-screen-reason-label">What was resolved</span>
            <p className="blocked-screen-reason-text">{fixesMade}</p>
          </div>
        )}

        <div className="blocked-screen-divider" />

        <div className="blocked-screen-info">
          {bullets.map((line) => (
            <p key={line} className="blocked-screen-info-line">
              <span className="blocked-screen-info-dot blocked-screen-info-dot--green" />
              {line}
            </p>
          ))}
        </div>

        <button
          className="blocked-screen-cta blocked-screen-cta--restored"
          onClick={() => { void handleContinue(); }}
          disabled={dismissing}
        >
          {dismissing ? 'Loading…' : 'Continue to Plivio'}
        </button>
      </div>

      <p className="blocked-screen-footer">
        © {new Date().getFullYear()} Plivio · Your account has been reinstated by our moderation team.
      </p>
    </div>
  );
}
