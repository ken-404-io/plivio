import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api.ts';
import { useAuth } from '../../store/authStore.tsx';
import { useToast } from '../../components/common/Toast.tsx';
import ChatTask from './ChatTask.tsx';
import type { Task, TaskListResponse } from '../../types/index.ts';
import {
  Users, CheckCircle2, MessageCircle, Copy, Check,
  TrendingUp, ChevronRight,
} from 'lucide-react';

// ─── Referral task card ───────────────────────────────────────────────────────

function ReferralTaskCard({ task }: { task: Task }) {
  const done = task.completed_today;
  return (
    <div className={`ref-task-card ${done ? 'ref-task-card--done' : ''}`}>
      <div className="ref-task-card-left">
        <div className={`ref-task-icon ${done ? 'ref-task-icon--done' : ''}`}>
          {done ? <CheckCircle2 size={18} /> : <Users size={18} />}
        </div>
        <div>
          <div className="ref-task-title">{task.title}</div>
          <div className="ref-task-sub">
            {task.min_plan !== 'free' && (
              <span className={`plan-badge plan-badge--${task.min_plan}`} style={{ marginRight: 6 }}>
                {task.min_plan.toUpperCase()}
              </span>
            )}
            Credited automatically on referral
          </div>
        </div>
      </div>
      <div className="ref-task-reward">
        +₱{Number(task.reward_amount).toFixed(2)}
        {done && <div className="ref-task-done-tag"><CheckCircle2 size={11} /> Earned</div>}
      </div>
    </div>
  );
}

// ─── Tasks page ───────────────────────────────────────────────────────────────

export default function Tasks() {
  const { user }  = useAuth();
  const toast     = useToast();

  const [taskData,     setTaskData]     = useState<TaskListResponse | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [copied,       setCopied]       = useState(false);
  const [showChatQuiz, setShowChatQuiz] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<TaskListResponse>('/tasks');
      setTaskData(data);
    } catch {
      toast.error('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  function copyCode() {
    const code = user?.referral_code ?? '';
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyLink() {
    const code = user?.referral_code ?? '';
    const link = `${window.location.origin}/register?ref=${code}`;
    void navigator.clipboard.writeText(link).then(() => {
      toast.success('Referral link copied!');
    });
  }

  if (loading) return <div className="page-loading"><div className="spinner" /><span>Loading…</span></div>;

  const tasks          = taskData?.tasks ?? [];
  const todayEarned    = Number(taskData?.today_earnings ?? 0);
  const dailyLimit     = taskData?.daily_limit ?? null;
  const pct            = dailyLimit ? Math.min(100, (todayEarned / dailyLimit) * 100) : 100;
  const atLimit        = dailyLimit != null && todayEarned >= dailyLimit;
  const referralCount  = taskData?.referral_count ?? 0;
  const referralEarned = taskData?.referral_earned ?? 0;
  const referralCode   = user?.referral_code ?? '';
  const plan           = taskData?.plan ?? user?.active_sub_plan ?? user?.plan ?? 'free';

  return (
    <>
      <div className="page">

        {/* ── Header ── */}
        <header className="page-header">
          <div>
            <h1 className="page-title">Tasks</h1>
            <p className="page-subtitle">Earn real money — quiz bot &amp; referrals</p>
          </div>
        </header>

        {/* ── Today's earnings bar ── */}
        <div className="tasks-progress-card">
          <div className="tasks-progress-row">
            <span className="tasks-progress-label">Today's earnings</span>
            <span className="tasks-progress-value">
              ₱{todayEarned.toFixed(2)}
              {dailyLimit != null && <span className="tasks-progress-limit"> / ₱{dailyLimit}</span>}
            </span>
          </div>
          <div className="tasks-progress-bar">
            <div className="tasks-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          {atLimit ? (
            <p className="tasks-progress-limit-msg">
              Daily limit reached.{' '}
              <Link to="/plans" className="link">Upgrade</Link> to earn more.
            </p>
          ) : (
            <p className="tasks-progress-plan-note">
              {plan.toUpperCase()} plan
              {dailyLimit != null ? ` · ₱${(dailyLimit - todayEarned).toFixed(2)} remaining today` : ' · No daily limit'}
            </p>
          )}
        </div>

        {/* ── Quiz Bot ── */}
        <section className="tasks-section">
          <h2 className="tasks-section-title">Featured</h2>
          <button className="quiz-task-card" onClick={() => setShowChatQuiz(true)}>
            <div className="quiz-task-card-icon">
              <MessageCircle size={22} />
            </div>
            <div className="quiz-task-card-body">
              <div className="quiz-task-card-title">Quiz Bot</div>
              <div className="quiz-task-card-sub">Answer questions one at a time and earn ₱0.50 each</div>
            </div>
            <div className="quiz-task-card-right">
              <span className="quiz-task-card-reward">₱0.50</span>
              <span className="quiz-task-card-tag">per answer</span>
            </div>
          </button>
        </section>

        {/* ── Referrals ── */}
        <section className="tasks-section">
          <h2 className="tasks-section-title">
            Referrals
            <Link to="/referrals" className="tasks-section-link">
              View all <ChevronRight size={13} />
            </Link>
          </h2>

          {/* Referral code card */}
          <div className="ref-code-card">
            <div className="ref-code-label">Your referral code</div>
            <div className="ref-code-row">
              <span className="ref-code-value">{referralCode || '—'}</span>
              <button className="ref-code-copy" onClick={copyCode} disabled={!referralCode}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <button className="ref-link-btn" onClick={copyLink} disabled={!referralCode}>
              Copy referral link
            </button>
          </div>

          {/* Referral stats */}
          {(referralCount > 0 || referralEarned > 0) && (
            <div className="ref-stats-row">
              <div className="ref-stat">
                <span className="ref-stat-val">{referralCount}</span>
                <span className="ref-stat-lbl">People Referred</span>
              </div>
              <div className="ref-stat-divider" />
              <div className="ref-stat">
                <span className="ref-stat-val">₱{referralEarned.toFixed(2)}</span>
                <span className="ref-stat-lbl">Total Earned</span>
              </div>
              <div className="ref-stat-divider" />
              <div className="ref-stat">
                <TrendingUp size={14} style={{ color: 'var(--success)' }} />
                <span className="ref-stat-lbl">All time</span>
              </div>
            </div>
          )}

          {/* Referral task list */}
          {tasks.length === 0 ? (
            <div className="tasks-empty" style={{ paddingTop: 20, paddingBottom: 20 }}>
              <Users size={28} className="tasks-empty-icon" />
              <p style={{ fontSize: 14 }}>No referral tasks configured yet.</p>
            </div>
          ) : (
            <div className="task-list" style={{ marginTop: 12 }}>
              {tasks.map((task) => (
                <ReferralTaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </section>

      </div>

      {showChatQuiz && (
        <ChatTask onClose={() => setShowChatQuiz(false)} />
      )}
    </>
  );
}
