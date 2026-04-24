import { useEffect, useState, useRef, useCallback, Fragment } from 'react';
import {
  Users, ArrowUpCircle, ShieldCheck, TrendingUp,
  UserPlus, LayoutDashboard, Bell, Send, Mail,
  ChevronLeft, ChevronRight, Search, Ban, CheckCircle2,
  XCircle, Eye, Coins, MessageSquare, Clock,
  CreditCard, UserCheck, Info, History, Smartphone, RotateCcw,
  Download, X, Link2, Wifi, RefreshCw, Copy,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import type {
  AdminUser, AdminWithdrawal, AdminWithdrawalHistory, AdminStats,
  AdminKycSubmission, AdminUserDetails, AdminReferral, AdminReferralLeaderboard,
  AdminNotificationLog,
} from '../../types/index.ts';

const TABS = ['overview', 'users', 'subscriptions', 'restricted', 'withdrawals', 'referrals', 'notifications', 'kyc', 'online'] as const;
type Tab = typeof TABS[number];

const TAB_META: Record<Tab, { label: string; Icon: React.ElementType }> = {
  overview:      { label: 'Overview',      Icon: LayoutDashboard },
  users:         { label: 'Users',         Icon: Users           },
  subscriptions: { label: 'Subscriptions', Icon: CreditCard      },
  restricted:    { label: 'Restricted',    Icon: Ban             },
  withdrawals:   { label: 'Withdrawals',   Icon: ArrowUpCircle   },
  referrals:     { label: 'Referrals',     Icon: Link2           },
  notifications: { label: 'Notifications', Icon: Bell            },
  kyc:           { label: 'KYC',           Icon: ShieldCheck     },
  online:        { label: 'Online',        Icon: Wifi            },
};

// ─── KYC rejection modal (predefined reasons + custom) ───────────────────────
const KYC_REJECT_REASONS = [
  'ID photo is blurry or unclear. Please resubmit with a clearer image.',
  'ID has expired. Please submit a valid, non-expired government-issued ID.',
  'Selfie does not clearly match the ID photo. Please retake your selfie.',
  'ID is not fully visible — edges are cut off. Please show the complete ID.',
  'Glare or flash obscures the ID details. Please retake without flash.',
  'The name on the ID does not match your registered account name.',
  'Custom reason…',
] as const;

function RejectModal({ onConfirm, onCancel }: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [custom,   setCustom]   = useState('');

  const isCustom    = selected === 'Custom reason…';
  const finalReason = isCustom ? custom.trim() : selected;

  return (
    <div className="adm-modal-overlay" onClick={onCancel}>
      <div className="adm-modal adm-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3 className="adm-modal-title">KYC Rejection Reason</h3>
        <p className="adm-modal-hint">
          Select a reason — it will be sent to the user by email and in-app notification.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '10px 0' }}>
          {KYC_REJECT_REASONS.map((r) => (
            <label
              key={r}
              className={`adm-reject-option${selected === r ? ' adm-reject-option--selected' : ''}`}
            >
              <input
                type="radio"
                name="kyc-reject-reason"
                value={r}
                checked={selected === r}
                onChange={() => setSelected(r)}
                className="adm-reject-radio"
              />
              <span>{r}</span>
            </label>
          ))}
        </div>

        {isCustom && (
          <textarea
            className="form-input adm-modal-textarea"
            placeholder="Type a custom rejection reason…"
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

// ─── Withdrawal rejection modal (predefined reasons) ─────────────────────────
const WITHDRAWAL_REJECT_REASONS = [
  'The Updated Minimum payout for free plan is 400',
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
            <label
              key={r}
              className={`adm-reject-option${selected === r ? ' adm-reject-option--selected' : ''}`}
            >
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

// ─── Payment history modal (per-user) ────────────────────────────────────────

interface UserPaymentHistoryData {
  user: { id: string; username: string; email: string; plan: string };
  withdrawals: Array<{
    id: string;
    amount: string | number;
    fee_amount: string | number;
    net_amount: string | number;
    method: string;
    status: string;
    account_name: string;
    account_number: string;
    rejection_reason: string | null;
    requested_at: string;
    processed_at: string | null;
  }>;
  stats: {
    total: number;
    total_requested: number;
    total_paid: number;
    count_by_status: Record<string, number>;
  };
}

const STATUS_COLOR: Record<string, string> = {
  paid:       'var(--success)',
  pending:    'var(--warning)',
  processing: 'var(--info, #3b82f6)',
  rejected:   'var(--error)',
  cancelled:  'var(--text-muted)',
};

function UserPaymentHistoryModal({ data, onClose }: {
  data:    UserPaymentHistoryData;
  onClose: () => void;
}) {
  const { user, withdrawals, stats } = data;

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div
        className="adm-modal adm-modal--wide"
        style={{ maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h3 className="adm-modal-title" style={{ marginBottom: 2 }}>
              <History size={15} style={{ marginRight: 6 }} />
              Payment History — {user.username}
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{user.email}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Total Requests', value: stats.total },
            { label: 'Total Requested', value: `₱${Number(stats.total_requested).toFixed(2)}` },
            { label: 'Total Paid Out', value: `₱${Number(stats.total_paid).toFixed(2)}` },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.04))', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Status breakdown */}
        {Object.keys(stats.count_by_status).length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {Object.entries(stats.count_by_status).map(([st, cnt]) => (
              <span
                key={st}
                style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 12,
                  background: 'var(--bg-secondary, rgba(255,255,255,0.06))',
                  color: STATUS_COLOR[st] ?? 'var(--text-secondary)',
                  border: `1px solid ${STATUS_COLOR[st] ?? 'var(--border)'}`,
                  fontWeight: 600,
                  textTransform: 'capitalize',
                }}
              >
                {st}: {cnt}
              </span>
            ))}
          </div>
        )}

        {/* Scrollable list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {withdrawals.length === 0 ? (
            <div className="empty-state"><p>No withdrawal records.</p></div>
          ) : (
            <div className="adm-list">
              {withdrawals.map((w) => (
                <div key={w.id} className="adm-wd-card" style={{ cursor: 'default' }}>
                  <div className="adm-wd-top">
                    <div className="adm-wd-user">
                      <span className="adm-wd-username" style={{ fontSize: 12 }}>
                        {w.method.toUpperCase()} · {w.account_name}
                      </span>
                      <span className="adm-wd-email" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        {w.account_number}
                      </span>
                    </div>
                    <div className="adm-wd-amounts">
                      <div className="adm-wd-amount">₱{Number(w.net_amount || w.amount).toFixed(2)}</div>
                      <div className="adm-wd-amount-sub">
                        Req ₱{Number(w.amount).toFixed(2)} · Fee ₱{Number(w.fee_amount || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="adm-wd-payment" style={{ justifyContent: 'space-between' }}>
                    <span
                      className={`adm-details-wd-status adm-details-wd-status--${w.status}`}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {w.status}
                    </span>
                    <span className="adm-wd-date">
                      {new Date(w.requested_at).toLocaleDateString('en-PH', {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    {w.processed_at && (
                      <span className="adm-wd-date" style={{ color: 'var(--text-muted)' }}>
                        Processed {new Date(w.processed_at).toLocaleDateString('en-PH', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </span>
                    )}
                  </div>
                  {w.rejection_reason && (
                    <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                      Rejected: {w.rejection_reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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

// ─── Email individual user modal ──────────────────────────────────────────────

function EmailUserModal({ username, onSend, onCancel }: {
  username: string;
  onSend:   (subject: string, message: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ subject: '', message: '' });
  const [busy, setBusy] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return;
    setBusy(true);
    await onSend(form.subject, form.message);
    setBusy(false);
  }

  return (
    <div className="adm-modal-overlay" onClick={onCancel}>
      <div className="adm-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="adm-modal-title">
          <Mail size={15} style={{ marginRight: 6 }} />
          Email {username}
        </h3>
        <p style={{ margin: '-4px 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>
          This email will be sent directly to <strong>{username}</strong>'s inbox using the Plivio email template.
        </p>
        <form onSubmit={(e) => { void handle(e); }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="form-input"
            placeholder="Subject"
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            maxLength={200}
            required
            autoFocus
          />
          <textarea
            className="form-input adm-modal-textarea"
            placeholder="Message body — plain text, line breaks are preserved."
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            maxLength={5000}
            rows={6}
            required
            style={{ resize: 'vertical', minHeight: 120 }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
            {form.message.length}/5000
          </span>
          <div className="adm-modal-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={busy || !form.subject.trim() || !form.message.trim()}
            >
              <Send size={13} />
              {busy ? 'Sending…' : 'Send Email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Change Plan modal ────────────────────────────────────────────────────────
function ChangePlanModal({ username, currentPlan, onConfirm, onCancel }: {
  username:    string;
  currentPlan: string;
  onConfirm:   (plan: string, duration_days: number) => void;
  onCancel:    () => void;
}) {
  const [plan,     setPlan]     = useState(currentPlan === 'free' ? 'premium' : currentPlan);
  const [days,     setDays]     = useState(30);
  const [busy,     setBusy]     = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onConfirm(plan, days);
    setBusy(false);
  }

  const isPaid = plan !== 'free';

  return (
    <div className="adm-modal-overlay" onClick={onCancel}>
      <div className="adm-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="adm-modal-title">
          <CreditCard size={15} style={{ marginRight: 6 }} />
          Change Plan — {username}
        </h3>
        <p style={{ margin: '-4px 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
          Current plan: <strong style={{ textTransform: 'capitalize' }}>{currentPlan}</strong>.
          A confirmation email will be sent to the user.
        </p>
        <form onSubmit={(e) => { void handle(e); }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              New Plan
            </label>
            <select
              className="form-input"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            >
              <option value="free">Free</option>
              <option value="premium">Premium</option>
              <option value="elite">Elite</option>
            </select>
          </div>

          {isPaid && (
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Duration (days)
              </label>
              <input
                type="number"
                className="form-input"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value))))}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'block' }}>
                Expires ~{new Date(Date.now() + days * 86_400_000).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          )}

          <div className="adm-modal-actions" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={busy || plan === currentPlan}
            >
              <CreditCard size={13} />
              {busy ? 'Applying…' : 'Apply & Notify'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Ban modal ────────────────────────────────────────────────────────────────
function BanModal({ username, onConfirm, onCancel }: {
  username:  string;
  onConfirm: (reason: string) => void;
  onCancel:  () => void;
}) {
  const PRESETS = [
    'Violating Terms of Service',
    'Fraudulent activity or cheating',
    'Creating multiple accounts',
    'Abuse or harassment of other users',
    'Attempting to manipulate the earning system',
    'Custom reason…',
  ];
  const [selected, setSelected] = useState('');
  const [custom,   setCustom]   = useState('');
  const isCustom   = selected === 'Custom reason…';
  const finalReason = isCustom ? custom.trim() : selected;

  return (
    <div className="adm-modal-overlay" onClick={onCancel}>
      <div className="adm-modal adm-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3 className="adm-modal-title" style={{ color: 'var(--error)' }}>
          <Ban size={15} style={{ marginRight: 6 }} />
          Ban Account — {username}
        </h3>
        <p style={{ margin: '-4px 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
          This is a <strong>permanent</strong> ban. The user will be blocked immediately and shown this reason when they try to log in.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '10px 0' }}>
          {PRESETS.map((r) => (
            <label
              key={r}
              className={`adm-reject-option${selected === r ? ' adm-reject-option--selected' : ''}`}
            >
              <input
                type="radio"
                name="ban-reason"
                value={r}
                checked={selected === r}
                onChange={() => setSelected(r)}
                className="adm-reject-radio"
              />
              <span>{r}</span>
            </label>
          ))}
        </div>

        {isCustom && (
          <textarea
            className="form-input adm-modal-textarea"
            placeholder="Describe the reason for the ban…"
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
            <Ban size={13} /> Confirm Ban
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Suspend modal ────────────────────────────────────────────────────────────
function SuspendModal({ username, onConfirm, onCancel }: {
  username:  string;
  onConfirm: (duration_days: number, reason: string) => void;
  onCancel:  () => void;
}) {
  const DURATION_PRESETS = [
    { label: '1 day',   days: 1  },
    { label: '3 days',  days: 3  },
    { label: '7 days',  days: 7  },
    { label: '14 days', days: 14 },
    { label: '30 days', days: 30 },
    { label: 'Custom…', days: 0  },
  ];
  const REASON_PRESETS = [
    'Suspicious account activity',
    'Violation of community guidelines',
    'Pending fraud investigation',
    'Unusual earning pattern detected',
    'Custom reason…',
  ];

  const [selected,       setSelected]       = useState(7);
  const [custom,         setCustom]         = useState('');
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason,   setCustomReason]   = useState('');

  const isCustomDuration = selected === 0;
  const isCustomReason   = selectedReason === 'Custom reason…';
  const finalDays        = isCustomDuration ? Math.max(1, Math.min(365, Number(custom) || 1)) : selected;
  const finalReason      = isCustomReason ? customReason.trim() : selectedReason;

  return (
    <div className="adm-modal-overlay" onClick={onCancel}>
      <div className="adm-modal adm-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3 className="adm-modal-title">
          <Clock size={15} style={{ marginRight: 6 }} />
          Suspend Account — {username}
        </h3>
        <p style={{ margin: '-4px 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
          The user will be blocked from logging in until the suspension expires. They will see the reason when they try to log in.
        </p>

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
          Duration
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {DURATION_PRESETS.map((p) => (
            <button
              key={p.days}
              className={`btn btn-sm ${selected === p.days ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSelected(p.days)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {isCustomDuration && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              Days (1–365)
            </label>
            <input
              type="number"
              className="form-input"
              min={1}
              max={365}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          </div>
        )}

        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Expires: <strong>
            {new Date(Date.now() + finalDays * 86_400_000).toLocaleDateString('en-PH', {
              month: 'long', day: 'numeric', year: 'numeric',
            })}
          </strong>
        </p>

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
          Reason <span style={{ color: 'var(--error)' }}>*</span>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {REASON_PRESETS.map((r) => (
            <label
              key={r}
              className={`adm-reject-option${selectedReason === r ? ' adm-reject-option--selected' : ''}`}
            >
              <input
                type="radio"
                name="suspend-reason"
                value={r}
                checked={selectedReason === r}
                onChange={() => setSelectedReason(r)}
                className="adm-reject-radio"
              />
              <span>{r}</span>
            </label>
          ))}
        </div>

        {isCustomReason && (
          <textarea
            className="form-input adm-modal-textarea"
            placeholder="Describe the reason for the suspension…"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            rows={3}
            autoFocus
          />
        )}

        <div className="adm-modal-actions">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-danger btn-sm"
            disabled={!finalReason || (isCustomDuration && (!custom || Number(custom) < 1))}
            onClick={() => { if (finalReason) onConfirm(finalDays, finalReason); }}
          >
            <Clock size={13} /> Suspend {finalDays}d
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Unban modal ──────────────────────────────────────────────────────────────
function UnbanModal({ username, onConfirm, onCancel }: {
  username:  string;
  onConfirm: (restoration_message: string, fixes_made: string) => void;
  onCancel:  () => void;
}) {
  const [message, setMessage] = useState('');
  const [fixes,   setFixes]   = useState('');

  return (
    <div className="adm-modal-overlay" onClick={onCancel}>
      <div className="adm-modal adm-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3 className="adm-modal-title" style={{ color: 'var(--success)' }}>
          <CheckCircle2 size={15} style={{ marginRight: 6 }} />
          Lift Ban — {username}
        </h3>
        <p style={{ margin: '-4px 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
          The user will be notified and shown a full-screen message explaining why their account was restored. Both fields are optional but recommended.
        </p>

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
          Message to user
        </label>
        <textarea
          className="form-input adm-modal-textarea"
          placeholder="e.g. After further review, we've determined that your account was banned in error and we sincerely apologise for the inconvenience."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          autoFocus
        />

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', margin: '10px 0 4px' }}>
          What was fixed / resolved
        </label>
        <textarea
          className="form-input adm-modal-textarea"
          placeholder="e.g. The duplicate account flag was removed after identity verification. Your account is now in good standing."
          value={fixes}
          onChange={(e) => setFixes(e.target.value)}
          rows={3}
        />

        <div className="adm-modal-actions" style={{ marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onConfirm(message.trim(), fixes.trim())}
          >
            <CheckCircle2 size={13} /> Lift Ban & Notify
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Unsuspend modal ──────────────────────────────────────────────────────────
const UNSUSPEND_PRESETS = [
  {
    label: 'Invite wrong credit',
    type: 'invite_credit',
    message: 'Your account was temporarily suspended due to an invite credit issue, which has now been reviewed and resolved.',
    fixes: 'The invite credit discrepancy was identified and corrected. Your balance has been adjusted accordingly.',
  },
  {
    label: 'Activity cleared',
    type: 'activity_cleared',
    message: 'After a thorough review of your account activity, no violations were confirmed and your suspension has been lifted.',
    fixes: 'The flagged activity was reviewed and cleared. No policy violations were found during the investigation.',
  },
  {
    label: 'Appeal approved',
    type: 'appeal_approved',
    message: 'Your appeal has been reviewed and approved. The suspension on your account has been lifted.',
    fixes: 'Your appeal was carefully reviewed and accepted by our moderation team.',
  },
];

function UnsuspendModal({ username, onConfirm, onCancel }: {
  username:  string;
  onConfirm: (restoration_message: string, fixes_made: string) => void;
  onCancel:  () => void;
}) {
  const [message,        setMessage]        = useState('');
  const [fixes,          setFixes]          = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  function applyPreset(preset: typeof UNSUSPEND_PRESETS[number]) {
    setSelectedPreset(preset.type);
    setMessage(`[preset:${preset.type}] ${preset.message}`);
    setFixes(preset.fixes);
  }

  return (
    <div className="adm-modal-overlay" onClick={onCancel}>
      <div className="adm-modal adm-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3 className="adm-modal-title" style={{ color: 'var(--success)' }}>
          <CheckCircle2 size={15} style={{ marginRight: 6 }} />
          Lift Suspension — {username}
        </h3>
        <p style={{ margin: '-4px 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
          The user will be notified and shown a full-screen message explaining why their suspension was lifted. Both fields are optional but recommended.
        </p>

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
          Quick presets
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {UNSUSPEND_PRESETS.map((p) => (
            <button
              key={p.type}
              type="button"
              className={`btn btn-sm ${selectedPreset === p.type ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 11 }}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
          Message to user
        </label>
        <textarea
          className="form-input adm-modal-textarea"
          placeholder="e.g. After reviewing your account activity, we have lifted the suspension. Thank you for your patience."
          value={message}
          onChange={(e) => { setMessage(e.target.value); setSelectedPreset(null); }}
          rows={3}
          autoFocus
        />

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', margin: '10px 0 4px' }}>
          What was fixed / resolved
        </label>
        <textarea
          className="form-input adm-modal-textarea"
          placeholder="e.g. The suspicious activity was reviewed and cleared. No violations were confirmed during the investigation period."
          value={fixes}
          onChange={(e) => setFixes(e.target.value)}
          rows={3}
        />

        <div className="adm-modal-actions" style={{ marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onConfirm(message.trim(), fixes.trim())}
          >
            <CheckCircle2 size={13} /> Lift Suspension & Notify
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── KYC auto-approval countdown ─────────────────────────────────────────────
const AUTO_APPROVE_HOURS = 32;

function KycCountdown({ submittedAt }: { submittedAt: string }) {
  function compute() {
    const autoAt = new Date(submittedAt).getTime() + AUTO_APPROVE_HOURS * 60 * 60 * 1000;
    const diff   = autoAt - Date.now();
    if (diff <= 0) return 'Auto-approving soon…';
    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `Auto-approves in ${h}h ${m}m`;
  }

  const [label, setLabel] = useState(compute);

  useEffect(() => {
    const id = setInterval(() => setLabel(compute()), 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedAt]);

  const isImminent = !label.includes('h') || label.startsWith('Auto-approving');
  return (
    <span className="adm-kyc-countdown" style={{ color: isImminent ? 'var(--warning)' : undefined }}>
      <Clock size={11} style={{ marginRight: 3 }} />
      {label}
    </span>
  );
}

// ─── KYC image with auth + lazy loading ─────────────────────────────────────
function KycImage({ kycId, field, alt }: { kycId: string; field: 'id_front' | 'id_selfie'; alt: string }) {
  const [src,     setSrc]     = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const urlRef       = useRef<string | null>(null);

  // Only start fetching when the element scrolls near the viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: '300px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
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
  }, [visible, kycId, field]);

  return (
    <div ref={containerRef}>
      {src ? (
        <a href={src} target="_blank" rel="noreferrer" className="kyc-img-link">
          <img src={src} alt={alt} className="kyc-img-thumb" />
        </a>
      ) : (
        <div className="kyc-img-placeholder">Loading…</div>
      )}
    </div>
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

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (TABS.includes(searchParams.get('tab') as Tab) ? searchParams.get('tab') : 'overview') as Tab;
  const setTab = (t: Tab) => setSearchParams({ tab: t }, { replace: true });
  const [stats,         setStats]         = useState<AdminStats | null>(null);
  const [users,         setUsers]         = useState<AdminUser[]>([]);
  const [usersMeta,     setUsersMeta]     = useState({ page: 1, total: 0, limit: 25 });
  const [usersLoading,  setUsersLoading]  = useState(false);
  const [userSearch,           setUserSearch]           = useState('');
  const [userSearchCommitted,  setUserSearchCommitted]  = useState('');
  const [userPlanFilter,       setUserPlanFilter]       = useState<'all' | 'premium' | 'elite'>('all');
  const [userPage,             setUserPage]             = useState(1);
  const [withdrawals,   setWithdrawals]   = useState<AdminWithdrawal[]>([]);
  const [pendingPlanFilter, setPendingPlanFilter] = useState('');
  const [pendingSearchFilter, setPendingSearchFilter] = useState('');
  const [kycList,       setKycList]       = useState<AdminKycSubmission[]>([]);
  const [loading,       setLoading]       = useState(true);

  const [notifyTarget,     setNotifyTarget]     = useState<{ id: string; username: string } | null>(null);
  const [emailTarget,      setEmailTarget]      = useState<{ id: string; username: string } | null>(null);
  const [changePlanTarget, setChangePlanTarget] = useState<{ id: string; username: string; currentPlan: string } | null>(null);
  const [suspendTarget,    setSuspendTarget]    = useState<{ id: string; username: string } | null>(null);
  const [banTarget,        setBanTarget]        = useState<{ id: string; username: string } | null>(null);
  const [unbanTarget,      setUnbanTarget]      = useState<{ id: string; username: string } | null>(null);
  const [unsuspendTarget,  setUnsuspendTarget]  = useState<{ id: string; username: string } | null>(null);

  // Restricted tab (banned + suspended accounts)
  const [restrictedUsers,   setRestrictedUsers]   = useState<AdminUser[]>([]);
  const [restrictedLoading, setRestrictedLoading] = useState(false);
  const [restrictedPage,    setRestrictedPage]    = useState(1);
  const [restrictedMeta,    setRestrictedMeta]    = useState<{ page: number; total: number; limit: number }>({ page: 1, total: 0, limit: 25 });
  const [broadcasting,  setBroadcasting]  = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '' });
  const [emailBroadcasting,  setEmailBroadcasting]  = useState(false);
  const [emailBroadcastForm, setEmailBroadcastForm] = useState({ subject: '', message: '' });

  const [expandedUser,    setExpandedUser]    = useState<string | null>(null);
  const [userDetailsTab,  setUserDetailsTab]  = useState<Record<string, 'manage' | 'details'>>({});
  const [userDetails,     setUserDetails]     = useState<Record<string, AdminUserDetails>>({});
  const [userDetailsLoad, setUserDetailsLoad] = useState<Record<string, boolean>>({});
  const [adjustDraft,     setAdjustDraft]     = useState<Record<string, { delta: string; plan: string }>>({});

  const [rejectTarget,  setRejectTarget]  = useState<string | null>(null);
  const [wdRejectTarget,setWdRejectTarget]= useState<string | null>(null);
  const [selectedKyc,   setSelectedKyc]   = useState<Set<string>>(new Set());
  const [batchRejectMode, setBatchRejectMode] = useState(false);

  const [copiedWdId, setCopiedWdId] = useState<string | null>(null);
  function copyToClipboard(text: string, id: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedWdId(id);
      setTimeout(() => setCopiedWdId(null), 2000);
    });
  }

  // Withdrawal history state
  const [wdSubTab,         setWdSubTab]         = useState<'pending' | 'history' | 'paid'>('pending');
  const [wdHistory,        setWdHistory]        = useState<AdminWithdrawalHistory[]>([]);
  const [wdHistoryMeta,    setWdHistoryMeta]    = useState({ page: 1, total: 0, limit: 25 });
  const [wdHistoryTotals,  setWdHistoryTotals]  = useState({ total_amount: 0, total_fee: 0, total_net: 0 });
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

  // Paid history tab state
  const [wdPaidList,    setWdPaidList]    = useState<AdminWithdrawalHistory[]>([]);
  const [wdPaidMeta,    setWdPaidMeta]    = useState({ page: 1, total: 0, limit: 25 });
  const [wdPaidTotals,  setWdPaidTotals]  = useState({ total_amount: 0, total_fee: 0, total_net: 0 });
  const [wdPaidLoading, setWdPaidLoading] = useState(false);
  const [wdPaidPage,    setWdPaidPage]    = useState(1);
  const [wdPaidFilters, setWdPaidFilters] = useState({
    plan: '' as string, search: '' as string,
    date_from: '' as string, date_to: '' as string,
    amount_min: '' as string, amount_max: '' as string,
  });
  const [wdPaidExpanded, setWdPaidExpanded] = useState<string | null>(null);
  const [paymentHistoryData,    setPaymentHistoryData]    = useState<UserPaymentHistoryData | null>(null);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);

  // Enhanced user filters
  const [userStatusFilter, setUserStatusFilter] = useState('');
  const [userDeviceFilter, setUserDeviceFilter] = useState('');
  const [userDateFrom,     setUserDateFrom]     = useState('');
  const [userDateTo,       setUserDateTo]       = useState('');

  // Referrals state
  const [refSubTab,  setRefSubTab]  = useState<'leaderboard' | 'records'>('leaderboard');
  const [refData,    setRefData]    = useState<AdminReferral[]>([]);
  const [refMeta,    setRefMeta]    = useState({ page: 1, total: 0, limit: 25 });
  const [refLoading, setRefLoading] = useState(false);
  const [refPage,    setRefPage]    = useState(1);
  const [refFilters, setRefFilters] = useState({ search: '', date_from: '', date_to: '' });

  // Referral leaderboard state
  const [refLbData,     setRefLbData]     = useState<AdminReferralLeaderboard[]>([]);
  const [refLbMeta,     setRefLbMeta]     = useState({ page: 1, total: 0, limit: 25 });
  const [refLbLoading,  setRefLbLoading]  = useState(false);
  const [refLbPage,     setRefLbPage]     = useState(1);
  const [refLbFilters,  setRefLbFilters]  = useState({ search: '', date_from: '', date_to: '' });
  const [refLbSelected, setRefLbSelected] = useState<Set<string>>(new Set());

  // Notifications state
  const [notifData,    setNotifData]    = useState<AdminNotificationLog[]>([]);
  const [notifMeta,    setNotifMeta]    = useState({ page: 1, total: 0, limit: 25 });
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifPage,    setNotifPage]    = useState(1);
  const [notifFilters, setNotifFilters] = useState({ search: '', status: '', date_from: '', date_to: '' });
  const [notifExpanded, setNotifExpanded] = useState<string | null>(null);

  // Online users state
  const [onlineUsers,        setOnlineUsers]        = useState<{ id: string; username: string; email: string; plan: string; last_active_at: string; ad_block_status: 'blocked' | 'allowed' | null }[]>([]);
  const [onlineLoading,      setOnlineLoading]      = useState(false);
  const [onlineLastRefreshed, setOnlineLastRefreshed] = useState<Date | null>(null);
  const onlineIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscriptions state
  const [subsList,    setSubsList]    = useState<{ id: number; plan: 'premium' | 'elite'; starts_at: string; expires_at: string; is_active: boolean; user_id: string; username: string; email: string; is_banned: boolean }[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);

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
    void loadOnlineUsers(); // load count for header pill on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadOnlineUsers = useCallback(async () => {
    setOnlineLoading(true);
    try {
      const { data } = await api.get<{ users: typeof onlineUsers; count: number }>('/admin/online');
      setOnlineUsers(data.users);
      setOnlineLastRefreshed(new Date());
    } catch { /* silent */ }
    finally { setOnlineLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh online list every 30s while the tab is active
  useEffect(() => {
    if (tab === 'online') {
      void loadOnlineUsers();
      onlineIntervalRef.current = setInterval(() => { void loadOnlineUsers(); }, 30_000);
    } else {
      if (onlineIntervalRef.current) { clearInterval(onlineIntervalRef.current); onlineIntervalRef.current = null; }
    }
    return () => { if (onlineIntervalRef.current) clearInterval(onlineIntervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadSubscriptions = useCallback(async () => {
    setSubsLoading(true);
    try {
      const { data } = await api.get<{ subscriptions: typeof subsList }>('/admin/subscriptions');
      setSubsList(data.subscriptions);
    } catch {
      toast.error('Failed to load subscriptions.');
    } finally {
      setSubsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'subscriptions') void loadSubscriptions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params: Record<string, string | number> = { page: userPage, limit: 25 };
      if (userSearchCommitted) params.search    = userSearchCommitted;
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
  }, [userPage, userPlanFilter, userStatusFilter, userDeviceFilter, userDateFrom, userDateTo, userSearchCommitted]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const loadRestricted = useCallback(async () => {
    setRestrictedLoading(true);
    try {
      const { data } = await api.get<{
        data: AdminUser[];
        meta: { page: number; total: number; limit: number };
      }>('/admin/users', { params: { page: restrictedPage, limit: 25, status: 'restricted' } });
      setRestrictedUsers(data.data);
      setRestrictedMeta(data.meta);
    } catch {
      toast.error('Failed to load restricted accounts.');
    } finally {
      setRestrictedLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restrictedPage]);

  useEffect(() => {
    if (tab === 'restricted') void loadRestricted();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, loadRestricted]);

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
        totals: { total_amount: number; total_fee: number; total_net: number };
      }>('/admin/withdrawals/history', { params });
      setWdHistory(data.data);
      setWdHistoryMeta(data.meta);
      if (data.totals) setWdHistoryTotals(data.totals);
    } catch {
      toast.error('Failed to load withdrawal history.');
    } finally {
      setWdHistoryLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadWdPaidHistory = useCallback(async (page: number, filters: typeof wdPaidFilters) => {
    setWdPaidLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 25, status: 'paid' };
      if (filters.plan)       params.plan       = filters.plan;
      if (filters.search)     params.search     = filters.search;
      if (filters.date_from)  params.date_from  = filters.date_from;
      if (filters.date_to)    params.date_to    = filters.date_to;
      if (filters.amount_min) params.amount_min = filters.amount_min;
      if (filters.amount_max) params.amount_max = filters.amount_max;

      const { data } = await api.get<{
        data: AdminWithdrawalHistory[];
        meta: { page: number; total: number; limit: number };
        totals: { total_amount: number; total_fee: number; total_net: number };
      }>('/admin/withdrawals/history', { params });
      setWdPaidList(data.data);
      setWdPaidMeta(data.meta);
      if (data.totals) setWdPaidTotals(data.totals);
    } catch {
      toast.error('Failed to load paid history.');
    } finally {
      setWdPaidLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (wdSubTab === 'history') void loadWdHistory(wdHistoryPage, wdFilters);
    if (wdSubTab === 'paid')    void loadWdPaidHistory(wdPaidPage, wdPaidFilters);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wdSubTab, wdHistoryPage, wdPaidPage]);

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

  const paidSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleWdPaidFilterChange(key: string, value: string) {
    const updated = { ...wdPaidFilters, [key]: value };
    setWdPaidFilters(updated);
    if (key === 'search') {
      if (paidSearchDebounceRef.current) clearTimeout(paidSearchDebounceRef.current);
      paidSearchDebounceRef.current = setTimeout(() => {
        setWdPaidPage(1);
        void loadWdPaidHistory(1, updated);
      }, 400);
    } else {
      setWdPaidPage(1);
      void loadWdPaidHistory(1, updated);
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

  const loadRefLeaderboard = useCallback(async (page: number, filters: typeof refLbFilters) => {
    setRefLbLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 25 };
      if (filters.search)    params.search    = filters.search;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to)   params.date_to   = filters.date_to;
      const { data } = await api.get<{ data: AdminReferralLeaderboard[]; meta: { page: number; total: number; limit: number } }>('/admin/referrals/leaderboard', { params });
      setRefLbData(data.data);
      setRefLbMeta(data.meta);
    } catch { toast.error('Failed to load leaderboard.'); }
    finally { setRefLbLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab !== 'referrals') return;
    if (refSubTab === 'leaderboard') void loadRefLeaderboard(refLbPage, refLbFilters);
    else void loadReferrals(refPage, refFilters);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, refSubTab, refPage, refLbPage]);

  const refLbSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleRefFilterChange(key: string, value: string) {
    const updated = { ...refFilters, [key]: value };
    setRefFilters(updated);
    if (key === 'search') {
      if (refSearchDebounceRef.current) clearTimeout(refSearchDebounceRef.current);
      refSearchDebounceRef.current = setTimeout(() => { setRefPage(1); void loadReferrals(1, updated); }, 400);
    } else { setRefPage(1); void loadReferrals(1, updated); }
  }

  function handleRefLbFilterChange(key: string, value: string) {
    const updated = { ...refLbFilters, [key]: value };
    setRefLbFilters(updated);
    if (key === 'search') {
      if (refLbSearchDebounceRef.current) clearTimeout(refLbSearchDebounceRef.current);
      refLbSearchDebounceRef.current = setTimeout(() => { setRefLbPage(1); void loadRefLeaderboard(1, updated); }, 400);
    } else { setRefLbPage(1); void loadRefLeaderboard(1, updated); }
  }

  function handleRefLbSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (refLbSearchDebounceRef.current) clearTimeout(refLbSearchDebounceRef.current);
      setRefLbPage(1);
      void loadRefLeaderboard(1, refLbFilters);
    }
  }

  function handleRefSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (refSearchDebounceRef.current) clearTimeout(refSearchDebounceRef.current);
      setRefPage(1);
      void loadReferrals(1, refFilters);
    }
  }

  function toggleRefLbSelect(id: string) {
    setRefLbSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleRefLbSelectAll() {
    if (refLbSelected.size === refLbData.length) {
      setRefLbSelected(new Set());
    } else {
      setRefLbSelected(new Set(refLbData.map((r) => r.referrer_id)));
    }
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
      setUserSearchCommitted(value);
      setUserPage(1);
    }, 400);
  }

  function executeUserSearch() {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setUserSearchCommitted(userSearch);
    setUserPage(1);
  }

  function resetUserFilters() {
    setUserSearch(''); setUserSearchCommitted(''); setUserPlanFilter('all'); setUserStatusFilter('');
    setUserDeviceFilter(''); setUserDateFrom(''); setUserDateTo('');
    setUserPage(1);
  }

  function handlePlanFilter(plan: 'all' | 'premium' | 'elite') {
    setUserPlanFilter(plan);
    setUserPage(1);
    setExpandedUser(null);
    // loadUsers will re-fire via the useEffect dependency on userPlanFilter
  }

  async function handleBan(userId: string, reason: string) {
    try {
      await api.post(`/admin/users/${userId}/ban`, { action: 'ban', reason });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_banned: true, ban_reason: reason } : u));
      setRestrictedUsers((prev) => {
        const existing = prev.find((u) => u.id === userId);
        if (existing) {
          return prev.map((u) => u.id === userId ? { ...u, is_banned: true, ban_reason: reason } : u);
        }
        // Row wasn't in the restricted list yet (e.g. banned from Users tab) — tab will refetch on next view
        return prev;
      });
      setBanTarget(null);
      toast.success('Account banned.');
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Action failed.');
    }
  }

  async function handleUnban(userId: string, restoration_message?: string, fixes_made?: string) {
    try {
      await api.post(`/admin/users/${userId}/ban`, { action: 'unban', restoration_message, fixes_made });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_banned: false } : u));
      setRestrictedUsers((prev) => prev.filter((u) => u.id !== userId));
      setRestrictedMeta((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
      setUnbanTarget(null);
      toast.success('Account unbanned. User has been notified.');
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Action failed.');
    }
  }

  async function handleSuspend(userId: string, duration_days: number, reason: string) {
    try {
      const { data } = await api.post<{ is_suspended: boolean; suspended_until: string | null }>(
        `/admin/users/${userId}/suspend`,
        { action: 'suspend', duration_days, reason },
      );
      setUsers((prev) => prev.map((u) =>
        u.id === userId ? { ...u, is_suspended: data.is_suspended, suspended_until: data.suspended_until, suspend_reason: reason } : u,
      ));
      setRestrictedUsers((prev) => prev.map((u) =>
        u.id === userId ? { ...u, is_suspended: data.is_suspended, suspended_until: data.suspended_until, suspend_reason: reason } : u,
      ));
      setSuspendTarget(null);
      const until = data.suspended_until
        ? new Date(data.suspended_until).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
        : '';
      toast.success(`Account suspended until ${until}.`);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Action failed.');
    }
  }

  async function handleUnsuspend(userId: string, restoration_message?: string, fixes_made?: string) {
    try {
      await api.post(`/admin/users/${userId}/suspend`, { action: 'unsuspend', restoration_message, fixes_made });
      setUsers((prev) => prev.map((u) =>
        u.id === userId ? { ...u, is_suspended: false, suspended_until: null } : u,
      ));
      setRestrictedUsers((prev) => prev.filter((u) => u.id !== userId));
      setRestrictedMeta((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
      setUnsuspendTarget(null);
      toast.success('Suspension lifted. User has been notified.');
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

  async function sendUserEmail(userId: string, subject: string, message: string) {
    try {
      const { data } = await api.post<{ sent_to: string }>(`/admin/users/${userId}/email`, { subject, message });
      toast.success(`Email sent to ${data.sent_to}`);
      setEmailTarget(null);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to send email.');
    }
  }

  async function handleChangePlan(userId: string, plan: string, duration_days: number) {
    try {
      const { data } = await api.post<{ success: boolean; plan: string; expires_at: string | null }>(
        `/admin/users/${userId}/change-plan`,
        { plan, duration_days },
      );
      setUsers((prev) => prev.map((u) =>
        u.id === userId ? { ...u, plan: data.plan as AdminUser['plan'] } : u,
      ));
      // Also clear cached details so they reload fresh
      setUserDetails((prev) => { const n = { ...prev }; delete n[userId]; return n; });
      const expiryMsg = data.expires_at
        ? ` · expires ${new Date(data.expires_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : '';
      toast.success(`Plan changed to ${data.plan}${expiryMsg}. Confirmation email sent.`);
      setChangePlanTarget(null);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to change plan.');
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

  async function sendEmailBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!emailBroadcastForm.subject.trim() || !emailBroadcastForm.message.trim()) return;
    setEmailBroadcasting(true);
    try {
      const { data } = await api.post<{ sending_to: number }>('/admin/email-everyone', emailBroadcastForm);
      toast.success(`Email queued for ${data.sending_to} users.`);
      setEmailBroadcastForm({ subject: '', message: '' });
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Email broadcast failed.');
    } finally {
      setEmailBroadcasting(false);
    }
  }

  async function openPaymentHistory(userId: string) {
    setPaymentHistoryLoading(true);
    try {
      const { data } = await api.get<UserPaymentHistoryData>(`/admin/users/${userId}/payment-history`);
      setPaymentHistoryData(data);
    } catch {
      toast.error('Failed to load payment history.');
    } finally {
      setPaymentHistoryLoading(false);
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
      toast.success(`KYC ${action}d.`);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Action failed.');
    }
  }

  async function batchReviewKyc(ids: string[], action: 'approve' | 'reject', reason?: string) {
    try {
      await Promise.all(ids.map((id) =>
        api.put(`/admin/kyc/${id}`, { action, rejection_reason: reason }),
      ));
      setKycList((prev) => prev.filter((k) => !ids.includes(k.id)));
      setSelectedKyc(new Set());
      toast.success(`${ids.length} KYC submission${ids.length > 1 ? 's' : ''} ${action}d.`);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Batch action failed.');
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

  // Shared Manage/Details expanded panel — rendered from both the Users tab
  // and the Restricted tab so the two tabs expose identical per-user admin
  // affordances (balance adjustment, plan change, account info, withdrawals,
  // device reset).
  function renderUserManagePanel(u: AdminUser) {
    const draft = adjustDraft[u.id] ?? { delta: '', plan: '' };
    const activeTab = userDetailsTab[u.id] ?? 'manage';
    const details   = userDetails[u.id];
    const detLoading = userDetailsLoad[u.id];

    function switchTab(nextTab: 'manage' | 'details') {
      setUserDetailsTab((prev) => ({ ...prev, [u.id]: nextTab }));
      if (nextTab === 'details') void loadUserDetails(u.id);
    }

    return (
      <div className="adm-user-manage">
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
              <label className="adm-manage-label">Plan</label>
              <div className="adm-manage-input-row">
                <span className="adm-manage-hint" style={{ marginLeft: 0 }}>
                  Current: <span className={`plan-badge plan-badge--${u.plan}`}>{u.plan}</span>
                </span>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => setChangePlanTarget({ id: u.id, username: u.username, currentPlan: u.plan })}
                >
                  <CreditCard size={13} /> Change Plan
                </button>
              </div>
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
                disabled={!draft.delta}
              >
                Apply changes
              </button>
            </div>
          </>
        )}

        {activeTab === 'details' && (
          <div className="adm-details-panel">
            {detLoading && <p className="adm-details-loading">Loading…</p>}
            {!detLoading && details && (
              <>
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
      {batchRejectMode && (
        <RejectModal
          onConfirm={(reason) => { void batchReviewKyc([...selectedKyc], 'reject', reason); setBatchRejectMode(false); }}
          onCancel={() => setBatchRejectMode(false)}
        />
      )}
      {wdRejectTarget && (
        <WithdrawalRejectModal
          onConfirm={(reason) => { void processWithdrawal(wdRejectTarget, 'reject', reason); setWdRejectTarget(null); }}
          onCancel={() => setWdRejectTarget(null)}
        />
      )}
      {paymentHistoryData && (
        <UserPaymentHistoryModal
          data={paymentHistoryData}
          onClose={() => setPaymentHistoryData(null)}
        />
      )}
      {notifyTarget && (
        <NotifyModal
          username={notifyTarget.username}
          onSend={(title, message, link) => sendNotification(notifyTarget.id, title, message, link)}
          onCancel={() => setNotifyTarget(null)}
        />
      )}
      {emailTarget && (
        <EmailUserModal
          username={emailTarget.username}
          onSend={(subject, message) => sendUserEmail(emailTarget.id, subject, message)}
          onCancel={() => setEmailTarget(null)}
        />
      )}
      {changePlanTarget && (
        <ChangePlanModal
          username={changePlanTarget.username}
          currentPlan={changePlanTarget.currentPlan}
          onConfirm={(plan, days) => void handleChangePlan(changePlanTarget.id, plan, days)}
          onCancel={() => setChangePlanTarget(null)}
        />
      )}
      {suspendTarget && (
        <SuspendModal
          username={suspendTarget.username}
          onConfirm={(days, reason) => void handleSuspend(suspendTarget.id, days, reason)}
          onCancel={() => setSuspendTarget(null)}
        />
      )}
      {banTarget && (
        <BanModal
          username={banTarget.username}
          onConfirm={(reason) => void handleBan(banTarget.id, reason)}
          onCancel={() => setBanTarget(null)}
        />
      )}
      {unbanTarget && (
        <UnbanModal
          username={unbanTarget.username}
          onConfirm={(msg, fixes) => void handleUnban(unbanTarget.id, msg, fixes)}
          onCancel={() => setUnbanTarget(null)}
        />
      )}
      {unsuspendTarget && (
        <UnsuspendModal
          username={unsuspendTarget.username}
          onConfirm={(msg, fixes) => void handleUnsuspend(unsuspendTarget.id, msg, fixes)}
          onCancel={() => setUnsuspendTarget(null)}
        />
      )}

      {/* Header + tab bar + KYC batch toolbar — sticky */}
      <div className="adm-sticky-top">
        <header className="adm-header">
          <div>
            <h1 className="adm-title">Admin Panel</h1>
            <p className="adm-subtitle">{new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
          <div className="adm-header-actions">
            <button
              className="adm-online-pill"
              onClick={() => setTab('online')}
              title="View online users"
            >
              <span className="adm-online-dot" />
              <Wifi size={13} />
              <span>{onlineUsers.length} online</span>
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { void loadOnlineUsers(); }}
              disabled={onlineLoading}
              title="Refresh online count"
              style={{ padding: '5px 8px' }}
            >
              <RefreshCw size={13} className={onlineLoading ? 'spin' : ''} />
            </button>
          </div>
        </header>

        {/* KYC batch select toolbar — only visible on the KYC tab */}
        {tab === 'kyc' && kycList.length > 0 && (
          <div className="adm-batch-toolbar">
            <label className="adm-batch-select-all">
              <input
                type="checkbox"
                checked={selectedKyc.size === kycList.length}
                onChange={(e) => setSelectedKyc(e.target.checked ? new Set(kycList.map((k) => k.id)) : new Set())}
              />
              <span>Select all ({kycList.length})</span>
            </label>
            {selectedKyc.size > 0 && (
              <>
                <span className="adm-batch-count">{selectedKyc.size} selected</span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => void batchReviewKyc([...selectedKyc], 'approve')}
                >
                  <CheckCircle2 size={13} /> Approve {selectedKyc.size}
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => setBatchRejectMode(true)}
                >
                  <XCircle size={13} /> Reject {selectedKyc.size}
                </button>
              </>
            )}
          </div>
        )}
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

          {/* Broadcast notification */}
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

          {/* Email broadcast */}
          <div className="adm-section">
            <div className="adm-section-header">
              <Mail size={15} />
              <h2 className="adm-section-title">Send Email to Everyone</h2>
            </div>
            <p className="adm-section-hint">Send an email to all verified, active users. Emails are sent in the background.</p>
            <form onSubmit={(e) => { void sendEmailBroadcast(e); }} className="adm-broadcast-form">
              <input
                className="form-input"
                placeholder="Subject"
                value={emailBroadcastForm.subject}
                onChange={(e) => setEmailBroadcastForm((f) => ({ ...f, subject: e.target.value }))}
                maxLength={200}
                required
              />
              <textarea
                className="form-input"
                placeholder="Message (supports line breaks)"
                value={emailBroadcastForm.message}
                onChange={(e) => setEmailBroadcastForm((f) => ({ ...f, message: e.target.value }))}
                maxLength={5000}
                rows={5}
                required
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={emailBroadcasting || !emailBroadcastForm.subject.trim() || !emailBroadcastForm.message.trim()}
              >
                <Mail size={14} />
                {emailBroadcasting ? 'Queueing…' : 'Send email to all users'}
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
                <input
                  className="form-input adm-search-input"
                  placeholder="Search username or email…"
                  value={userSearch}
                  onChange={(e) => handleUserSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') executeUserSearch(); }}
                />
              </div>
              <button className="btn btn-primary btn-sm" onClick={executeUserSearch}>
                <Search size={13} /> Search
              </button>
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
                <option value="suspended">Suspended</option>
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
              return (
                <div key={u.id} className={`adm-user-row${isExpanded ? ' adm-user-row--expanded' : ''}`}>
                  {/* Main row */}
                  <div className="adm-user-main">
                    <div className="adm-user-avatar">
                      {u.username[0]?.toUpperCase()}
                    </div>
                    <div className="adm-user-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <span className="adm-user-name">{u.username}</span>
                        {(() => {
                          const isOnline = !!u.last_active_at && (Date.now() - new Date(u.last_active_at).getTime()) < 5 * 60 * 1000;
                          const lastSeenLabel = u.last_active_at
                            ? (() => {
                                const secsAgo = Math.floor((Date.now() - new Date(u.last_active_at).getTime()) / 1000);
                                if (secsAgo < 60) return `${secsAgo}s ago`;
                                if (secsAgo < 3600) return `${Math.floor(secsAgo / 60)}m ago`;
                                if (secsAgo < 86400) return `${Math.floor(secsAgo / 3600)}h ago`;
                                return `${Math.floor(secsAgo / 86400)}d ago`;
                              })()
                            : 'Never';
                          return (
                            <span
                              title={isOnline ? 'Online now' : `Last seen: ${lastSeenLabel}`}
                              style={{
                                width: 7, height: 7, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
                                background: isOnline ? '#22c55e' : '#6b7280',
                                boxShadow: isOnline ? '0 0 4px #22c55e' : undefined,
                              }}
                            />
                          );
                        })()}
                        {u.ad_block_status === 'blocked' && (
                          <span
                            title="Ad blocker or filtering DNS detected"
                            style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 10,
                              background: 'rgba(234,179,8,0.15)', color: '#eab308',
                              border: '1px solid rgba(234,179,8,0.35)', fontWeight: 600,
                              flexShrink: 0, whiteSpace: 'nowrap',
                            }}
                          >
                            Ad Blocker
                          </span>
                        )}
                      </div>
                      <span className="adm-user-email">{u.email}</span>
                      <span className="adm-user-date">
                        Joined {new Date(u.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="adm-user-badges">
                      <span className={`plan-badge plan-badge--${u.plan}`}>{u.plan}</span>
                      {u.is_banned ? (
                        <span className="adm-status-chip adm-status-chip--banned">
                          <Ban size={10} /> Banned
                        </span>
                      ) : u.is_suspended && u.suspended_until && new Date(u.suspended_until) > new Date() ? (
                        <span className="adm-status-chip adm-status-chip--suspended">
                          <Clock size={10} /> Suspended
                        </span>
                      ) : (
                        <span className="adm-status-chip adm-status-chip--active">
                          <CheckCircle2 size={10} /> Active
                        </span>
                      )}
                    </div>
                    <span className="adm-user-balance">₱{Number(u.balance).toFixed(2)}</span>
                    <div className="adm-user-actions">
                      <Link
                        to={`/admin/users/${u.id}`}
                        className="adm-icon-btn"
                        title="View all details"
                      >
                        <Eye size={14} />
                      </Link>
                      <button
                        className="adm-icon-btn"
                        onClick={() => setNotifyTarget({ id: u.id, username: u.username })}
                        title="Send in-app notification"
                      >
                        <Bell size={14} />
                      </button>
                      <button
                        className="adm-icon-btn"
                        onClick={() => setEmailTarget({ id: u.id, username: u.username })}
                        title="Send email"
                      >
                        <Mail size={14} />
                      </button>
                      <button
                        className={`adm-icon-btn${isExpanded ? ' adm-icon-btn--active' : ''}`}
                        onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                        title="Manage user"
                      >
                        <ChevronRight size={14} style={{ transform: isExpanded ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s' }} />
                      </button>
                      {u.is_suspended && u.suspended_until && new Date(u.suspended_until) > new Date() ? (
                        <button
                          className="adm-action-btn adm-action-btn--unban"
                          onClick={() => setUnsuspendTarget({ id: u.id, username: u.username })}
                          title="Lift suspension"
                        >
                          Unsuspend
                        </button>
                      ) : (
                        <button
                          className="adm-action-btn adm-action-btn--suspend"
                          onClick={() => setSuspendTarget({ id: u.id, username: u.username })}
                          title="Suspend account temporarily"
                        >
                          Suspend
                        </button>
                      )}
                      {u.is_banned ? (
                        <button
                          className="adm-action-btn adm-action-btn--unban"
                          onClick={() => setUnbanTarget({ id: u.id, username: u.username })}
                          title="Lift permanent ban"
                        >
                          Unban
                        </button>
                      ) : (
                        <button
                          className="adm-action-btn adm-action-btn--ban"
                          onClick={() => setBanTarget({ id: u.id, username: u.username })}
                          title="Permanently ban this account"
                        >
                          Ban
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Manage/Details panel */}
                  {isExpanded && renderUserManagePanel(u)}
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

      {/* ── Subscriptions ── */}
      {tab === 'subscriptions' && (
        <div className="adm-section">
          <div className="adm-section-header" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CreditCard size={15} />
              <h2 className="adm-section-title">Subscriptions</h2>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { void loadSubscriptions(); }}
              disabled={subsLoading}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <RefreshCw size={13} className={subsLoading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
          <p className="adm-section-hint">All users who have subscribed, newest to oldest. Separated by plan tier.</p>

          {subsLoading && subsList.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Loading…
            </div>
          ) : (
            <>
              {/* Elite */}
              {(() => {
                const eliteList = subsList.filter((s) => s.plan === 'elite');
                return (
                  <div style={{ marginBottom: 32 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 10px' }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>Elite Members</span>
                      <span style={{
                        background: 'var(--plan-elite, #7c3aed)',
                        color: '#fff',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '1px 8px',
                      }}>
                        {eliteList.length}
                      </span>
                    </div>
                    {eliteList.length === 0 ? (
                      <div className="empty-state"><p>No elite subscribers yet.</p></div>
                    ) : (
                      <div className="adm-table-wrap">
                        <table className="adm-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Username</th>
                              <th>Email</th>
                              <th>Started</th>
                              <th>Expires</th>
                              <th>Status</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {eliteList.map((s, i) => (
                              <tr key={s.id}>
                                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                                <td>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <strong>{s.username}</strong>
                                    {s.is_banned && <span className="adm-plan-badge" style={{ background: 'var(--error)', color: '#fff', fontSize: 10 }}>banned</span>}
                                  </span>
                                </td>
                                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{s.email}</td>
                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                  {new Date(s.starts_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                  {new Date(s.expires_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td>
                                  {s.is_active
                                    ? <span style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600 }}>Active</span>
                                    : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Expired</span>}
                                </td>
                                <td>
                                  <Link to={`/admin/users/${s.user_id}`} className="btn btn-ghost btn-sm">
                                    <Eye size={13} /> View
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Premium */}
              {(() => {
                const premiumList = subsList.filter((s) => s.plan === 'premium');
                return (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px' }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>Premium Members</span>
                      <span style={{
                        background: 'var(--plan-premium, #2563eb)',
                        color: '#fff',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '1px 8px',
                      }}>
                        {premiumList.length}
                      </span>
                    </div>
                    {premiumList.length === 0 ? (
                      <div className="empty-state"><p>No premium subscribers yet.</p></div>
                    ) : (
                      <div className="adm-table-wrap">
                        <table className="adm-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Username</th>
                              <th>Email</th>
                              <th>Started</th>
                              <th>Expires</th>
                              <th>Status</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {premiumList.map((s, i) => (
                              <tr key={s.id}>
                                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                                <td>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <strong>{s.username}</strong>
                                    {s.is_banned && <span className="adm-plan-badge" style={{ background: 'var(--error)', color: '#fff', fontSize: 10 }}>banned</span>}
                                  </span>
                                </td>
                                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{s.email}</td>
                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                  {new Date(s.starts_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                  {new Date(s.expires_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td>
                                  {s.is_active
                                    ? <span style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600 }}>Active</span>
                                    : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Expired</span>}
                                </td>
                                <td>
                                  <Link to={`/admin/users/${s.user_id}`} className="btn btn-ghost btn-sm">
                                    <Eye size={13} /> View
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ── Withdrawals ── */}
      {tab === 'withdrawals' && (
        <>
          {/* Quick info message */}
          <div className="adm-section-hint adm-info-banner" style={{ marginBottom: 12 }}>
            <Info size={13} style={{ flexShrink: 0, marginRight: 6 }} />
            <span>
              Approve or reject withdrawal requests below. You can also <strong>suspend</strong> or <strong>ban</strong> an account directly from a pending request if you detect suspicious activity.
            </span>
          </div>

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
            <button
              className={`adm-details-tab${wdSubTab === 'paid' ? ' adm-details-tab--active' : ''}`}
              onClick={() => setWdSubTab('paid')}
            >
              <CheckCircle2 size={13} /> Paid History
            </button>
          </div>

          {/* Pending withdrawals */}
          {wdSubTab === 'pending' && (
            <>
              <div className="adm-wd-filters" style={{ marginBottom: 12 }}>
                <div className="adm-wd-filter-row">
                  <div className="adm-search-wrap" style={{ flex: 1 }}>
                    <Search size={14} className="adm-search-icon" />
                    <input
                      className="form-input adm-search-input"
                      placeholder="Search by username…"
                      value={pendingSearchFilter}
                      onChange={(e) => setPendingSearchFilter(e.target.value)}
                    />
                    {pendingSearchFilter && (
                      <button className="adm-search-clear" onClick={() => setPendingSearchFilter('')}>×</button>
                    )}
                  </div>
                  <select
                    className="form-input adm-wd-filter-select"
                    value={pendingPlanFilter}
                    onChange={(e) => setPendingPlanFilter(e.target.value)}
                  >
                    <option value="">All Plans</option>
                    <option value="free">Free</option>
                    <option value="premium">Premium</option>
                    <option value="elite">Elite</option>
                  </select>
                  {(pendingPlanFilter || pendingSearchFilter) && (
                    <button className="btn btn-ghost btn-sm" onClick={() => { setPendingPlanFilter(''); setPendingSearchFilter(''); }}>Reset</button>
                  )}
                </div>
              </div>
            <div className="adm-list">
              {(() => {
                const filtered = withdrawals.filter((w) =>
                  (!pendingPlanFilter || w.user_plan === pendingPlanFilter) &&
                  (!pendingSearchFilter || w.username.toLowerCase().includes(pendingSearchFilter.toLowerCase()))
                );
                return filtered.length === 0 ? (
                  <div className="empty-state"><p>No pending withdrawals.</p></div>
                ) : filtered.map((w) => (
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
                    <span className={`plan-badge plan-badge--${w.user_plan}`}>{w.user_plan}</span>
                    <span className="adm-wd-date">
                      {new Date(w.requested_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {/* GCash / PayPal account info — prominent embed for admin review */}
                  <div style={{
                    margin: '6px 0 4px',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(0,174,82,0.08)',
                    border: '1px solid rgba(0,174,82,0.22)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {w.method.toUpperCase()} Account
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{w.account_name}</span>
                      <span style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{w.account_number}</span>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                      onClick={() => copyToClipboard(w.account_number, w.id)}
                      title="Copy account number"
                    >
                      {copiedWdId === w.id
                        ? <><CheckCircle2 size={13} style={{ color: 'var(--success)' }} /> Copied</>
                        : <><Copy size={13} /> Copy</>}
                    </button>
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
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={paymentHistoryLoading}
                      onClick={() => { void openPaymentHistory(w.user_id); }}
                      title="View full payment history for this user"
                    >
                      <History size={13} /> History
                    </button>
                    <Link
                      to={`/admin/users/${w.user_id}`}
                      className="btn btn-ghost btn-sm"
                      title="View full user profile"
                    >
                      <Eye size={13} /> View User
                    </Link>
                    <div className="adm-wd-divider" />
                    <button
                      className="adm-action-btn adm-action-btn--suspend"
                      onClick={() => setSuspendTarget({ id: w.user_id, username: w.username })}
                      title="Temporarily suspend this user's account"
                    >
                      Suspend
                    </button>
                    <button
                      className="adm-action-btn adm-action-btn--ban"
                      onClick={() => setBanTarget({ id: w.user_id, username: w.username })}
                      title="Permanently ban this user's account"
                    >
                      Ban
                    </button>
                  </div>
                </div>
              ));
              })()}
            </div>
            </>
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

              {/* Totals bar */}
              {wdHistoryMeta.total > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                  {[
                    { label: 'Matched Records', value: wdHistoryMeta.total.toString() },
                    { label: 'Total Requested', value: `₱${Number(wdHistoryTotals.total_amount).toFixed(2)}` },
                    { label: 'Total Net Paid', value: `₱${Number(wdHistoryTotals.total_net).toFixed(2)}` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.04))', borderRadius: 8, padding: '8px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}

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
                        <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={paymentHistoryLoading}
                            onClick={() => { void openPaymentHistory(w.user_id); }}
                          >
                            <History size={13} /> Payment History
                          </button>
                          <Link
                            to={`/admin/users/${w.user_id}`}
                            className="btn btn-ghost btn-sm"
                          >
                            <Eye size={13} /> View Full Profile
                          </Link>
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

          {/* ── Paid History tab ── */}
          {wdSubTab === 'paid' && (
            <>
              {/* Filters */}
              <div className="adm-wd-filters">
                <div className="adm-filter-toolbar">
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Filters</span>
                  <ExportButton section="withdrawals" />
                </div>
                <div className="adm-wd-filter-row">
                  <div className="adm-search-wrap" style={{ flex: 1 }}>
                    <Search size={15} className="adm-search-icon" />
                    <input className="form-input adm-search-input" placeholder="Search user…" value={wdPaidFilters.search} onChange={(e) => handleWdPaidFilterChange('search', e.target.value)} />
                  </div>
                  <select className="form-input adm-wd-filter-select" value={wdPaidFilters.plan} onChange={(e) => handleWdPaidFilterChange('plan', e.target.value)}>
                    <option value="">All Plans</option>
                    <option value="free">Free</option>
                    <option value="premium">Premium</option>
                    <option value="elite">Elite</option>
                  </select>
                </div>
                <div className="adm-wd-filter-row">
                  <label className="adm-wd-filter-label">From</label>
                  <input type="date" className="form-input adm-wd-filter-date" value={wdPaidFilters.date_from} onChange={(e) => handleWdPaidFilterChange('date_from', e.target.value)} />
                  <label className="adm-wd-filter-label">To</label>
                  <input type="date" className="form-input adm-wd-filter-date" value={wdPaidFilters.date_to} onChange={(e) => handleWdPaidFilterChange('date_to', e.target.value)} />
                  <label className="adm-wd-filter-label">Min ₱</label>
                  <input type="number" className="form-input adm-amount-input" placeholder="0" value={wdPaidFilters.amount_min} onChange={(e) => handleWdPaidFilterChange('amount_min', e.target.value)} />
                  <label className="adm-wd-filter-label">Max ₱</label>
                  <input type="number" className="form-input adm-amount-input" placeholder="∞" value={wdPaidFilters.amount_max} onChange={(e) => handleWdPaidFilterChange('amount_max', e.target.value)} />
                  <button className="btn btn-ghost btn-sm" onClick={() => { const empty = { plan: '', search: '', date_from: '', date_to: '', amount_min: '', amount_max: '' }; setWdPaidFilters(empty); setWdPaidPage(1); void loadWdPaidHistory(1, empty); }}>Reset</button>
                </div>
              </div>
              <FilterChips
                filters={{ plan: wdPaidFilters.plan, from: wdPaidFilters.date_from, to: wdPaidFilters.date_to, 'min ₱': wdPaidFilters.amount_min, 'max ₱': wdPaidFilters.amount_max }}
                onRemove={(k) => { const key = k === 'min ₱' ? 'amount_min' : k === 'max ₱' ? 'amount_max' : k === 'from' ? 'date_from' : k === 'to' ? 'date_to' : k; handleWdPaidFilterChange(key, ''); }}
                onClear={() => { const empty = { plan: '', search: '', date_from: '', date_to: '', amount_min: '', amount_max: '' }; setWdPaidFilters(empty); setWdPaidPage(1); void loadWdPaidHistory(1, empty); }}
              />

              {/* Totals summary */}
              {(wdPaidMeta.total > 0 || !wdPaidLoading) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                  {[
                    { label: 'Paid Records',     value: wdPaidMeta.total.toString() },
                    { label: 'Total Requested',  value: `₱${Number(wdPaidTotals.total_amount).toFixed(2)}` },
                    { label: 'Total Fees',        value: `₱${Number(wdPaidTotals.total_fee).toFixed(2)}` },
                    { label: 'Total Disbursed',  value: `₱${Number(wdPaidTotals.total_net).toFixed(2)}` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.04))', borderRadius: 8, padding: '8px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: label === 'Total Disbursed' ? 'var(--success)' : undefined }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* List */}
              <div className="adm-list" style={{ opacity: wdPaidLoading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
                {wdPaidList.length === 0 && !wdPaidLoading ? (
                  <div className="empty-state"><p>No paid withdrawals found.</p></div>
                ) : wdPaidList.map((w) => (
                  <div
                    key={w.id}
                    className={`adm-wd-card adm-wd-card--clickable${wdPaidExpanded === w.id ? ' adm-wd-card--expanded' : ''}`}
                    onClick={() => setWdPaidExpanded(wdPaidExpanded === w.id ? null : w.id)}
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
                      <span className="adm-details-wd-status adm-details-wd-status--paid">paid</span>
                      <span className={`plan-badge plan-badge--${w.user_plan}`}>{w.user_plan}</span>
                      <span className="adm-wd-date">
                        {new Date(w.requested_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {wdPaidExpanded === w.id && (
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
                            <span className="adm-wd-detail-label">Net Disbursed</span>
                            <span className="adm-wd-detail-value" style={{ color: 'var(--success)', fontWeight: 700 }}>₱{Number(w.net_amount || w.amount).toFixed(2)}</span>
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
                              <span className="adm-wd-detail-label">Paid At</span>
                              <span className="adm-wd-detail-value">
                                {new Date(w.processed_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          )}
                        </div>
                        <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={paymentHistoryLoading}
                            onClick={() => { void openPaymentHistory(w.user_id); }}
                          >
                            <History size={13} /> Payment History
                          </button>
                          <Link
                            to={`/admin/users/${w.user_id}`}
                            className="btn btn-ghost btn-sm"
                          >
                            <Eye size={13} /> View Full Profile
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {wdPaidMeta.total > wdPaidMeta.limit && (
                <div className="adm-pagination">
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={wdPaidPage <= 1}
                    onClick={() => setWdPaidPage((p) => p - 1)}
                  >
                    <ChevronLeft size={15} /> Prev
                  </button>
                  <span className="adm-pagination-info">
                    Page {wdPaidMeta.page} of {Math.ceil(wdPaidMeta.total / wdPaidMeta.limit)} · {wdPaidMeta.total} records
                  </span>
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={wdPaidPage * wdPaidMeta.limit >= wdPaidMeta.total}
                    onClick={() => setWdPaidPage((p) => p + 1)}
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
          {/* Sub-tabs */}
          <div className="adm-details-tabs" style={{ marginBottom: 12 }}>
            <button
              className={`adm-details-tab${refSubTab === 'leaderboard' ? ' adm-details-tab--active' : ''}`}
              onClick={() => setRefSubTab('leaderboard')}
            >
              <TrendingUp size={13} /> Leaderboard
            </button>
            <button
              className={`adm-details-tab${refSubTab === 'records' ? ' adm-details-tab--active' : ''}`}
              onClick={() => setRefSubTab('records')}
            >
              <History size={13} /> Records
            </button>
          </div>

          {/* ── Leaderboard sub-tab ── */}
          {refSubTab === 'leaderboard' && (
            <>
              <div className="adm-wd-filters">
                <div className="adm-filter-toolbar">
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    Referral Leaderboard
                    {refLbMeta.total > 0 && <span className="adm-tab-badge" style={{ marginLeft: 8 }}>{refLbMeta.total}</span>}
                  </span>
                  {refLbSelected.size > 0 && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{refLbSelected.size} selected</span>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          const first = refLbData.find((r) => refLbSelected.has(r.referrer_id));
                          if (first) setBanTarget({ id: first.referrer_id, username: first.referrer_username });
                        }}
                      >
                        <Ban size={13} /> Ban
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const first = refLbData.find((r) => refLbSelected.has(r.referrer_id));
                          if (first) setSuspendTarget({ id: first.referrer_id, username: first.referrer_username });
                        }}
                      >
                        <Clock size={13} /> Suspend
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const first = refLbData.find((r) => refLbSelected.has(r.referrer_id));
                          if (first) setNotifyTarget({ id: first.referrer_id, username: first.referrer_username });
                        }}
                      >
                        <Bell size={13} /> Message
                      </button>
                    </div>
                  )}
                </div>
                <div className="adm-wd-filter-row">
                  <div className="adm-search-wrap" style={{ flex: 1 }}>
                    <Search size={15} className="adm-search-icon" />
                    <input
                      className="form-input adm-search-input"
                      placeholder="Search referrer… (Enter or auto)"
                      value={refLbFilters.search}
                      onChange={(e) => handleRefLbFilterChange('search', e.target.value)}
                      onKeyDown={handleRefLbSearchKey}
                    />
                  </div>
                  <label className="adm-wd-filter-label">From</label>
                  <input type="date" className="form-input adm-wd-filter-date" value={refLbFilters.date_from} onChange={(e) => handleRefLbFilterChange('date_from', e.target.value)} />
                  <label className="adm-wd-filter-label">To</label>
                  <input type="date" className="form-input adm-wd-filter-date" value={refLbFilters.date_to} onChange={(e) => handleRefLbFilterChange('date_to', e.target.value)} />
                  <button className="btn btn-ghost btn-sm" onClick={() => { const e = { search: '', date_from: '', date_to: '' }; setRefLbFilters(e); setRefLbPage(1); void loadRefLeaderboard(1, e); }}>Reset</button>
                </div>
              </div>
              <FilterChips
                filters={{ from: refLbFilters.date_from, to: refLbFilters.date_to }}
                onRemove={(k) => handleRefLbFilterChange(k === 'from' ? 'date_from' : 'date_to', '')}
                onClear={() => { const e = { search: '', date_from: '', date_to: '' }; setRefLbFilters(e); setRefLbPage(1); void loadRefLeaderboard(1, e); }}
              />

              {/* Select-all row */}
              {refLbData.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', marginBottom: 4 }}>
                  <input
                    type="checkbox"
                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary)' }}
                    checked={refLbSelected.size === refLbData.length && refLbData.length > 0}
                    onChange={toggleRefLbSelectAll}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {refLbSelected.size === refLbData.length && refLbData.length > 0 ? 'Deselect all' : 'Select all on page'}
                  </span>
                </div>
              )}

              <div className="adm-list" style={{ opacity: refLbLoading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
                {refLbData.length === 0 && !refLbLoading ? (
                  <div className="empty-state"><p>No referrers found.</p></div>
                ) : refLbData.map((r, i) => {
                  const rank = (refLbPage - 1) * refLbMeta.limit + i + 1;
                  const isSelected = refLbSelected.has(r.referrer_id);
                  return (
                    <div
                      key={r.referrer_id}
                      className="adm-ref-card"
                      style={{ alignItems: 'center', gap: 10, background: isSelected ? 'var(--primary-alpha, rgba(99,102,241,0.08))' : undefined }}
                    >
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--primary)' }}
                        checked={isSelected}
                        onChange={() => toggleRefLbSelect(r.referrer_id)}
                        onClick={(e) => e.stopPropagation()}
                      />

                      {/* Rank badge */}
                      <div style={{
                        minWidth: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 800, flexShrink: 0,
                        background: rank === 1 ? '#f59e0b' : rank === 2 ? '#94a3b8' : rank === 3 ? '#cd7c4f' : 'var(--bg-secondary, rgba(255,255,255,0.08))',
                        color: rank <= 3 ? '#fff' : 'var(--text-secondary)',
                      }}>
                        {rank}
                      </div>

                      {/* User info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span className="adm-ref-username">{r.referrer_username}</span>
                          <span className={`plan-badge plan-badge--${r.referrer_plan}`}>{r.referrer_plan}</span>
                          {r.is_banned && <span style={{ fontSize: 10, background: 'var(--error)', color: '#fff', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>BANNED</span>}
                          {!r.is_banned && r.is_suspended && r.suspended_until && new Date(r.suspended_until) > new Date() && (
                            <span style={{ fontSize: 10, background: 'var(--warning)', color: '#fff', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>SUSPENDED</span>
                          )}
                        </div>
                        <span className="adm-ref-email">{r.referrer_email}</span>
                      </div>

                      {/* Referral count */}
                      <div style={{ textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{r.referral_count}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>referrals</div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Send message"
                          onClick={() => setNotifyTarget({ id: r.referrer_id, username: r.referrer_username })}
                        >
                          <MessageSquare size={13} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Suspend user"
                          onClick={() => setSuspendTarget({ id: r.referrer_id, username: r.referrer_username })}
                        >
                          <Clock size={13} />
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          title="Ban user"
                          onClick={() => setBanTarget({ id: r.referrer_id, username: r.referrer_username })}
                        >
                          <Ban size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {refLbMeta.total > refLbMeta.limit && (
                <div className="adm-pagination">
                  <button className="btn btn-sm btn-ghost" disabled={refLbPage <= 1} onClick={() => setRefLbPage((p) => p - 1)}><ChevronLeft size={15} /> Prev</button>
                  <span className="adm-pagination-info">Page {refLbMeta.page} of {Math.ceil(refLbMeta.total / refLbMeta.limit)} · {refLbMeta.total} referrers</span>
                  <button className="btn btn-sm btn-ghost" disabled={refLbPage * refLbMeta.limit >= refLbMeta.total} onClick={() => setRefLbPage((p) => p + 1)}>Next <ChevronRight size={15} /></button>
                </div>
              )}
            </>
          )}

          {/* ── Records sub-tab ── */}
          {refSubTab === 'records' && (
            <>
              <div className="adm-wd-filters">
                <div className="adm-filter-toolbar">
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Referral Records</span>
                  <ExportButton section="referrals" />
                </div>
                <div className="adm-wd-filter-row">
                  <div className="adm-search-wrap" style={{ flex: 1 }}>
                    <Search size={15} className="adm-search-icon" />
                    <input
                      className="form-input adm-search-input"
                      placeholder="Search referrer or invited user… (Enter or auto)"
                      value={refFilters.search}
                      onChange={(e) => handleRefFilterChange('search', e.target.value)}
                      onKeyDown={handleRefSearchKey}
                    />
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
                      <span className="adm-ref-email">Referrer</span>
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
        <>
          <div className="adm-list">
            {kycList.length === 0 ? (
              <div className="empty-state"><p>No pending KYC submissions.</p></div>
            ) : kycList.map((k) => (
              <div key={k.id} className={`adm-kyc-card${selectedKyc.has(k.id) ? ' adm-kyc-card--selected' : ''}`}>
                <div className="adm-kyc-top">
                  <label className="adm-kyc-check">
                    <input
                      type="checkbox"
                      checked={selectedKyc.has(k.id)}
                      onChange={(e) => setSelectedKyc((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(k.id); else next.delete(k.id);
                        return next;
                      })}
                    />
                  </label>
                  <div className="adm-kyc-user">
                    <span className="adm-kyc-username">{k.username}</span>
                    <span className="adm-kyc-email">{k.email}</span>
                    {k.status === 'pending' && (
                      <KycCountdown submittedAt={k.submitted_at} />
                    )}
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

                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <Link
                    to={`/admin/users/${k.user_id}`}
                    className="adm-docs-toggle"
                    style={{ textDecoration: 'none' }}
                  >
                    <Users size={13} /> View all user info
                  </Link>
                </div>

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
        </>
      )}

      {/* ── Restricted (banned + suspended) ── */}
      {tab === 'restricted' && (
        <div className="adm-section">
          <div className="adm-section-header" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Ban size={15} style={{ color: 'var(--danger)' }} />
              <h2 className="adm-section-title">
                Restricted Accounts
                <span style={{
                  marginLeft: 8,
                  background: 'var(--danger)',
                  color: '#fff',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '1px 8px',
                }}>
                  {restrictedMeta.total}
                </span>
              </h2>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { void loadRestricted(); }}
              disabled={restrictedLoading}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <RefreshCw size={13} className={restrictedLoading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
          <p className="adm-section-hint">Banned or currently-suspended accounts. Use the actions to reinstate.</p>

          {restrictedLoading && restrictedUsers.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Loading…
            </div>
          ) : restrictedUsers.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              No restricted accounts.
            </div>
          ) : (
            <>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Reason</th>
                      <th>Until</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {restrictedUsers.map((u) => {
                      const suspendedActive = u.is_suspended && u.suspended_until && new Date(u.suspended_until) > new Date();
                      const until = suspendedActive && u.suspended_until
                        ? new Date(u.suspended_until).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—';
                      const reason = u.is_banned ? (u.ban_reason ?? '—') : (u.suspend_reason ?? '—');
                      const isExpanded = expandedUser === u.id;
                      return (
                        <Fragment key={u.id}>
                          <tr>
                            <td><strong>{u.username}</strong></td>
                            <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{u.email}</td>
                            <td>
                              {u.is_banned ? (
                                <span className="adm-status-chip adm-status-chip--banned">
                                  <Ban size={10} /> Banned
                                </span>
                              ) : (
                                <span className="adm-status-chip adm-status-chip--suspended">
                                  <Clock size={10} /> Suspended
                                </span>
                              )}
                            </td>
                            <td style={{ fontSize: 13, maxWidth: 280, whiteSpace: 'normal' }}>{reason}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{until}</td>
                            <td>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <Link
                                  to={`/admin/users/${u.id}`}
                                  className="adm-icon-btn"
                                  title="View all details"
                                >
                                  <Eye size={14} />
                                </Link>
                                <button
                                  className="adm-icon-btn"
                                  onClick={() => setNotifyTarget({ id: u.id, username: u.username })}
                                  title="Send in-app notification"
                                >
                                  <Bell size={14} />
                                </button>
                                <button
                                  className="adm-icon-btn"
                                  onClick={() => setEmailTarget({ id: u.id, username: u.username })}
                                  title="Send email"
                                >
                                  <Mail size={14} />
                                </button>
                                <button
                                  className={`adm-icon-btn${isExpanded ? ' adm-icon-btn--active' : ''}`}
                                  onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                                  title="Manage user"
                                >
                                  <ChevronRight size={14} style={{ transform: isExpanded ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s' }} />
                                </button>
                                {u.is_banned ? (
                                  <button
                                    className="adm-action-btn adm-action-btn--unban"
                                    onClick={() => setUnbanTarget({ id: u.id, username: u.username })}
                                    title="Lift permanent ban"
                                  >
                                    Unban
                                  </button>
                                ) : (
                                  <button
                                    className="adm-action-btn adm-action-btn--unban"
                                    onClick={() => setUnsuspendTarget({ id: u.id, username: u.username })}
                                    title="Lift suspension"
                                  >
                                    Unsuspend
                                  </button>
                                )}
                                {u.is_banned ? (
                                  <button
                                    className="adm-action-btn adm-action-btn--suspend"
                                    onClick={() => setSuspendTarget({ id: u.id, username: u.username })}
                                    title="Replace ban with a timed suspension"
                                  >
                                    Suspend
                                  </button>
                                ) : (
                                  <button
                                    className="adm-action-btn adm-action-btn--ban"
                                    onClick={() => setBanTarget({ id: u.id, username: u.username })}
                                    title="Escalate to a permanent ban"
                                  >
                                    Ban
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={6} style={{ padding: 0, background: 'var(--bg-elevated)' }}>
                                {renderUserManagePanel(u)}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {restrictedMeta.total > restrictedMeta.limit && (
                <div className="adm-pagination" style={{ marginTop: 12 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={restrictedPage <= 1 || restrictedLoading}
                    onClick={() => setRestrictedPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={13} /> Prev
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Page {restrictedMeta.page} of {Math.max(1, Math.ceil(restrictedMeta.total / restrictedMeta.limit))}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={restrictedPage * restrictedMeta.limit >= restrictedMeta.total || restrictedLoading}
                    onClick={() => setRestrictedPage((p) => p + 1)}
                  >
                    Next <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Online ── */}
      {tab === 'online' && (
        <div className="adm-section">
          <div className="adm-section-header" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Wifi size={15} style={{ color: 'var(--success)' }} />
              <h2 className="adm-section-title">
                Online Now
                <span style={{
                  marginLeft: 8,
                  background: 'var(--success)',
                  color: '#fff',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '1px 8px',
                }}>
                  {onlineUsers.length}
                </span>
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {onlineLastRefreshed && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Updated {onlineLastRefreshed.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { void loadOnlineUsers(); }}
                disabled={onlineLoading}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <RefreshCw size={13} className={onlineLoading ? 'spin' : ''} />
                Refresh
              </button>
            </div>
          </div>
          <p className="adm-section-hint">Users who pinged the server in the last 5 minutes. Auto-refreshes every 30 seconds.</p>

          {onlineLoading && onlineUsers.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Loading…
            </div>
          ) : onlineUsers.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              No users online right now.
            </div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Plan</th>
                    <th>Last Active</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {onlineUsers.map((u, i) => {
                    const secsAgo = Math.floor((Date.now() - new Date(u.last_active_at).getTime()) / 1000);
                    const ago = secsAgo < 60
                      ? `${secsAgo}s ago`
                      : `${Math.floor(secsAgo / 60)}m ${secsAgo % 60}s ago`;
                    return (
                      <tr key={u.id}>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                        <td>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 4px var(--success)', flexShrink: 0 }} />
                            <strong>{u.username}</strong>
                            {u.ad_block_status === 'blocked' && (
                              <span
                                title="Ad blocker or filtering DNS detected"
                                style={{
                                  fontSize: 10, padding: '1px 6px', borderRadius: 10,
                                  background: 'rgba(234,179,8,0.15)', color: '#eab308',
                                  border: '1px solid rgba(234,179,8,0.35)', fontWeight: 600,
                                  flexShrink: 0, whiteSpace: 'nowrap',
                                }}
                              >
                                Ad Blocker
                              </span>
                            )}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{u.email}</td>
                        <td>
                          <span className={`adm-plan-badge adm-plan-badge--${u.plan}`}>
                            {u.plan}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ago}</td>
                        <td>
                          <Link to={`/admin/users/${u.id}`} className="btn btn-ghost btn-sm">
                            <Eye size={13} /> View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
