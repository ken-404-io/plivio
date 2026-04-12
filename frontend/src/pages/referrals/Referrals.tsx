import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Check, Copy, Share2, DollarSign, Trophy, Lock, ChevronRight } from 'lucide-react';
import { useAuth } from '../../store/authStore.tsx';
import BackButton from '../../components/common/BackButton.tsx';
import api from '../../services/api.ts';
import type { PlanType } from '../../types/index.ts';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ReferredUser {
  username:   string;
  plan:       PlanType;
  created_at: string;
}

interface ReferralsResponse {
  success:      boolean;
  referrals:    ReferredUser[];
  total_earned: number;
}

// ─── Tier logic ────────────────────────────────────────────────────────────────

interface Tier {
  level:        number;
  label:        string;
  rewardPer10:  number;
  unlockAt:     number;      // total invites required to enter this tier
  nextUnlockAt: number | null; // invites to unlock the next tier (null = highest)
}

const TIERS: Tier[] = [
  { level: 1, label: 'Tier 1', rewardPer10: 100, unlockAt: 0,    nextUnlockAt: 500  },
  { level: 2, label: 'Tier 2', rewardPer10: 200, unlockAt: 500,  nextUnlockAt: 3000 },
  { level: 3, label: 'Tier 3', rewardPer10: 500, unlockAt: 3000, nextUnlockAt: null },
];

function getCurrentTier(totalInvites: number): Tier {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (totalInvites >= TIERS[i].unlockAt) return TIERS[i];
  }
  return TIERS[0];
}

function getTierProgress(totalInvites: number, tier: Tier): number {
  if (tier.nextUnlockAt === null) return 100; // max tier
  const range = tier.nextUnlockAt - tier.unlockAt;
  const progress = totalInvites - tier.unlockAt;
  return Math.min(100, Math.round((progress / range) * 100));
}

function computeTierEarnings(totalInvites: number): number {
  let remaining = totalInvites;
  let earnings = 0;
  for (let i = TIERS.length - 1; i >= 0; i--) {
    const t = TIERS[i];
    if (remaining > t.unlockAt) {
      const invitesInTier = remaining - t.unlockAt;
      const batches = Math.floor(invitesInTier / 10);
      earnings += batches * t.rewardPer10;
      remaining = t.unlockAt;
    }
  }
  return earnings;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const HAS_SHARE_API = typeof navigator !== 'undefined' && 'share' in navigator;

function planOrder(plan: PlanType): number {
  return plan === 'elite' ? 2 : plan === 'premium' ? 1 : 0;
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Referrals() {
  const { user } = useAuth();

  const [referrals,    setReferrals]    = useState<ReferredUser[]>([]);
  const [totalEarned,  setTotalEarned]  = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [copied,       setCopied]       = useState<'code' | 'link' | null>(null);

  const referralCode = user?.referral_code ?? '';
  const referralLink = `${window.location.origin}/register?ref=${referralCode}`;

  useEffect(() => {
    api.get<ReferralsResponse>('/users/me/referrals')
      .then(({ data }) => {
        setReferrals(data.referrals);
        setTotalEarned(data.total_earned);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function copy(text: string, type: 'code' | 'link') {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(type);
      setTimeout(() => setCopied(null), 2500);
    });
  }

  async function nativeShare() {
    try {
      await navigator.share({
        title: 'Join Plivio — Earn Real Money Online',
        text:  'Complete simple tasks and earn money to your GCash! Use my referral link to sign up:',
        url:   referralLink,
      });
    } catch {
      // User cancelled or browser doesn't support — silently ignore
    }
  }

  function shareWhatsApp() {
    const msg = encodeURIComponent(
      `Join Plivio and earn real money online! Complete tasks, get paid to GCash. Sign up with my link: ${referralLink}`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener,noreferrer');
  }

  const premiumCount = referrals.filter((r) => r.plan !== 'free').length;
  // Sort: premium/elite first, then by join date
  const sortedReferrals = [...referrals].sort((a, b) => {
    const pd = planOrder(b.plan) - planOrder(a.plan);
    if (pd !== 0) return pd;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // ─── Tier state ────────────────────────────────────────────────────────────
  const totalInvites   = referrals.length;
  const currentTier    = getCurrentTier(totalInvites);
  const tierProgress   = getTierProgress(totalInvites, currentTier);
  const tierEarnings   = computeTierEarnings(totalInvites);

  if (loading) return (
    <div className="page">
      <div className="sk-section">
        <span className="sk sk-line sk-line--xl skeleton" style={{ width: '45%' }} />
        <span className="sk sk-line--sm skeleton" style={{ width: '60%' }} />
      </div>
      {/* stats row */}
      <div className="sk-card sk-row" style={{ justifyContent: 'space-around', padding: 20 }}>
        {[0,1,2].map(i => (
          <div key={i} className="sk-col" style={{ alignItems: 'center', gap: 8 }}>
            <span className="sk sk-line--xl skeleton" style={{ width: 60 }} />
            <span className="sk sk-line--sm skeleton" style={{ width: 70 }} />
          </div>
        ))}
      </div>
      {/* tier skeleton */}
      <div className="sk-card" style={{ padding: 20 }}>
        <span className="sk sk-line--sm skeleton" style={{ width: '30%' }} />
        <span className="sk skeleton" style={{ width: '100%', height: 12, borderRadius: 6, marginTop: 12 }} />
        <span className="sk sk-line--sm skeleton" style={{ width: '50%', marginTop: 8 }} />
      </div>
      {/* code card */}
      <div className="sk-card sk-row">
        <div className="sk-col">
          <span className="sk sk-line--sm skeleton" style={{ width: 60 }} />
          <span className="sk sk-line--lg skeleton" style={{ width: 110 }} />
        </div>
        <span className="sk skeleton" style={{ width: 72, height: 36, borderRadius: 8, marginLeft: 'auto' }} />
      </div>
      {/* referred users */}
      <div className="sk-section">
        <span className="sk sk-line--sm skeleton" style={{ width: '40%' }} />
        {[0,1,2,3].map(i => (
          <div key={i} className="sk-card sk-row">
            <span className="sk skeleton sk-circle" style={{ width: 36, height: 36, flexShrink: 0 }} />
            <div className="sk-col">
              <span className="sk sk-line skeleton" style={{ width: '50%' }} />
              <span className="sk sk-line--sm skeleton" style={{ width: '35%' }} />
            </div>
            <span className="sk skeleton" style={{ width: 50, height: 22, borderRadius: 12, flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <BackButton />
          <h1 className="page-title">Referrals</h1>
          <p className="page-subtitle">Invite friends · earn per signup</p>
        </div>
      </header>

      {/* Stats row */}
      <div className="ref-stats-row">
        <div className="ref-stat">
          <span className="ref-stat-num">{referrals.length}</span>
          <span className="ref-stat-lbl">Referred</span>
        </div>
        <div className="ref-stat-divider" />
        <div className="ref-stat">
          <span className="ref-stat-num">{premiumCount}</span>
          <span className="ref-stat-lbl">Premium</span>
        </div>
        <div className="ref-stat-divider" />
        <div className="ref-stat">
          <span className="ref-stat-num ref-stat-num--accent">
            ₱{totalEarned.toFixed(2)}
          </span>
          <span className="ref-stat-lbl">Earned</span>
        </div>
      </div>

      {/* ─── Tier Progress Card ────────────────────────────────────────────── */}
      <div className="card tier-card">
        <div className="tier-header">
          <div className="tier-badge-wrap">
            <div className={`tier-badge tier-badge--${currentTier.level}`}>
              <Trophy size={16} />
              <span>{currentTier.label}</span>
            </div>
            <span className="tier-reward-label">
              ₱{currentTier.rewardPer10} per 10 invites
            </span>
          </div>
          <div className="tier-earnings-pill">
            <DollarSign size={14} />
            <span>₱{tierEarnings.toLocaleString()}</span>
          </div>
        </div>

        {/* Progress bar */}
        {currentTier.nextUnlockAt !== null ? (
          <div className="tier-progress-wrap">
            <div className="tier-progress-bar">
              <div
                className="tier-progress-fill"
                style={{ width: `${tierProgress}%` }}
              />
            </div>
            <div className="tier-progress-labels">
              <span>{totalInvites} invites</span>
              <span>{currentTier.nextUnlockAt} to unlock {TIERS[currentTier.level]?.label}</span>
            </div>
          </div>
        ) : (
          <p className="tier-max-msg">
            You've reached the highest tier — no cap on earnings!
          </p>
        )}

        {/* Tier level overview */}
        <div className="tier-levels">
          {TIERS.map((t) => {
            const isActive  = t.level === currentTier.level;
            const isLocked  = t.level > currentTier.level;
            return (
              <div
                key={t.level}
                className={`tier-level${isActive ? ' tier-level--active' : ''}${isLocked ? ' tier-level--locked' : ''}`}
              >
                <div className="tier-level-header">
                  <span className={`tier-level-dot tier-level-dot--${t.level}`} />
                  <span className="tier-level-name">{t.label}</span>
                  {isLocked && <Lock size={12} className="tier-level-lock" />}
                  {isActive && <span className="tier-level-current-tag">Current</span>}
                </div>
                <div className="tier-level-details">
                  <span className="tier-level-reward">₱{t.rewardPer10} / 10 invites</span>
                  {t.nextUnlockAt !== null ? (
                    <span className="tier-level-unlock">{t.unlockAt > 0 ? `Unlocks at ${t.unlockAt}` : 'Default tier'}</span>
                  ) : (
                    <span className="tier-level-unlock">Unlocks at {t.unlockAt}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Share card */}
      <div className="card">
        <h2 className="card-title">Share your link</h2>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
          Anyone who signs up with your code or link earns you a referral bonus.
        </p>

        <div className="ref-share-stack">
          {/* Code */}
          <div className="ref-share-item">
            <span className="ref-share-label">Referral Code</span>
            <div className="referral-field">
              <span className="referral-code">{referralCode || '—'}</span>
              <button
                className={`btn btn-sm ${copied === 'code' ? 'btn-outline' : 'btn-ghost'}`}
                onClick={() => copy(referralCode, 'code')}
                disabled={!referralCode}
              >
                {copied === 'code'
                  ? <><Check size={13} /> Copied</>
                  : <><Copy size={13} /> Copy</>}
              </button>
            </div>
          </div>

          {/* Link */}
          <div className="ref-share-item">
            <span className="ref-share-label">Referral Link</span>
            <div className="referral-field">
              <span className="referral-link">{referralLink}</span>
              <button
                className={`btn btn-sm ${copied === 'link' ? 'btn-outline' : 'btn-ghost'}`}
                onClick={() => copy(referralLink, 'link')}
              >
                {copied === 'link'
                  ? <><Check size={13} /> Copied</>
                  : <><Copy size={13} /> Copy</>}
              </button>
            </div>
          </div>
        </div>

        {/* Share buttons */}
        <div className="ref-share-btns">
          <button className="ref-share-btn ref-share-btn--whatsapp" onClick={shareWhatsApp}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Share via WhatsApp
          </button>

          {HAS_SHARE_API && (
            <button className="ref-share-btn ref-share-btn--native" onClick={() => { void nativeShare(); }}>
              <Share2 size={16} />
              Share
            </button>
          )}
        </div>

        {/* How it works */}
        <div className="ref-how-it-works">
          <div className="ref-how-item">
            <div className="ref-how-icon"><Users size={16} /></div>
            <span>Friend signs up with your link</span>
          </div>
          <div className="ref-how-arrow">→</div>
          <div className="ref-how-item">
            <div className="ref-how-icon"><DollarSign size={16} /></div>
            <span>You earn a referral bonus</span>
          </div>
          <div className="ref-how-arrow">→</div>
          <div className="ref-how-item">
            <div className="ref-how-icon"><Check size={16} /></div>
            <span>Both accounts get rewarded</span>
          </div>
        </div>
      </div>

      {/* Referred users list */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">
            People you've referred
            {referrals.length > 0 && (
              <span className="ref-count-badge">{referrals.length}</span>
            )}
          </h2>
        </div>

        {sortedReferrals.length === 0 ? (
          <div className="empty-state">
            <p>No referrals yet.</p>
            <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              Share your link above to start earning.{' '}
              <Link to="/plans" className="link">Upgrade to Premium</Link> to maximize bonuses.
            </p>
          </div>
        ) : (
          <div className="earnings-list">
            {sortedReferrals.map((r) => (
              <div key={r.username} className="earning-row">
                <div className="earning-row-icon ref-user-avatar">
                  {r.username[0]?.toUpperCase()}
                </div>
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
                <div className="ref-user-reward">
                  <span className="earning-row-amount">
                    +₱{r.plan !== 'free' ? '25' : '10'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
