import { useEffect, useState, useRef } from 'react';
import { Users, ListTodo, Clock, TrendingUp, UserPlus, CheckSquare, ShieldCheck, Coins } from 'lucide-react';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import type { AdminUser, AdminTask, AdminWithdrawal, AdminStats, AdNetwork, AdminKycSubmission } from '../../types/index.ts';

const TABS = ['overview', 'users', 'tasks', 'ads', 'withdrawals', 'kyc'] as const;
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

// ─── KYC image loader with auth ───────────────────────────────────────────────
function KycImage({ kycId, field, alt }: { kycId: string; field: 'id_front' | 'id_selfie'; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get(`/kyc/document/${field}?kyc_id=${kycId}`, { responseType: 'blob' })
      .then(({ data }) => {
        if (cancelled) return;
        const url = URL.createObjectURL(data as Blob);
        urlRef.current = url;
        setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [kycId, field]);

  if (!src) return <div className="kyc-img-placeholder">Loading…</div>;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="kyc-img-link">
      <img src={src} alt={alt} className="kyc-img-thumb" />
    </a>
  );
}

// ─── Rejection modal ───────────────────────────────────────────────────────────
interface RejectModalProps {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

function RejectModal({ onConfirm, onCancel }: RejectModalProps) {
  const [reason, setReason] = useState('');
  return (
    <div className="reject-modal-overlay" onClick={onCancel}>
      <div className="reject-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="reject-modal-title">Rejection Reason</h3>
        <p className="reject-modal-hint">This message will be shown to the user.</p>
        <textarea
          className="form-input reject-modal-textarea"
          placeholder="e.g. ID photo is blurry, please resubmit…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
        />
        <div className="reject-modal-actions">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-danger btn-sm"
            disabled={!reason.trim()}
            onClick={() => { if (reason.trim()) onConfirm(reason.trim()); }}
          >
            Reject KYC
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const toast = useToast();

  const [tab,         setTab]         = useState<Tab>('overview');
  const [stats,       setStats]       = useState<AdminStats | null>(null);
  const [users,       setUsers]       = useState<AdminUser[]>([]);
  const [tasks,       setTasks]       = useState<AdminTask[]>([]);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [kycList,     setKycList]     = useState<AdminKycSubmission[]>([]);
  const [loading,     setLoading]     = useState(true);

  // KYC — which card has images expanded
  const [expandedKyc,     setExpandedKyc]     = useState<string | null>(null);
  // KYC — rejection modal target
  const [rejectTarget,    setRejectTarget]    = useState<string | null>(null);
  // Withdrawal — rejection modal target
  const [wdRejectTarget,  setWdRejectTarget]  = useState<string | null>(null);

  const [taskForm, setTaskForm] = useState<TaskForm>({
    title: '', type: 'captcha', reward_amount: '', min_plan: 'free',
  });

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, usersRes, tasksRes, wdRes, kycRes] = await Promise.all([
          api.get<{ stats: AdminStats }>('/admin/stats'),
          api.get<{ data: AdminUser[] }>('/admin/users'),
          api.get<{ tasks: AdminTask[] }>('/admin/tasks'),
          api.get<{ withdrawals: AdminWithdrawal[] }>('/admin/withdrawals'),
          api.get<{ submissions: AdminKycSubmission[] }>('/admin/kyc'),
        ]);
        setStats(statsRes.data.stats);
        setUsers(usersRes.data.data);
        setTasks(tasksRes.data.tasks);
        setWithdrawals(wdRes.data.withdrawals);
        setKycList(kycRes.data.submissions);
      } catch {
        toast.error('Failed to load admin data.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const [adNetworks, setAdNetworks] = useState<Record<string, AdNetwork[]>>({});
  const [adDrafts,   setAdDrafts]   = useState<Record<string, AdNetworkDraft[]>>({});
  const [savingAds,  setSavingAds]  = useState<string | null>(null);

  function getNetworksForTask(taskId: string): AdNetworkDraft[] {
    return adDrafts[taskId] ?? adNetworks[taskId]?.map((n) => ({ ...n })) ?? [];
  }

  function setNetworksForTask(taskId: string, nets: AdNetworkDraft[]) {
    setAdDrafts((prev) => ({ ...prev, [taskId]: nets }));
  }

  function addNetwork(taskId: string) {
    setNetworksForTask(taskId, [...getNetworksForTask(taskId), emptyDraft()]);
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

  async function processWithdrawal(id: string, action: 'approve' | 'reject', rejection_reason?: string) {
    try {
      await api.put(`/admin/withdrawals/${id}`, { action, rejection_reason });
      setWithdrawals((prev) => prev.filter((w) => w.id !== id));
      toast.success(`Withdrawal ${action === 'approve' ? 'approved' : 'rejected'}.`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Action failed.');
    }
  }

  async function reviewKyc(id: string, action: 'approve' | 'reject', reason?: string) {
    try {
      await api.put(`/admin/kyc/${id}`, { action, rejection_reason: reason });
      setKycList((prev) => prev.filter((k) => k.id !== id));
      setExpandedKyc(null);
      toast.success(`KYC ${action}d.`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Action failed.');
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      {rejectTarget && (
        <RejectModal
          onConfirm={(reason) => {
            void reviewKyc(rejectTarget, 'reject', reason);
            setRejectTarget(null);
          }}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      {wdRejectTarget && (
        <RejectModal
          onConfirm={(reason) => {
            void processWithdrawal(wdRejectTarget, 'reject', reason);
            setWdRejectTarget(null);
          }}
          onCancel={() => setWdRejectTarget(null)}
        />
      )}

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
            {t === 'kyc' && stats && stats.pending_kyc > 0 && (
              <span className="tab-badge">{stats.pending_kyc}</span>
            )}
            {t === 'withdrawals' && stats && stats.pending_withdrawals > 0 && (
              <span className="tab-badge">{stats.pending_withdrawals}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && stats && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-icon stat-card-icon--purple"><Users size={18} /></div>
              <span className="stat-label">Total Users</span>
              <span className="stat-value">{stats.total_users.toLocaleString()}</span>
              {stats.new_users_today > 0 && (
                <span className="stat-sub stat-sub--positive">+{stats.new_users_today} today</span>
              )}
            </div>
            <div className="stat-card">
              <div className="stat-card-icon stat-card-icon--blue"><ListTodo size={18} /></div>
              <span className="stat-label">Active Tasks</span>
              <span className="stat-value">{stats.active_tasks}</span>
              {stats.completed_tasks_today > 0 && (
                <span className="stat-sub">{stats.completed_tasks_today} done today</span>
              )}
            </div>
            <div className="stat-card">
              <div className="stat-card-icon stat-card-icon--orange"><Clock size={18} /></div>
              <span className="stat-label">Pending Withdrawals</span>
              <span className="stat-value">{stats.pending_withdrawals}</span>
              <span className="stat-sub">₱{Number(stats.pending_withdrawal_total).toFixed(2)} total</span>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon stat-card-icon--green"><TrendingUp size={18} /></div>
              <span className="stat-label">Total Approved Earnings</span>
              <span className="stat-value">₱{Number(stats.total_approved_earnings).toFixed(2)}</span>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon stat-card-icon--teal"><UserPlus size={18} /></div>
              <span className="stat-label">New Users Today</span>
              <span className="stat-value">{stats.new_users_today}</span>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon stat-card-icon--indigo"><CheckSquare size={18} /></div>
              <span className="stat-label">Tasks Done Today</span>
              <span className="stat-value">{stats.completed_tasks_today}</span>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon stat-card-icon--red"><ShieldCheck size={18} /></div>
              <span className="stat-label">Pending KYC</span>
              <span className="stat-value">{stats.pending_kyc}</span>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon stat-card-icon--yellow"><Coins size={18} /></div>
              <span className="stat-label">Coins Distributed</span>
              <span className="stat-value">{Number(stats.total_coins_distributed).toLocaleString()}</span>
            </div>
          </div>
        </>
      )}

      {/* ── Users ── */}
      {tab === 'users' && (
        <div className="admin-list">
          {users.length === 0 ? (
            <div className="empty-state"><p>No users found.</p></div>
          ) : users.map((u) => (
            <div key={u.id} className="admin-card">
              <div className="admin-card-body">
                <div className="admin-card-main">
                  <span className="admin-card-title">{u.username}</span>
                  <span className="admin-card-sub">{u.email}</span>
                </div>
                <div className="admin-card-meta">
                  <span className={`plan-badge plan-badge--${u.plan}`}>{u.plan.toUpperCase()}</span>
                  <span className="admin-card-balance">₱{Number(u.balance).toFixed(2)}</span>
                  <span className={`status-dot status-dot--${u.is_banned ? 'rejected' : 'approved'}`}>
                    {u.is_banned ? 'Banned' : 'Active'}
                  </span>
                </div>
              </div>
              <div className="admin-card-actions">
                <button
                  className={`btn btn-sm ${u.is_banned ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => { void toggleBan(u.id, u.is_banned); }}
                >
                  {u.is_banned ? 'Unban' : 'Ban'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tasks ── */}
      {tab === 'tasks' && (
        <>
          <section className="card" style={{ marginBottom: 16 }}>
            <h2 className="card-title">Create task</h2>
            <form onSubmit={(e) => { void createTask(e); }} className="admin-task-form">
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
              <button type="submit" className="btn btn-primary btn-full">Add Task</button>
            </form>
          </section>

          <div className="admin-list">
            {tasks.length === 0 ? (
              <div className="empty-state"><p>No tasks yet.</p></div>
            ) : tasks.map((t) => (
              <div key={t.id} className="admin-card">
                <div className="admin-card-body">
                  <div className="admin-card-main">
                    <span className="admin-card-title">{t.title}</span>
                    <div className="admin-card-meta" style={{ marginTop: 4 }}>
                      <span className="badge">{t.type}</span>
                      <span className="text-muted" style={{ fontSize: 12 }}>{t.min_plan}</span>
                    </div>
                  </div>
                  <div className="admin-card-right">
                    <span className="admin-card-balance">₱{Number(t.reward_amount).toFixed(2)}</span>
                    <span className={`status-dot status-dot--${t.is_active ? 'approved' : 'rejected'}`}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="admin-card-actions">
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => { void toggleTask(t.id, t.is_active); }}
                  >
                    {t.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Ads ── */}
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

      {/* ── Withdrawals ── */}
      {tab === 'withdrawals' && (
        <div className="admin-list">
          {withdrawals.length === 0 ? (
            <div className="empty-state"><p>No pending withdrawals.</p></div>
          ) : withdrawals.map((w) => (
            <div key={w.id} className="admin-card">
              <div className="admin-card-body">
                <div className="admin-card-main">
                  <span className="admin-card-title">{w.username}</span>
                  <span className="admin-card-sub">{w.email}</span>
                  <div className="admin-card-meta" style={{ marginTop: 6 }}>
                    <span className="badge">{w.method.toUpperCase()}</span>
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      {new Date(w.requested_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  {/* Payment destination — critical info for admin */}
                  <div className="wd-payment-info">
                    <span className="wd-payment-label">Send to:</span>
                    <span className="wd-payment-name">{w.account_name}</span>
                    <span className="wd-payment-number">{w.account_number}</span>
                  </div>
                </div>
                <span className="admin-card-amount">₱{Number(w.amount).toFixed(2)}</span>
              </div>
              <div className="admin-card-actions">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => { void processWithdrawal(w.id, 'approve'); }}
                >
                  Approve
                </button>
                <button
                  className="btn btn-sm btn-ghost btn-danger"
                  onClick={() => setWdRejectTarget(w.id)}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── KYC ── */}
      {tab === 'kyc' && (
        <div className="admin-list">
          {kycList.length === 0 ? (
            <div className="empty-state"><p>No pending KYC submissions.</p></div>
          ) : kycList.map((k) => (
            <div key={k.id} className="admin-card kyc-card">
              <div className="admin-card-body">
                <div className="admin-card-main">
                  <span className="admin-card-title">{k.username}</span>
                  <span className="admin-card-sub">{k.email}</span>
                  <div className="admin-card-meta" style={{ marginTop: 4 }}>
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      {k.id_type.replace('_', ' ')} · {new Date(k.submitted_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className={`badge ${
                      k.status === 'approved' ? 'badge--success' :
                      k.status === 'rejected' ? 'badge--error' :
                      k.status === 'pending'  ? 'badge--warning' : ''
                    }`}>{k.status}</span>
                  </div>
                </div>
              </div>

              {/* Image preview toggle */}
              <button
                className="btn btn-sm btn-ghost kyc-preview-toggle"
                onClick={() => setExpandedKyc(expandedKyc === k.id ? null : k.id)}
              >
                {expandedKyc === k.id ? 'Hide Documents' : 'View Documents'}
              </button>

              {expandedKyc === k.id && (
                <div className="kyc-images-row">
                  <div className="kyc-img-wrap">
                    <span className="kyc-img-label">ID Front</span>
                    <KycImage kycId={k.id} field="id_front" alt="ID front" />
                  </div>
                  <div className="kyc-img-wrap">
                    <span className="kyc-img-label">Selfie with ID</span>
                    <KycImage kycId={k.id} field="id_selfie" alt="Selfie with ID" />
                  </div>
                </div>
              )}

              <div className="admin-card-actions">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => { void reviewKyc(k.id, 'approve'); }}
                >
                  Approve
                </button>
                <button
                  className="btn btn-sm btn-ghost btn-danger"
                  onClick={() => setRejectTarget(k.id)}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
