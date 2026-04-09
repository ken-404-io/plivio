import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import type { TaskListResponse, Earning } from '../../types/index.ts';
import EmailVerificationBanner from '../../components/common/EmailVerificationBanner.tsx';
import {
  ShieldCheck,
  Play,
  MousePointerClick,
  ClipboardList,
  Users,
  Zap,
  BadgeCheck,
  Flame,
  CheckSquare,
  ArrowUpCircle,
  UserPlus,
  Star,
  TrendingUp,
  ChevronRight,
  Trophy,
  Coins,
} from 'lucide-react';

// ─── Sub-components ───────────────────────────────────────────────────────────

function EarningTypeIcon({ type }: { type: string }) {
  const size = 16;
  switch (type) {
    case 'captcha':  return <ShieldCheck size={size} />;
    case 'video':    return <Play size={size} />;
    case 'ad_click': return <MousePointerClick size={size} />;
    case 'survey':   return <ClipboardList size={size} />;
    case 'referral': return <Users size={size} />;
    default:         return <Zap size={size} />;
  }
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

const STREAK_TASK_GOAL = 5;

export default function Dashboard() {
  const { user, fetchMe } = useAuth();

  const [taskData, setTaskData] = useState<TaskListResponse | null>(null);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    try {
      const [taskRes, earningRes] = await Promise.all([
        api.get<TaskListResponse>('/tasks'),
        api.get<{ data: Earning[] }>('/users/me/earnings', { params: { limit: 5 } }),
      ]);
      setTaskData(taskRes.data);
      setEarnings(earningRes.data.data ?? []);
    } catch {
      // silent — fallback UI handles empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    fetchMe();
  }, [load, fetchMe]);

  // ── Skeleton ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page">
        <div className="sk-section">
          <span className="sk sk-line sk-line--xl skeleton" style={{ width: '55%' }} />
          <span className="sk sk-line--sm skeleton" style={{ width: '35%' }} />
        </div>
        <div className="sk-card sk-section" style={{ padding: 20, gap: 16, borderRadius: 16 }}>
          <span className="sk sk-line--sm skeleton" style={{ width: '40%' }} />
          <span className="sk skeleton" style={{ height: 40, width: '65%', borderRadius: 8 }} />
          <span className="sk skeleton" style={{ height: 6, width: '100%', borderRadius: 99 }} />
          <div className="sk-row" style={{ justifyContent: 'space-between' }}>
            <span className="sk sk-line--sm skeleton" style={{ width: '45%' }} />
            <span className="sk sk-line--sm skeleton" style={{ width: '20%' }} />
          </div>
        </div>
        <div className="sk-card sk-section">
          <div className="sk-row">
            <span className="sk skeleton" style={{ width: 18, height: 18, borderRadius: 4 }} />
            <span className="sk sk-line skeleton" style={{ width: '40%' }} />
          </div>
          <span className="sk skeleton" style={{ height: 8, borderRadius: 4, width: '100%' }} />
          <div className="sk-row" style={{ justifyContent: 'space-between' }}>
            {[0, 1, 2].map(i => (
              <div key={i} className="sk-col" style={{ alignItems: 'center', gap: 6 }}>
                <span className="sk sk-line--lg skeleton" style={{ width: 32 }} />
                <span className="sk sk-line--sm skeleton" style={{ width: 56 }} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="sk-card sk-section" style={{ minHeight: 90 }}>
              <span className="sk skeleton sk-circle" style={{ width: 36, height: 36 }} />
              <span className="sk sk-line skeleton" style={{ width: '60%' }} />
            </div>
          ))}
        </div>
        <div className="sk-section">
          <span className="sk sk-line--sm skeleton" style={{ width: '35%' }} />
          {[0, 1, 2].map(i => (
            <div key={i} className="sk-card sk-row">
              <span className="sk skeleton sk-circle" style={{ width: 36, height: 36, flexShrink: 0 }} />
              <div className="sk-col">
                <span className="sk sk-line skeleton" style={{ width: '65%' }} />
                <span className="sk sk-line--sm skeleton" style={{ width: '45%' }} />
              </div>
              <span className="sk sk-line skeleton" style={{ width: 48, flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const todayEarned    = Number(taskData?.today_earnings ?? 0);
  const dailyLimit     = taskData?.daily_limit ?? null;
  const earningsPct    = dailyLimit ? Math.min(100, Math.round((todayEarned / dailyLimit) * 100)) : 100;
  const availableCount = taskData?.tasks?.filter(t => !t.completed_today && !t.in_progress_today).length ?? 0;
  const completedCount = taskData?.tasks?.filter(t => t.completed_today).length ?? 0;
  const streakPct      = Math.min(100, Math.round((completedCount / STREAK_TASK_GOAL) * 100));
  const streakDone     = completedCount >= STREAK_TASK_GOAL;
  const streak         = user?.streak_count ?? 0;
  const coins          = Number(user?.coins ?? 0);
  const balance        = Number(user?.balance ?? 0);
  const isFreePlan     = !user?.plan || user.plan === 'free';
  const nextBonusIn    = streak > 0 ? 7 - (streak % 7) : 7;

  return (
    <div className="page">

      {/* Email verification banner */}
      {user && !user.is_email_verified && (
        <EmailVerificationBanner email={user.email} />
      )}

      {/* ── Greeting ── */}
      <header className="dash-greeting">
        <div>
          <h1 className="dash-greeting-title">Hi, {user?.username} 👋</h1>
          <p className="dash-greeting-sub">
            <span className={`plan-badge plan-badge--${user?.plan ?? 'free'}`} style={{ fontSize: 11 }}>
              {(user?.plan ?? 'free').toUpperCase()}
            </span>
            {user?.active_sub_plan && user.sub_expires_at && (
              <span className="dash-greeting-exp">
                &nbsp;· until {new Date(user.sub_expires_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </p>
        </div>
        {isFreePlan && (
          <Link to="/plans" className="btn btn-primary btn-sm">Upgrade</Link>
        )}
      </header>

      {/* ── Hero balance card ── */}
      <div className="dash-hero-card">
        {/* decorative circle */}
        <div className="dash-hero-circle" aria-hidden="true" />

        <div className="dash-hero-top">
          <span className="dash-hero-label">Total Balance</span>
          <Link to="/coins" className="dash-hero-coins">
            <Coins size={13} />
            {coins.toLocaleString()}
          </Link>
        </div>

        <div className="dash-hero-balance">
          ₱{balance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>

        <div className="dash-hero-divider" />

        <div className="dash-hero-today-row">
          <span className="dash-hero-today-label">
            Today&nbsp;
            <strong className="dash-hero-today-amount">₱{todayEarned.toFixed(2)}</strong>
            {dailyLimit && (
              <span className="dash-hero-today-of"> / ₱{dailyLimit}</span>
            )}
          </span>
          <Link to="/withdraw" className="dash-hero-withdraw-btn">
            <ArrowUpCircle size={14} />
            Withdraw
          </Link>
        </div>

        {dailyLimit && (
          <div className="dash-hero-progress-track">
            <div className="dash-hero-progress-fill" style={{ width: `${earningsPct}%` }} />
          </div>
        )}
      </div>

      {/* ── Today's Goal ── */}
      <div className="dash-goal-card">
        <div className="dash-goal-header">
          <div className="dash-goal-title-row">
            <Flame size={17} className={streak > 0 ? 'dash-goal-flame--active' : 'dash-goal-flame'} />
            <span className="dash-goal-title">Today's Goal</span>
            {streakDone && (
              <span className="dash-goal-done-badge"><Trophy size={11} /> Done!</span>
            )}
          </div>
          <span className="dash-goal-progress-count">{completedCount}/{STREAK_TASK_GOAL}</span>
        </div>

        <div className="dash-goal-bar">
          <div
            className={`dash-goal-fill${streakDone ? ' dash-goal-fill--done' : ''}`}
            style={{ width: `${streakPct}%` }}
          />
        </div>

        <p className="dash-goal-hint">
          {streakDone
            ? 'Streak earned — come back tomorrow 🎉'
            : `${STREAK_TASK_GOAL - completedCount} more task${STREAK_TASK_GOAL - completedCount !== 1 ? 's' : ''} for your streak`}
        </p>

        <div className="dash-goal-stats">
          <div className="dash-goal-stat">
            <span className="dash-goal-stat-value">{streak}</span>
            <span className="dash-goal-stat-label">Day streak</span>
          </div>
          <div className="dash-goal-stat-divider" />
          <div className="dash-goal-stat">
            <span className="dash-goal-stat-value">{nextBonusIn}</span>
            <span className="dash-goal-stat-label">Days to bonus</span>
          </div>
          <div className="dash-goal-stat-divider" />
          <div className="dash-goal-stat">
            <span className="dash-goal-stat-value">{availableCount}</span>
            <span className="dash-goal-stat-label">Tasks ready</span>
          </div>
        </div>
      </div>

      {/* ── KYC banner ── */}
      {user?.kyc_status === 'none' && (
        <Link to="/kyc" className="dash-kyc-banner">
          <BadgeCheck size={18} className="dash-kyc-icon" />
          <div className="dash-kyc-body">
            <p className="dash-kyc-title">Verify identity to unlock withdrawals</p>
            <p className="dash-kyc-sub">Takes 2 minutes</p>
          </div>
          <ChevronRight size={16} className="dash-kyc-chevron" />
        </Link>
      )}

      {/* ── Quick Actions 2×2 grid ── */}
      <section className="section">
        <h2 className="section-title">Quick Actions</h2>
        <div className="dash-actions-grid">
          <Link to="/tasks" className="dash-action-card">
            <span className="dash-action-icon dash-action-icon--blue">
              <CheckSquare size={20} />
            </span>
            <div className="dash-action-body">
              <span className="dash-action-label">Tasks</span>
              <span className="dash-action-desc">{availableCount} available</span>
            </div>
          </Link>
          <Link to="/withdraw" className="dash-action-card">
            <span className="dash-action-icon dash-action-icon--green">
              <ArrowUpCircle size={20} />
            </span>
            <div className="dash-action-body">
              <span className="dash-action-label">Withdraw</span>
              <span className="dash-action-desc">₱{balance.toFixed(2)} ready</span>
            </div>
          </Link>
          <Link to="/referrals" className="dash-action-card">
            <span className="dash-action-icon dash-action-icon--purple">
              <UserPlus size={20} />
            </span>
            <div className="dash-action-body">
              <span className="dash-action-label">Referrals</span>
              <span className="dash-action-desc">Earn ₱10/signup</span>
            </div>
          </Link>
          <Link to="/plans" className="dash-action-card">
            <span className="dash-action-icon dash-action-icon--orange">
              <Star size={20} />
            </span>
            <div className="dash-action-body">
              <span className="dash-action-label">Plans</span>
              <span className="dash-action-desc">More tasks &amp; limits</span>
            </div>
          </Link>
        </div>
      </section>

      {/* ── Recent Earnings ── */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Recent Earnings</h2>
          <Link to="/earnings" className="link link--sm">
            View all <TrendingUp size={13} />
          </Link>
        </div>

        {earnings.length === 0 ? (
          <div className="empty-state">
            <p>No earnings yet. <Link to="/tasks" className="link">Complete tasks</Link> to start.</p>
          </div>
        ) : (
          <div className="earnings-list">
            {earnings.map((e) => (
              <div key={e.id} className="earning-row">
                <div className="earning-row-icon">
                  <EarningTypeIcon type={e.type} />
                </div>
                <div className="earning-row-body">
                  <p className="earning-row-title">{e.title}</p>
                  <p className="earning-row-date">
                    {new Date(e.completed_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })}
                  </p>
                </div>
                <span className="earning-row-amount">+₱{Number(e.reward_earned).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
