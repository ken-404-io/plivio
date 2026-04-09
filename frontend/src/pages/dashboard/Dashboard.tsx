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
  Coins,
  CheckSquare,
  ArrowUpCircle,
  UserPlus,
  Star,
  TrendingUp,
  ChevronRight,
  Trophy,
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

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  to?: string;
  ctaLabel?: string;
}

function StatCard({ label, value, sub, accent, to, ctaLabel }: StatCardProps) {
  return (
    <div className={`dash-stat-card${accent ? ' dash-stat-card--accent' : ''}`}>
      <span className="dash-stat-label">{label}</span>
      <span className="dash-stat-value">{value}</span>
      {sub && <span className="dash-stat-sub">{sub}</span>}
      {to && ctaLabel && (
        <Link to={to} className="dash-stat-cta">{ctaLabel} →</Link>
      )}
    </div>
  );
}

interface QuickActionProps {
  to: string;
  Icon: React.ElementType;
  label: string;
  desc: string;
}

function QuickAction({ to, Icon, label, desc }: QuickActionProps) {
  return (
    <Link to={to} className="dash-quick-action">
      <span className="dash-quick-action-icon"><Icon size={20} /></span>
      <div className="dash-quick-action-body">
        <span className="dash-quick-action-label">{label}</span>
        <span className="dash-quick-action-desc">{desc}</span>
      </div>
      <ChevronRight size={16} className="dash-quick-action-chevron" />
    </Link>
  );
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

const STREAK_TASK_GOAL = 5;

export default function Dashboard() {
  const { user, fetchMe } = useAuth();

  const [taskData,  setTaskData]  = useState<TaskListResponse | null>(null);
  const [earnings,  setEarnings]  = useState<Earning[]>([]);
  const [loading,   setLoading]   = useState(true);

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

  if (loading) {
    return (
      <div className="page">
        {/* header */}
        <div className="sk-section">
          <span className="sk sk-line sk-line--xl skeleton" style={{ width: '55%' }} />
          <span className="sk sk-line sk-line--sm skeleton" style={{ width: '35%' }} />
        </div>
        {/* stat cards */}
        <div className="dash-stats-row">
          {[0,1].map(i => (
            <div key={i} className="sk-card sk-section">
              <span className="sk sk-line sk-line--sm skeleton" style={{ width: '50%' }} />
              <span className="sk sk-line sk-line--xl skeleton" style={{ width: '70%' }} />
              <span className="sk sk-line sk-line--sm skeleton" style={{ width: '40%' }} />
            </div>
          ))}
        </div>
        {/* goal card */}
        <div className="sk-card sk-section">
          <div className="sk-row">
            <span className="sk sk-line skeleton" style={{ width: 18, height: 18, borderRadius: 4 }} />
            <span className="sk sk-line skeleton" style={{ width: '40%' }} />
          </div>
          <span className="sk skeleton" style={{ height: 8, borderRadius: 4, width: '100%' }} />
          <div className="sk-row" style={{ justifyContent: 'space-between' }}>
            {[0,1,2].map(i => (
              <div key={i} className="sk-col" style={{ alignItems: 'center', gap: 6 }}>
                <span className="sk sk-line--lg skeleton" style={{ width: 32 }} />
                <span className="sk sk-line--sm skeleton" style={{ width: 56 }} />
              </div>
            ))}
          </div>
        </div>
        {/* quick actions */}
        <div className="sk-section">
          <span className="sk sk-line--sm skeleton" style={{ width: '30%' }} />
          {[0,1,2].map(i => (
            <div key={i} className="sk-card sk-row">
              <span className="sk skeleton sk-circle" style={{ width: 40, height: 40, flexShrink: 0 }} />
              <div className="sk-col">
                <span className="sk sk-line skeleton" style={{ width: '60%' }} />
                <span className="sk sk-line--sm skeleton" style={{ width: '80%' }} />
              </div>
              <span className="sk skeleton" style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0 }} />
            </div>
          ))}
        </div>
        {/* recent earnings */}
        <div className="sk-section">
          <span className="sk sk-line--sm skeleton" style={{ width: '35%' }} />
          {[0,1,2].map(i => (
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

  // Derived values
  const todayEarned    = Number(taskData?.today_earnings ?? 0);
  const dailyLimit     = taskData?.daily_limit ?? null;
  const earningsPct    = dailyLimit
    ? Math.min(100, Math.round((todayEarned / dailyLimit) * 100))
    : 100;

  const availableCount = taskData?.tasks?.filter(
    (t) => !t.completed_today && !t.in_progress_today,
  ).length ?? 0;

  const completedCount = taskData?.tasks?.filter((t) => t.completed_today).length ?? 0;
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
      <header className="page-header">
        <div>
          <h1 className="page-title">Hi, {user?.username}</h1>
          <p className="page-subtitle">
            {(user?.plan ?? 'free').charAt(0).toUpperCase() + (user?.plan ?? 'free').slice(1)} plan
            {user?.active_sub_plan && user.sub_expires_at && (
              <span className="badge badge--accent">
                &nbsp;· Active until {new Date(user.sub_expires_at).toLocaleDateString('en-PH')}
              </span>
            )}
          </p>
        </div>
        {isFreePlan && (
          <Link to="/plans" className="btn btn-primary btn-sm">Upgrade</Link>
        )}
      </header>

      {/* ── Balance + today's earnings ── */}
      <div className="dash-stats-row">
        <StatCard
          label="Total Balance"
          value={`₱${balance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          accent
          to="/withdraw"
          ctaLabel="Withdraw"
        />
        <StatCard
          label="Today's Earnings"
          value={`₱${todayEarned.toFixed(2)}`}
          sub={dailyLimit ? `of ₱${dailyLimit} daily limit (${earningsPct}%)` : 'No limit set'}
        />
      </div>

      {/* Daily earnings progress bar */}
      {dailyLimit && (
        <div className="dash-progress-wrap">
          <div className="dash-progress-bar">
            <div className="dash-progress-fill" style={{ width: `${earningsPct}%` }} />
          </div>
        </div>
      )}

      {/* ── Today's Goal card (streak + task progress) ── */}
      <div className="dash-goal-card">
        <div className="dash-goal-header">
          <div className="dash-goal-title-row">
            <Flame size={18} className={streak > 0 ? 'dash-goal-flame--active' : 'dash-goal-flame'} />
            <span className="dash-goal-title">Today's Goal</span>
            {streakDone && (
              <span className="dash-goal-done-badge">
                <Trophy size={12} /> Streak earned!
              </span>
            )}
          </div>
          <Link to="/coins" className="dash-goal-coins">
            <Coins size={14} />
            <span>{coins.toLocaleString()}</span>
          </Link>
        </div>

        {/* Task progress toward streak */}
        <div className="dash-goal-progress-row">
          <span className="dash-goal-progress-label">
            {streakDone
              ? 'Come back tomorrow to continue your streak'
              : `Complete ${STREAK_TASK_GOAL - completedCount} more task${STREAK_TASK_GOAL - completedCount !== 1 ? 's' : ''} to earn your streak`}
          </span>
          <span className="dash-goal-progress-count">
            {completedCount}/{STREAK_TASK_GOAL}
          </span>
        </div>
        <div className="dash-goal-bar">
          <div
            className={`dash-goal-fill${streakDone ? ' dash-goal-fill--done' : ''}`}
            style={{ width: `${streakPct}%` }}
          />
        </div>

        {/* Streak stats row */}
        <div className="dash-goal-stats">
          <div className="dash-goal-stat">
            <span className="dash-goal-stat-value">{streak}</span>
            <span className="dash-goal-stat-label">Day streak</span>
          </div>
          <div className="dash-goal-stat-divider" />
          <div className="dash-goal-stat">
            <span className="dash-goal-stat-value">{nextBonusIn === 7 ? '7' : nextBonusIn}</span>
            <span className="dash-goal-stat-label">Days to +50 coins</span>
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
          <BadgeCheck size={20} className="dash-kyc-icon" />
          <div className="dash-kyc-body">
            <p className="dash-kyc-title">Verify your identity to enable withdrawals</p>
            <p className="dash-kyc-sub">Takes only 2 minutes</p>
          </div>
          <ChevronRight size={18} className="dash-kyc-chevron" />
        </Link>
      )}

      {/* ── Quick actions ── */}
      <section className="section">
        <h2 className="section-title">Quick Actions</h2>
        <div className="dash-quick-actions">
          <QuickAction to="/tasks"     Icon={CheckSquare}   label="Tasks"     desc={`${availableCount} available`} />
          <QuickAction to="/withdraw"  Icon={ArrowUpCircle} label="Withdraw"  desc={`₱${balance.toFixed(2)} ready`} />
          <QuickAction to="/referrals" Icon={UserPlus}      label="Referrals" desc="Earn ₱10 per signup" />
          <QuickAction to="/plans"     Icon={Star}          label="Plans"     desc="Upgrade for more tasks" />
        </div>
      </section>

      {/* ── Recent earnings ── */}
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
