import type { User } from '../../types/index.ts';

interface Props {
  user: User;
}

function BanIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="28" cy="28" r="28" fill="rgba(239,68,68,0.12)" />
      <circle cx="28" cy="28" r="18" stroke="#ef4444" strokeWidth="2.5" fill="none" />
      <line x1="16.5" y1="16.5" x2="39.5" y2="39.5" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function SuspendIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="28" cy="28" r="28" fill="rgba(234,179,8,0.12)" />
      <circle cx="28" cy="28" r="18" stroke="#eab308" strokeWidth="2.5" fill="none" />
      <line x1="28" y1="18" x2="28" y2="29" stroke="#eab308" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="28" cy="34" r="1.5" fill="#eab308" />
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

export default function AccountBlockedScreen({ user }: Props) {
  const isSuspended =
    user.is_suspended &&
    user.suspended_until != null &&
    new Date(user.suspended_until) > new Date();

  const isBanned = user.is_banned;

  if (!isBanned && !isSuspended) return null;

  const untilFormatted = isSuspended && user.suspended_until
    ? new Date(user.suspended_until).toLocaleDateString('en-PH', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const reason = isBanned ? user.ban_reason : user.suspend_reason;

  return (
    <div className="blocked-screen" role="alert" aria-live="assertive">
      {/* Background pattern */}
      <div className="blocked-screen-bg" aria-hidden="true" />

      {/* Branding */}
      <div className="blocked-screen-brand">
        <PlivioMark />
        <span className="blocked-screen-brand-name">Plivio</span>
      </div>

      {/* Card */}
      <div className={`blocked-screen-card ${isBanned ? 'blocked-screen-card--banned' : 'blocked-screen-card--suspended'}`}>

        {/* Icon */}
        <div className="blocked-screen-icon">
          {isBanned ? <BanIcon /> : <SuspendIcon />}
        </div>

        {/* Status badge */}
        <span className={`blocked-screen-badge ${isBanned ? 'blocked-screen-badge--banned' : 'blocked-screen-badge--suspended'}`}>
          {isBanned ? 'Permanently Banned' : 'Temporarily Suspended'}
        </span>

        {/* Headline */}
        <h1 className="blocked-screen-title">
          {isBanned ? 'Your account has been banned' : 'Your account is suspended'}
        </h1>

        {/* Subtitle */}
        <p className="blocked-screen-sub">
          {isBanned
            ? 'Access to Plivio has been permanently revoked for this account.'
            : untilFormatted
              ? <>Your access has been temporarily removed until <strong>{untilFormatted}</strong>.</>
              : 'Your access has been temporarily removed.'}
        </p>

        {/* Reason block */}
        {reason && (
          <div className={`blocked-screen-reason ${isBanned ? 'blocked-screen-reason--banned' : 'blocked-screen-reason--suspended'}`}>
            <span className="blocked-screen-reason-label">Reason</span>
            <p className="blocked-screen-reason-text">{reason}</p>
          </div>
        )}

        {/* Divider */}
        <div className="blocked-screen-divider" />

        {/* What happens next */}
        <div className="blocked-screen-info">
          {isSuspended ? (
            <>
              <p className="blocked-screen-info-line">
                <span className="blocked-screen-info-dot blocked-screen-info-dot--yellow" />
                Your account will be automatically restored after the suspension expires.
              </p>
              <p className="blocked-screen-info-line">
                <span className="blocked-screen-info-dot blocked-screen-info-dot--yellow" />
                Your balance, coins, and earnings are safe and will be intact when restored.
              </p>
            </>
          ) : (
            <>
              <p className="blocked-screen-info-line">
                <span className="blocked-screen-info-dot blocked-screen-info-dot--red" />
                All access to your account and earnings has been permanently revoked.
              </p>
              <p className="blocked-screen-info-line">
                <span className="blocked-screen-info-dot blocked-screen-info-dot--red" />
                If you believe this is a mistake, contact our support team.
              </p>
            </>
          )}
        </div>

        {/* CTA */}
        <a
          href="mailto:support@plivio.com"
          className={`blocked-screen-cta ${isBanned ? 'blocked-screen-cta--banned' : 'blocked-screen-cta--suspended'}`}
        >
          Contact Support
        </a>
      </div>

      {/* Footer */}
      <p className="blocked-screen-footer">
        © {new Date().getFullYear()} Plivio · This decision was made by our moderation team.
      </p>
    </div>
  );
}
