import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import TaskModal from './TaskModal.tsx';
import type { Task, TaskListResponse } from '../../types/index.ts';

const TYPE_LABEL: Record<string, string> = {
  captcha:  'Captcha',
  video:    'Watch Video',
  ad_click: 'Ad Click',
  survey:   'Survey',
  referral: 'Referral',
};

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

export default function Tasks() {
  const toast = useToast();

  const [taskData,      setTaskData]      = useState<TaskListResponse | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [activeTask,    setActiveTask]    = useState<Task | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<TaskListResponse>('/tasks');
      setTaskData(data);
    } catch {
      toast.error('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  function handleStart(task: Task) {
    // Referral tasks aren't manually startable
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

  const available    = taskData?.tasks?.filter((t) => !t.completed_today && !t.in_progress_today) ?? [];
  const inProgress   = taskData?.tasks?.filter((t) => t.in_progress_today)                        ?? [];
  const completed    = taskData?.tasks?.filter((t) => t.completed_today)                           ?? [];
  const atLimit      = taskData?.daily_limit != null && taskData.today_earnings >= taskData.daily_limit;

  return (
    <>
      <div className="page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Tasks</h1>
            <p className="page-subtitle">
              Today&apos;s earnings: ₱{Number(taskData?.today_earnings ?? 0).toFixed(2)}
              {taskData?.daily_limit != null && ` / ₱${taskData.daily_limit}`}
            </p>
          </div>
        </header>

        {atLimit && (
          <div className="alert alert--warning">
            Daily earning limit reached. Come back tomorrow or{' '}
            <a href="/plans" className="link">upgrade your plan</a>.
          </div>
        )}

        {/* In-progress tasks (started but not yet submitted) */}
        {inProgress.length > 0 && (
          <section className="section">
            <h2 className="section-title">In Progress</h2>
            <div className="task-grid">
              {inProgress.map((task) => (
                <div key={task.id} className="task-card task-card--progress">
                  <div className="task-card-header">
                    <span className="badge badge--warning">{TYPE_LABEL[task.type] ?? task.type}</span>
                    {task.min_plan !== 'free' && (
                      <span className={`plan-badge plan-badge--${task.min_plan}`}>
                        {task.min_plan.toUpperCase()}+
                      </span>
                    )}
                  </div>
                  <h3 className="task-title">{task.title}</h3>
                  <div className="task-footer">
                    <span className="task-reward">+₱{Number(task.reward_amount).toFixed(2)}</span>
                    <button
                      className="btn btn-warning btn-sm"
                      onClick={() => handleStart(task)}
                    >
                      Resume
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Available tasks */}
        {available.length === 0 && !atLimit && inProgress.length === 0 ? (
          <div className="empty-state">
            {(taskData?.tasks?.length ?? 0) === 0
              ? 'No tasks available right now. Check back soon.'
              : 'All tasks completed for today. Great work!'}
          </div>
        ) : (
          <div className="task-grid">
            {available.map((task) => {
              const hint = taskHint(task);
              return (
                <div key={task.id} className="task-card">
                  <div className="task-card-header">
                    <span className="badge">{TYPE_LABEL[task.type] ?? task.type}</span>
                    {hint && <span className="task-hint">{hint}</span>}
                    {task.min_plan !== 'free' && (
                      <span className={`plan-badge plan-badge--${task.min_plan}`}>
                        {task.min_plan.toUpperCase()}+
                      </span>
                    )}
                  </div>
                  <h3 className="task-title">{task.title}</h3>
                  <div className="task-footer">
                    <span className="task-reward">+₱{Number(task.reward_amount).toFixed(2)}</span>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleStart(task)}
                      disabled={atLimit}
                    >
                      Start
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Completed tasks */}
        {completed.length > 0 && (
          <section className="section">
            <h2 className="section-title">Completed today</h2>
            <div className="task-grid task-grid--dim">
              {completed.map((task) => (
                <div key={task.id} className="task-card task-card--done">
                  <span className="badge">{TYPE_LABEL[task.type] ?? task.type}</span>
                  <h3 className="task-title">{task.title}</h3>
                  <span className="task-reward task-reward--muted">
                    +₱{Number(task.reward_amount).toFixed(2)} ✓
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Task modal — rendered outside page flow to overlay everything */}
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
