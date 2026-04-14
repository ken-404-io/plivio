import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Users, ArrowUpCircle, ShieldCheck, TrendingUp,
  UserPlus, LayoutDashboard, Bell, Send,
  ChevronLeft, ChevronRight, Search, Ban, CheckCircle2,
  XCircle, Eye, EyeOff, Coins, MessageSquare, Clock,
  CreditCard, UserCheck, Info, History, Smartphone, RotateCcw,
  Download, X, Link2,
} from 'lucide-react';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import type {
  AdminUser, AdminWithdrawal, AdminWithdrawalHistory, AdminStats,
  AdminKycSubmission, AdminUserDetails, AdminReferral, AdminNotificationLog,
} from '../../types/index.ts';

const TABS = ['overview', 'users', 'withdrawals', 'referrals', 'notifications', 'kyc'] as const;
type Tab = typeof TABS[number];

const TAB_META: Record<Tab, { label: string; Icon: React.ElementType }> = {
  overview:      { label: 'Overview',      Icon: LayoutDashboard },
  users:         { label: 'Users',         Icon: Users           },
  withdrawals:   { label: 'Withdrawals',   Icon: ArrowUpCircle   },
  referrals:     { label: 'Referrals',     Icon: Link2           },
  notifications: { label: 'Notifications', Icon: Bell            },
  kyc:           { label: 'KYC',           Icon: ShieldCheck     },
};

// ─── Rejection modal (KYC – free text) ───────────────────────────────────────
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

// ─── Withdrawal rejection modal (predefined reasons) ─────────────────────────
const WITHDRAWAL_REJECT_REASONS = [
  'PayPal is currently under maintenance.',
  'GCash is currently under maintenance.',
  'Account information mismatch. Please verify your account details.',
  'Insufficient verification details for this transaction.',
  'Transaction temporarily suspended for security review.',
  'Other',
] as const;

function WithdrawalRejectModal({ onConfirm, onCancel }: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [custom,   setCustom]   = useState('');

  const isOther    = selected === 'Other';
  const finalReason = isOther ? custom.trim() : selected;

  return (
    <div className="adm-modal-overlay" onClick={onCancel}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="adm-modal-title">Withdrawal Rejection Reason</h3>
        <p className="adm-modal-hint">
          Select a reason — it will be sent to the user by email and in-app notification.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '12px 0' }}>
          {WITHDRAWAL_REJECT_REASONS.map((r) => (
            <label key={r} className="adm-reject-option">
              <input
                type="radio"
                name="wd-reject-reason"
                value={r}
                checked={selected === r}
                onChange={() => setSelected(r)}
                className="adm-reject-radio"
              />
              <span>{r}</span>
            </label>
          ))}
        </div>

        {isOther && (
          <textarea
            className="form-input adm-modal-textarea"
            placeholder="Describe the reason…"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            rows={3}
            autoFocus
          />
        )}

        <div className="adm-modal-actions">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-danger btn-sm"
            disabled={!finalReason}
            onClick={() => { if (finalReason) onConfirm(finalReason); }}
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

// ─── Filter chips ────────────────────────────────────────────────────────────
function FilterChips({ filters, onRemove, onClear }: {
  filters: Record<string, string>;
  onRemove: (key: string) => void;
  onClear: () => void;
}) {
  const active = Object.entries(filters).filter(([, v]) => v !== '');
  if (active.length === 0) return null;
  return (
    <div className="adm-filter-chips">
      {active.map(([key, val]) => (
        <span key={key} className="adm-filter-chip">
          {key}: {val}
          <button className="adm-filter-chip-x" onClick={() => onRemove(key)}><X size={10} /></button>
        </span>
      ))}
      <button className="adm-filter-chip adm-filter-chip--clear" onClick={onClear}>Clear all</button>
    </div>
  );
}

// ─── Export button ────────────────────────────────────────────────────────────
function ExportButton({ section }: { section: string }) {
  const [busy, setBusy] = useState(false);
  async function handleExport() {
    setBusy(true);
    try {
      const res = await api.get(`/admin/export/${section}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${section}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
    finally { setBusy(false); }
  }
  return (
    <button className="btn btn-ghost btn-sm adm-export-btn" onClick={() => { void handleExport(); }} disabled={busy}>
      <Download size={13} /> {busy ? 'Exporting…' : 'Export CSV'}
    </button>
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
  const [userSearch,      setUserSearch]      = useState('');
  const [userPlanFilter,  setUserPlanFilter]  = useState<'all' | 'premium' | 'elite'>('all');
  const [userPage,        setUserPage]        = useState(1);
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

  // Withdrawal history state
  const [wdSubTab,         setWdSubTab]         = useState<'pending' | 'history'>('pending');
  const [wdHistory,        setWdHistory]        = useState<AdminWithdrawalHistory[]>([]);
  const [wdHistoryMeta,    setWdHistoryMeta]    = useState({ page: 1, total: 0, limit: 25 });
  const [wdHistoryLoading, setWdHistoryLoading] = useState(false);
  const [wdHistoryPage,    setWdHistoryPage]    = useState(1);
  const [wdFilters,        setWdFilters]        = useState({
    status: '' as string,
    plan:   '' as string,
    search: '' as string,
    date_from: '' as string,
    date_to:   '' as string,
    amount_min: '' as string,
    amount_max: '' as string,
  });
  const [wdExpanded,       setWdExpanded]       = useState<string | null>(null);

  // Enhanced user filters
  const [userStatusFilter, setUserStatusFilter] = useState('');
  const [userDeviceFilter, setUserDeviceFilter] = useState('');
  const [userDateFrom,     setUserDateFrom]     = useState('');
  const [userDateTo,       setUserDateTo]       = useState('');

  // Referrals state
  const [refData,    setRefData]    = useState<AdminReferral[]>([]);
  const [refMeta,    setRefMeta]    = useState({ page: 1, total: 0, limit: 25 });
  const [refLoading, setRefLoading] = useState(false);
  const [refPage,    setRefPage]    = useState(1);
  const [refFilters, setRefFilters] = useState({ search: '', date_from: '', date_to: '' });

  // Notifications state
  const [notifData,    setNotifData]    = useState<AdminNotificationLog[]>([]);
  const [notifMeta,    setNotifMeta]    = useState({ page: 1, total: 0, limit: 25 });
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifPage,    setNotifPage]    = useState(1);
  const [notifFilters, setNotifFilters] = useState({ search: '', status: '', date_from: '', date_to: '' });
  const [notifExpanded, setNotifExpanded] = useState<string | null>(null);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wdSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params: Record<string, string | number> = { page: userPage, limit: 25 };
      if (userSearch)       params.search    = userSearch;
      if (userPlanFilter !== 'all') params.plan = userPlanFilter;
      if (userStatusFilter) params.status    = userStatusFilter;
      if (userDeviceFilter) params.device    = userDeviceFilter;
      if (userDateFrom)     params.date_from = userDateFrom;
      if (userDateTo)       params.date_to   = userDateTo;
      const { data } = await api.get<{
        data: AdminUser[];
        meta: { page: number; total: number; limit: number };
      }>('/admin/users', { params });
      setUsers(data.data);
      setUsersMeta(data.meta);
    } catch {
      toast.error('Failed to load users.');
    } finally {
      setUsersLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPage, userPlanFilter, userStatusFilter, userDeviceFilter, userDateFrom, userDateTo]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

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

  const loadWdHistory = useCallback(async (page: number, filters: typeof wdFilters) => {
    setWdHistoryLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 25 };
      if (filters.status)    params.status    = filters.status;
      if (filters.plan)      params.plan      = filters.plan;
      if (filters.search)    params.search    = filters.search;
      if (filters.date_from)  params.date_from  = filters.date_from;
      if (filters.date_to)    params.date_to    = filters.date_to;
      if (filters.amount_min) params.amount_min = filters.amount_min;
      if (filters.amount_max) params.amount_max = filters.amount_max;

      const { data } = await api.get<{
        data: AdminWithdrawalHistory[];
        meta: { page: number; total: number; limit: number };
      }>('/admin/withdrawals/history', { params });
      setWdHistory(data.data);
      setWdHistoryMeta(data.meta);
    } catch {
      toast.error('Failed to load withdrawal history.');
    } finally {
      setWdHistoryLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (wdSubTab === 'history') void loadWdHistory(wdHistoryPage, wdFilters);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wdSubTab, wdHistoryPage]);

  function handleWdFilterChange(key: string, value: string) {
    const updated = { ...wdFilters, [key]: value };
    setWdFilters(updated);
    if (key === 'search') {
      if (wdSearchDebounceRef.current) clearTimeout(wdSearchDebounceRef.current);
      wdSearchDebounceRef.current = setTimeout(() => {
        setWdHistoryPage(1);
        void loadWdHistory(1, updated);
      }, 400);
    } else {
      setWdHistoryPage(1);
      void loadWdHistory(1, updated);
    }
  }

  async function resetDevice(userId: string) {
    try {
      await api.put(`/admin/users/${userId}/reset-device`);
      toast.success('Device unlinked. User can now log in from any device.');
      // Refresh user details
      setUserDetails((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      void loadUserDetails(userId);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to reset device.');
    }
  }

  // ── Referrals loader ────────────────────────────────────────────────────
  const loadReferrals = useCallback(async (page: number, filters: typeof refFilters) => {
    setRefLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 25 };
      if (filters.search)    params.search    = filters.search;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to)   params.date_to   = filters.date_to;
      const { data } = await api.get<{ data: AdminReferral[]; meta: { page: number; total: number; limit: number } }>('/admin/referrals', { params });
      setRefData(data.data);
      setRefMeta(data.meta);
    } catch { toast.error('Failed to load referrals.'); }
    finally { setRefLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (tab === 'referrals') void loadReferrals(refPage, refFilters); }, [tab, refPage, loadReferrals]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleRefFilterChange(key: string, value: string) {
    const updated = { ...refFilters, [key]: value };
    setRefFilters(updated);
    if (key === 'search') {
      if (refSearchDebounceRef.current) clearTimeout(refSearchDebounceRef.current);
      refSearchDebounceRef.current = setTimeout(() => { setRefPage(1); void loadReferrals(1, updated); }, 400);
    } else { setRefPage(1); void loadReferrals(1, updated); }
  }

  // ── Notifications loader ──────────────────────────────────────────────────
  const loadNotifications = useCallback(async (page: number, filters: typeof notifFilters) => {
    setNotifLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 25 };
      if (filters.search)    params.search    = filters.search;
      if (filters.status)    params.status    = filters.status;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to)   params.date_to   = filters.date_to;
      const { data } = await api.get<{ data: AdminNotificationLog[]; meta: { page: number; total: number; limit: number } }>('/admin/notifications', { params });
      setNotifData(data.data);
      setNotifMeta(data.meta);
    } catch { toast.error('Failed to load notifications.'); }
    finally { setNotifLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (tab === 'notifications') void loadNotifications(notifPage, notifFilters); }, [tab, notifPage, loadNotifications]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleNotifFilterChange(key: string, value: string) {
    const updated = { ...notifFilters, [key]: value };
    setNotifFilters(updated);
    if (key === 'search') {
      if (notifSearchDebounceRef.current) clearTimeout(notifSearchDebounceRef.current);
      notifSearchDebounceRef.current = setTimeout(() => { setNotifPage(1); void loadNotifications(1, updated); }, 400);
    } else { setNotifPage(1); void loadNotifications(1, updated); }
  }

  function handleUserSearch(value: string) {
    setUserSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setUserPage(1);
    }, 400);
  }

  function resetUserFilters() {
    setUserSearch(''); setUserPlanFilter('all'); setUserStatusFilter('');
    setUserDeviceFilter(''); setUserDateFrom(''); setUserDateTo('');
    setUserPage(1);
  }

  function handlePlanFilter(plan: 'all' | 'premium' | 'elite') {
    setUserPlanFilter(plan);
    setUserPage(1);
    setExpandedUser(null);
    // loadUsers will re-fire via the useEffect dependency on userPlanFilter
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
        <WithdrawalRejectModal
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
          {/* Filters */}
          <div className="adm-wd-filters">
            <div className="adm-filter-toolbar">
              <span style={{ fontSize: 13, fontWeight: 600 }}>Filters</span>
              <ExportButton section="users" />
            </div>
            <div className="adm-wd-filter-row">
              <div className="adm-search-wrap" style={{ flex: 1 }}>
                <Search size={15} className="adm-search-icon" />
                <input className="form-input adm-search-input" placeholder="Search username or email…" value={userSearch} onChange={(e) => handleUserSearch(e.target.value)} />
              </div>
              <select className="form-input adm-wd-filter-select" value={userPlanFilter} onChange={(e) => handlePlanFilter(e.target.value as 'all' | 'premium' | 'elite')}>
                <option value="all">All Plans</option>
                <option value="free">Free</option>
                <option value="premium">Premium</option>
                <option value="elite">Elite</option>
              </select>
              <select className="form-input adm-wd-filter-select" value={userStatusFilter} onChange={(e) => { setUserStatusFilter(e.target.value); setUserPage(1); }}>
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="banned">Banned</option>
              </select>
              <select className="form-input adm-wd-filter-select" value={userDeviceFilter} onChange={(e) => { setUserDeviceFilter(e.target.value); setUserPage(1); }}>
                <option value="">All Devices</option>
                <option value="registered">Registered</option>
                <option value="unregistered">Unregistered</option>
              </select>
            </div>
            <div className="adm-wd-filter-row">
              <label className="adm-wd-filter-label">Joined from</label>
              <input type="date" className="form-input adm-wd-filter-date" value={userDateFrom} onChange={(e) => { setUserDateFrom(e.target.value); setUserPage(1); }} />
              <label className="adm-wd-filter-label">to</label>
              <input type="date" className="form-input adm-wd-filter-date" value={userDateTo} onChange={(e) => { setUserDateTo(e.target.value); setUserPage(1); }} />
              <button className="btn btn-ghost btn-sm" onClick={resetUserFilters}>Reset</button>
            </div>
          </div>
          <FilterChips
            filters={{ plan: userPlanFilter !== 'all' ? userPlanFilter : '', status: userStatusFilter, device: userDeviceFilter, from: userDateFrom, to: userDateTo }}
            onRemove={(k) => { if (k === 'plan') setUserPlanFilter('all'); else if (k === 'status') setUserStatusFilter(''); else if (k === 'device') setUserDeviceFilter(''); else if (k === 'from') setUserDateFrom(''); else if (k === 'to') setUserDateTo(''); setUserPage(1); }}
            onClear={resetUserFilters}
          />

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
                      <span className="adm-user-date">
                        Joined {new Date(u.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
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
                                {/* User Info */}
                                <div className="adm-details-section">
                                  <h4 className="adm-details-section-title">
                                    <Users size={13} /> Account Info
                                  </h4>
                                  <div className="adm-details-sub-card">
                                    <span className="adm-details-sub-expiry">
                                      Joined {new Date(u.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                </div>

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
                                        Started {new Date(details.subscription.starts_at).toLocaleDateString('en-PH', {
                                          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                                        })}
                                      </span>
                                      <span className="adm-details-sub-expiry">
                                        Expires {new Date(details.subscription.expires_at).toLocaleDateString('en-PH', {
                                          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
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
                                            {new Date(inv.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
                                              {new Date(wd.requested_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Device Info */}
                                <div className="adm-details-section">
                                  <h4 className="adm-details-section-title">
                                    <Smartphone size={13} /> Registered Device
                                  </h4>
                                  {details.device ? (
                                    <div className="adm-device-card">
                                      <div className="adm-device-info">
                                        <span className="adm-device-name">{details.device.device_name || 'Unknown device'}</span>
                                        <span className="adm-device-fp">ID: {details.device.fingerprint.slice(0, 16)}…</span>
                                        {details.device.registered_at && (
                                          <span className="adm-device-date">
                                            Registered {new Date(details.device.registered_at).toLocaleDateString('en-PH', {
                                              month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                                            })}
                                          </span>
                                        )}
                                      </div>
                                      <button
                                        className="btn btn-danger btn-sm"
                                        onClick={() => { void resetDevice(u.id); }}
                                        title="Unlink device so user can log in from a new device"
                                      >
                                        <RotateCcw size={12} /> Reset
                                      </button>
                                    </div>
                                  ) : (
                                    <p className="adm-details-empty">No device registered.</p>
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
        <>
          {/* Sub-tabs: Pending / History */}
          <div className="adm-details-tabs" style={{ marginBottom: 12 }}>
            <button
              className={`adm-details-tab${wdSubTab === 'pending' ? ' adm-details-tab--active' : ''}`}
              onClick={() => setWdSubTab('pending')}
            >
              <Clock size={13} /> Pending {withdrawals.length > 0 && <span className="adm-tab-badge" style={{ marginLeft: 4 }}>{withdrawals.length}</span>}
            </button>
            <button
              className={`adm-details-tab${wdSubTab === 'history' ? ' adm-details-tab--active' : ''}`}
              onClick={() => setWdSubTab('history')}
            >
              <History size={13} /> All History
            </button>
          </div>

          {/* Pending withdrawals */}
          {wdSubTab === 'pending' && (
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
                      {new Date(w.requested_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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

          {/* Withdrawal history with filters */}
          {wdSubTab === 'history' && (
            <>
              {/* Filters row */}
              <div className="adm-wd-filters">
                <div className="adm-filter-toolbar">
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Filters</span>
                  <ExportButton section="withdrawals" />
                </div>
                <div className="adm-wd-filter-row">
                  <div className="adm-search-wrap" style={{ flex: 1 }}>
                    <Search size={15} className="adm-search-icon" />
                    <input className="form-input adm-search-input" placeholder="Search user…" value={wdFilters.search} onChange={(e) => handleWdFilterChange('search', e.target.value)} />
                  </div>
                  <select className="form-input adm-wd-filter-select" value={wdFilters.status} onChange={(e) => handleWdFilterChange('status', e.target.value)}>
                    <option value="">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="paid">Paid</option>
                    <option value="rejected">Rejected</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <select className="form-input adm-wd-filter-select" value={wdFilters.plan} onChange={(e) => handleWdFilterChange('plan', e.target.value)}>
                    <option value="">All Plans</option>
                    <option value="free">Free</option>
                    <option value="premium">Premium</option>
                    <option value="elite">Elite</option>
                  </select>
                </div>
                <div className="adm-wd-filter-row">
                  <label className="adm-wd-filter-label">From</label>
                  <input type="date" className="form-input adm-wd-filter-date" value={wdFilters.date_from} onChange={(e) => handleWdFilterChange('date_from', e.target.value)} />
                  <label className="adm-wd-filter-label">To</label>
                  <input type="date" className="form-input adm-wd-filter-date" value={wdFilters.date_to} onChange={(e) => handleWdFilterChange('date_to', e.target.value)} />
                  <label className="adm-wd-filter-label">Min ₱</label>
                  <input type="number" className="form-input adm-amount-input" placeholder="0" value={wdFilters.amount_min} onChange={(e) => handleWdFilterChange('amount_min', e.target.value)} />
                  <label className="adm-wd-filter-label">Max ₱</label>
                  <input type="number" className="form-input adm-amount-input" placeholder="∞" value={wdFilters.amount_max} onChange={(e) => handleWdFilterChange('amount_max', e.target.value)} />
                  <button className="btn btn-ghost btn-sm" onClick={() => { setWdFilters({ status: '', plan: '', search: '', date_from: '', date_to: '', amount_min: '', amount_max: '' }); setWdHistoryPage(1); void loadWdHistory(1, { status: '', plan: '', search: '', date_from: '', date_to: '', amount_min: '', amount_max: '' }); }}>Reset</button>
                </div>
              </div>
              <FilterChips
                filters={{ status: wdFilters.status, plan: wdFilters.plan, from: wdFilters.date_from, to: wdFilters.date_to, 'min ₱': wdFilters.amount_min, 'max ₱': wdFilters.amount_max }}
                onRemove={(k) => { const key = k === 'min ₱' ? 'amount_min' : k === 'max ₱' ? 'amount_max' : k === 'from' ? 'date_from' : k === 'to' ? 'date_to' : k; handleWdFilterChange(key, ''); }}
                onClear={() => { setWdFilters({ status: '', plan: '', search: '', date_from: '', date_to: '', amount_min: '', amount_max: '' }); setWdHistoryPage(1); void loadWdHistory(1, { status: '', plan: '', search: '', date_from: '', date_to: '', amount_min: '', amount_max: '' }); }}
              />

              {/* Results */}
              <div className="adm-list" style={{ opacity: wdHistoryLoading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
                {wdHistory.length === 0 && !wdHistoryLoading ? (
                  <div className="empty-state"><p>No withdrawal records found.</p></div>
                ) : wdHistory.map((w) => (
                  <div
                    key={w.id}
                    className={`adm-wd-card adm-wd-card--clickable${wdExpanded === w.id ? ' adm-wd-card--expanded' : ''}`}
                    onClick={() => setWdExpanded(wdExpanded === w.id ? null : w.id)}
                  >
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
                      <span className={`adm-details-wd-status adm-details-wd-status--${w.status}`}>{w.status}</span>
                      <span className={`plan-badge plan-badge--${w.user_plan}`}>{w.user_plan}</span>
                      <span className="adm-wd-date">
                        {new Date(w.requested_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Expanded details */}
                    {wdExpanded === w.id && (
                      <div className="adm-wd-expanded" onClick={(e) => e.stopPropagation()}>
                        <div className="adm-wd-detail-grid">
                          <div className="adm-wd-detail-item">
                            <span className="adm-wd-detail-label">Account Name</span>
                            <span className="adm-wd-detail-value">{w.account_name}</span>
                          </div>
                          <div className="adm-wd-detail-item">
                            <span className="adm-wd-detail-label">Account Number</span>
                            <span className="adm-wd-detail-value" style={{ fontFamily: 'monospace' }}>{w.account_number}</span>
                          </div>
                          <div className="adm-wd-detail-item">
                            <span className="adm-wd-detail-label">Requested Amount</span>
                            <span className="adm-wd-detail-value">₱{Number(w.amount).toFixed(2)}</span>
                          </div>
                          <div className="adm-wd-detail-item">
                            <span className="adm-wd-detail-label">Fee</span>
                            <span className="adm-wd-detail-value">₱{Number(w.fee_amount || 0).toFixed(2)}</span>
                          </div>
                          <div className="adm-wd-detail-item">
                            <span className="adm-wd-detail-label">Net Amount</span>
                            <span className="adm-wd-detail-value">₱{Number(w.net_amount || w.amount).toFixed(2)}</span>
                          </div>
                          <div className="adm-wd-detail-item">
                            <span className="adm-wd-detail-label">User Plan</span>
                            <span className={`plan-badge plan-badge--${w.user_plan}`}>{w.user_plan}</span>
                          </div>
                          <div className="adm-wd-detail-item">
                            <span className="adm-wd-detail-label">Requested At</span>
                            <span className="adm-wd-detail-value">
                              {new Date(w.requested_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {w.processed_at && (
                            <div className="adm-wd-detail-item">
                              <span className="adm-wd-detail-label">Processed At</span>
                              <span className="adm-wd-detail-value">
                                {new Date(w.processed_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          )}
                          {w.rejection_reason && (
                            <div className="adm-wd-detail-item" style={{ gridColumn: '1 / -1' }}>
                              <span className="adm-wd-detail-label">Rejection Reason</span>
                              <span className="adm-wd-detail-value" style={{ color: 'var(--error)' }}>{w.rejection_reason}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {wdHistoryMeta.total > wdHistoryMeta.limit && (
                <div className="adm-pagination">
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={wdHistoryPage <= 1}
                    onClick={() => setWdHistoryPage((p) => p - 1)}
                  >
                    <ChevronLeft size={15} /> Prev
                  </button>
                  <span className="adm-pagination-info">
                    Page {wdHistoryMeta.page} of {Math.ceil(wdHistoryMeta.total / wdHistoryMeta.limit)} · {wdHistoryMeta.total} records
                  </span>
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={wdHistoryPage * wdHistoryMeta.limit >= wdHistoryMeta.total}
                    onClick={() => setWdHistoryPage((p) => p + 1)}
                  >
                    Next <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Referrals ── */}
      {tab === 'referrals' && (
        <>
          <div className="adm-wd-filters">
            <div className="adm-filter-toolbar">
              <span style={{ fontSize: 13, fontWeight: 600 }}>Referral Records</span>
              <ExportButton section="referrals" />
            </div>
            <div className="adm-wd-filter-row">
              <div className="adm-search-wrap" style={{ flex: 1 }}>
                <Search size={15} className="adm-search-icon" />
                <input className="form-input adm-search-input" placeholder="Search referrer or invited user…" value={refFilters.search} onChange={(e) => handleRefFilterChange('search', e.target.value)} />
              </div>
              <label className="adm-wd-filter-label">From</label>
              <input type="date" className="form-input adm-wd-filter-date" value={refFilters.date_from} onChange={(e) => handleRefFilterChange('date_from', e.target.value)} />
              <label className="adm-wd-filter-label">To</label>
              <input type="date" className="form-input adm-wd-filter-date" value={refFilters.date_to} onChange={(e) => handleRefFilterChange('date_to', e.target.value)} />
              <button className="btn btn-ghost btn-sm" onClick={() => { setRefFilters({ search: '', date_from: '', date_to: '' }); setRefPage(1); void loadReferrals(1, { search: '', date_from: '', date_to: '' }); }}>Reset</button>
            </div>
          </div>
          <FilterChips
            filters={{ from: refFilters.date_from, to: refFilters.date_to }}
            onRemove={(k) => handleRefFilterChange(k === 'from' ? 'date_from' : 'date_to', '')}
            onClear={() => { setRefFilters({ search: '', date_from: '', date_to: '' }); setRefPage(1); void loadReferrals(1, { search: '', date_from: '', date_to: '' }); }}
          />
          <div className="adm-list" style={{ opacity: refLoading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
            {refData.length === 0 && !refLoading ? (
              <div className="empty-state"><p>No referral records found.</p></div>
            ) : refData.map((r, i) => (
              <div key={`${r.referrer_id}-${r.invited_username}-${i}`} className="adm-ref-card">
                <div className="adm-ref-user">
                  <span className="adm-ref-username">{r.referrer_username}</span>
                  <span className="adm-ref-email">Referrer · {r.referral_batches_credited} batches</span>
                </div>
                <span className="adm-ref-arrow">→</span>
                <div className="adm-ref-user" style={{ flex: 1 }}>
                  <span className="adm-ref-username">{r.invited_username}</span>
                  <span className="adm-ref-email">{r.invited_email}</span>
                </div>
                <div className="adm-ref-meta">
                  <span className={`plan-badge plan-badge--${r.invited_plan}`}>{r.invited_plan}</span>
                  <span className="adm-ref-date">
                    {new Date(r.invited_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {refMeta.total > refMeta.limit && (
            <div className="adm-pagination">
              <button className="btn btn-sm btn-ghost" disabled={refPage <= 1} onClick={() => setRefPage((p) => p - 1)}><ChevronLeft size={15} /> Prev</button>
              <span className="adm-pagination-info">Page {refMeta.page} of {Math.ceil(refMeta.total / refMeta.limit)} · {refMeta.total} records</span>
              <button className="btn btn-sm btn-ghost" disabled={refPage * refMeta.limit >= refMeta.total} onClick={() => setRefPage((p) => p + 1)}>Next <ChevronRight size={15} /></button>
            </div>
          )}
        </>
      )}

      {/* ── Notifications ── */}
      {tab === 'notifications' && (
        <>
          <div className="adm-wd-filters">
            <div className="adm-filter-toolbar">
              <span style={{ fontSize: 13, fontWeight: 600 }}>Notification Logs</span>
              <ExportButton section="notifications" />
            </div>
            <div className="adm-wd-filter-row">
              <div className="adm-search-wrap" style={{ flex: 1 }}>
                <Search size={15} className="adm-search-icon" />
                <input className="form-input adm-search-input" placeholder="Search user or title…" value={notifFilters.search} onChange={(e) => handleNotifFilterChange('search', e.target.value)} />
              </div>
              <select className="form-input adm-wd-filter-select" value={notifFilters.status} onChange={(e) => handleNotifFilterChange('status', e.target.value)}>
                <option value="">All Status</option>
                <option value="read">Read</option>
                <option value="unread">Unread</option>
              </select>
              <label className="adm-wd-filter-label">From</label>
              <input type="date" className="form-input adm-wd-filter-date" value={notifFilters.date_from} onChange={(e) => handleNotifFilterChange('date_from', e.target.value)} />
              <label className="adm-wd-filter-label">To</label>
              <input type="date" className="form-input adm-wd-filter-date" value={notifFilters.date_to} onChange={(e) => handleNotifFilterChange('date_to', e.target.value)} />
              <button className="btn btn-ghost btn-sm" onClick={() => { setNotifFilters({ search: '', status: '', date_from: '', date_to: '' }); setNotifPage(1); void loadNotifications(1, { search: '', status: '', date_from: '', date_to: '' }); }}>Reset</button>
            </div>
          </div>
          <FilterChips
            filters={{ status: notifFilters.status, from: notifFilters.date_from, to: notifFilters.date_to }}
            onRemove={(k) => handleNotifFilterChange(k === 'from' ? 'date_from' : k === 'to' ? 'date_to' : k, '')}
            onClear={() => { setNotifFilters({ search: '', status: '', date_from: '', date_to: '' }); setNotifPage(1); void loadNotifications(1, { search: '', status: '', date_from: '', date_to: '' }); }}
          />
          <div className="adm-list" style={{ opacity: notifLoading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
            {notifData.length === 0 && !notifLoading ? (
              <div className="empty-state"><p>No notification records found.</p></div>
            ) : notifData.map((n) => (
              <div key={n.id} className="adm-notif-card" onClick={() => setNotifExpanded(notifExpanded === n.id ? null : n.id)}>
                <div className="adm-notif-top">
                  <span className="adm-notif-title">{n.title}</span>
                  <div className="adm-notif-badges">
                    <span className="adm-notif-type">{n.type}</span>
                    <span className={`adm-notif-read ${n.is_read ? 'adm-notif-read--yes' : 'adm-notif-read--no'}`}>
                      {n.is_read ? 'Read' : 'Unread'}
                    </span>
                  </div>
                </div>
                <div className="adm-notif-sub">
                  <span>{n.username}</span>
                  <span>·</span>
                  <span>{new Date(n.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {notifExpanded === n.id && (
                  <div className="adm-notif-body">{n.message}</div>
                )}
              </div>
            ))}
          </div>
          {notifMeta.total > notifMeta.limit && (
            <div className="adm-pagination">
              <button className="btn btn-sm btn-ghost" disabled={notifPage <= 1} onClick={() => setNotifPage((p) => p - 1)}><ChevronLeft size={15} /> Prev</button>
              <span className="adm-pagination-info">Page {notifMeta.page} of {Math.ceil(notifMeta.total / notifMeta.limit)} · {notifMeta.total} records</span>
              <button className="btn btn-sm btn-ghost" disabled={notifPage * notifMeta.limit >= notifMeta.total} onClick={() => setNotifPage((p) => p + 1)}>Next <ChevronRight size={15} /></button>
            </div>
          )}
        </>
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
                    {new Date(k.submitted_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {k.reviewed_at && (
                    <span className="adm-kyc-date">
                      Reviewed {new Date(k.reviewed_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
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
