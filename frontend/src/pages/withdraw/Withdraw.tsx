import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Smartphone, CreditCard, Banknote, XCircle, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import BackButton from '../../components/common/BackButton.tsx';
import type { Withdrawal } from '../../types/index.ts';

// ─── Constants ─────────────────────────────────────────────────────────────────

const MIN_AMOUNT    = 50;
const MAX_AMOUNT    = 5000;
const GCASH_RE      = /^09\d{9}$/;
const PAYPAL_EMAIL  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  pending:    { label: 'Pending',    icon: <Clock      size={13} />, color: 'var(--warning)' },
  processing: { label: 'Processing', icon: <Clock      size={13} />, color: 'var(--accent)'  },
  paid:       { label: 'Paid',       icon: <CheckCircle2 size={13} />, color: 'var(--success)' },
  rejected:   { label: 'Rejected',   icon: <AlertCircle  size={13} />, color: 'var(--error)'   },
  cancelled:  { label: 'Cancelled',  icon: <XCircle      size={13} />, color: 'var(--text-muted)' },
};

interface WithdrawForm {
  amount:         string;
  method:         'gcash' | 'paypal';
  account_name:   string;
  account_number: string;
}

// ─── Confirmation modal ────────────────────────────────────────────────────────

interface ConfirmProps {
  form: WithdrawForm;
  onConfirm: () => void;
  onCancel:  () => void;
  loading:   boolean;
}

function ConfirmModal({ form, onConfirm, onCancel, loading }: ConfirmProps) {
  const label  = form.method === 'gcash' ? 'GCash Number' : 'PayPal Email';
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Confirm Withdrawal</h3>
        <p className="modal-subtitle">Please review your details before submitting.</p>

        <div className="withdraw-confirm-rows">
          <div className="withdraw-confirm-row">
            <span className="withdraw-confirm-label">Amount</span>
            <span className="withdraw-confirm-value">₱{Number(form.amount).toFixed(2)}</span>
          </div>
          <div className="withdraw-confirm-row">
            <span className="withdraw-confirm-label">Method</span>
            <span className="withdraw-confirm-value">{form.method.toUpperCase()}</span>
          </div>
          <div className="withdraw-confirm-row">
            <span className="withdraw-confirm-label">Account Name</span>
            <span className="withdraw-confirm-value">{form.account_name}</span>
          </div>
          <div className="withdraw-confirm-row">
            <span className="withdraw-confirm-label">{label}</span>
            <span className="withdraw-confirm-value">{form.account_number}</span>
          </div>
        </div>

        <p className="withdraw-confirm-note">
          Make sure the {label.toLowerCase()} is correct. We are not responsible for funds sent to wrong accounts.
        </p>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={loading}>
            Go back
          </button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={loading}>
            {loading ? 'Submitting…' : 'Confirm & Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Withdraw() {
  const { user, fetchMe } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState<WithdrawForm>({
    amount:         '',
    method:         'gcash',
    account_name:   '',
    account_number: '',
  });
  const [history,    setHistory]    = useState<Withdrawal[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [cancelling,  setCancelling]  = useState<string | null>(null);

  async function loadHistory() {
    try {
      const { data } = await api.get<{ data: Withdrawal[] }>('/withdrawals');
      setHistory(data.data);
    } catch { /* silent */ }
  }

  useEffect(() => { void loadHistory(); }, []);

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate(): string | null {
    const amount = Number(form.amount);
    if (!form.amount || isNaN(amount)) return 'Enter a valid amount.';
    if (amount < MIN_AMOUNT)           return `Minimum withdrawal is ₱${MIN_AMOUNT}.`;
    if (amount > MAX_AMOUNT)           return `Maximum withdrawal is ₱${MAX_AMOUNT.toLocaleString()}.`;
    if (amount > Number(user?.balance ?? 0)) return 'Insufficient balance.';
    if (!form.account_name.trim())     return 'Account name is required.';
    if (form.account_name.trim().length < 2) return 'Account name is too short.';
    if (form.method === 'gcash' && !GCASH_RE.test(form.account_number)) {
      return 'GCash number must be in format 09XXXXXXXXX.';
    }
    if (form.method === 'paypal' && !PAYPAL_EMAIL.test(form.account_number)) {
      return 'Enter a valid PayPal email address.';
    }
    return null;
  }

  function handleReview(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { toast.error(err); return; }
    setShowConfirm(true);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await api.post('/withdrawals', {
        amount:         Number(form.amount),
        method:         form.method,
        account_name:   form.account_name.trim(),
        account_number: form.account_number.trim(),
      });
      setShowConfirm(false);
      setForm({ amount: '', method: 'gcash', account_name: '', account_number: '' });
      toast.success('Withdrawal request submitted. We\'ll process it within 24 hours.');
      await Promise.all([loadHistory(), fetchMe()]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Request failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    setCancelling(id);
    try {
      await api.delete(`/withdrawals/${id}`);
      toast.success('Withdrawal cancelled. Your balance has been refunded.');
      await Promise.all([loadHistory(), fetchMe()]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Failed to cancel. Please try again.');
    } finally {
      setCancelling(null);
    }
  }

  const kycStatus  = user?.kyc_status ?? 'none';
  const kycBlocked = kycStatus !== 'approved';

  const accountNumberPlaceholder = form.method === 'gcash'
    ? '09XXXXXXXXX'
    : 'email@example.com';

  const accountNumberLabel = form.method === 'gcash'
    ? 'GCash Number'
    : 'PayPal Email';

  return (
    <div className="page">
      {showConfirm && (
        <ConfirmModal
          form={form}
          onConfirm={() => { void handleSubmit(); }}
          onCancel={() => setShowConfirm(false)}
          loading={submitting}
        />
      )}

      <header className="page-header">
        <div>
          <BackButton />
          <h1 className="page-title">Withdraw</h1>
          <p className="page-subtitle">
            Balance: <strong>₱{Number(user?.balance ?? 0).toFixed(2)}</strong>
          </p>
        </div>
      </header>

      {/* KYC gate */}
      {kycBlocked && (
        <div className={`alert ${kycStatus === 'pending' ? 'alert--info' : 'alert--warning'}`}>
          <AlertCircle size={18} />
          <div>
            {kycStatus === 'pending'  && <><strong>KYC under review.</strong> Withdrawals unlock once verified.</>}
            {kycStatus === 'rejected' && <><strong>KYC rejected.</strong> <Link to="/kyc">Resubmit documents →</Link></>}
            {kycStatus === 'none'     && <><strong>Verification required.</strong> <Link to="/kyc">Complete KYC to withdraw →</Link></>}
          </div>
        </div>
      )}

      {/* Balance hero */}
      <div className="withdraw-balance-card">
        <div className="withdraw-balance-left">
          <span className="withdraw-balance-label">Available to withdraw</span>
          <span className="withdraw-balance-value">₱{Number(user?.balance ?? 0).toFixed(2)}</span>
        </div>
        <div className="withdraw-balance-right">
          <Banknote size={28} style={{ opacity: 0.5 }} />
          <span className="withdraw-min-note">Min ₱{MIN_AMOUNT} · Max ₱{MAX_AMOUNT.toLocaleString()}</span>
        </div>
      </div>

      {/* Request form */}
      <section className="card">
        <h2 className="card-title">New withdrawal request</h2>
        <form onSubmit={handleReview} noValidate className="withdraw-form">

          {/* Method picker */}
          <div className="withdraw-method-grid">
            {(['gcash', 'paypal'] as const).map((m) => (
              <label
                key={m}
                className={`withdraw-method-option${form.method === m ? ' withdraw-method-option--active' : ''}`}
              >
                <input
                  type="radio"
                  name="method"
                  value={m}
                  checked={form.method === m}
                  onChange={() => setForm((f) => ({ ...f, method: m, account_number: '' }))}
                  className="sr-only"
                />
                <span className="withdraw-method-icon">
                  {m === 'gcash' ? <Smartphone size={22} /> : <CreditCard size={22} />}
                </span>
                <span className="withdraw-method-label">{m === 'gcash' ? 'GCash' : 'PayPal'}</span>
              </label>
            ))}
          </div>

          {/* Account name */}
          <div className="form-group">
            <label className="form-label" htmlFor="account-name">
              Account Name <span className="form-label-hint">(Full name on your account)</span>
            </label>
            <input
              id="account-name"
              type="text"
              className="form-input"
              placeholder="Juan Dela Cruz"
              value={form.account_name}
              onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))}
              maxLength={100}
              required
            />
          </div>

          {/* Account number / email */}
          <div className="form-group">
            <label className="form-label" htmlFor="account-number">
              {accountNumberLabel}
            </label>
            <input
              id="account-number"
              type={form.method === 'paypal' ? 'email' : 'tel'}
              inputMode={form.method === 'gcash' ? 'numeric' : 'email'}
              className="form-input"
              placeholder={accountNumberPlaceholder}
              value={form.account_number}
              onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value.trim() }))}
              maxLength={form.method === 'gcash' ? 11 : 254}
              required
            />
            {form.method === 'gcash' && (
              <span className="form-hint">Format: 09XXXXXXXXX (11 digits)</span>
            )}
          </div>

          {/* Amount */}
          <div className="form-group">
            <label className="form-label" htmlFor="amount">Amount (₱)</label>
            <div className="withdraw-amount-wrap">
              <span className="withdraw-amount-prefix">₱</span>
              <input
                id="amount"
                type="number"
                className="form-input withdraw-amount-input"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                step={1}
                placeholder="0"
                required
              />
            </div>
            <span className="form-hint">Min ₱{MIN_AMOUNT} · Max ₱{MAX_AMOUNT.toLocaleString()}</span>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={kycBlocked}
          >
            Review Request
          </button>
        </form>
      </section>

      {/* History */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Withdrawal history</h2>
        </div>

        {history.length === 0 ? (
          <div className="empty-state"><p>No withdrawals yet.</p></div>
        ) : (
          <div className="withdraw-history-list">
            {history.map((w) => {
              const meta = STATUS_META[w.status] ?? STATUS_META.pending;
              return (
                <div key={w.id} className="withdraw-history-card">
                  <div className="withdraw-history-top">
                    <div className="withdraw-history-method">
                      {w.method === 'gcash' ? <Smartphone size={18} /> : <CreditCard size={18} />}
                      <span>{w.method.toUpperCase()}</span>
                    </div>
                    <span className="withdraw-history-amount">
                      ₱{Number(w.amount).toFixed(2)}
                    </span>
                  </div>

                  <div className="withdraw-history-details">
                    <span className="withdraw-history-account">
                      {w.account_name} · {w.account_number}
                    </span>
                    <span
                      className="withdraw-history-status"
                      style={{ color: meta.color }}
                    >
                      {meta.icon} {meta.label}
                    </span>
                  </div>

                  <div className="withdraw-history-meta">
                    <span className="withdraw-history-date">
                      {new Date(w.requested_at).toLocaleDateString('en-PH', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                    {w.status === 'pending' && (
                      <button
                        className="btn btn-sm btn-ghost btn-danger"
                        onClick={() => { void handleCancel(w.id); }}
                        disabled={cancelling === w.id}
                      >
                        {cancelling === w.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    )}
                  </div>

                  {w.status === 'rejected' && w.rejection_reason && (
                    <div className="withdraw-rejection-reason">
                      <AlertCircle size={13} />
                      <span>{w.rejection_reason}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
