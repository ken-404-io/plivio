import { useEffect, useState } from 'react';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import type { AdminUser, AdminTask, AdminWithdrawal, AdminStats, AdNetwork } from '../../types/index.ts';

const TABS = ['overview', 'users', 'tasks', 'ads', 'withdrawals'] as const;
type Tab = typeof TABS[number];

const PRESET_NETWORKS = ['Adsterra', 'Monetag', 'PropellerAds', 'Custom'] as const;

interface AdNetworkDraft {
  name: string;
  weight: number;
  embed_code: string;
}

function emptyDraft(): AdNetworkDraft {
  return { name: 'Adsterra', weight: 50, embed_code: '' };
}

interface TaskForm {
  title:         string;
  type:          string;
  reward_amount: string;
  min_plan:      string;
}

export default function AdminDashboard() {
  const toast = useToast();

  const [tab,         setTab]         = useState<Tab>('overview');
  const [stats,       setStats]       = useState<AdminStats | null>(null);
  const [users,       setUsers]       = useState<AdminUser[]>([]);
  const [tasks,       setTasks]       = useState<AdminTask[]>([]);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [loading,     setLoading]     = useState(true);

  const [taskForm, setTaskForm] = useState<TaskForm>({
    title: '', type: 'captcha', reward_amount: '', min_plan: 'free',
  });

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, usersRes, tasksRes, wdRes] = await Promise.all([
          api.get<{ stats: AdminStats }>('/admin/stats'),
          api.get<{ data: AdminUser[] }>('/admin/users'),
          api.get<{ tasks: AdminTask[] }>('/admin/tasks'),
          api.get<{ withdrawals: AdminWithdrawal[] }>('/admin/withdrawals'),
        ]);
        setStats(statsRes.data.stats);
        setUsers(usersRes.data.data);
        setTasks(tasksRes.data.tasks);
        setWithdrawals(wdRes.data.withdrawals);
      } catch {
        toast.error('Failed to load admin data.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [toast]);

  async function toggleBan(userId: string, isBanned: boolean) {
    try {
      await api.put(`/admin/users/${userId}`, { is_banned: String(!isBanned) });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_banned: !isBanned } : u));
      toast.success(`User ${isBanned ? 'unbanned' : 'banned'}.`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Action failed.');
    }
  }

  async function toggleTask(taskId: string, isActive: boolean) {
    try {
      await api.put(`/admin/tasks/${taskId}`, { is_active: !isActive });
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, is_active: !isActive } : t));
      toast.success(`Task ${isActive ? 'deactivated' : 'activated'}.`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Action failed.');
    }
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { data } = await api.post<{ task: AdminTask }>('/admin/tasks', taskForm);
      setTasks((prev) => [data.task, ...prev]);
      setTaskForm({ title: '', type: 'captcha', reward_amount: '', min_plan: 'free' });
      toast.success('Task created.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Failed to create task.');
    }
  }

  // Ad network state — keyed by task id
  const [adNetworks,    setAdNetworks]    = useState<Record<string, AdNetwork[]>>({});
  const [adDrafts,      setAdDrafts]      = useState<Record<string, AdNetworkDraft[]>>({});
  const [savingAds,     setSavingAds]     = useState<string | null>(null);

  function getNetworksForTask(taskId: string): AdNetworkDraft[] {
    return adDrafts[taskId] ?? adNetworks[taskId]?.map((n) => ({ ...n })) ?? [];
  }

  function setNetworksForTask(taskId: string, nets: AdNetworkDraft[]) {
    setAdDrafts((prev) => ({ ...prev, [taskId]: nets }));
  }

  function addNetwork(taskId: string) {
    const nets = getNetworksForTask(taskId);
    setNetworksForTask(taskId, [...nets, emptyDraft()]);
  }

  function removeNetwork(taskId: string, idx: number) {
    const nets = [...getNetworksForTask(taskId)];
    nets.splice(idx, 1);
    setNetworksForTask(taskId, nets);
  }

  function updateNetwork(taskId: string, idx: number, patch: Partial<AdNetworkDraft>) {
    const nets = getNetworksForTask(taskId).map((n, i) => i === idx ? { ...n, ...patch } : n);
    setNetworksForTask(taskId, nets);
  }

  async function saveNetworks(taskId: string) {
    const nets = getNetworksForTask(taskId);
    if (nets.some((n) => !n.embed_code.trim())) {
      toast.error('All networks must have an embed code.');
      return;
    }
    setSavingAds(taskId);
    try {
      await api.put(`/admin/tasks/${taskId}/ad-networks`, { networks: nets });
      setAdNetworks((prev) => ({ ...prev, [taskId]: nets }));
      setAdDrafts((prev) => { const n = { ...prev }; delete n[taskId]; return n; });
      toast.success('Ad networks saved.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Failed to save ad networks.');
    } finally {
      setSavingAds(null);
    }
  }

  async function processWithdrawal(id: string, action: 'approve' | 'reject') {
    try {
      await api.put(`/admin/withdrawals/${id}`, { action });
      setWithdrawals((prev) => prev.filter((w) => w.id !== id));
      toast.success(`Withdrawal ${action}d.`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Action failed.');
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Admin Panel</h1>
      </header>

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
                      onClick={() => { void toggleBan(u.id, u.is_banned); }}
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

      {tab === 'tasks' && (
        <>
          <section className="card mb-4">
            <h2 className="card-title">Create task</h2>
            <form onSubmit={(e) => { void createTask(e); }} className="form-row">
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
                        onClick={() => { void toggleTask(t.id, t.is_active); }}
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

      {tab === 'ads' && (
        <div className="ads-tab">
          <p className="ads-tab-hint text-muted">
            Configure ad network embed codes for video / ad-click tasks. Networks are selected at
            random (weighted) each time a user starts the task.
          </p>

          {tasks.filter((t) => t.type === 'video' || t.type === 'ad_click').length === 0 ? (
            <p className="text-muted">No video or ad-click tasks found.</p>
          ) : (
            tasks
              .filter((t) => t.type === 'video' || t.type === 'ad_click')
              .map((task) => {
                const nets = getNetworksForTask(task.id);
                const isDirty = !!adDrafts[task.id];
                return (
                  <div key={task.id} className="card ad-task-card">
                    <div className="ad-task-header">
                      <div>
                        <span className="ad-task-title">{task.title}</span>
                        <span className="badge ml-2">{task.type}</span>
                      </div>
                      <div className="ad-task-actions">
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => addNetwork(task.id)}
                        >
                          + Add Network
                        </button>
                        <button
                          className={`btn btn-sm btn-primary${!isDirty ? ' btn-disabled' : ''}`}
                          disabled={!isDirty || savingAds === task.id}
                          onClick={() => { void saveNetworks(task.id); }}
                        >
                          {savingAds === task.id ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>

                    {nets.length === 0 ? (
                      <p className="text-muted ad-empty-hint">No ad networks configured. Click "+ Add Network" to start.</p>
                    ) : (
                      <div className="ad-network-list">
                        {nets.map((net, idx) => (
                          <div key={idx} className="ad-network-row">
                            <div className="ad-network-row-top">
                              <select
                                className="form-input ad-network-name"
                                value={net.name}
                                onChange={(e) => updateNetwork(task.id, idx, { name: e.target.value })}
                              >
                                {PRESET_NETWORKS.map((p) => (
                                  <option key={p} value={p}>{p}</option>
                                ))}
                              </select>
                              <label className="ad-weight-label">
                                Weight
                                <input
                                  className="form-input ad-weight-input"
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={net.weight}
                                  onChange={(e) =>
                                    updateNetwork(task.id, idx, { weight: Number(e.target.value) })
                                  }
                                />
                              </label>
                              <button
                                className="btn btn-sm btn-ghost btn-danger"
                                onClick={() => removeNetwork(task.id, idx)}
                              >
                                Remove
                              </button>
                            </div>
                            <textarea
                              className="form-input ad-embed-textarea"
                              placeholder="Paste embed code from ad network (script or iframe tag)"
                              value={net.embed_code}
                              onChange={(e) =>
                                updateNetwork(task.id, idx, { embed_code: e.target.value })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>
      )}

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
                      onClick={() => { void processWithdrawal(w.id, 'approve'); }}
                    >
                      Approve
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { void processWithdrawal(w.id, 'reject'); }}
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
