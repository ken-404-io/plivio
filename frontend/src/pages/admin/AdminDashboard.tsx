import { useEffect, useState, useRef, useCallback } from 'react';
import { Users, ListTodo, Clock, TrendingUp, UserPlus, CheckSquare, ShieldCheck, Coins, Bell, Send, ChevronLeft, ChevronRight, Search } from 'lucide-react';
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

// ─── Notify user modal ────────────────────────────────────────────────────────
interface NotifyModalProps {
  username: string;
  onSend:   (title: string, message: string, link: string) => Promise<void>;
  onCancel: () => void;
}

function NotifyModal({ username, onSend, onCancel }: NotifyModalProps) {
  const [form, setForm]   = useState({ title: '', message: '', link: '' });
  const [busy, setBusy]   = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) return;
    setBusy(true);
    await onSend(form.title, form.message, form.link);
    setBusy(false);
  }

  return (
    <div className="reject-modal-overlay" onClick={onCancel}>
      <div className="reject-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="reject-modal-title">
          <Bell size={16} style={{ marginRight: 6 }} />
          Notify {username}
        </h3>
        <form onSubmit={(e) => { void handle(e); }}>
          <input
            className="form-input"
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            maxLength={200}
            required
            autoFocus
            style={{ marginBottom: 8 }}
          />
          <textarea
            className="form-input reject-modal-textarea"
            placeholder="Message"
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            maxLength={2000}
            rows={3}
            required
            style={{ marginBottom: 8 }}
          />
          <input
            className="form-input"
            placeholder="Link (optional, e.g. /kyc)"
            value={form.link}
            onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
            maxLength={500}
            style={{ marginBottom: 12 }}
          />
          <div className="reject-modal-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={busy || !form.title.trim() || !form.message.trim()}
            >
              <Send size={14} />
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const toast = useToast();

  const [tab,         setTab]         = useState<Tab>('overview');
  const [stats,       setStats]       = useState<AdminStats | null>(null);
  const [users,       setUsers]       = useState<AdminUser[]>([]);
  const [usersMeta,   setUsersMeta]   = useState({ page: 1, total: 0, limit: 25 });
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch,  setUserSearch]  = useState('');
  const [userPage,    setUserPage]    = useState(1);
  const [tasks,       setTasks]       = useState<AdminTask[]>([]);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [kycList,     setKycList]     = useState<AdminKycSubmission[]>([]);
  const [loading,     setLoading]     = useState(true);

  // Notify — target user + broadcast form
  const [notifyTarget,     setNotifyTarget]     = useState<{ id: string; username: string } | null>(null);
  const [broadcasting,     setBroadcasting]     = useState(false);
  const [broadcastForm,    setBroadcastForm]    = useState({ title: '', message: '' });

  // Expand user management row
  const [expandedUser,  setExpandedUser]  = useState<string | null>(null);
  const [adjustDraft,   setAdjustDraft]   = useState<Record<string, { delta: string; plan: string }>>({});

  // KYC — which card has images expanded
  const [expandedKyc,     setExpandedKyc]     = useState<string | null>(null);
  // KYC — rejection modal target
  const [rejectTarget,    setRejectTarget]    = useState<string | null>(null);
  // Withdrawal — rejection modal target
  const [wdRejectTarget,  setWdRejectTarget]  = useState<string | null>(null);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [taskForm, setTaskForm] = useState<TaskForm>({
    title: '', type: 'captcha', reward_amount: '', min_plan: 'free',
  });

  // Load non-user data once on mount
  useEffect(() => {
    async function load() {
      try {
        const [statsRes, tasksRes, wdRes, kycRes] = await Promise.all([
          api.get<{ stats: AdminStats }>('/admin/stats'),
          api.get<{ tasks: AdminTask[] }>('/admin/tasks'),
          api.get<{ withdrawals: AdminWithdrawal[] }>('/admin/withdrawals'),
          api.get<{ submissions: AdminKycSubmission[] }>('/admin/kyc'),
        ]);
        setStats(statsRes.data.stats);
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

  // Load users with search + pagination
  const loadUsers = useCallback(async (search: string, page: number) => {
    setUsersLoading(true);
    try {
      const { data } = await api.get<{
        data: AdminUser[];
        meta: { page: number; total: number; limit: number };
      }>('/admin/users', { params: { search: search || undefined, page, limit: 25 } });
      setUsers(data.data);
      setUsersMeta(data.meta);
    } catch {
      toast.error('Failed to load users.');
    } finally {
      setUsersLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial user load + re-load on page change
  useEffect(() => { void loadUsers(userSearch, userPage); }, [loadUsers, userPage]);

  // Debounced search — reset to page 1 on new query
  function handleUserSearch(value: string) {
    setUserSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setUserPage(1);
      void loadUsers(value, 1);
    }, 400);
  }

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

  async function applyUserAdjustment(userId: string) {
    const draft = adjustDraft[userId];
    if (!draft) return;

    const payload: Record<string, unknown> = {};
    const delta = parseFloat(draft.delta);
    if (draft.delta.trim() !== '' && !isNaN(delta)) payload.balance_adjustment = delta;
    if (draft.plan) payload.plan = draft.plan;
    if (Object.keys(payload).length === 0) { toast.error('No changes to apply.'); return; }

    try {
      const { data } = await api.put<{ user: AdminUser }>(`/admin/users/${userId}`, payload);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, ...data.user } : u));
      setAdjustDraft((prev) => { const n = { ...prev }; delete n[userId]; return n; });
      setExpandedUser(null);
      toast.success('User updated.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Update failed.');
    }
  }

  async function sendNotification(userId: string, title: string, message: string, link: string) {
    try {
      await api.post('/admin/notify', { user_id: userId, title, message, link: link || undefined });
      toast.success('Notification sent.');
      setNotifyTarget(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Failed to send notification.');
    }
  }

  async function sendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!broadcastForm.title.trim() || !broadcastForm.message.trim()) return;
    setBroadcasting(true);
    try {
      const { data } = await api.post<{ sent_to: number }>('/admin/notify-all', broadcastForm);
      toast.success(`Broadcast sent to ${data.sent_to} users.`);
      setBroadcastForm({ title: '', message: '' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Broadcast failed.');
    } finally {
      setBroadcasting(false);
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

  if (loading) return <div className="page-loading"><div className="spinner" /><span>Loading…</span></div>;

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

      {notifyTarget && (
        <NotifyModal
          username={notifyTarget.username}
          onSend={(title, message, link) => sendNotification(notifyTarget.id, title, message, link)}
          onCancel={() => setNotifyTarget(null)}
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

          {/* Broadcast notification panel */}
          <section className="card" style={{ marginTop: 20 }}>
            <div className="card-title-row">
              <Bell size={18} />
              <h2 className="card-title">Broadcast Notification</h2>
            </div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
              Send an in-app notification to all active (non-banned) users.
            </p>
            <form onSubmit={(e) => { void sendBroadcast(e); }} className="admin-broadcast-form">
              <input
                className="form-input"
                placeholder="Title"
                value={broadcastForm.title}
                onChange={(e) => setBroadcastForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={200}
                required
              />
              <textarea
                className="form-input"
                placeholder="Message"
                value={broadcastForm.message}
                onChange={(e) => setBroadcastForm((f) => ({ ...f, message: e.target.value }))}
                maxLength={2000}
                rows={3}
                required
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={broadcasting || !broadcastForm.title.trim() || !broadcastForm.message.trim()}
                style={{ alignSelf: 'flex-start' }}
              >
                <Send size={15} />
                {broadcasting ? 'Sending…' : 'Send to all users'}
              </button>
            </form>
          </section>
        </>
      )}

      {/* ── Users ── */}
      {tab === 'users' && (
        <>
          {/* Search bar */}
          <div className="admin-search-wrap">
            <span className="admin-search-icon"><Search size={16} /></span>
            <input
              className="form-input admin-search-input"
              placeholder="Search by username or email…"
              value={userSearch}
              onChange={(e) => handleUserSearch(e.target.value)}
            />
          </div>

          <div className="admin-list" style={{ opacity: usersLoading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
            {users.length === 0 && !usersLoading ? (
              <div className="empty-state"><p>No users found.</p></div>
            ) : users.map((u) => {
              const isExpanded = expandedUser === u.id;
              const draft = adjustDraft[u.id] ?? { delta: '', plan: '' };
              return (
                <div key={u.id} className={`admin-card${isExpanded ? ' admin-card--expanded' : ''}`}>
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
                      className="btn btn-sm btn-ghost"
                      onClick={() => setNotifyTarget({ id: u.id, username: u.username })}
                      title="Send notification"
                    >
                      <Bell size={14} />
                    </button>
                    <button
                      className={`btn btn-sm btn-ghost${isExpanded ? ' btn-ghost--active' : ''}`}
                      onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                      title="Manage user"
                    >
                      Manage
                    </button>
                    <button
                      className={`btn btn-sm ${u.is_banned ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => { void toggleBan(u.id, u.is_banned); }}
                    >
                      {u.is_banned ? 'Unban' : 'Ban'}
                    </button>
                  </div>

                  {/* Expandable management panel */}
                  {isExpanded && (
                    <div className="admin-user-manage">
                      <div className="admin-user-manage-row">
                        <label className="admin-user-manage-label">Balance adjustment</label>
                        <div className="admin-user-manage-input-wrap">
                          <span className="admin-user-manage-prefix">₱</span>
                          <input
                            type="number"
                            className="form-input admin-user-manage-input"
                            placeholder="e.g. 50 or -10"
                            step="0.01"
                            value={draft.delta}
                            onChange={(e) => setAdjustDraft((prev) => ({
                              ...prev,
                              [u.id]: { ...draft, delta: e.target.value },
                            }))}
                          />
                        </div>
                        <span className="admin-user-manage-hint text-muted">
                          Current: ₱{Number(u.balance).toFixed(2)}
                        </span>
                      </div>

                      <div className="admin-user-manage-row">
                        <label className="admin-user-manage-label">Set plan</label>
                        <select
                          className="form-input admin-user-manage-select"
                          value={draft.plan}
                          onChange={(e) => setAdjustDraft((prev) => ({
                            ...prev,
                            [u.id]: { ...draft, plan: e.target.value },
                          }))}
                        >
                          <option value="">— no change —</option>
                          <option value="free">Free</option>
                          <option value="premium">Premium</option>
                          <option value="elite">Elite</option>
                        </select>
                      </div>

                      <div className="admin-user-manage-actions">
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => { setExpandedUser(null); setAdjustDraft((p) => { const n = {...p}; delete n[u.id]; return n; }); }}
                        >
                          Cancel
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => { void applyUserAdjustment(u.id); }}
                          disabled={!draft.delta && !draft.plan}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {usersMeta.total > usersMeta.limit && (
            <div className="admin-pagination">
              <button
                className="btn btn-sm btn-ghost"
                disabled={userPage <= 1}
                onClick={() => setUserPage((p) => p - 1)}
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="admin-pagination-info">
                Page {usersMeta.page} · {usersMeta.total} users
              </span>
              <button
                className="btn btn-sm btn-ghost"
                disabled={userPage * usersMeta.limit >= usersMeta.total}
                onClick={() => setUserPage((p) => p + 1)}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
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
