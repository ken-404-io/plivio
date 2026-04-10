import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Smartphone, CreditCard, Banknote, XCircle, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import BackButton from '../../components/common/BackButton.tsx';
import type { Withdrawal } from '../../types/index.ts';

// ─── Constants ─────────────────────────────────────────────────────────────────

const MIN_AMOUNT       = 50;
const MAX_AMOUNT       = 5000;
const DOC_FEE_RATE     = 0.01;   // 1% document fee
const HANDLING_FEE_RATE= 0.04;   // 4% handling fee
const TOTAL_FEE_RATE   = DOC_FEE_RATE + HANDLING_FEE_RATE; // 5%
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
  const amount      = Number(form.amount);
  const docFee      = Math.round(amount * DOC_FEE_RATE     * 100) / 100;
  const handlingFee = Math.round(amount * HANDLING_FEE_RATE * 100) / 100;
  const totalFee    = Math.round(amount * TOTAL_FEE_RATE   * 100) / 100;
  const netAmount   = Math.round((amount - totalFee)        * 100) / 100;
  const acctLabel   = form.method === 'gcash' ? 'GCash Number' : 'PayPal Email';

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal wd-invoice-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Withdrawal Invoice</h3>

        {/* Fee breakdown */}
        <div className="wd-invoice">
          <div className="wd-invoice-row">
            <span className="wd-invoice-label">Withdrawal amount</span>
            <span className="wd-invoice-value">₱{amount.toFixed(2)}</span>
          </div>
          <div className="wd-invoice-divider" />
          <div className="wd-invoice-row wd-invoice-row--fee">
            <span className="wd-invoice-label">Document fee (1%)</span>
            <span className="wd-invoice-value wd-invoice-value--fee">-₱{docFee.toFixed(2)}</span>
          </div>
          <div className="wd-invoice-row wd-invoice-row--fee">
            <span className="wd-invoice-label">Handling fee (4%)</span>
            <span className="wd-invoice-value wd-invoice-value--fee">-₱{handlingFee.toFixed(2)}</span>
          </div>
          <div className="wd-invoice-divider" />
          <div className="wd-invoice-row wd-invoice-row--total">
            <span className="wd-invoice-label">Total fee (5%)</span>
            <span className="wd-invoice-value wd-invoice-value--fee">-₱{totalFee.toFixed(2)}</span>
          </div>
          <div className="wd-invoice-net">
            <span className="wd-invoice-net-label">You will receive</span>
            <span className="wd-invoice-net-value">₱{netAmount.toFixed(2)}</span>
          </div>
        </div>

        {/* Destination */}
        <div className="wd-invoice-dest">
          <div className="wd-invoice-dest-row">
            <span className="wd-invoice-dest-label">Method</span>
            <span className="wd-invoice-dest-value">{form.method.toUpperCase()}</span>
          </div>
          <div className="wd-invoice-dest-row">
            <span className="wd-invoice-dest-label">Account name</span>
            <span className="wd-invoice-dest-value">{form.account_name}</span>
          </div>
          <div className="wd-invoice-dest-row">
            <span className="wd-invoice-dest-label">{acctLabel}</span>
            <span className="wd-invoice-dest-value">{form.account_number}</span>
          </div>
        </div>

        <p className="wd-invoice-note">
          Make sure the {acctLabel.toLowerCase()} is correct. We are not responsible for funds sent to wrong accounts.
        </p>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={loading}>
            Go back
          </button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={loading}>
            {loading ? 'Submitting…' : 'Confirm & Withdraw'}
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
  const [loading,    setLoading]    = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [cancelling,  setCancelling]  = useState<string | null>(null);

  async function loadHistory() {
    try {
      const { data } = await api.get<{ data: Withdrawal[] }>('/withdrawals');
      setHistory(data.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
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

  if (loading) return (
    <div className="page">
      <div className="sk-section">
        <span className="sk sk-line sk-line--xl skeleton" style={{ width: '35%' }} />
        <span className="sk sk-line--sm skeleton" style={{ width: '55%' }} />
      </div>
      {/* Balance card skeleton */}
      <div className="sk-card sk-row" style={{ padding: 20, justifyContent: 'space-between' }}>
        <div className="sk-col" style={{ gap: 8 }}>
          <span className="sk sk-line--sm skeleton" style={{ width: 120 }} />
          <span className="sk sk-line--xl skeleton" style={{ width: 100 }} />
        </div>
        <div className="sk-col" style={{ alignItems: 'flex-end', gap: 8 }}>
          <span className="sk skeleton" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <span className="sk sk-line--sm skeleton" style={{ width: 90 }} />
        </div>
      </div>
      {/* Form skeleton */}
      <div className="sk-card sk-section" style={{ padding: 20, gap: 16 }}>
        <span className="sk sk-line skeleton" style={{ width: '40%' }} />
        <div className="sk-row" style={{ gap: 8 }}>
          <span className="sk skeleton" style={{ flex: 1, height: 56, borderRadius: 8 }} />
          <span className="sk skeleton" style={{ flex: 1, height: 56, borderRadius: 8 }} />
        </div>
        <div className="sk-col" style={{ gap: 8 }}>
          <span className="sk sk-line--sm skeleton" style={{ width: '30%' }} />
          <span className="sk skeleton" style={{ height: 44, borderRadius: 8, width: '100%' }} />
        </div>
        <div className="sk-col" style={{ gap: 8 }}>
          <span className="sk sk-line--sm skeleton" style={{ width: '25%' }} />
          <span className="sk skeleton" style={{ height: 44, borderRadius: 8, width: '100%' }} />
        </div>
        <span className="sk skeleton" style={{ height: 44, borderRadius: 8, width: '100%' }} />
      </div>
      {/* History skeleton */}
      <div className="sk-section" style={{ gap: 10 }}>
        <span className="sk sk-line skeleton" style={{ width: '40%' }} />
        {[0,1,2].map(i => (
          <div key={i} className="sk-card sk-section" style={{ padding: 14, gap: 10 }}>
            <div className="sk-row" style={{ justifyContent: 'space-between' }}>
              <div className="sk-row" style={{ gap: 8 }}>
                <span className="sk skeleton" style={{ width: 20, height: 20, borderRadius: 4 }} />
                <span className="sk sk-line skeleton" style={{ width: 60 }} />
              </div>
              <span className="sk sk-line skeleton" style={{ width: 70 }} />
            </div>
            <div className="sk-row" style={{ justifyContent: 'space-between' }}>
              <span className="sk sk-line--sm skeleton" style={{ width: '45%' }} />
              <span className="sk sk-line--sm skeleton" style={{ width: 60 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

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
                      ₱{Number(w.net_amount || w.amount).toFixed(2)}
                      {Number(w.fee_amount) > 0 && (
                        <span className="withdraw-history-gross"> (req. ₱{Number(w.amount).toFixed(2)})</span>
                      )}
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
