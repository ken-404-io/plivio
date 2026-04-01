import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Lock, Play, MousePointerClick, ClipboardList, Users,
  Zap, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import type { TaskListResponse, Earning } from '../../types/index.ts';
import EmailVerificationBanner from '../../components/common/EmailVerificationBanner.tsx';

const PLAN_LABEL: Record<string, string> = { free: 'Free', premium: 'Premium', elite: 'Elite' };

const EARNING_TYPE_ICON: Record<string, React.ReactElement> = {
  captcha:  <Lock              size={18} />,
  video:    <Play              size={18} />,
  ad_click: <MousePointerClick size={18} />,
  survey:   <ClipboardList     size={18} />,
  referral: <Users             size={18} />,
};

export default function Dashboard() {
  const { user, fetchMe } = useAuth();

  const [taskData, setTaskData] = useState<TaskListResponse | null>(null);
  const [earnings, setEarnings] = useState<Earning[] | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [taskRes, earningRes] = await Promise.all([
          api.get<TaskListResponse>('/tasks'),
          api.get<{ data: Earning[] }>('/users/me/earnings', { params: { limit: 5 } }),
        ]);
        setTaskData(taskRes.data);
        setEarnings(earningRes.data.data);
      } catch {
        // handled silently; user sees fallback UI
      } finally {
        setLoading(false);
      }
    }
    void load();
    fetchMe();
  }, [fetchMe]);

  if (loading) {
    return <div className="page-loading"><div className="spinner" /></div>;
  }

  const todayEarned = Number(taskData?.today_earnings ?? 0);
  const dailyLimit  = taskData?.daily_limit ?? null;
  const pct = dailyLimit
    ? Math.min(100, (todayEarned / dailyLimit) * 100).toFixed(0)
    : 100;

  const availableCount = taskData?.tasks?.filter((t) => !t.completed_today && !t.in_progress_today).length ?? 0;
  const completedCount = taskData?.tasks?.filter((t) => t.completed_today).length ?? 0;

  return (
    <div className="page">
      {user && !user.is_email_verified && (
        <EmailVerificationBanner email={user.email} />
      )}

      {/* ── Greeting header ── */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Hi, {user?.username}</h1>
          <p className="page-subtitle">
            {PLAN_LABEL[user?.plan ?? 'free']} plan
            {user?.active_sub_plan && user.sub_expires_at && (
              <span className="badge badge--accent ml-2">
                Active until {new Date(user.sub_expires_at).toLocaleDateString('en-PH')}
              </span>
            )}
          </p>
        </div>
        {user?.plan === 'free' && (
          <Link to="/plans" className="btn btn-primary btn-sm">Upgrade</Link>
        )}
      </header>

      {/* ── Balance + daily earnings ── */}
      <div className="dash-hero-grid">
        <div className="dash-hero-card dash-hero-card--balance">
          <span className="dash-hero-label">Total Balance</span>
          <span className="dash-hero-value">₱{Number(user?.balance ?? 0).toFixed(2)}</span>
          <Link to="/withdraw" className="btn btn-sm btn-ghost dash-hero-cta">Withdraw →</Link>
        </div>

        <div className="dash-hero-card">
          <span className="dash-hero-label">Today's Earnings</span>
          <span className="dash-hero-value">
            ₱{todayEarned.toFixed(2)}
            {dailyLimit && <span className="dash-hero-limit"> / ₱{dailyLimit}</span>}
          </span>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* ── Task quick-stats ── */}
      <div className="dash-task-bar">
        <Link to="/tasks" className="dash-task-stat">
          <span className="dash-task-stat-num dash-task-stat-num--accent">{availableCount}</span>
          <span className="dash-task-stat-lbl">Tasks Ready</span>
        </Link>
        <div className="dash-task-stat-divider" />
        <div className="dash-task-stat">
          <span className="dash-task-stat-num">{completedCount}</span>
          <span className="dash-task-stat-lbl">Done Today</span>
        </div>
        <div className="dash-task-stat-divider" />
        <Link to="/referrals" className="dash-task-stat">
          <span className="dash-task-stat-num">₱10</span>
          <span className="dash-task-stat-lbl">Per Referral</span>
        </Link>
      </div>

      {/* ── CTA banner if tasks available ── */}
      {availableCount > 0 && (
        <Link to="/tasks" className="dash-cta-banner">
          <div className="dash-cta-banner-text">
            <span className="dash-cta-banner-title">
              {availableCount} task{availableCount !== 1 ? 's' : ''} waiting for you
            </span>
            <span className="dash-cta-banner-sub">Start earning now</span>
          </div>
          <span className="dash-cta-banner-arrow">→</span>
        </Link>
      )}

      {/* ── KYC warning ── */}
      {user?.kyc_status === 'none' && (
        <Link to="/kyc" className="dash-kyc-banner">
          <span className="dash-kyc-icon"><ShieldCheck size={22} /></span>
          <div>
            <p className="dash-kyc-title">Verify your identity to enable withdrawals</p>
            <p className="dash-kyc-sub">Takes only 2 minutes — tap to start</p>
          </div>
          <span className="dash-kyc-arrow">→</span>
        </Link>
      )}

      {/* ── Recent earnings ── */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Recent earnings</h2>
          <Link to="/earnings" className="link">View all</Link>
        </div>

        {earnings?.length === 0 ? (
          <div className="empty-state">
            <p>No earnings yet. <Link to="/tasks" className="link">Complete tasks</Link> to start earning.</p>
          </div>
        ) : (
          <div className="earnings-list">
            {earnings?.map((e) => (
              <div key={e.id} className="earning-row">
                <div className="earning-row-icon">
                  {EARNING_TYPE_ICON[e.type] ?? <Zap size={18} />}
                </div>
                <div className="earning-row-body">
                  <p className="earning-row-title">{e.title}</p>
                  <p className="earning-row-date text-muted">
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
