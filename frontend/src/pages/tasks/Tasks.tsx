import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api.ts';
import { useAuth } from '../../store/authStore.tsx';
import { useToast } from '../../components/common/Toast.tsx';
import ChatTask from './ChatTask.tsx';
import type { Task, TaskListResponse } from '../../types/index.ts';
import {
  Users, CheckCircle2, MessageCircle,
  Copy, Check, ChevronRight, TrendingUp, Flame,
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
              <span className={`plan-badge plan-badge--${task.min_plan}`}>
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
  const plan           = taskData?.plan ?? 'free';

  return (
    <>
      <div className="page">

        {/* ── Header ── */}
        <header className="page-header">
          <div>
            <h1 className="page-title">Tasks</h1>
            <p className="page-subtitle">Earn real money — quiz &amp; referrals</p>
          </div>
        </header>

        {/* ── Earnings card ── */}
        <div className="tasks-earn-card">
          <div className="tasks-earn-top">
            <div>
              <div className="tasks-earn-label">Today's earnings</div>
              <div className="tasks-earn-amount">
                ₱{todayEarned.toFixed(2)}
                {dailyLimit != null && (
                  <span className="tasks-earn-limit"> / ₱{dailyLimit}</span>
                )}
              </div>
            </div>
            <div className="tasks-earn-plan-badge">
              <Flame size={12} />
              {plan.toUpperCase()}
            </div>
          </div>
          <div className="tasks-progress-bar" style={{ marginTop: 10 }}>
            <div className="tasks-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          {atLimit ? (
            <p className="tasks-progress-limit-msg">
              Daily limit reached.{' '}
              <Link to="/plans" className="link">Upgrade your plan</Link>
            </p>
          ) : (
            <p className="tasks-progress-plan-note">
              {dailyLimit != null
                ? `₱${(dailyLimit - todayEarned).toFixed(2)} remaining today`
                : 'No daily earning limit'}
            </p>
          )}
        </div>

        {/* ── Quiz Bot card ── */}
        <section className="tasks-section">
          <div className="tasks-section-header">
            <h2 className="tasks-section-title">Featured</h2>
          </div>
          <button className="quiz-task-card" onClick={() => setShowChatQuiz(true)}>
            <div className="quiz-task-card-icon">
              <MessageCircle size={24} />
            </div>
            <div className="quiz-task-card-body">
              <div className="quiz-task-card-title">Quiz Bot</div>
              <div className="quiz-task-card-sub">
                Pick A or B — answer correctly to earn ₱0.50 each
              </div>
              <div className="quiz-task-card-limits">
                Free: 50q · Premium: 150q · Elite: 500q
              </div>
            </div>
            <div className="quiz-task-card-right">
              <span className="quiz-task-card-reward">₱0.50</span>
              <span className="quiz-task-card-tag">per answer</span>
              <ChevronRight size={16} style={{ color: 'rgba(255,255,255,0.7)', marginTop: 4 }} />
            </div>
          </button>
        </section>

        {/* ── Referrals ── */}
        <section className="tasks-section">
          <div className="tasks-section-header">
            <h2 className="tasks-section-title">Referrals</h2>
            <Link to="/referrals" className="tasks-section-link">
              History <ChevronRight size={13} />
            </Link>
          </div>

          {/* How it works */}
          <div className="ref-how-it-works">
            <div className="ref-how-step">
              <span className="ref-how-num">1</span>
              <span>Share your code or link</span>
            </div>
            <ChevronRight size={14} className="ref-how-arrow" />
            <div className="ref-how-step">
              <span className="ref-how-num">2</span>
              <span>Friend registers</span>
            </div>
            <ChevronRight size={14} className="ref-how-arrow" />
            <div className="ref-how-step">
              <span className="ref-how-num">3</span>
              <span>You earn automatically</span>
            </div>
          </div>

          {/* Code + share row */}
          <div className="ref-code-card">
            <div className="ref-code-inner">
              <div className="ref-code-label">Your code</div>
              <div className="ref-code-value">{referralCode || '—'}</div>
            </div>
            <button className="ref-code-copy" onClick={copyCode} disabled={!referralCode}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button className="ref-link-btn" onClick={copyLink} disabled={!referralCode}>
            Copy full referral link
          </button>

          {/* Stats */}
          {(referralCount > 0 || referralEarned > 0) && (
            <div className="ref-stats-row">
              <div className="ref-stat">
                <span className="ref-stat-val">{referralCount}</span>
                <span className="ref-stat-lbl">Referred</span>
              </div>
              <div className="ref-stat-divider" />
              <div className="ref-stat">
                <span className="ref-stat-val">₱{referralEarned.toFixed(2)}</span>
                <span className="ref-stat-lbl">Earned</span>
              </div>
              <div className="ref-stat-divider" />
              <div className="ref-stat">
                <TrendingUp size={16} style={{ color: 'var(--success)' }} />
                <span className="ref-stat-lbl">All time</span>
              </div>
            </div>
          )}

          {/* Task list */}
          {tasks.length > 0 && (
            <div className="task-list" style={{ marginTop: 14 }}>
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
