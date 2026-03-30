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
  const [copied,    setCopied]    = useState(false);

  useEffect(() => {
    api.get<ReferralsResponse>('/users/me/referrals')
      .then(({ data }) => setReferrals(data.referrals))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function copyCode() {
    if (!user?.referral_code) return;
    void navigator.clipboard.writeText(user.referral_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const referralLink = `${window.location.origin}/register?ref=${user?.referral_code ?? ''}`;

  function copyLink() {
    void navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Referrals</h1>
          <p className="page-subtitle">
            Invite friends and earn a bonus when they sign up.
          </p>
        </div>
      </header>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Total Referrals</span>
          <span className="stat-value">{loading ? '—' : referrals.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Premium Referrals</span>
          <span className="stat-value">
            {loading ? '—' : referrals.filter((r) => r.plan !== 'free').length}
          </span>
        </div>
      </div>

      {/* Referral code + link */}
      <div className="card">
        <h2 className="card-title">Your referral code</h2>
        <p className="text-muted" style={{ fontSize: 14, marginBottom: 16 }}>
          Share your code or link. Anyone who signs up using it gets linked to your account.
        </p>

        <div className="referral-share-grid">
          <div>
            <p className="form-label" style={{ marginBottom: 8 }}>Code</p>
            <div className="referral-field">
              <span className="referral-code">{user?.referral_code ?? '—'}</span>
              <button
                className={`btn btn-sm ${copied ? 'btn-outline' : 'btn-ghost'}`}
                onClick={copyCode}
                disabled={!user?.referral_code}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <p className="form-label" style={{ marginBottom: 8 }}>Link</p>
            <div className="referral-field">
              <span className="referral-link">{referralLink}</span>
              <button className="btn btn-sm btn-ghost" onClick={copyLink}>
                Copy link
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Referred users table */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">People you've referred</h2>
        </div>

        {loading ? (
          <div className="page-loading"><div className="spinner" /></div>
        ) : referrals.length === 0 ? (
          <div className="empty-state">
            <p>No referrals yet.</p>
            <p style={{ marginTop: 8, fontSize: 14 }}>
              Share your code and start earning.{' '}
              <Link to="/plans" className="link">Upgrade to Premium</Link> to maximize your referral bonus.
            </p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Plan</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.username}>
                    <td>{r.username}</td>
                    <td>
                      <span className={`plan-badge plan-badge--${r.plan}`}>
                        {r.plan.toUpperCase()}
                      </span>
                    </td>
                    <td className="text-muted">
                      {new Date(r.created_at).toLocaleDateString('en-PH')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
