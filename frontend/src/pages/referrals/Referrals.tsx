import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import type { PlanType } from '../../types/index.ts';

interface ReferredUser {
  username:   string;
  plan:       PlanType;
  created_at: string;
}

interface ReferralsResponse {
  success:   boolean;
  referrals: ReferredUser[];
}

export default function Referrals() {
  const { user } = useAuth();

  const [referrals, setReferrals] = useState<ReferredUser[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [copied,    setCopied]    = useState<'code' | 'link' | null>(null);

  useEffect(() => {
    api.get<ReferralsResponse>('/users/me/referrals')
      .then(({ data }) => setReferrals(data.referrals))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const referralLink = `${window.location.origin}/register?ref=${user?.referral_code ?? ''}`;

  function copy(text: string, type: 'code' | 'link') {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const premiumCount = referrals.filter((r) => r.plan !== 'free').length;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Referrals</h1>
          <p className="page-subtitle">Invite friends · earn ₱10 per signup</p>
        </div>
      </header>

      {/* Stats */}
      <div className="ref-stats-row">
        <div className="ref-stat">
          <span className="ref-stat-num">{loading ? '—' : referrals.length}</span>
          <span className="ref-stat-lbl">Total</span>
        </div>
        <div className="ref-stat-divider" />
        <div className="ref-stat">
          <span className="ref-stat-num">{loading ? '—' : premiumCount}</span>
          <span className="ref-stat-lbl">Premium</span>
        </div>
        <div className="ref-stat-divider" />
        <div className="ref-stat">
          <span className="ref-stat-num ref-stat-num--accent">
            ₱{loading ? '—' : (referrals.length * 10).toFixed(0)}
          </span>
          <span className="ref-stat-lbl">Earned</span>
        </div>
      </div>

      {/* Share card */}
      <div className="card">
        <h2 className="card-title">Your referral</h2>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
          Anyone who signs up with your code or link gets linked to your account.
        </p>

        <div className="ref-share-stack">
          <div className="ref-share-item">
            <span className="ref-share-label">Code</span>
            <div className="referral-field">
              <span className="referral-code">{user?.referral_code ?? '—'}</span>
              <button
                className={`btn btn-sm ${copied === 'code' ? 'btn-outline' : 'btn-ghost'}`}
                onClick={() => copy(user?.referral_code ?? '', 'code')}
                disabled={!user?.referral_code}
              >
                {copied === 'code' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="ref-share-item">
            <span className="ref-share-label">Link</span>
            <div className="referral-field">
              <span className="referral-link">{referralLink}</span>
              <button
                className={`btn btn-sm ${copied === 'link' ? 'btn-outline' : 'btn-ghost'}`}
                onClick={() => copy(referralLink, 'link')}
              >
                {copied === 'link' ? '✓ Copied' : 'Copy link'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Referred users */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">People you've referred</h2>
        </div>

        {loading ? (
          <div className="page-loading"><div className="spinner" /></div>
        ) : referrals.length === 0 ? (
          <div className="empty-state">
            <p>No referrals yet.</p>
            <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              Share your code and start earning.{' '}
              <Link to="/plans" className="link">Upgrade to Premium</Link> to maximize bonuses.
            </p>
          </div>
        ) : (
          <div className="earnings-list">
            {referrals.map((r) => (
              <div key={r.username} className="earning-row">
                <div className="earning-row-icon">👤</div>
                <div className="earning-row-body">
                  <p className="earning-row-title">{r.username}</p>
                  <div className="earning-row-meta">
                    <span className={`plan-badge plan-badge--${r.plan}`}>
                      {r.plan.toUpperCase()}
                    </span>
                    <span className="earning-row-date">
                      Joined {new Date(r.created_at).toLocaleDateString('en-PH', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
                <span className="earning-row-amount">+₱10</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
