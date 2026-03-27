import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api.js';

const TYPE_LABEL = {
  captcha:  'Captcha',
  video:    'Watch Video',
  ad_click: 'Ad Click',
  survey:   'Survey',
  referral: 'Referral',
};

export default function Tasks() {
  const [taskData, setTaskData]     = useState(null);
  const [loading, setLoading]       = useState(true);
  const [completing, setCompleting] = useState(null);
  const [message, setMessage]       = useState({ type: '', text: '' });

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/tasks');
      setTaskData(data);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load tasks.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleComplete(taskId) {
    setCompleting(taskId);
    setMessage({ type: '', text: '' });
    try {
      const { data } = await api.post(`/tasks/${taskId}/complete`);
      setMessage({ type: 'success', text: data.message });
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to complete task.' });
    } finally {
      setCompleting(null);
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>;

  const available  = taskData?.tasks?.filter((t) => !t.completed_today) ?? [];
  const completed  = taskData?.tasks?.filter((t) => t.completed_today)  ?? [];
  const atLimit    = taskData?.daily_limit !== null &&
                     taskData?.today_earnings >= taskData?.daily_limit;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">
            Today&apos;s earnings: ₱{Number(taskData?.today_earnings || 0).toFixed(2)}
            {taskData?.daily_limit && ` / ₱${taskData.daily_limit}`}
          </p>
        </div>
      </header>

      {message.text && (
        <div className={`alert alert--${message.type}`} role="alert">
          {message.text}
        </div>
      )}

      {atLimit && (
        <div className="alert alert--warning">
          Daily earning limit reached. Come back tomorrow or upgrade your plan.
        </div>
      )}

      {available.length === 0 && !atLimit ? (
        <div className="empty-state">All tasks completed for today. Great work!</div>
      ) : (
        <div className="task-grid">
          {available.map((task) => (
            <div key={task.id} className="task-card">
              <div className="task-card-header">
                <span className="badge">{TYPE_LABEL[task.type] || task.type}</span>
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
                  onClick={() => handleComplete(task.id)}
                  disabled={completing === task.id || atLimit}
                >
                  {completing === task.id ? 'Processing…' : 'Complete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <section className="section">
          <h2 className="section-title">Completed today</h2>
          <div className="task-grid task-grid--dim">
            {completed.map((task) => (
              <div key={task.id} className="task-card task-card--done">
                <span className="badge">{TYPE_LABEL[task.type] || task.type}</span>
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
  );
}
