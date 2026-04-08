import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import ChatTask from './ChatTask.tsx';
import type { Task, TaskListResponse } from '../../types/index.ts';
import {
  Users,
  CheckCircle2,
  MessageCircle,
} from 'lucide-react';

// ─── Referral task card ───────────────────────────────────────────────────────

function ReferralCard({ task }: { task: Task }) {
  return (
    <div className="task-card2 task-card2--available">
      <div className="task-card2-icon type--referral" aria-hidden="true">
        <Users size={18} />
      </div>
      <div className="task-card2-body">
        <div className="task-card2-meta">
          <span className="task-type-badge type--referral">Referral</span>
          <span className="task-hint2">Auto</span>
          {task.min_plan !== 'free' && (
            <span className={`plan-badge plan-badge--${task.min_plan}`}>
              {task.min_plan.toUpperCase()}
            </span>
          )}
        </div>
        <p className="task-card2-title">{task.title}</p>
      </div>
      <div className="task-card2-right">
        <span className="task-card2-reward">+₱{Number(task.reward_amount).toFixed(2)}</span>
        <span className="task-card2-done-badge" style={{ opacity: 0.6, fontSize: 11 }}>
          Auto-credited
        </span>
      </div>
    </div>
  );
}

// ─── Tasks page ───────────────────────────────────────────────────────────────

export default function Tasks() {
  const toast = useToast();

  const [taskData,     setTaskData]     = useState<TaskListResponse | null>(null);
  const [loading,      setLoading]      = useState(true);
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

  if (loading) return <div className="page-loading"><div className="spinner" /><span>Loading…</span></div>;

  const referralTasks = taskData?.tasks?.filter((t) => t.type === 'referral') ?? [];
  const completedReferrals = referralTasks.filter((t) => t.completed_today);
  const pendingReferrals   = referralTasks.filter((t) => !t.completed_today);

  const todayEarned = Number(taskData?.today_earnings ?? 0);
  const dailyLimit  = taskData?.daily_limit ?? null;
  const pct         = dailyLimit ? Math.min(100, (todayEarned / dailyLimit) * 100) : 100;
  const atLimit     = dailyLimit != null && todayEarned >= dailyLimit;

  return (
    <>
      <div className="page">

        <header className="page-header">
          <div>
            <h1 className="page-title">Tasks</h1>
            <p className="page-subtitle">Complete tasks to earn real money</p>
          </div>
        </header>

        {/* ── Today's progress bar ── */}
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
          {atLimit && (
            <p className="tasks-progress-limit-msg">
              Daily limit reached.{' '}
              <Link to="/plans" className="link">Upgrade</Link> to earn more.
            </p>
          )}
        </div>

        {/* ── Quiz Bot ── */}
        <section className="tasks-section">
          <h2 className="tasks-section-title">Featured Task</h2>
          <button className="quiz-task-card" onClick={() => setShowChatQuiz(true)}>
            <div className="quiz-task-card-icon">
              <MessageCircle size={22} />
            </div>
            <div className="quiz-task-card-body">
              <div className="quiz-task-card-title">Quiz Bot — Answer &amp; Earn</div>
              <div className="quiz-task-card-sub">Bot asks questions one at a time — answer correctly to earn real money</div>
            </div>
            <div className="quiz-task-card-right">
              <span className="quiz-task-card-reward">₱0.50</span>
              <span className="quiz-task-card-tag">per correct</span>
            </div>
          </button>
        </section>

        {/* ── Referral tasks ── */}
        <section className="tasks-section">
          <h2 className="tasks-section-title">Referrals</h2>
          {referralTasks.length === 0 ? (
            <div className="tasks-empty">
              <Users size={32} className="tasks-empty-icon" />
              <p>No referral tasks available right now.</p>
            </div>
          ) : (
            <div className="task-list">
              {pendingReferrals.map((task) => (
                <ReferralCard key={task.id} task={task} />
              ))}
              {completedReferrals.length > 0 && (
                <div className="task-list task-list--dim" style={{ marginTop: 8 }}>
                  {completedReferrals.map((task) => (
                    <div key={task.id} className="task-card2 task-card2--done">
                      <div className="task-card2-icon type--referral"><Users size={18} /></div>
                      <div className="task-card2-body">
                        <p className="task-card2-title">{task.title}</p>
                      </div>
                      <div className="task-card2-right">
                        <span className="task-card2-reward">+₱{Number(task.reward_amount).toFixed(2)}</span>
                        <span className="task-card2-done-badge">
                          <CheckCircle2 size={14} /> Done
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
