import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import TaskModal from './TaskModal.tsx';
import type { Task, TaskListResponse } from '../../types/index.ts';
import {
  ShieldCheck,
  Play,
  MousePointerClick,
  ClipboardList,
  Users,
  Zap,
  Clock,
  CheckCircle2,
  PartyPopper,
  MailX,
} from 'lucide-react';

// ─── Task type meta ───────────────────────────────────────────────────────────

type TaskIcon = React.ReactElement;

const TYPE_META: Record<string, { label: string; Icon: () => TaskIcon; cls: string }> = {
  captcha:  { label: 'Captcha',     Icon: () => <ShieldCheck size={18} />,        cls: 'type--captcha'  },
  video:    { label: 'Watch Video', Icon: () => <Play size={18} />,               cls: 'type--video'    },
  ad_click: { label: 'Ad Click',    Icon: () => <MousePointerClick size={18} />,  cls: 'type--adclick'  },
  survey:   { label: 'Survey',      Icon: () => <ClipboardList size={18} />,      cls: 'type--survey'   },
  referral: { label: 'Referral',    Icon: () => <Users size={18} />,              cls: 'type--referral' },
};

function typeMeta(type: string) {
  return TYPE_META[type] ?? { label: type, Icon: () => <Zap size={18} />, cls: '' };
}

// ─── Duration / hint helper ───────────────────────────────────────────────────

function taskHint(task: Task): string {
  const cfg = task.verification_config;
  if (!cfg) return '';
  if ((task.type === 'video' || task.type === 'ad_click') && cfg.duration_seconds) {
    return `${cfg.duration_seconds}s`;
  }
  if (task.type === 'survey' && cfg.questions) {
    return `${cfg.questions.length} question${cfg.questions.length !== 1 ? 's' : ''}`;
  }
  if (task.type === 'referral') return 'Auto';
  return '';
}

// ─── Single task card ─────────────────────────────────────────────────────────

interface TaskCardProps {
  task:    Task;
  variant: 'available' | 'progress' | 'done';
  onStart: (task: Task) => void;
  atLimit: boolean;
}

function TaskCard({ task, variant, onStart, atLimit }: TaskCardProps) {
  const meta = typeMeta(task.type);
  const hint = taskHint(task);

  return (
    <div className={`task-card2 task-card2--${variant}`}>
      <div className={`task-card2-icon ${meta.cls}`} aria-hidden="true">
        <meta.Icon />
      </div>

      <div className="task-card2-body">
        <div className="task-card2-meta">
          <span className={`task-type-badge ${meta.cls}`}>{meta.label}</span>
          {hint && <span className="task-hint2">{hint}</span>}
          {task.min_plan !== 'free' && (
            <span className={`plan-badge plan-badge--${task.min_plan}`}>
              {task.min_plan.toUpperCase()}
            </span>
          )}
        </div>
        <p className="task-card2-title">{task.title}</p>
      </div>

      <div className="task-card2-right">
        <span className="task-card2-reward">
          +₱{Number(task.reward_amount).toFixed(2)}
        </span>

        {variant === 'done' ? (
          <span className="task-card2-done-badge">
            <CheckCircle2 size={14} />
            Done
          </span>
        ) : (
          <button
            className={`btn btn-sm ${variant === 'progress' ? 'btn-warning' : 'btn-primary'}`}
            onClick={() => onStart(task)}
            disabled={variant === 'available' && atLimit}
          >
            {variant === 'progress' ? 'Resume' : 'Start'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Tasks page ───────────────────────────────────────────────────────────────

export default function Tasks() {
  const toast = useToast();

  const [taskData,   setTaskData]   = useState<TaskListResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

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

  function handleStart(task: Task) {
    if (task.type === 'referral') {
      toast.info('Referral rewards are credited automatically when a friend registers with your code.');
      return;
    }
    setActiveTask(task);
  }

  function handleModalComplete(message: string) {
    setActiveTask(null);
    toast.success(message);
    void load();
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>;

  const available  = taskData?.tasks?.filter((t) => !t.completed_today && !t.in_progress_today) ?? [];
  const inProgress = taskData?.tasks?.filter((t) => t.in_progress_today)                        ?? [];
  const completed  = taskData?.tasks?.filter((t) => t.completed_today)                           ?? [];
  const atLimit    = taskData?.daily_limit != null && taskData.today_earnings >= taskData.daily_limit;

  const todayEarned = Number(taskData?.today_earnings ?? 0);
  const dailyLimit  = taskData?.daily_limit ?? null;
  const pct         = dailyLimit ? Math.min(100, (todayEarned / dailyLimit) * 100) : 100;

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

        {/* ── Quick stats ── */}
        <div className="tasks-stats-row">
          <div className="tasks-stat">
            <span className="tasks-stat-num">{available.length}</span>
            <span className="tasks-stat-lbl">Available</span>
          </div>
          <div className="tasks-stat-divider" />
          <div className="tasks-stat">
            <span className="tasks-stat-num">{inProgress.length}</span>
            <span className="tasks-stat-lbl">In Progress</span>
          </div>
          <div className="tasks-stat-divider" />
          <div className="tasks-stat">
            <span className="tasks-stat-num">{completed.length}</span>
            <span className="tasks-stat-lbl">Completed</span>
          </div>
        </div>

        {/* ── In-progress ── */}
        {inProgress.length > 0 && (
          <section className="tasks-section">
            <h2 className="tasks-section-title tasks-section-title--warning">
              <Clock size={16} />
              In Progress
            </h2>
            <div className="task-list">
              {inProgress.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  variant="progress"
                  onStart={handleStart}
                  atLimit={false}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Available ── */}
        <section className="tasks-section">
          <h2 className="tasks-section-title">Available Tasks</h2>

          {available.length === 0 ? (
            <div className="tasks-empty">
              {(taskData?.tasks?.length ?? 0) === 0 ? (
                <>
                  <MailX size={36} className="tasks-empty-icon" />
                  <p>No tasks available right now. Check back soon.</p>
                </>
              ) : (
                <>
                  <PartyPopper size={36} className="tasks-empty-icon" />
                  <p>All tasks completed for today. Great work!</p>
                  <p className="text-muted">Come back tomorrow for more tasks.</p>
                </>
              )}
            </div>
          ) : (
            <div className="task-list">
              {available.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  variant="available"
                  onStart={handleStart}
                  atLimit={atLimit}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Completed ── */}
        {completed.length > 0 && (
          <section className="tasks-section">
            <h2 className="tasks-section-title tasks-section-title--muted">
              <CheckCircle2 size={16} />
              Completed Today
            </h2>
            <div className="task-list task-list--dim">
              {completed.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  variant="done"
                  onStart={handleStart}
                  atLimit={false}
                />
              ))}
            </div>
          </section>
        )}

      </div>

      {activeTask && (
        <TaskModal
          task={activeTask}
          onClose={() => setActiveTask(null)}
          onComplete={handleModalComplete}
        />
      )}
    </>
  );
}
