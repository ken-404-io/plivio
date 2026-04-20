import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Users, CreditCard, UserCheck, ArrowUpCircle,
  Smartphone, RotateCcw, ShieldCheck, ShieldX, Ban, CheckCircle2,
  Coins, Star, Mail, Key, Clock, BookOpen, Pencil, X, Copy, Wallet,
} from 'lucide-react';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import type { AdminUserDetails, AdminUserWithdrawal, AdminPaymentMethod, WithdrawalStatus } from '../../types/index.ts';

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [details, setDetails] = useState<AdminUserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [resettingDevice, setResettingDevice] = useState(false);

  const [editingWd, setEditingWd] = useState<AdminUserWithdrawal | null>(null);
  const [editStatus, setEditStatus] = useState<WithdrawalStatus>('pending');
  const [editReason, setEditReason] = useState('');
  const [savingWd, setSavingWd] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copyToClipboard(text: string, id: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  useEffect(() => {
    if (!id) return;
    async function load() {
      try {
        const { data } = await api.get<AdminUserDetails & { success: boolean }>(
          `/admin/users/${id}/details`,
        );
        setDetails(data);
      } catch {
        toast.error('Failed to load user details.');
        navigate('/admin');
      } finally {
        setLoading(false);
      }
    }
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleResetDevice() {
    if (!id) return;
    setResettingDevice(true);
    try {
      await api.put(`/admin/users/${id}/reset-device`);
      toast.success('Device unlinked. User can now log in from any device.');
      setDetails((prev) =>
        prev ? { ...prev, device: null } : prev,
      );
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          'Failed to reset device.',
      );
    } finally {
      setResettingDevice(false);
    }
  }

  function openEditWd(wd: AdminUserWithdrawal) {
    setEditingWd(wd);
    setEditStatus(wd.status);
    setEditReason(wd.rejection_reason ?? '');
  }

  async function handleSaveWd() {
    if (!editingWd) return;
    setSavingWd(true);
    try {
      await api.patch(`/admin/withdrawals/${editingWd.id}`, {
        status: editStatus,
        rejection_reason: editReason,
      });
      setDetails((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          withdrawals: prev.withdrawals.map((w) =>
            w.id === editingWd.id
              ? { ...w, status: editStatus, rejection_reason: editReason || null }
              : w,
          ),
        };
      });
      toast.success('Withdrawal updated.');
      setEditingWd(null);
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          'Failed to update withdrawal.',
      );
    } finally {
      setSavingWd(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="sk-section">
          <span className="sk sk-line skeleton" style={{ width: 180 }} />
          <span className="sk sk-line--sm skeleton" style={{ width: 120 }} />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="sk-card sk-section" style={{ minHeight: 80, gap: 8, marginBottom: 12 }}>
            <span className="sk sk-line--sm skeleton" style={{ width: '45%' }} />
            <span className="sk sk-line skeleton" style={{ width: '70%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (!details) return null;

  const { user, subscription, invites, withdrawals, device, kyc, quiz_stats, payment_methods = [] } = details as AdminUserDetails & { payment_methods: AdminPaymentMethod[] };

  const kycColor: Record<string, string> = {
    approved: 'var(--success)',
    pending:  'var(--warning)',
    rejected: 'var(--error)',
    none:     'var(--text-muted)',
  };

  return (
    <div className="page">
      {/* Back navigation */}
      <button
        className="btn btn-ghost btn-sm"
        style={{ marginBottom: 16, alignSelf: 'flex-start' }}
        onClick={() => navigate('/admin?tab=users')}
      >
        <ChevronLeft size={15} /> Back to Users
      </button>

      {/* Header */}
      <header className="adm-header" style={{ marginBottom: 16 }}>
        <div className="adm-user-avatar" style={{ width: 48, height: 48, fontSize: 20 }}>
          {user.username[0]?.toUpperCase()}
        </div>
        <div>
          <h1 className="adm-title" style={{ fontSize: 20 }}>{user.username}</h1>
          <p className="adm-subtitle">{user.email}</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`plan-badge plan-badge--${user.plan}`}>{user.plan}</span>
          {user.is_banned ? (
            <span className="adm-status-chip adm-status-chip--banned">
              <Ban size={10} /> Banned
            </span>
          ) : user.is_suspended && user.suspended_until && new Date(user.suspended_until) > new Date() ? (
            <span className="adm-status-chip adm-status-chip--suspended">
              <Clock size={10} /> Suspended until{' '}
              {new Date(user.suspended_until).toLocaleDateString('en-PH', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </span>
          ) : (
            <span className="adm-status-chip adm-status-chip--active">
              <CheckCircle2 size={10} /> Active
            </span>
          )}
        </div>
      </header>

      {/* ── Account Info ── */}
      <div className="adm-details-section" style={{ marginBottom: 16 }}>
        <h4 className="adm-details-section-title"><Users size={13} /> Account Info</h4>
        <div className="adm-wd-detail-grid">
          <div className="adm-wd-detail-item">
            <span className="adm-wd-detail-label">User ID</span>
            <span className="adm-wd-detail-value" style={{ fontFamily: 'monospace', fontSize: 11 }}>{user.id}</span>
          </div>
          <div className="adm-wd-detail-item">
            <span className="adm-wd-detail-label"><Mail size={11} style={{ marginRight: 4 }} />Email</span>
            <span className="adm-wd-detail-value">
              {user.email}{' '}
              {user.is_email_verified
                ? <CheckCircle2 size={11} color="var(--success)" />
                : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>(unverified)</span>}
            </span>
          </div>
          <div className="adm-wd-detail-item">
            <span className="adm-wd-detail-label"><Coins size={11} style={{ marginRight: 4 }} />Balance</span>
            <span className="adm-wd-detail-value">₱{Number(user.balance).toFixed(2)}</span>
          </div>
          <div className="adm-wd-detail-item">
            <span className="adm-wd-detail-label"><Star size={11} style={{ marginRight: 4 }} />Coins</span>
            <span className="adm-wd-detail-value">{Number(user.coins).toLocaleString()}</span>
          </div>
          <div className="adm-wd-detail-item">
            <span className="adm-wd-detail-label">Streak</span>
            <span className="adm-wd-detail-value">{user.streak_count} days</span>
          </div>
          <div className="adm-wd-detail-item">
            <span className="adm-wd-detail-label"><Key size={11} style={{ marginRight: 4 }} />Referral Code</span>
            <span className="adm-wd-detail-value" style={{ fontFamily: 'monospace' }}>{user.referral_code}</span>
          </div>
          <div className="adm-wd-detail-item">
            <span className="adm-wd-detail-label">Verified</span>
            <span className="adm-wd-detail-value">{user.is_verified ? 'Yes' : 'No'}</span>
          </div>
          <div className="adm-wd-detail-item">
            <span className="adm-wd-detail-label">Admin</span>
            <span className="adm-wd-detail-value">{user.is_admin ? 'Yes' : 'No'}</span>
          </div>
          <div className="adm-wd-detail-item">
            <span className="adm-wd-detail-label">Joined</span>
            <span className="adm-wd-detail-value">
              {new Date(user.created_at).toLocaleDateString('en-PH', {
                month: 'long', day: 'numeric', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      </div>

      {/* ── Quiz Activity ── */}
      <div className="adm-details-section" style={{ marginBottom: 16 }}>
        <h4 className="adm-details-section-title"><BookOpen size={13} /> Quiz Activity</h4>
        <div className="adm-wd-detail-grid">
          <div className="adm-wd-detail-item">
            <span className="adm-wd-detail-label">Today — Answered</span>
            <span className="adm-wd-detail-value">{quiz_stats.today_answered.toLocaleString()}</span>
          </div>
          <div className="adm-wd-detail-item">
            <span className="adm-wd-detail-label">Today — Correct</span>
            <span className="adm-wd-detail-value">
              {quiz_stats.today_correct.toLocaleString()}
              {quiz_stats.today_answered > 0 && (
                <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>
                  ({Math.round((quiz_stats.today_correct / quiz_stats.today_answered) * 100)}%)
                </span>
              )}
            </span>
          </div>
          <div className="adm-wd-detail-item">
            <span className="adm-wd-detail-label">Today — Earned</span>
            <span className="adm-wd-detail-value" style={{ color: 'var(--success)', fontWeight: 600 }}>
              ₱{Number(quiz_stats.today_earned).toFixed(2)}
            </span>
          </div>
          <div className="adm-wd-detail-item">
            <span className="adm-wd-detail-label">Lifetime — Answered</span>
            <span className="adm-wd-detail-value">{quiz_stats.total_answered.toLocaleString()}</span>
          </div>
          <div className="adm-wd-detail-item">
            <span className="adm-wd-detail-label">Lifetime — Correct</span>
            <span className="adm-wd-detail-value">
              {quiz_stats.total_correct.toLocaleString()}
              {quiz_stats.total_answered > 0 && (
                <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>
                  ({Math.round((quiz_stats.total_correct / quiz_stats.total_answered) * 100)}%)
                </span>
              )}
            </span>
          </div>
          <div className="adm-wd-detail-item">
            <span className="adm-wd-detail-label">Lifetime — Earned</span>
            <span className="adm-wd-detail-value" style={{ color: 'var(--success)', fontWeight: 600 }}>
              ₱{Number(quiz_stats.total_earned).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* ── KYC ── */}
      <div className="adm-details-section" style={{ marginBottom: 16 }}>
        <h4 className="adm-details-section-title"><ShieldCheck size={13} /> KYC Status</h4>
        {kyc ? (
          <div className="adm-wd-detail-grid">
            <div className="adm-wd-detail-item">
              <span className="adm-wd-detail-label">Status</span>
              <span className="adm-wd-detail-value" style={{ color: kycColor[kyc.status], fontWeight: 600 }}>
                {kyc.status === 'approved' ? <ShieldCheck size={13} style={{ marginRight: 4 }} /> : <ShieldX size={13} style={{ marginRight: 4 }} />}
                {kyc.status}
              </span>
            </div>
            <div className="adm-wd-detail-item">
              <span className="adm-wd-detail-label">ID Type</span>
              <span className="adm-wd-detail-value">{kyc.id_type.replace(/_/g, ' ')}</span>
            </div>
            <div className="adm-wd-detail-item">
              <span className="adm-wd-detail-label">Submitted</span>
              <span className="adm-wd-detail-value">
                {new Date(kyc.submitted_at).toLocaleDateString('en-PH', {
                  month: 'short', day: 'numeric', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
            {kyc.reviewed_at && (
              <div className="adm-wd-detail-item">
                <span className="adm-wd-detail-label">Reviewed</span>
                <span className="adm-wd-detail-value">
                  {new Date(kyc.reviewed_at).toLocaleDateString('en-PH', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            )}
            {kyc.rejection_reason && (
              <div className="adm-wd-detail-item" style={{ gridColumn: '1 / -1' }}>
                <span className="adm-wd-detail-label">Rejection Reason</span>
                <span className="adm-wd-detail-value" style={{ color: 'var(--error)' }}>{kyc.rejection_reason}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="adm-details-empty">No KYC submission on record.</p>
        )}
      </div>

      {/* ── Subscription ── */}
      <div className="adm-details-section" style={{ marginBottom: 16 }}>
        <h4 className="adm-details-section-title"><CreditCard size={13} /> Subscription</h4>
        {subscription ? (
          <div className="adm-details-sub-card">
            <span className={`plan-badge plan-badge--${subscription.plan}`}>{subscription.plan}</span>
            <span className="adm-details-sub-expiry">
              Started {new Date(subscription.starts_at).toLocaleDateString('en-PH', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </span>
            <span className="adm-details-sub-expiry">
              Expires {new Date(subscription.expires_at).toLocaleDateString('en-PH', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        ) : (
          <p className="adm-details-empty">
            No active subscription — currently on <strong>{user.plan}</strong> plan
          </p>
        )}
      </div>

      {/* ── Payment Accounts ── */}
      <div className="adm-details-section" style={{ marginBottom: 16 }}>
        <h4 className="adm-details-section-title"><Wallet size={13} /> GCash / PayPal Accounts ({payment_methods.length})</h4>
        {payment_methods.length === 0 ? (
          <p className="adm-details-empty">No saved payment accounts.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {payment_methods.map((pm) => (
              <div key={pm.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 10, gap: 12,
                background: pm.method === 'gcash' ? 'rgba(0,174,82,0.08)' : 'rgba(0,112,204,0.08)',
                border: `1px solid ${pm.method === 'gcash' ? 'rgba(0,174,82,0.25)' : 'rgba(0,112,204,0.25)'}`,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                      {pm.method.toUpperCase()}
                    </span>
                    {pm.is_default && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--primary)', color: '#fff', borderRadius: 99, padding: '1px 6px' }}>
                        Default
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{pm.account_name}</span>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{pm.account_number}</span>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                  onClick={() => copyToClipboard(pm.account_number, pm.id)}
                  title="Copy account number"
                >
                  {copiedId === pm.id
                    ? <><CheckCircle2 size={13} style={{ color: 'var(--success)' }} /> Copied</>
                    : <><Copy size={13} /> Copy</>}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Invites ── */}
      <div className="adm-details-section" style={{ marginBottom: 16 }}>
        <h4 className="adm-details-section-title"><UserCheck size={13} /> Sent Invites ({invites.length})</h4>
        {invites.length === 0 ? (
          <p className="adm-details-empty">No verified invites yet.</p>
        ) : (
          <div className="adm-details-invites-list">
            {invites.map((inv) => (
              <div key={inv.username} className="adm-details-invite-row">
                <div className="adm-details-invite-avatar">{inv.username[0]?.toUpperCase()}</div>
                <div className="adm-details-invite-info">
                  <span className="adm-details-invite-name">{inv.username}</span>
                  <span className="adm-details-invite-email">{inv.email}</span>
                </div>
                <span className={`plan-badge plan-badge--${inv.plan}`}>{inv.plan}</span>
                <span className="adm-details-invite-date">
                  {new Date(inv.created_at).toLocaleDateString('en-PH', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Withdrawal History ── */}
      <div className="adm-details-section" style={{ marginBottom: 16 }}>
        <h4 className="adm-details-section-title">
          <ArrowUpCircle size={13} /> Withdrawal History ({withdrawals.length})
        </h4>
        {withdrawals.length === 0 ? (
          <p className="adm-details-empty">No withdrawal records.</p>
        ) : (
          <div className="adm-details-wd-list">
            {withdrawals.map((wd) => (
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
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {wd.account_name} · {wd.account_number}
                  </span>
                </div>
                <div className="adm-details-wd-right">
                  <span className={`adm-details-wd-status adm-details-wd-status--${wd.status}`}>
                    {wd.status}
                  </span>
                  <span className="adm-details-wd-date">
                    {new Date(wd.requested_at).toLocaleDateString('en-PH', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  {wd.rejection_reason && (
                    <span style={{ fontSize: 11, color: wd.status === 'paid' ? 'var(--success)' : 'var(--error)' }}>
                      {wd.rejection_reason}
                    </span>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '2px 6px', fontSize: 11, marginTop: 4 }}
                    onClick={() => openEditWd(wd)}
                  >
                    <Pencil size={11} /> Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Device ── */}
      <div className="adm-details-section" style={{ marginBottom: 16 }}>
        <h4 className="adm-details-section-title"><Smartphone size={13} /> Registered Device</h4>
        {device ? (
          <div className="adm-device-card">
            <div className="adm-device-info">
              <span className="adm-device-name">{device.device_name || 'Unknown device'}</span>
              <span className="adm-device-fp">ID: {device.fingerprint.slice(0, 16)}…</span>
              {device.registered_at && (
                <span className="adm-device-date">
                  Registered{' '}
                  {new Date(device.registered_at).toLocaleDateString('en-PH', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              )}
            </div>
            <button
              className="btn btn-danger btn-sm"
              disabled={resettingDevice}
              onClick={() => { void handleResetDevice(); }}
            >
              <RotateCcw size={12} /> {resettingDevice ? 'Resetting…' : 'Reset'}
            </button>
          </div>
        ) : (
          <p className="adm-details-empty">No device registered.</p>
        )}
      </div>

      {/* ── Edit Withdrawal Modal ── */}
      {editingWd && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditingWd(null); }}
        >
          <div style={{
            background: 'var(--surface)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420,
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Edit Withdrawal #{editingWd.id}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingWd(null)}>
                <X size={14} />
              </button>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <strong>{String(editingWd.method).toUpperCase()}</strong> · ₱{Number(editingWd.net_amount || editingWd.amount).toFixed(2)}
              {' · '}{editingWd.account_name} {editingWd.account_number}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Status</label>
              <select
                className="form-input"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as WithdrawalStatus)}
              >
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="paid">Paid</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Reason / Note</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Rejection reason or note (optional)"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingWd(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={savingWd}
                onClick={() => { void handleSaveWd(); }}
              >
                {savingWd ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
