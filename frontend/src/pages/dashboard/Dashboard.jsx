import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../store/authStore.jsx';
import api from '../../services/api.js';

const PLAN_LABEL = { free: 'Free', premium: 'Premium', elite: 'Elite' };

export default function Dashboard() {
  const { user, fetchMe } = useAuth();

  const [taskData, setTaskData]   = useState(null);
  const [earnings, setEarnings]   = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [taskRes, earningRes] = await Promise.all([
          api.get('/tasks'),
          api.get('/users/me/earnings', { params: { limit: 5 } }),
        ]);
        setTaskData(taskRes.data);
        setEarnings(earningRes.data.data);
      } catch {
        // handled silently; user sees fallback UI
      } finally {
        setLoading(false);
      }
    }
    load();
    fetchMe();
  }, [fetchMe]);

  if (loading) {
    return <div className="page-loading"><div className="spinner" /></div>;
  }

  const pct = taskData?.daily_limit
    ? Math.min(100, ((taskData.today_earnings / taskData.daily_limit) * 100)).toFixed(0)
    : 100;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Welcome back, {user?.username}</h1>
          <p className="page-subtitle">
            {PLAN_LABEL[user?.plan || 'free']} plan
            {user?.active_sub_plan && user.sub_expires_at && (
              <span className="badge badge--accent ml-2">
                Active until {new Date(user.sub_expires_at).toLocaleDateString('en-PH')}
              </span>
            )}
          </p>
        </div>
        {user?.plan === 'free' && (
          <Link to="/plans" className="btn btn-primary btn-sm">Upgrade Plan</Link>
        )}
      </header>

      {/* Stats row */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Balance</span>
          <span className="stat-value">₱{Number(user?.balance || 0).toFixed(2)}</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Today&apos;s Earnings</span>
          <span className="stat-value">
            ₱{Number(taskData?.today_earnings || 0).toFixed(2)}
            {taskData?.daily_limit && (
              <span className="stat-limit"> / ₱{taskData.daily_limit}</span>
            )}
          </span>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="stat-card">
          <span className="stat-label">Available Tasks</span>
          <span className="stat-value">{taskData?.tasks?.filter((t) => !t.completed_today).length ?? '–'}</span>
        </div>
      </div>

      {/* Recent earnings */}
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
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {earnings?.map((e) => (
                  <tr key={e.id}>
                    <td>{e.title}</td>
                    <td><span className="badge">{e.type}</span></td>
                    <td className="text-accent">+₱{Number(e.reward_earned).toFixed(2)}</td>
                    <td className="text-muted">{new Date(e.completed_at).toLocaleDateString('en-PH')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
