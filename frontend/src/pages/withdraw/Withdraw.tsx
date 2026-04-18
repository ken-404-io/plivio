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
  Plus,
  Trash2,
  Star,
  BookOpen,
  CalendarDays,
} from 'lucide-react';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import BackButton from '../../components/common/BackButton.tsx';
import type { Withdrawal, PaymentMethod } from '../../types/index.ts';

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

const MIN_AMOUNT                = 50;
const MAX_AMOUNT                = 5000;
const FREE_PLAN_MIN_AMOUNT      = 400;
const FREE_PLAN_MAX_AMOUNT      = 5000;
const PREMIUM_PLAN_MIN_AMOUNT   = 500;
const ELITE_PLAN_MIN_AMOUNT     = 1500;
const QUIZ_EARN_GATE            = 30;
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

// ─── Confirmation bottom-sheet ─────────────────────────────────────────────────

interface ConfirmProps {
  amount:   number;
  pm:       PaymentMethod;
  onConfirm: () => void;
  onCancel:  () => void;
  loading:   boolean;
}

function ConfirmModal({ amount, pm, onConfirm, onCancel, loading }: ConfirmProps) {
  const totalFee    = Math.round(amount * TOTAL_FEE_RATE * 100) / 100;
  const netAmount   = Math.round((amount - totalFee)      * 100) / 100;
  const acctLabel   = pm.method === 'gcash' ? 'GCash Number' : 'PayPal Email';

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
              {pm.method === 'gcash' ? <Smartphone size={14} /> : <CreditCard size={14} />}
              {pm.method === 'gcash' ? 'GCash' : 'PayPal'}
            </span>
          </div>
          <div className="wd-confirm-row">
            <span className="wd-confirm-label">Name</span>
            <span className="wd-confirm-value">{pm.account_name}</span>
          </div>
          <div className="wd-confirm-row">
            <span className="wd-confirm-label">{acctLabel}</span>
            <span className="wd-confirm-value wd-confirm-value--mono">{pm.account_number}</span>
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

// ─── Add Payment Method Modal ─────────────────────────────────────────────────

interface AddPaymentMethodModalProps {
  onClose:  () => void;
  onAdded:  (pm: PaymentMethod) => void;
}

function AddPaymentMethodModal({ onClose, onAdded }: AddPaymentMethodModalProps) {
  const toast = useToast();
  const [method,         setMethod]         = useState<'gcash' | 'paypal'>('gcash');
  const [accountName,    setAccountName]    = useState('');
  const [accountNumber,  setAccountNumber]  = useState('');
  const [makeDefault,    setMakeDefault]    = useState(true);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  function validate(): string | null {
    if (!accountName.trim())                                       return 'Account name is required.';
    if (accountName.trim().length < 2)                             return 'Account name is too short.';
    if (method === 'gcash'  && !GCASH_RE.test(accountNumber))      return 'GCash number must be 09XXXXXXXXX.';
    if (method === 'paypal' && !PAYPAL_EMAIL.test(accountNumber))  return 'Enter a valid PayPal email.';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }

    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post<{ data: PaymentMethod }>('/payment-methods', {
        method,
        account_name:   accountName.trim(),
        account_number: accountNumber.trim(),
        is_default:     makeDefault,
      });
      toast.success('Payment method saved.');
      onAdded(data.data);
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: { error?: string } }; response_status?: number })
        .response?.data;
      setError(errData?.error ?? 'Failed to save payment method.');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="modal-overlay modal-overlay--center" onClick={onClose}>
      <div className="modal wd-confirm" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="wd-confirm-hero" style={{ background: 'var(--bg-card)' }}>
          <CreditCard size={28} style={{ color: 'var(--accent)', marginBottom: 8 }} />
          <span className="wd-confirm-hero-label">Add Payment Method</span>
          <span className="wd-confirm-hero-amount" style={{ fontSize: 14, marginTop: 4, color: 'var(--text-muted)', fontWeight: 500 }}>
            Save an account once — pick it on every withdrawal.
          </span>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '0 20px 4px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <span className="wd-input-label" style={{ display: 'block', marginBottom: 6 }}>Payment method</span>
            <div className="wd-method-row">
              {(['gcash', 'paypal'] as const).map((m) => (
                <label
                  key={m}
                  className={`wd-method-chip${method === m ? ' wd-method-chip--active' : ''}`}
                >
                  <input
                    type="radio"
                    name="add-pm-method"
                    value={m}
                    checked={method === m}
                    onChange={() => { setMethod(m); setAccountNumber(''); }}
                    className="sr-only"
                  />
                  {m === 'gcash' ? <Smartphone size={18} /> : <CreditCard size={18} />}
                  <span>{m === 'gcash' ? 'GCash' : 'PayPal'}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="wd-input-group">
            <label className="wd-input-label" htmlFor="add-pm-name">Full name on account</label>
            <input
              id="add-pm-name"
              type="text"
              className="wd-input"
              placeholder="Juan Dela Cruz"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              maxLength={100}
              autoComplete="name"
            />
          </div>

          <div className="wd-input-group">
            <label className="wd-input-label" htmlFor="add-pm-acct">
              {method === 'gcash' ? 'GCash number' : 'PayPal email'}
            </label>
            <input
              id="add-pm-acct"
              type={method === 'paypal' ? 'email' : 'tel'}
              inputMode={method === 'gcash' ? 'numeric' : 'email'}
              className="wd-input"
              placeholder={method === 'gcash' ? '09XXXXXXXXX' : 'email@example.com'}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.trim())}
              maxLength={method === 'gcash' ? 11 : 254}
              autoComplete={method === 'gcash' ? 'tel' : 'email'}
            />
            {method === 'gcash' && (
              <span className="wd-input-hint">11 digits starting with 09</span>
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
            <input
              type="checkbox"
              checked={makeDefault}
              onChange={(e) => setMakeDefault(e.target.checked)}
            />
            Set as my default payment method
          </label>

          {error && (
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: '8px 12px', borderRadius: 8,
              background: 'var(--error-light, rgba(239,68,68,0.1))',
              color: 'var(--error)', fontSize: 13,
            }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{error}</span>
            </div>
          )}

          <div className="wd-confirm-actions" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="btn btn-ghost wd-confirm-back"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary wd-confirm-submit"
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Save payment method'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Withdraw() {
  const { user, fetchMe } = useAuth();
  const toast = useToast();

  const [amount,           setAmount]          = useState('');
  const [selectedPmId,     setSelectedPmId]    = useState<string>('');
  const [paymentMethods,   setPaymentMethods]  = useState<PaymentMethod[]>([]);
  const [showAddPm,        setShowAddPm]       = useState(false);
  const [deletingPmId,     setDeletingPmId]    = useState<string | null>(null);

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
  const [quizGatePassed,  setQuizGatePassed]  = useState<boolean | null>(null);
  const [quizTodayEarned, setQuizTodayEarned] = useState(0);
  const [quizEarnGate,    setQuizEarnGate]    = useState(QUIZ_EARN_GATE);
  const [showReleaseBanner, setShowReleaseBanner] = useState(
    () => sessionStorage.getItem('wd_release_banner_dismissed') !== '1',
  );

  function dismissReleaseBanner() {
    sessionStorage.setItem('wd_release_banner_dismissed', '1');
    setShowReleaseBanner(false);
  }

  async function loadHistory() {
    try {
      const { data } = await api.get<{ data: Withdrawal[] }>('/withdrawals');
      setHistory(data.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  async function loadCooldown() {
    try {
      const { data } = await api.get<{
        on_cooldown: boolean;
        cooldown_end?: string;
        quiz_gate_passed?: boolean;
        quiz_today_earned?: number;
        quiz_earn_gate?: number;
      }>('/withdrawals/cooldown');
      if (data.on_cooldown && data.cooldown_end) {
        setCooldownEnd(new Date(data.cooldown_end));
      } else {
        setCooldownEnd(null);
      }
      setQuizGatePassed(data.quiz_gate_passed ?? true);
      setQuizTodayEarned(data.quiz_today_earned ?? 0);
      setQuizEarnGate(data.quiz_earn_gate ?? QUIZ_EARN_GATE);
    } catch { /* silent */ }
  }

  async function loadPaymentMethods() {
    try {
      const { data } = await api.get<{ data: PaymentMethod[] }>('/payment-methods');
      setPaymentMethods(data.data);
      // Auto-select the default, or the first available method.
      const defaultPm = data.data.find((pm) => pm.is_default) ?? data.data[0];
      setSelectedPmId((current) => current || (defaultPm ? defaultPm.id : ''));
    } catch { /* silent */ }
  }

  useEffect(() => { void loadHistory(); void loadCooldown(); void loadPaymentMethods(); void fetchMe(); }, []);

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
  const liveAmount = Number(amount) || 0;
  const liveFee    = Math.round(liveAmount * TOTAL_FEE_RATE * 100) / 100;
  const liveNet    = Math.round((liveAmount - liveFee) * 100) / 100;

  // ── Plan checks ───────────────────────────────────────────────────────────
  const isFreePlan    = user?.plan === 'free';
  const isPremiumPlan = user?.plan === 'premium';
  const isElitePlan   = user?.plan === 'elite';

  const planMinAmount = isElitePlan ? ELITE_PLAN_MIN_AMOUNT : isPremiumPlan ? PREMIUM_PLAN_MIN_AMOUNT : FREE_PLAN_MIN_AMOUNT;
  const effectiveMinLabel = `₱${planMinAmount.toLocaleString()}`;

  // ── Quick amounts filtered by balance ─────────────────────────────────────
  const balance = Number(user?.balance ?? 0);
  const effectiveMax = FREE_PLAN_MAX_AMOUNT; // global max applies to all plans
  const quickAmounts = useMemo(
    () => QUICK_AMOUNTS.filter((a) => a <= balance && a <= effectiveMax && a >= planMinAmount),
    [balance, effectiveMax, planMinAmount],
  );

  const selectedPm = paymentMethods.find((pm) => pm.id === selectedPmId) ?? null;

  // ── Validation ────────────────────────────────────────────────────────────
  function validate(): string | null {
    if (!amount || isNaN(liveAmount))            return 'Enter a valid amount.';
    if (liveAmount < planMinAmount)              return `Minimum payout for your plan is ${effectiveMinLabel}.`;
    if (liveAmount > MAX_AMOUNT)                 return `Maximum withdrawal is ₱${MAX_AMOUNT.toLocaleString()}.`;
    if (liveAmount > balance)                    return 'Insufficient balance.';
    if (!selectedPm)                             return 'Please add and select a payment method before withdrawing.';
    return null;
  }

  // Check proactively if free-plan user has already used their one withdrawal.
  // Rejected withdrawals don't count — the slot is restored so the user can retry.
  const hasUsedFreeWithdrawal = isFreePlan && history.some(
    (w) => !['cancelled', 'rejected'].includes(w.status),
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
    if (!selectedPm) return;
    setSubmitting(true);
    try {
      await api.post('/withdrawals', {
        amount:            liveAmount,
        payment_method_id: selectedPm.id,
      });
      setShowConfirm(false);
      setAmount('');
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
      if (errData?.code === 'quiz_gate_not_met') {
        setShowConfirm(false);
        void loadCooldown();
        setValidationError(errData.error ?? 'Complete today\'s quiz session first.');
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

  async function handleDeletePm(id: string) {
    if (!confirm('Remove this saved payment method?')) return;
    setDeletingPmId(id);
    try {
      await api.delete(`/payment-methods/${id}`);
      if (selectedPmId === id) setSelectedPmId('');
      toast.success('Payment method removed.');
      await loadPaymentMethods();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Failed to remove payment method.');
    } finally { setDeletingPmId(null); }
  }

  async function handleSetDefaultPm(id: string) {
    try {
      await api.put(`/payment-methods/${id}`, { is_default: true });
      await loadPaymentMethods();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Failed to update default.');
    }
  }

  function handlePmAdded(pm: PaymentMethod) {
    setShowAddPm(false);
    setSelectedPmId(pm.id);
    void loadPaymentMethods();
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
      {showReleaseBanner && (
        <div className="wd-release-backdrop">
        <div className="wd-release-overlay">
          <div className="wd-release-overlay-bg">
            <div className="wd-release-overlay-circle1" />
            <div className="wd-release-overlay-circle2" />
            <div className="wd-release-overlay-circle3" />
          </div>
          <div className="wd-release-content">
            <div className="wd-release-icon-ring">
              <CalendarDays size={38} />
            </div>
            <p className="wd-release-eyebrow">Payout Schedule</p>
            <h2 className="wd-release-headline">
              Withdrawals are<br />released on the
            </h2>
            <div className="wd-release-dates-row">
              <div className="wd-release-date-chip">
                <span className="wd-release-date-num">15</span>
                <span className="wd-release-date-suffix">th</span>
              </div>
              <span className="wd-release-date-sep">&amp;</span>
              <div className="wd-release-date-chip">
                <span className="wd-release-date-num">30</span>
                <span className="wd-release-date-suffix">th</span>
              </div>
            </div>
            <p className="wd-release-sub">
              of every month. Submit your withdrawal request anytime — it will be processed on the next release date.
            </p>
          </div>
          <div className="wd-release-footer">
            <button className="wd-release-cta" onClick={dismissReleaseBanner}>
              Got it!
            </button>
            <button className="wd-release-later" onClick={dismissReleaseBanner}>
              Remind me later
            </button>
          </div>
        </div>
        </div>
      )}

      {showConfirm && selectedPm && (
        <ConfirmModal
          amount={liveAmount}
          pm={selectedPm}
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
      {showAddPm && (
        <AddPaymentMethodModal
          onClose={() => setShowAddPm(false)}
          onAdded={handlePmAdded}
        />
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

      {/* Quiz earn gate */}
      {quizGatePassed === false && (
        <div className="alert alert--warning">
          <BookOpen size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>Earn ₱{quizEarnGate} in Quizly today to unlock withdrawal.</strong>{' '}
            You've earned ₱{quizTodayEarned.toFixed(2)} so far — ₱{Math.max(0, quizEarnGate - quizTodayEarned).toFixed(2)} more to go.{' '}
            <Link to="/tasks">Open Quizly →</Link>
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

        {/* 1 — Payment method picker (saved methods) */}
        <fieldset className="wd-fieldset">
          <legend className="wd-fieldset-legend" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
          }}>
            <span>Payment method</span>
            <button
              type="button"
              onClick={() => setShowAddPm(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--accent)', fontWeight: 600, fontSize: 12,
                padding: 0, fontFamily: 'inherit',
              }}
            >
              <Plus size={13} />
              Add payment method
            </button>
          </legend>

          {paymentMethods.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              padding: '18px 12px',
              border: '1px dashed var(--border)', borderRadius: 10,
              background: 'var(--bg-elevated)',
              textAlign: 'center',
            }}>
              <CreditCard size={22} style={{ color: 'var(--text-muted)' }} />
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, maxWidth: 320 }}>
                Save a GCash or PayPal account once so you don't have to re-enter the details on every withdrawal.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowAddPm(true)}
                style={{ height: 40, padding: '0 18px', fontSize: 13 }}
              >
                <Plus size={14} style={{ marginRight: 6 }} />
                Add your first payment method
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {paymentMethods.map((pm) => {
                const active = pm.id === selectedPmId;
                return (
                  <label
                    key={pm.id}
                    className={`wd-method-chip${active ? ' wd-method-chip--active' : ''}`}
                    style={{
                      flex: 'initial', justifyContent: 'flex-start', gap: 12,
                      padding: '12px 14px', cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="saved-pm"
                      value={pm.id}
                      checked={active}
                      onChange={() => setSelectedPmId(pm.id)}
                      className="sr-only"
                    />
                    {pm.method === 'gcash'
                      ? <Smartphone size={20} />
                      : <CreditCard  size={20} />}
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 13, fontWeight: 700, color: 'var(--text-heading)',
                      }}>
                        <span>{pm.method === 'gcash' ? 'GCash' : 'PayPal'}</span>
                        {pm.is_default && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                            color: 'var(--accent)',
                            background: 'var(--accent-light)',
                            padding: '2px 6px', borderRadius: 10,
                          }}>
                            <Star size={9} />
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 12, color: 'var(--text-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {pm.account_name} · {pm.account_number}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {!pm.is_default && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); void handleSetDefaultPm(pm.id); }}
                          title="Set as default"
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', padding: 6, borderRadius: 6,
                          }}
                        >
                          <Star size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); void handleDeletePm(pm.id); }}
                        disabled={deletingPmId === pm.id}
                        title="Remove payment method"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-muted)', padding: 6, borderRadius: 6,
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        {/* 2 — Amount */}
        <fieldset className="wd-fieldset">
          <legend className="wd-fieldset-legend">Amount</legend>

          {/* Quick-select chips */}
          {quickAmounts.length > 0 && (
            <div className="wd-quick-row">
              {quickAmounts.map((a) => (
                <button
                  key={a} type="button"
                  className={`wd-quick-chip${amount === String(a) ? ' wd-quick-chip--active' : ''}`}
                  onClick={() => setAmount(String(a))}
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
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
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
          disabled={kycBlocked || paymentMethods.length === 0 || quizGatePassed === false}
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
