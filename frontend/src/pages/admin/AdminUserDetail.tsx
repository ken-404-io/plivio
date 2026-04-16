import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Users, CreditCard, UserCheck, ArrowUpCircle,
  Smartphone, RotateCcw, ShieldCheck, ShieldX, Ban, CheckCircle2,
  Coins, Star, Mail, Key, Clock,
} from 'lucide-react';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import type { AdminUserDetails } from '../../types/index.ts';

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [details, setDetails] = useState<AdminUserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [resettingDevice, setResettingDevice] = useState(false);

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

  const { user, subscription, invites, withdrawals, device, kyc } = details;

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
                    <span style={{ fontSize: 11, color: 'var(--error)' }}>
                      {wd.rejection_reason}
                    </span>
                  )}
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
    </div>
  );
}
