import { useEffect, useState } from 'react';
import api from '../../services/api.js';

const TABS = ['overview', 'users', 'tasks', 'withdrawals'];

export default function AdminDashboard() {
  const [tab, setTab]           = useState('overview');
  const [stats, setStats]       = useState(null);
  const [users, setUsers]       = useState([]);
  const [tasks, setTasks]       = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [message, setMessage]   = useState({ type: '', text: '' });

  // New task form state
  const [taskForm, setTaskForm] = useState({
    title: '', type: 'captcha', reward_amount: '', min_plan: 'free',
  });

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, usersRes, tasksRes, wdRes] = await Promise.all([
          api.get('/admin/stats'),
          api.get('/admin/users'),
          api.get('/admin/tasks'),
          api.get('/admin/withdrawals'),
        ]);
        setStats(statsRes.data.stats);
        setUsers(usersRes.data.data);
        setTasks(tasksRes.data.tasks);
        setWithdrawals(wdRes.data.withdrawals);
      } catch {
        setMessage({ type: 'error', text: 'Failed to load admin data.' });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function toggleBan(userId, isBanned) {
    try {
      await api.put(`/admin/users/${userId}`, { is_banned: String(!isBanned) });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_banned: !isBanned } : u))
      );
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Action failed.' });
    }
  }

  async function toggleTask(taskId, isActive) {
    try {
      await api.put(`/admin/tasks/${taskId}`, { is_active: !isActive });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, is_active: !isActive } : t))
      );
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Action failed.' });
    }
  }

  async function createTask(e) {
    e.preventDefault();
    try {
      const { data } = await api.post('/admin/tasks', taskForm);
      setTasks((prev) => [data.task, ...prev]);
      setTaskForm({ title: '', type: 'captcha', reward_amount: '', min_plan: 'free' });
      setMessage({ type: 'success', text: 'Task created.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to create task.' });
    }
  }

  async function processWithdrawal(id, action) {
    try {
      await api.put(`/admin/withdrawals/${id}`, { action });
      setWithdrawals((prev) => prev.filter((w) => w.id !== id));
      setMessage({ type: 'success', text: `Withdrawal ${action}d.` });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Action failed.' });
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Admin Panel</h1>
      </header>

      {message.text && (
        <div className={`alert alert--${message.type}`} role="alert">{message.text}</div>
      )}

      {/* Tab navigation */}
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`tab-btn${tab === t ? ' tab-btn--active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Total Users</span>
            <span className="stat-value">{stats.total_users.toLocaleString()}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Active Tasks</span>
            <span className="stat-value">{stats.active_tasks}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Pending Withdrawals</span>
            <span className="stat-value">{stats.pending_withdrawals}</span>
            <span className="stat-sub">₱{Number(stats.pending_withdrawal_total).toFixed(2)} total</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Total Approved Earnings</span>
            <span className="stat-value">₱{Number(stats.total_approved_earnings).toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Users */}
      {tab === 'users' && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Username</th><th>Email</th><th>Plan</th><th>Balance</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td className="text-muted">{u.email}</td>
                  <td><span className={`plan-badge plan-badge--${u.plan}`}>{u.plan.toUpperCase()}</span></td>
                  <td>₱{Number(u.balance).toFixed(2)}</td>
                  <td>
                    <span className={`status-dot status-dot--${u.is_banned ? 'rejected' : 'approved'}`}>
                      {u.is_banned ? 'Banned' : 'Active'}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`btn btn-sm ${u.is_banned ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => toggleBan(u.id, u.is_banned)}
                    >
                      {u.is_banned ? 'Unban' : 'Ban'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tasks */}
      {tab === 'tasks' && (
        <>
          {/* Create task form */}
          <section className="card mb-4">
            <h2 className="card-title">Create task</h2>
            <form onSubmit={createTask} className="form-row">
              <input
                className="form-input"
                placeholder="Task title"
                value={taskForm.title}
                onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
              <select
                className="form-input"
                value={taskForm.type}
                onChange={(e) => setTaskForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="captcha">Captcha</option>
                <option value="video">Video</option>
                <option value="ad_click">Ad Click</option>
                <option value="survey">Survey</option>
                <option value="referral">Referral</option>
              </select>
              <input
                className="form-input"
                type="number"
                placeholder="Reward (PHP)"
                value={taskForm.reward_amount}
                onChange={(e) => setTaskForm((f) => ({ ...f, reward_amount: e.target.value }))}
                min={0.01}
                step={0.01}
                required
              />
              <select
                className="form-input"
                value={taskForm.min_plan}
                onChange={(e) => setTaskForm((f) => ({ ...f, min_plan: e.target.value }))}
              >
                <option value="free">Free+</option>
                <option value="premium">Premium+</option>
                <option value="elite">Elite only</option>
              </select>
              <button type="submit" className="btn btn-primary">Add Task</button>
            </form>
          </section>

          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Title</th><th>Type</th><th>Reward</th><th>Min Plan</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td>{t.title}</td>
                    <td><span className="badge">{t.type}</span></td>
                    <td>₱{Number(t.reward_amount).toFixed(2)}</td>
                    <td>{t.min_plan}</td>
                    <td>
                      <span className={`status-dot status-dot--${t.is_active ? 'approved' : 'rejected'}`}>
                        {t.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => toggleTask(t.id, t.is_active)}
                      >
                        {t.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Withdrawals */}
      {tab === 'withdrawals' && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>User</th><th>Amount</th><th>Method</th><th>Requested</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {withdrawals.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted">No pending withdrawals</td></tr>
              ) : withdrawals.map((w) => (
                <tr key={w.id}>
                  <td>{w.username}</td>
                  <td>₱{Number(w.amount).toFixed(2)}</td>
                  <td>{w.method.toUpperCase()}</td>
                  <td className="text-muted">{new Date(w.requested_at).toLocaleDateString('en-PH')}</td>
                  <td className="action-cell">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => processWithdrawal(w.id, 'approve')}
                    >
                      Approve
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => processWithdrawal(w.id, 'reject')}
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
