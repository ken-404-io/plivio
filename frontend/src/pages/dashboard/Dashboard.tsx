import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import type { TaskListResponse, Earning } from '../../types/index.ts';
import EmailVerificationBanner from '../../components/common/EmailVerificationBanner.tsx';
import ChatTask from '../tasks/ChatTask.tsx';
import {
  ShieldCheck,
  Play,
  MousePointerClick,
  ClipboardList,
  Users,
  Zap,
  BadgeCheck,
  Flame,
  MessageCircle,
  ArrowUpCircle,
  ChevronRight,
  Trophy,
  Coins,
  TrendingUp,
} from 'lucide-react';

// Official Plivio community on Facebook. Opens in a new tab so the user
// doesn't lose their session / current page.
const COMMUNITY_URL = 'https://www.facebook.com/share/g/1azcCLjCTc/';

// Inline Facebook glyph — lucide-react v1.x doesn't ship brand icons, so we
// draw the "f" ourselves. Kept small and self-contained on purpose.
function FacebookGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M13.5 22v-8h2.7l.4-3.1h-3.1V8.9c0-.9.25-1.5 1.55-1.5H17V4.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.1H7.6V14h2.7v8h3.2z" />
    </svg>
  );
}

// ─── Quizly (daily quiz) status shape ────────────────────────────────────────
interface QuizlyStatus {
  success: boolean;
  plan: string;
  question_limit: number | null;
  total_answered: number;
  total_correct: number;
  questions_left: number | null;
  total_earned: number;
  today_earned: number;
  today_answered: number;
  daily_limit: number | null;
  daily_remaining: number | null;
  can_earn_more: boolean;
  free_lifetime_exhausted?: boolean;
  earnings_capped?: boolean;
}

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

// Matches STREAK_QUIZ_GOAL in ChatTask — answering this many quiz questions
// in a single PH day checks the user in for their daily streak.
const STREAK_QUIZ_GOAL = 15;

export default function Dashboard() {
  const { user, fetchMe } = useAuth();

  const [taskData, setTaskData] = useState<TaskListResponse | null>(null);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [quizly,   setQuizly]   = useState<QuizlyStatus | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [showQuizly, setShowQuizly] = useState(false);

  const load = useCallback(async () => {
    try {
      const [taskRes, earningRes, quizRes] = await Promise.all([
        api.get<TaskListResponse>('/tasks'),
        api.get<{ data: Earning[] }>('/users/me/earnings', { params: { limit: 5 } }),
        api.get<QuizlyStatus>('/quiz/status').catch(() => null),
      ]);
      setTaskData(taskRes.data);
      setEarnings(earningRes.data.data ?? []);
      if (quizRes) setQuizly(quizRes.data);
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

  // Reload after closing the Quizly modal so the daily progress card
  // reflects the latest answered/earned counts.
  const handleQuizlyClose = useCallback(() => {
    setShowQuizly(false);
    void load();
    void fetchMe();
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
  const streak         = user?.streak_count ?? 0;
  const coins          = Number(user?.coins ?? 0);
  const balance        = Number(user?.balance ?? 0);
  const isFreePlan     = !user?.plan || user.plan === 'free';
  const nextBonusIn    = streak > 0 ? 7 - (streak % 7) : 7;

  // Quizly-specific derived values (drive both the CTA and the daily card)
  const quizPlan          = quizly?.plan ?? user?.plan ?? 'free';
  const quizTodayAnswered = quizly?.today_answered ?? 0;
  const quizTodayEarned   = quizly?.today_earned   ?? 0;
  const quizTotalAnswered = quizly?.total_answered ?? 0;
  const quizLimit         = quizly?.question_limit ?? null;
  const quizLeft          = quizly?.questions_left ?? null;
  const quizDailyLimit    = quizly?.daily_limit ?? null;
  const quizDailyDone     = quizTodayAnswered >= STREAK_QUIZ_GOAL;
  const quizStreakPct     = Math.min(100, Math.round((quizTodayAnswered / STREAK_QUIZ_GOAL) * 100));
  const quizLocked        = quizly ? !quizly.can_earn_more : false;
  // CTA sub-line describes the plan's quota in human terms
  const quizSubline = (() => {
    if (!quizly) return 'Loading your quiz…';
    if (quizPlan === 'elite')   return 'Unlimited questions · answer anytime';
    if (quizPlan === 'premium') return `${quizLeft ?? 0} of 1,000 questions left today`;
    // Free plan — lifetime cap
    return `${quizLeft ?? 0} of ${quizLimit ?? 100} questions remaining`;
  })();

  return (
    <>
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

      {/* ── Join Community banner ── */}
      <a
        href={COMMUNITY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="dash-community-banner"
      >
        {/* Cover — Plivio Community banner image */}
        <div className="dash-community-cover" aria-hidden="true">
          <img
            src="/community-banner.png"
            alt="Plivio Community"
            className="dash-community-cover-img"
          />
        </div>

        {/* Content */}
        <div className="dash-community-content">
          <div className="dash-community-avatar">
            <FacebookGlyph size={28} />
          </div>
          <div className="dash-community-text">
            <p className="dash-community-title">Join our community</p>
            <p className="dash-community-sub">
              Connect with fellow Plivio earners · tips, giveaways, support
            </p>
            <div className="dash-community-meta">
              <span className="dash-community-meta-item">
                <Users size={12} /> Public group
              </span>
              <span className="dash-community-meta-dot">·</span>
              <span className="dash-community-meta-item">Facebook</span>
            </div>
          </div>
          <span className="dash-community-cta">
            Join
            <ChevronRight size={14} />
          </span>
        </div>
      </a>

      {/* ── Quizly daily progress (replaces the old Today's Goal card) ── */}
      <div className="dash-goal-card">
        <div className="dash-goal-header">
          <div className="dash-goal-title-row">
            <Flame size={16} className={streak > 0 ? 'dash-goal-flame--active' : 'dash-goal-flame'} />
            <span className="dash-goal-title">Quizly Today</span>
            {quizDailyDone && (
              <span className="dash-goal-done-badge"><Trophy size={10} /> Streak!</span>
            )}
          </div>
          <span className="dash-goal-progress-count">
            {quizTodayAnswered}/{STREAK_QUIZ_GOAL}
          </span>
        </div>

        <div className="dash-goal-bar">
          <div
            className={`dash-goal-fill${quizDailyDone ? ' dash-goal-fill--done' : ''}`}
            style={{ width: `${quizStreakPct}%` }}
          />
        </div>

        <p className="dash-goal-hint">
          {quizDailyDone
            ? 'Streak earned — come back tomorrow 🎉'
            : `Answer ${STREAK_QUIZ_GOAL - quizTodayAnswered} more question${STREAK_QUIZ_GOAL - quizTodayAnswered !== 1 ? 's' : ''} in Quizly for your streak`}
        </p>

        <div className="dash-goal-stats">
          <div className="dash-goal-stat">
            <span className="dash-goal-stat-value">{quizTodayAnswered}</span>
            <span className="dash-goal-stat-label">Answered</span>
          </div>
          <div className="dash-goal-stat-divider" />
          <div className="dash-goal-stat">
            <span className="dash-goal-stat-value">₱{quizTodayEarned.toFixed(2)}</span>
            <span className="dash-goal-stat-label">
              {quizDailyLimit ? `of ₱${quizDailyLimit}` : 'Earned today'}
            </span>
          </div>
          <div className="dash-goal-stat-divider" />
          <div className="dash-goal-stat">
            <span className="dash-goal-stat-value">
              {quizPlan === 'elite' ? '∞' : (quizLeft ?? 0)}
            </span>
            <span className="dash-goal-stat-label">
              {quizPlan === 'free' ? 'Left total' : 'Left today'}
            </span>
          </div>
        </div>

        {/* Secondary row: daily streak data (moved out of the goal card body) */}
        <div className="dash-goal-subrow">
          <div className="dash-goal-substat">
            <Flame size={12} className={streak > 0 ? 'dash-goal-flame--active' : 'dash-goal-flame'} />
            <span className="dash-goal-substat-val">{streak}</span>
            <span className="dash-goal-substat-lbl">day streak</span>
          </div>
          <span className="dash-goal-substat-divider" />
          <div className="dash-goal-substat">
            <Trophy size={12} />
            <span className="dash-goal-substat-val">{nextBonusIn}</span>
            <span className="dash-goal-substat-lbl">days to bonus</span>
          </div>
          <span className="dash-goal-substat-divider" />
          <div className="dash-goal-substat">
            <span className="dash-goal-substat-val">{quizTotalAnswered}</span>
            <span className="dash-goal-substat-lbl">lifetime</span>
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
            <p>No earnings yet. <button type="button" className="link" onClick={() => setShowQuizly(true)}>Open Quizly</button> to start.</p>
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

    {showQuizly && <ChatTask onClose={handleQuizlyClose} />}
    </>
  );
}
