import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Smartphone,
  CreditCard,
  XCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Wallet,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
} from 'lucide-react';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import BackButton from '../../components/common/BackButton.tsx';
import type { Withdrawal } from '../../types/index.ts';

// ─── Free Plan Upgrade Modal ──────────────────────────────────────────────────

function FreePlanUpgradeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay modal-overlay--center" onClick={onClose}>
      <div className="modal wd-confirm" onClick={(e) => e.stopPropagation()}>
        <div className="wd-confirm-hero" style={{ background: 'var(--bg-card)' }}>
          <AlertCircle size={32} style={{ color: 'var(--warning)', marginBottom: 8 }} />
          <span className="wd-confirm-hero-label">Withdrawal Limit Reached</span>
          <span className="wd-confirm-hero-amount" style={{ fontSize: 18, marginTop: 4 }}>
            Free Plan Limit
          </span>
        </div>
        <div style={{ padding: '0 20px 4px' }}>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', margin: '12px 0 16px' }}>
            Free plan users can only make <strong>1 withdrawal</strong> in total.
            Upgrade your plan to continue making withdrawals.
          </p>
          <div className="wd-confirm-actions">
            <button className="btn btn-ghost wd-confirm-back" onClick={onClose}>
              Close
            </button>
            <Link to="/plans" className="btn btn-primary wd-confirm-submit" style={{ textDecoration: 'none', textAlign: 'center' }}>
              <ArrowUpRight size={15} />
              Upgrade Plan
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Validation Error Modal ──────────────────────────────────────────────────

function ValidationModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="modal-overlay modal-overlay--center" onClick={onClose}>
      <div className="modal wd-confirm" onClick={(e) => e.stopPropagation()}>
        <div className="wd-confirm-hero" style={{ background: 'var(--bg-card)' }}>
          <AlertCircle size={32} style={{ color: 'var(--error)', marginBottom: 8 }} />
          <span className="wd-confirm-hero-label">Validation Error</span>
        </div>
        <div style={{ padding: '0 20px 4px' }}>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', margin: '12px 0 16px' }}>
            {message}
          </p>
          <div className="wd-confirm-actions">
            <button className="btn btn-primary wd-confirm-submit" onClick={onClose} style={{ flex: 1 }}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MIN_AMOUNT            = 50;
const MAX_AMOUNT            = 5000;
const FREE_PLAN_MAX_AMOUNT  = 100;
const DOC_FEE_RATE      = 0.01;
const HANDLING_FEE_RATE  = 0.04;
const TOTAL_FEE_RATE    = DOC_FEE_RATE + HANDLING_FEE_RATE;

const GCASH_RE     = /^09\d{9}$/;
const PAYPAL_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000, 2000];

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  pending:    { label: 'Pending',    icon: <Clock        size={13} />, color: 'var(--warning)'    },
  processing: { label: 'Processing', icon: <Clock        size={13} />, color: 'var(--accent)'     },
  paid:       { label: 'Paid',       icon: <CheckCircle2 size={13} />, color: 'var(--success)'    },
  rejected:   { label: 'Rejected',   icon: <AlertCircle  size={13} />, color: 'var(--error)'      },
  cancelled:  { label: 'Cancelled',  icon: <XCircle      size={13} />, color: 'var(--text-muted)' },
};

interface WithdrawForm {
  amount:         string;
  method:         'gcash' | 'paypal';
  account_name:   string;
  account_number: string;
}

// ─── Confirmation bottom-sheet ─────────────────────────────────────────────────

interface ConfirmProps {
  form:      WithdrawForm;
  onConfirm: () => void;
  onCancel:  () => void;
  loading:   boolean;
}

function ConfirmModal({ form, onConfirm, onCancel, loading }: ConfirmProps) {
  const amount      = Number(form.amount);
  const totalFee    = Math.round(amount * TOTAL_FEE_RATE * 100) / 100;
  const netAmount   = Math.round((amount - totalFee)      * 100) / 100;
  const acctLabel   = form.method === 'gcash' ? 'GCash Number' : 'PayPal Email';

  return (
    <div className="modal-overlay modal-overlay--center" onClick={onCancel}>
      <div className="modal wd-confirm" onClick={(e) => e.stopPropagation()}>
        {/* Big net amount hero */}
        <div className="wd-confirm-hero">
          <span className="wd-confirm-hero-label">You will receive</span>
          <span className="wd-confirm-hero-amount">₱{netAmount.toFixed(2)}</span>
          <span className="wd-confirm-hero-fee">
            ₱{amount.toFixed(2)} &minus; ₱{totalFee.toFixed(2)} fee (5%)
          </span>
        </div>

        {/* Destination rows */}
        <div className="wd-confirm-details">
          <div className="wd-confirm-row">
            <span className="wd-confirm-label">Method</span>
            <span className="wd-confirm-value">
              {form.method === 'gcash' ? <Smartphone size={14} /> : <CreditCard size={14} />}
              {form.method === 'gcash' ? 'GCash' : 'PayPal'}
            </span>
          </div>
          <div className="wd-confirm-row">
            <span className="wd-confirm-label">Name</span>
            <span className="wd-confirm-value">{form.account_name}</span>
          </div>
          <div className="wd-confirm-row">
            <span className="wd-confirm-label">{acctLabel}</span>
            <span className="wd-confirm-value wd-confirm-value--mono">{form.account_number}</span>
          </div>
        </div>

        <p className="wd-confirm-note">
          Double-check the account details above. We cannot reverse funds sent to a wrong account.
        </p>

        <div className="wd-confirm-actions">
          <button className="btn btn-ghost wd-confirm-back" onClick={onCancel} disabled={loading}>
            Back
          </button>
          <button className="btn btn-primary wd-confirm-submit" onClick={onConfirm} disabled={loading}>
            {loading ? 'Submitting…' : 'Confirm Withdrawal'}
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
    amount: '', method: 'gcash', account_name: '', account_number: '',
  });
  const [history,           setHistory]           = useState<Withdrawal[]>([]);
  const [loading,           setLoading]           = useState(true);
  const [showConfirm,       setShowConfirm]       = useState(false);
  const [showUpgradeModal,  setShowUpgradeModal]  = useState(false);
  const [validationError,   setValidationError]   = useState<string | null>(null);
  const [submitting,        setSubmitting]        = useState(false);
  const [cancelling,        setCancelling]        = useState<string | null>(null);
  const [historyOpen,       setHistoryOpen]       = useState(true);
  const [cooldownEnd,       setCooldownEnd]       = useState<Date | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState('');

  async function loadHistory() {
    try {
      const { data } = await api.get<{ data: Withdrawal[] }>('/withdrawals');
      setHistory(data.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  async function loadCooldown() {
    try {
      const { data } = await api.get<{ on_cooldown: boolean; cooldown_end?: string }>('/withdrawals/cooldown');
      if (data.on_cooldown && data.cooldown_end) {
        setCooldownEnd(new Date(data.cooldown_end));
      } else {
        setCooldownEnd(null);
      }
    } catch { /* silent */ }
  }

  useEffect(() => { void loadHistory(); void loadCooldown(); }, []);

  // Countdown timer for cooldown
  useEffect(() => {
    if (!cooldownEnd) { setCooldownRemaining(''); return; }

    function tick() {
      const now = Date.now();
      const diff = cooldownEnd!.getTime() - now;
      if (diff <= 0) {
        setCooldownEnd(null);
        setCooldownRemaining('');
        return;
      }
      const h = Math.floor(diff / (60 * 60 * 1000));
      const m = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
      const s = Math.floor((diff % (60 * 1000)) / 1000);
      setCooldownRemaining(
        h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`,
      );
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownEnd]);

  // ── Live fee preview ──────────────────────────────────────────────────────
  const liveAmount = Number(form.amount) || 0;
  const liveFee    = Math.round(liveAmount * TOTAL_FEE_RATE * 100) / 100;
  const liveNet    = Math.round((liveAmount - liveFee) * 100) / 100;

  // ── Plan checks ───────────────────────────────────────────────────────────
  const isFreePlan = user?.plan === 'free';

  // ── Quick amounts filtered by balance ─────────────────────────────────────
  const balance = Number(user?.balance ?? 0);
  const effectiveMax = isFreePlan ? FREE_PLAN_MAX_AMOUNT : MAX_AMOUNT;
  const quickAmounts = useMemo(
    () => QUICK_AMOUNTS.filter((a) => a <= balance && a <= effectiveMax),
    [balance, effectiveMax],
  );

  // ── Validation ────────────────────────────────────────────────────────────
  function validate(): string | null {
    if (!form.amount || isNaN(liveAmount))                    return 'Enter a valid amount.';
    if (liveAmount < MIN_AMOUNT)                              return `Minimum withdrawal is ₱${MIN_AMOUNT}.`;
    if (liveAmount > MAX_AMOUNT)                              return `Maximum withdrawal is ₱${MAX_AMOUNT.toLocaleString()}.`;
    if (isFreePlan && liveAmount > FREE_PLAN_MAX_AMOUNT)      return `Free plan withdrawals are limited to ₱${FREE_PLAN_MAX_AMOUNT}. Upgrade to withdraw more.`;
    if (liveAmount > balance)                                 return 'Insufficient balance.';
    if (!form.account_name.trim())                            return 'Account name is required.';
    if (form.account_name.trim().length < 2)                  return 'Account name is too short.';
    if (form.method === 'gcash'  && !GCASH_RE.test(form.account_number))
      return 'GCash number must be 09XXXXXXXXX.';
    if (form.method === 'paypal' && !PAYPAL_EMAIL.test(form.account_number))
      return 'Enter a valid PayPal email.';
    return null;
  }

  // Check proactively if free-plan user has already used their one withdrawal
  const hasUsedFreeWithdrawal = isFreePlan && history.some(
    (w) => !['cancelled'].includes(w.status),
  );

  // Cooldown active for premium/elite users
  const onCooldown = cooldownEnd !== null && cooldownEnd.getTime() > Date.now();

  function handleReview(e: React.FormEvent) {
    e.preventDefault();
    if (hasUsedFreeWithdrawal) { setShowUpgradeModal(true); return; }
    if (onCooldown) { setValidationError('Please wait for the cooldown period to end before withdrawing again.'); return; }
    const err = validate();
    if (err) { setValidationError(err); return; }
    setShowConfirm(true);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await api.post('/withdrawals', {
        amount:         liveAmount,
        method:         form.method,
        account_name:   form.account_name.trim(),
        account_number: form.account_number.trim(),
      });
      setShowConfirm(false);
      setForm({ amount: '', method: 'gcash', account_name: '', account_number: '' });
      toast.success('Withdrawal submitted — we\'ll process it within 24 hours.');
      await Promise.all([loadHistory(), fetchMe(), loadCooldown()]);
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: { error?: string; code?: string } } }).response?.data;
      if (errData?.code === 'free_plan_limit_reached') {
        setShowConfirm(false);
        setShowUpgradeModal(true);
        return;
      }
      if (errData?.code === 'withdrawal_cooldown') {
        setShowConfirm(false);
        void loadCooldown();
        setValidationError(errData.error ?? 'Withdrawal cooldown active. Please try again later.');
        return;
      }
      setShowConfirm(false);
      setValidationError(errData?.error ?? 'Request failed. Please try again.');
    } finally { setSubmitting(false); }
  }

  async function handleCancel(id: string) {
    setCancelling(id);
    try {
      await api.delete(`/withdrawals/${id}`);
      toast.success('Withdrawal cancelled. Balance refunded.');
      await Promise.all([loadHistory(), fetchMe(), loadCooldown()]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Failed to cancel.');
    } finally { setCancelling(null); }
  }

  const kycStatus  = user?.kyc_status ?? 'none';
  const kycBlocked = kycStatus !== 'approved';

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) return (
    <div className="page">
      <div className="sk-section">
        <span className="sk sk-line sk-line--xl skeleton" style={{ width: '35%' }} />
        <span className="sk sk-line--sm skeleton" style={{ width: '55%' }} />
      </div>
      <div className="sk-card" style={{ padding: 20, borderRadius: 16 }}>
        <span className="sk sk-line--sm skeleton" style={{ width: 120 }} />
        <span className="sk sk-line--xl skeleton" style={{ width: 140, marginTop: 8 }} />
      </div>
      <div className="sk-card sk-section" style={{ padding: 20, gap: 16 }}>
        <div className="sk-row" style={{ gap: 8 }}>
          <span className="sk skeleton" style={{ flex: 1, height: 64, borderRadius: 12 }} />
          <span className="sk skeleton" style={{ flex: 1, height: 64, borderRadius: 12 }} />
        </div>
        <span className="sk skeleton" style={{ height: 44, borderRadius: 8, width: '100%' }} />
        <span className="sk skeleton" style={{ height: 44, borderRadius: 8, width: '100%' }} />
        <span className="sk skeleton" style={{ height: 44, borderRadius: 8, width: '100%' }} />
        <span className="sk skeleton" style={{ height: 48, borderRadius: 10, width: '100%' }} />
      </div>
    </div>
  );

  const pendingCount = history.filter((w) => w.status === 'pending').length;

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
      {showUpgradeModal && (
        <FreePlanUpgradeModal onClose={() => setShowUpgradeModal(false)} />
      )}
      {validationError && (
        <ValidationModal message={validationError} onClose={() => setValidationError(null)} />
      )}

      <header className="page-header">
        <div>
          <BackButton />
          <h1 className="page-title">Withdraw</h1>
          <p className="page-subtitle">Cash out to GCash or PayPal</p>
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


      {/* ── Balance hero card ─────────────────────────────────────────────── */}
      <div className="wd-hero">
        <div className="wd-hero-top">
          <div className="wd-hero-icon-wrap">
            <Wallet size={20} />
          </div>
          <div className="wd-hero-text">
            <span className="wd-hero-label">Available balance</span>
            <span className="wd-hero-amount">₱{balance.toFixed(2)}</span>
          </div>
        </div>
        <div className="wd-hero-limits">
          <span>Min ₱{MIN_AMOUNT}</span>
          <span className="wd-hero-limits-dot" />
          <span>Max ₱{(isFreePlan ? FREE_PLAN_MAX_AMOUNT : MAX_AMOUNT).toLocaleString()}</span>
          <span className="wd-hero-limits-dot" />
          <span>5% fee</span>
        </div>
      </div>

      {/* ── Cooldown banner ──────────────────────────────────────────────── */}
      {onCooldown && cooldownRemaining && (
        <div className="wd-cooldown-banner">
          <Clock size={16} className="wd-cooldown-icon" />
          <div className="wd-cooldown-text">
            <span className="wd-cooldown-label">Next withdrawal available in</span>
            <span className="wd-cooldown-timer">{cooldownRemaining}</span>
          </div>
        </div>
      )}

      {/* ── Withdrawal form ───────────────────────────────────────────────── */}
      <form onSubmit={handleReview} noValidate className="wd-form">

        {/* 1 — Payment method */}
        <fieldset className="wd-fieldset">
          <legend className="wd-fieldset-legend">Payment method</legend>
          <div className="wd-method-row">
            {(['gcash', 'paypal'] as const).map((m) => (
              <label
                key={m}
                className={`wd-method-chip${form.method === m ? ' wd-method-chip--active' : ''}`}
              >
                <input
                  type="radio" name="method" value={m}
                  checked={form.method === m}
                  onChange={() => setForm((f) => ({ ...f, method: m, account_number: '' }))}
                  className="sr-only"
                />
                {m === 'gcash' ? <Smartphone size={18} /> : <CreditCard size={18} />}
                <span>{m === 'gcash' ? 'GCash' : 'PayPal'}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* 2 — Account details */}
        <fieldset className="wd-fieldset">
          <legend className="wd-fieldset-legend">Account details</legend>

          <div className="wd-input-group">
            <label className="wd-input-label" htmlFor="wd-name">Full name on account</label>
            <input
              id="wd-name" type="text" className="wd-input"
              placeholder="Juan Dela Cruz"
              value={form.account_name}
              onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))}
              maxLength={100}
              autoComplete="name"
            />
          </div>

          <div className="wd-input-group">
            <label className="wd-input-label" htmlFor="wd-acct">
              {form.method === 'gcash' ? 'GCash number' : 'PayPal email'}
            </label>
            <input
              id="wd-acct"
              type={form.method === 'paypal' ? 'email' : 'tel'}
              inputMode={form.method === 'gcash' ? 'numeric' : 'email'}
              className="wd-input"
              placeholder={form.method === 'gcash' ? '09XXXXXXXXX' : 'email@example.com'}
              value={form.account_number}
              onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value.trim() }))}
              maxLength={form.method === 'gcash' ? 11 : 254}
              autoComplete={form.method === 'gcash' ? 'tel' : 'email'}
            />
            {form.method === 'gcash' && (
              <span className="wd-input-hint">11 digits starting with 09</span>
            )}
          </div>
        </fieldset>

        {/* 3 — Amount */}
        <fieldset className="wd-fieldset">
          <legend className="wd-fieldset-legend">Amount</legend>

          {/* Quick-select chips */}
          {quickAmounts.length > 0 && (
            <div className="wd-quick-row">
              {quickAmounts.map((a) => (
                <button
                  key={a} type="button"
                  className={`wd-quick-chip${form.amount === String(a) ? ' wd-quick-chip--active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, amount: String(a) }))}
                >
                  ₱{a.toLocaleString()}
                </button>
              ))}
            </div>
          )}

          <div className="wd-amount-wrap">
            <span className="wd-amount-prefix">₱</span>
            <input
              id="wd-amount" type="number"
              className="wd-amount-input"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              min={MIN_AMOUNT} max={MAX_AMOUNT} step={1}
              placeholder="0"
            />
          </div>

          {/* Live fee preview */}
          {liveAmount >= MIN_AMOUNT && (
            <div className="wd-fee-preview">
              <div className="wd-fee-row">
                <span>Fee (5%)</span>
                <span>&minus;₱{liveFee.toFixed(2)}</span>
              </div>
              <div className="wd-fee-row wd-fee-row--net">
                <span>You receive</span>
                <span>₱{liveNet.toFixed(2)}</span>
              </div>
            </div>
          )}
        </fieldset>

        <button
          type="submit"
          className="btn btn-primary wd-submit"
          disabled={kycBlocked}
        >
          Review Withdrawal
          <ArrowRight size={16} />
        </button>
      </form>

      {/* ── History section ────────────────────────────────────────────────── */}
      <section className="section">
        <button
          className="wd-history-toggle"
          onClick={() => setHistoryOpen((v) => !v)}
          type="button"
        >
          <h2 className="section-title">
            Withdrawal history
            {pendingCount > 0 && <span className="wd-pending-badge">{pendingCount}</span>}
          </h2>
          {history.length > 0 && (
            historyOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />
          )}
        </button>

        {historyOpen && (
          history.length === 0 ? (
            <div className="empty-state"><p>No withdrawals yet.</p></div>
          ) : (
            <div className="wd-history-list">
              {history.map((w) => {
                const meta = STATUS_META[w.status] ?? STATUS_META.pending;
                return (
                  <div key={w.id} className={`wd-history-card wd-history-card--${w.status}`}>
                    <div className="wd-history-top-row">
                      <div className="wd-history-method-badge">
                        {w.method === 'gcash' ? <Smartphone size={14} /> : <CreditCard size={14} />}
                        <span>{w.method === 'gcash' ? 'GCash' : 'PayPal'}</span>
                      </div>
                      <span className="wd-history-status" style={{ color: meta.color }}>
                        {meta.icon} {meta.label}
                      </span>
                    </div>

                    <div className="wd-history-amount-row">
                      <span className="wd-history-net">₱{Number(w.net_amount || w.amount).toFixed(2)}</span>
                      {Number(w.fee_amount) > 0 && (
                        <span className="wd-history-gross">
                          from ₱{Number(w.amount).toFixed(2)}
                        </span>
                      )}
                    </div>

                    <div className="wd-history-meta">
                      <span className="wd-history-account">{w.account_name} · {w.account_number}</span>
                      <span className="wd-history-date">
                        {new Date(w.requested_at).toLocaleDateString('en-PH', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </span>
                    </div>

                    {w.status === 'pending' && (
                      <button
                        className="wd-history-cancel"
                        onClick={() => { void handleCancel(w.id); }}
                        disabled={cancelling === w.id}
                        type="button"
                      >
                        {cancelling === w.id ? 'Cancelling…' : 'Cancel request'}
                      </button>
                    )}

                    {w.status === 'rejected' && w.rejection_reason && (
                      <div className="wd-history-rejection">
                        <AlertCircle size={13} />
                        <span>{w.rejection_reason}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </section>
    </div>
  );
}
