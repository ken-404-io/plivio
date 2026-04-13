import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Users, ArrowUpCircle, ShieldCheck, TrendingUp,
  UserPlus, LayoutDashboard, Bell, Send,
  ChevronLeft, ChevronRight, Search, Ban, CheckCircle2,
  XCircle, Eye, EyeOff, Coins, MessageSquare, Clock,
  CreditCard, UserCheck, Info,
} from 'lucide-react';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import type {
  AdminUser, AdminWithdrawal, AdminStats, AdminKycSubmission,
  AdminUserDetails,
} from '../../types/index.ts';

const TABS = ['overview', 'users', 'withdrawals', 'kyc'] as const;
type Tab = typeof TABS[number];

const TAB_META: Record<Tab, { label: string; Icon: React.ElementType }> = {
  overview:    { label: 'Overview',    Icon: LayoutDashboard },
  users:       { label: 'Users',       Icon: Users           },
  withdrawals: { label: 'Withdrawals', Icon: ArrowUpCircle   },
  kyc:         { label: 'KYC',         Icon: ShieldCheck     },
};

// ─── Rejection modal ──────────────────────────────────────────────────────────
function RejectModal({ onConfirm, onCancel }: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="adm-modal-overlay" onClick={onCancel}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="adm-modal-title">Rejection Reason</h3>
        <p className="adm-modal-hint">This message will be shown to the user.</p>
        <textarea
          className="form-input adm-modal-textarea"
          placeholder="e.g. ID photo is blurry, please resubmit…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
        />
        <div className="adm-modal-actions">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-danger btn-sm"
            disabled={!reason.trim()}
            onClick={() => { if (reason.trim()) onConfirm(reason.trim()); }}
          >
            Confirm Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Notify modal ─────────────────────────────────────────────────────────────
function NotifyModal({ username, onSend, onCancel }: {
  username: string;
  onSend:   (title: string, message: string, link: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ title: '', message: '', link: '' });
  const [busy, setBusy] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) return;
    setBusy(true);
    await onSend(form.title, form.message, form.link);
    setBusy(false);
  }

  return (
    <div className="adm-modal-overlay" onClick={onCancel}>
      <div className="adm-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="adm-modal-title">
          <Bell size={15} style={{ marginRight: 6 }} />
          Notify {username}
        </h3>
        <form onSubmit={(e) => { void handle(e); }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="form-input"
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            maxLength={200}
            required
            autoFocus
          />
          <textarea
            className="form-input adm-modal-textarea"
            placeholder="Message"
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            maxLength={2000}
            rows={3}
            required
          />
          <input
            className="form-input"
            placeholder="Link (optional, e.g. /kyc)"
            value={form.link}
            onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
            maxLength={500}
          />
          <div className="adm-modal-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={busy || !form.title.trim() || !form.message.trim()}
            >
              <Send size={13} />
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── KYC image with auth ──────────────────────────────────────────────────────
function KycImage({ kycId, field, alt }: { kycId: string; field: 'id_front' | 'id_selfie'; alt: string }) {
  const [src, setSrc]   = useState<string | null>(null);
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

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="adm-stat-card">
      <div className={`adm-stat-icon adm-stat-icon--${color}`}><Icon size={16} /></div>
      <div className="adm-stat-body">
        <span className="adm-stat-label">{label}</span>
        <span className="adm-stat-value">{value}</span>
        {sub && <span className="adm-stat-sub">{sub}</span>}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const toast = useToast();

  const [tab,           setTab]           = useState<Tab>('overview');
  const [stats,         setStats]         = useState<AdminStats | null>(null);
  const [users,         setUsers]         = useState<AdminUser[]>([]);
  const [usersMeta,     setUsersMeta]     = useState({ page: 1, total: 0, limit: 25 });
  const [usersLoading,  setUsersLoading]  = useState(false);
  const [userSearch,    setUserSearch]    = useState('');
  const [userPage,      setUserPage]      = useState(1);
  const [withdrawals,   setWithdrawals]   = useState<AdminWithdrawal[]>([]);
  const [kycList,       setKycList]       = useState<AdminKycSubmission[]>([]);
  const [loading,       setLoading]       = useState(true);

  const [notifyTarget,  setNotifyTarget]  = useState<{ id: string; username: string } | null>(null);
  const [broadcasting,  setBroadcasting]  = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '' });

  const [expandedUser,    setExpandedUser]    = useState<string | null>(null);
  const [userDetailsTab,  setUserDetailsTab]  = useState<Record<string, 'manage' | 'details'>>({});
  const [userDetails,     setUserDetails]     = useState<Record<string, AdminUserDetails>>({});
  const [userDetailsLoad, setUserDetailsLoad] = useState<Record<string, boolean>>({});
  const [adjustDraft,     setAdjustDraft]     = useState<Record<string, { delta: string; plan: string }>>({});

  const [expandedKyc,   setExpandedKyc]   = useState<string | null>(null);
  const [rejectTarget,  setRejectTarget]  = useState<string | null>(null);
  const [wdRejectTarget,setWdRejectTarget]= useState<string | null>(null);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load non-user data once
  useEffect(() => {
    async function load() {
      try {
        const [statsRes, wdRes, kycRes] = await Promise.all([
          api.get<{ stats: AdminStats }>('/admin/stats'),
          api.get<{ withdrawals: AdminWithdrawal[] }>('/admin/withdrawals'),
          api.get<{ submissions: AdminKycSubmission[] }>('/admin/kyc'),
        ]);
        setStats(statsRes.data.stats);
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

  useEffect(() => { void loadUsers(userSearch, userPage); }, [loadUsers, userPage]);

  const loadUserDetails = useCallback(async (userId: string) => {
    if (userDetails[userId] || userDetailsLoad[userId]) return;
    setUserDetailsLoad((prev) => ({ ...prev, [userId]: true }));
    try {
      const { data } = await api.get<AdminUserDetails & { success: boolean }>(
        `/admin/users/${userId}/details`,
      );
      setUserDetails((prev) => ({ ...prev, [userId]: data }));
    } catch {
      toast.error('Failed to load user details.');
    } finally {
      setUserDetailsLoad((prev) => ({ ...prev, [userId]: false }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userDetails, userDetailsLoad]);

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
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Action failed.');
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
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Update failed.');
    }
  }

  async function sendNotification(userId: string, title: string, message: string, link: string) {
    try {
      await api.post('/admin/notify', { user_id: userId, title, message, link: link || undefined });
      toast.success('Notification sent.');
      setNotifyTarget(null);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to send.');
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
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Broadcast failed.');
    } finally {
      setBroadcasting(false);
    }
  }

  async function processWithdrawal(id: string, action: 'approve' | 'reject', rejection_reason?: string) {
    try {
      await api.put(`/admin/withdrawals/${id}`, { action, rejection_reason });
      setWithdrawals((prev) => prev.filter((w) => w.id !== id));
      toast.success(`Withdrawal ${action === 'approve' ? 'approved' : 'rejected'}.`);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Action failed.');
    }
  }

  async function reviewKyc(id: string, action: 'approve' | 'reject', reason?: string) {
    try {
      await api.put(`/admin/kyc/${id}`, { action, rejection_reason: reason });
      setKycList((prev) => prev.filter((k) => k.id !== id));
      setExpandedKyc(null);
      toast.success(`KYC ${action}d.`);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Action failed.');
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="sk-section">
          <span className="sk sk-line skeleton" style={{ width: 160 }} />
          <span className="sk sk-line--sm skeleton" style={{ width: 100 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[0,1,2,3,4,5,6,7].map(i => (
            <div key={i} className="sk-card sk-section" style={{ minHeight: 80, gap: 8 }}>
              <span className="sk skeleton sk-circle" style={{ width: 32, height: 32 }} />
              <span className="sk sk-line--sm skeleton" style={{ width: '55%' }} />
              <span className="sk sk-line--lg skeleton" style={{ width: '70%' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page">

      {/* Modals */}
      {rejectTarget && (
        <RejectModal
          onConfirm={(reason) => { void reviewKyc(rejectTarget, 'reject', reason); setRejectTarget(null); }}
          onCancel={() => setRejectTarget(null)}
        />
      )}
      {wdRejectTarget && (
        <RejectModal
          onConfirm={(reason) => { void processWithdrawal(wdRejectTarget, 'reject', reason); setWdRejectTarget(null); }}
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

      {/* Header */}
      <header className="adm-header">
        <div>
          <h1 className="adm-title">Admin Panel</h1>
          <p className="adm-subtitle">{new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
      </header>

      {/* Tab bar */}
      <div className="adm-tabs">
        {TABS.map((t) => {
          const { label, Icon } = TAB_META[t];
          const badge = t === 'kyc' ? stats?.pending_kyc
                      : t === 'withdrawals' ? stats?.pending_withdrawals
                      : 0;
          return (
            <button
              key={t}
              className={`adm-tab${tab === t ? ' adm-tab--active' : ''}`}
              onClick={() => setTab(t)}
            >
              <Icon size={15} />
              <span>{label}</span>
              {badge != null && badge > 0 && <span className="adm-tab-badge">{badge}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && stats && (
        <>
          <div className="adm-stats-grid">
            <StatCard icon={Users}        label="Total Users"         value={stats.total_users.toLocaleString()}                   sub={stats.new_users_today > 0 ? `+${stats.new_users_today} today` : undefined} color="blue"   />
            <StatCard icon={MessageSquare}label="Quiz Sessions Today" value={stats.completed_tasks_today.toLocaleString()}         color="indigo" />
            <StatCard icon={ArrowUpCircle}label="Pending Withdrawals" value={stats.pending_withdrawals}                            sub={`₱${Number(stats.pending_withdrawal_total).toFixed(2)} total`}              color="orange" />
            <StatCard icon={ShieldCheck}  label="Pending KYC"         value={stats.pending_kyc}                                    color="red"    />
            <StatCard icon={TrendingUp}   label="Total Paid Out"      value={`₱${Number(stats.total_approved_earnings).toFixed(2)}`}                                                                                 color="green"  />
            <StatCard icon={UserPlus}     label="New Users Today"     value={stats.new_users_today}                                color="teal"   />
            <StatCard icon={Coins}        label="Coins Distributed"   value={Number(stats.total_coins_distributed).toLocaleString()}                                                                                 color="yellow" />
            <StatCard icon={Clock}        label="Active Tasks"        value={stats.active_tasks}                                   color="purple" />
          </div>

          {/* Broadcast */}
          <div className="adm-section">
            <div className="adm-section-header">
              <Bell size={15} />
              <h2 className="adm-section-title">Broadcast Notification</h2>
            </div>
            <p className="adm-section-hint">Send an in-app notification to all active users.</p>
            <form onSubmit={(e) => { void sendBroadcast(e); }} className="adm-broadcast-form">
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
              >
                <Send size={14} />
                {broadcasting ? 'Sending…' : 'Send to all users'}
              </button>
            </form>
          </div>
        </>
      )}

      {/* ── Users ── */}
      {tab === 'users' && (
        <>
          <div className="adm-search-wrap">
            <Search size={15} className="adm-search-icon" />
            <input
              className="form-input adm-search-input"
              placeholder="Search username or email…"
              value={userSearch}
              onChange={(e) => handleUserSearch(e.target.value)}
            />
          </div>

          <div className="adm-list" style={{ opacity: usersLoading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
            {users.length === 0 && !usersLoading ? (
              <div className="empty-state"><p>No users found.</p></div>
            ) : users.map((u) => {
              const isExpanded = expandedUser === u.id;
              const draft = adjustDraft[u.id] ?? { delta: '', plan: '' };
              return (
                <div key={u.id} className={`adm-user-row${isExpanded ? ' adm-user-row--expanded' : ''}`}>
                  {/* Main row */}
                  <div className="adm-user-main">
                    <div className="adm-user-avatar">
                      {u.username[0]?.toUpperCase()}
                    </div>
                    <div className="adm-user-info">
                      <span className="adm-user-name">{u.username}</span>
                      <span className="adm-user-email">{u.email}</span>
                    </div>
                    <div className="adm-user-badges">
                      <span className={`plan-badge plan-badge--${u.plan}`}>{u.plan}</span>
                      <span className={`adm-status-chip ${u.is_banned ? 'adm-status-chip--banned' : 'adm-status-chip--active'}`}>
                        {u.is_banned ? <Ban size={10} /> : <CheckCircle2 size={10} />}
                        {u.is_banned ? 'Banned' : 'Active'}
                      </span>
                    </div>
                    <span className="adm-user-balance">₱{Number(u.balance).toFixed(2)}</span>
                    <div className="adm-user-actions">
                      <button
                        className="adm-icon-btn"
                        onClick={() => setNotifyTarget({ id: u.id, username: u.username })}
                        title="Send notification"
                      >
                        <Bell size={14} />
                      </button>
                      <button
                        className={`adm-icon-btn${isExpanded ? ' adm-icon-btn--active' : ''}`}
                        onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                        title="Manage user"
                      >
                        <ChevronRight size={14} style={{ transform: isExpanded ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s' }} />
                      </button>
                      <button
                        className={`adm-action-btn ${u.is_banned ? 'adm-action-btn--unban' : 'adm-action-btn--ban'}`}
                        onClick={() => { void toggleBan(u.id, u.is_banned); }}
                      >
                        {u.is_banned ? 'Unban' : 'Ban'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded panel with tabs */}
                  {isExpanded && (() => {
                    const activeTab = userDetailsTab[u.id] ?? 'manage';
                    const details   = userDetails[u.id];
                    const detLoading = userDetailsLoad[u.id];

                    function switchTab(tab: 'manage' | 'details') {
                      setUserDetailsTab((prev) => ({ ...prev, [u.id]: tab }));
                      if (tab === 'details') void loadUserDetails(u.id);
                    }

                    return (
                      <div className="adm-user-manage">
                        {/* Tab selector */}
                        <div className="adm-details-tabs">
                          <button
                            className={`adm-details-tab${activeTab === 'manage' ? ' adm-details-tab--active' : ''}`}
                            onClick={() => switchTab('manage')}
                          >
                            <CreditCard size={13} /> Manage
                          </button>
                          <button
                            className={`adm-details-tab${activeTab === 'details' ? ' adm-details-tab--active' : ''}`}
                            onClick={() => switchTab('details')}
                          >
                            <Info size={13} /> Details
                          </button>
                        </div>

                        {/* ── Manage tab ── */}
                        {activeTab === 'manage' && (
                          <>
                            <div className="adm-manage-field">
                              <label className="adm-manage-label">Balance adjustment</label>
                              <div className="adm-manage-input-row">
                                <span className="adm-manage-prefix">₱</span>
                                <input
                                  type="number"
                                  className="form-input adm-manage-input"
                                  placeholder="e.g. 50 or -10"
                                  step="0.01"
                                  value={draft.delta}
                                  onChange={(e) => setAdjustDraft((prev) => ({ ...prev, [u.id]: { ...draft, delta: e.target.value } }))}
                                />
                                <span className="adm-manage-hint">Current: ₱{Number(u.balance).toFixed(2)}</span>
                              </div>
                            </div>
                            <div className="adm-manage-field">
                              <label className="adm-manage-label">Set plan</label>
                              <select
                                className="form-input adm-manage-select"
                                value={draft.plan}
                                onChange={(e) => setAdjustDraft((prev) => ({ ...prev, [u.id]: { ...draft, plan: e.target.value } }))}
                              >
                                <option value="">— no change —</option>
                                <option value="free">Free</option>
                                <option value="premium">Premium</option>
                                <option value="elite">Elite</option>
                              </select>
                            </div>
                            <div className="adm-manage-actions">
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => { setExpandedUser(null); setAdjustDraft((p) => { const n = {...p}; delete n[u.id]; return n; }); }}
                              >
                                Cancel
                              </button>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => { void applyUserAdjustment(u.id); }}
                                disabled={!draft.delta && !draft.plan}
                              >
                                Apply changes
                              </button>
                            </div>
                          </>
                        )}

                        {/* ── Details tab ── */}
                        {activeTab === 'details' && (
                          <div className="adm-details-panel">
                            {detLoading && <p className="adm-details-loading">Loading…</p>}
                            {!detLoading && details && (
                              <>
                                {/* Subscription */}
                                <div className="adm-details-section">
                                  <h4 className="adm-details-section-title">
                                    <CreditCard size={13} /> Subscription
                                  </h4>
                                  {details.subscription ? (
                                    <div className="adm-details-sub-card">
                                      <span className={`plan-badge plan-badge--${details.subscription.plan}`}>
                                        {details.subscription.plan}
                                      </span>
                                      <span className="adm-details-sub-expiry">
                                        Expires {new Date(details.subscription.expires_at).toLocaleDateString('en-PH', {
                                          month: 'short', day: 'numeric', year: 'numeric',
                                        })}
                                      </span>
                                    </div>
                                  ) : (
                                    <p className="adm-details-empty">
                                      No active subscription — currently on <strong>{u.plan}</strong> plan
                                    </p>
                                  )}
                                </div>

                                {/* Invites */}
                                <div className="adm-details-section">
                                  <h4 className="adm-details-section-title">
                                    <UserCheck size={13} /> Sent Invites ({details.invites.length})
                                  </h4>
                                  {details.invites.length === 0 ? (
                                    <p className="adm-details-empty">No verified invites yet.</p>
                                  ) : (
                                    <div className="adm-details-invites-list">
                                      {details.invites.map((inv) => (
                                        <div key={inv.username} className="adm-details-invite-row">
                                          <div className="adm-details-invite-avatar">
                                            {inv.username[0]?.toUpperCase()}
                                          </div>
                                          <div className="adm-details-invite-info">
                                            <span className="adm-details-invite-name">{inv.username}</span>
                                            <span className="adm-details-invite-email">{inv.email}</span>
                                          </div>
                                          <span className={`plan-badge plan-badge--${inv.plan}`}>{inv.plan}</span>
                                          <span className="adm-details-invite-date">
                                            {new Date(inv.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Withdrawals */}
                                <div className="adm-details-section">
                                  <h4 className="adm-details-section-title">
                                    <ArrowUpCircle size={13} /> Withdrawal History ({details.withdrawals.length})
                                  </h4>
                                  {details.withdrawals.length === 0 ? (
                                    <p className="adm-details-empty">No withdrawal records.</p>
                                  ) : (
                                    <div className="adm-details-wd-list">
                                      {details.withdrawals.map((wd) => (
                                        <div key={wd.id} className="adm-details-wd-row">
                                          <div className="adm-details-wd-left">
                                            <span className="adm-details-wd-method">{String(wd.method).toUpperCase()}</span>
                                            <span className="adm-details-wd-amount">
                                              ₱{Number(wd.net_amount || wd.amount).toFixed(2)}
                                            </span>
                                            {Number(wd.fee_amount) > 0 && (
                                              <span className="adm-details-wd-gross">
                                                from ₱{Number(wd.amount).toFixed(2)}
                                              </span>
                                            )}
                                          </div>
                                          <div className="adm-details-wd-right">
                                            <span className={`adm-details-wd-status adm-details-wd-status--${wd.status}`}>
                                              {wd.status}
                                            </span>
                                            <span className="adm-details-wd-date">
                                              {new Date(wd.requested_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          {usersMeta.total > usersMeta.limit && (
            <div className="adm-pagination">
              <button
                className="btn btn-sm btn-ghost"
                disabled={userPage <= 1}
                onClick={() => setUserPage((p) => p - 1)}
              >
                <ChevronLeft size={15} /> Prev
              </button>
              <span className="adm-pagination-info">
                Page {usersMeta.page} of {Math.ceil(usersMeta.total / usersMeta.limit)} · {usersMeta.total} users
              </span>
              <button
                className="btn btn-sm btn-ghost"
                disabled={userPage * usersMeta.limit >= usersMeta.total}
                onClick={() => setUserPage((p) => p + 1)}
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Withdrawals ── */}
      {tab === 'withdrawals' && (
        <div className="adm-list">
          {withdrawals.length === 0 ? (
            <div className="empty-state"><p>No pending withdrawals.</p></div>
          ) : withdrawals.map((w) => (
            <div key={w.id} className="adm-wd-card">
              <div className="adm-wd-top">
                <div className="adm-wd-user">
                  <span className="adm-wd-username">{w.username}</span>
                  <span className="adm-wd-email">{w.email}</span>
                </div>
                <div className="adm-wd-amounts">
                  <div className="adm-wd-amount">₱{Number(w.net_amount || w.amount).toFixed(2)}</div>
                  <div className="adm-wd-amount-sub">
                    Requested ₱{Number(w.amount).toFixed(2)} · Fee ₱{Number(w.fee_amount || 0).toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="adm-wd-payment">
                <span className="adm-wd-method">{w.method.toUpperCase()}</span>
                <div className="adm-wd-account">
                  <span className="adm-wd-account-name">{w.account_name}</span>
                  <span className="adm-wd-account-num">{w.account_number}</span>
                </div>
                <span className="adm-wd-date">
                  {new Date(w.requested_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <div className="adm-wd-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => { void processWithdrawal(w.id, 'approve'); }}
                >
                  <CheckCircle2 size={13} /> Approve
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => setWdRejectTarget(w.id)}
                >
                  <XCircle size={13} /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── KYC ── */}
      {tab === 'kyc' && (
        <div className="adm-list">
          {kycList.length === 0 ? (
            <div className="empty-state"><p>No pending KYC submissions.</p></div>
          ) : kycList.map((k) => (
            <div key={k.id} className="adm-kyc-card">
              <div className="adm-kyc-top">
                <div className="adm-kyc-user">
                  <span className="adm-kyc-username">{k.username}</span>
                  <span className="adm-kyc-email">{k.email}</span>
                </div>
                <div className="adm-kyc-meta">
                  <span className={`adm-kyc-badge adm-kyc-badge--${k.status}`}>{k.status}</span>
                  <span className="adm-kyc-type">{k.id_type.replace('_', ' ')}</span>
                  <span className="adm-kyc-date">
                    {new Date(k.submitted_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>

              <button
                className="adm-docs-toggle"
                onClick={() => setExpandedKyc(expandedKyc === k.id ? null : k.id)}
              >
                {expandedKyc === k.id ? <EyeOff size={13} /> : <Eye size={13} />}
                {expandedKyc === k.id ? 'Hide documents' : 'View documents'}
              </button>

              {expandedKyc === k.id && (
                <div className="adm-kyc-docs">
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

              <div className="adm-kyc-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => { void reviewKyc(k.id, 'approve'); }}
                >
                  <CheckCircle2 size={13} /> Approve
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => setRejectTarget(k.id)}
                >
                  <XCircle size={13} /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
