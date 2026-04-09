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
  ChevronRight,
  Trophy,
  Coins,
  TrendingUp,
} from 'lucide-react';

// ─── Sub-components ───────────────────────────────────────────────────────────

function EarningTypeIcon({ type }: { type: string }) {
  const size = 15;
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
        {/* Greeting */}
        <div className="sk-section" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="sk-col" style={{ gap: 6 }}>
            <span className="sk sk-line skeleton" style={{ width: 140 }} />
            <span className="sk sk-line--sm skeleton" style={{ width: 90 }} />
          </div>
          <span className="sk skeleton" style={{ width: 72, height: 30, borderRadius: 8 }} />
        </div>
        {/* Balance card */}
        <div className="sk-card sk-section" style={{ gap: 14 }}>
          <div className="sk-row" style={{ justifyContent: 'space-between' }}>
            <span className="sk sk-line--sm skeleton" style={{ width: 80 }} />
            <span className="sk skeleton" style={{ width: 64, height: 22, borderRadius: 99 }} />
          </div>
          <span className="sk skeleton" style={{ height: 38, width: '60%', borderRadius: 6 }} />
          <div className="sk-row" style={{ justifyContent: 'space-between' }}>
            <span className="sk sk-line--sm skeleton" style={{ width: '45%' }} />
            <span className="sk skeleton" style={{ width: 80, height: 28, borderRadius: 99 }} />
          </div>
          <span className="sk skeleton" style={{ height: 4, borderRadius: 99 }} />
        </div>
        {/* Tasks CTA */}
        <span className="sk skeleton" style={{ height: 64, borderRadius: 12 }} />
        {/* Goal card */}
        <div className="sk-card sk-section" style={{ gap: 10 }}>
          <div className="sk-row" style={{ justifyContent: 'space-between' }}>
            <span className="sk sk-line skeleton" style={{ width: '40%' }} />
            <span className="sk sk-line--sm skeleton" style={{ width: '20%' }} />
          </div>
          <span className="sk skeleton" style={{ height: 5, borderRadius: 99 }} />
          <span className="sk sk-line--sm skeleton" style={{ width: '55%' }} />
          <div className="sk-row" style={{ justifyContent: 'space-between', paddingTop: 6 }}>
            {[0, 1, 2].map(i => (
              <div key={i} className="sk-col" style={{ alignItems: 'center', gap: 4 }}>
                <span className="sk sk-line--lg skeleton" style={{ width: 28 }} />
                <span className="sk sk-line--sm skeleton" style={{ width: 52 }} />
              </div>
            ))}
          </div>
        </div>
        {/* Recent earnings */}
        <div className="sk-section">
          <span className="sk sk-line--sm skeleton" style={{ width: '35%' }} />
          {[0, 1, 2].map(i => (
            <div key={i} className="sk-card sk-row">
              <span className="sk skeleton sk-circle" style={{ width: 34, height: 34, flexShrink: 0 }} />
              <div className="sk-col" style={{ flex: 1 }}>
                <span className="sk sk-line skeleton" style={{ width: '65%' }} />
                <span className="sk sk-line--sm skeleton" style={{ width: '40%' }} />
              </div>
              <span className="sk sk-line skeleton" style={{ width: 44, flexShrink: 0 }} />
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
          <h1 className="dash-greeting-title">Hi, {user?.username}</h1>
          <p className="dash-greeting-sub">
            <span className={`plan-badge plan-badge--${user?.plan ?? 'free'}`}>
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
          <Link to="/plans" className="btn btn-outline btn-sm">Upgrade</Link>
        )}
      </header>

      {/* ── Balance card ── */}
      <div className="dash-balance-card">
        <div className="dash-balance-top">
          <span className="dash-balance-label">Total Balance</span>
          <Link to="/coins" className="dash-coins-chip">
            <Coins size={12} />
            {coins.toLocaleString()}
          </Link>
        </div>

        <div className="dash-balance-amount">
          ₱{balance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>

        <div className="dash-balance-footer">
          <span className="dash-balance-today">
            Today&nbsp;
            <strong>+₱{todayEarned.toFixed(2)}</strong>
            {dailyLimit && <span className="dash-balance-limit"> / ₱{dailyLimit}</span>}
          </span>
          <Link to="/withdraw" className="dash-withdraw-btn">
            <ArrowUpCircle size={13} />
            Withdraw
          </Link>
        </div>

        {dailyLimit && (
          <div className="dash-limit-track">
            <div className="dash-limit-fill" style={{ width: `${earningsPct}%` }} />
          </div>
        )}
      </div>

      {/* ── Tasks CTA — the one primary action ── */}
      {availableCount > 0 && (
        <Link to="/tasks" className="dash-tasks-cta">
          <span className="dash-tasks-cta-icon">
            <CheckSquare size={18} />
          </span>
          <div className="dash-tasks-cta-body">
            <span className="dash-tasks-cta-count">{availableCount} tasks available</span>
            <span className="dash-tasks-cta-sub">Start earning now</span>
          </div>
          <ChevronRight size={18} className="dash-tasks-cta-arrow" />
        </Link>
      )}

      {/* ── KYC banner ── */}
      {user?.kyc_status === 'none' && (
        <Link to="/kyc" className="dash-kyc-banner">
          <BadgeCheck size={17} className="dash-kyc-icon" />
          <div className="dash-kyc-body">
            <p className="dash-kyc-title">Verify identity to unlock withdrawals</p>
            <p className="dash-kyc-sub">Takes 2 minutes</p>
          </div>
          <ChevronRight size={15} className="dash-kyc-chevron" />
        </Link>
      )}

      {/* ── Today's Goal ── */}
      <div className="dash-goal-card">
        <div className="dash-goal-header">
          <div className="dash-goal-title-row">
            <Flame size={16} className={streak > 0 ? 'dash-goal-flame--active' : 'dash-goal-flame'} />
            <span className="dash-goal-title">Today's Goal</span>
            {streakDone && (
              <span className="dash-goal-done-badge"><Trophy size={10} /> Done!</span>
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
            <span className="dash-goal-stat-value">{completedCount}</span>
            <span className="dash-goal-stat-label">Done today</span>
          </div>
        </div>
      </div>

      {/* ── Recent Earnings ── */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Recent Earnings</h2>
          <Link to="/earnings" className="link link--sm">
            View all <TrendingUp size={12} />
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
