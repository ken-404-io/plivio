import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import type { Withdrawal } from '../../types/index.ts';
import { Smartphone, CreditCard, Banknote } from 'lucide-react';

const STATUS_LABEL: Record<string, string> = {
  pending:    'Pending',
  processing: 'Processing',
  paid:       'Paid',
  rejected:   'Rejected',
};

function MethodIcon({ method }: { method: string }) {
  if (method === 'gcash')  return <Smartphone size={18} />;
  if (method === 'paypal') return <CreditCard  size={18} />;
  return <Banknote size={18} />;
}

export default function Withdraw() {
  const { user, fetchMe } = useAuth();
  const toast             = useToast();

  const [form,       setForm]       = useState({ amount: '', method: 'gcash' });
  const [history,    setHistory]    = useState<Withdrawal[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function loadHistory() {
    try {
      const { data } = await api.get<{ data: Withdrawal[] }>('/withdrawals');
      setHistory(data.data);
    } catch { /* silent */ }
  }

  useEffect(() => { void loadHistory(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);

    if (amount < 50)   { toast.error('Minimum withdrawal is ₱50'); return; }
    if (amount > 5000) { toast.error('Maximum withdrawal is ₱5,000 per request'); return; }
    if (amount > Number(user?.balance ?? 0)) { toast.error('Insufficient balance'); return; }

    setSubmitting(true);
    try {
      await api.post('/withdrawals', { amount, method: form.method });
      toast.success('Withdrawal request submitted. Processing within 24 hours.');
      setForm({ amount: '', method: 'gcash' });
      await Promise.all([loadHistory(), fetchMe()]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  }

  const kycStatus  = user?.kyc_status ?? 'none';
  const kycBlocked = kycStatus !== 'approved';

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Withdraw</h1>
          <p className="page-subtitle">
            Available balance: <strong>₱{Number(user?.balance ?? 0).toFixed(2)}</strong>
          </p>
        </div>
      </header>

      {kycBlocked && (
        <div className={`alert kyc-gate-alert ${kycStatus === 'pending' ? 'alert--info' : 'alert--warning'}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div>
            {kycStatus === 'pending' ? (
              <><strong>KYC under review.</strong> Withdrawals will be enabled once verified.</>
            ) : kycStatus === 'rejected' ? (
              <><strong>KYC rejected.</strong> <Link to="/kyc">Resubmit documents →</Link></>
            ) : (
              <><strong>Verification required.</strong> <Link to="/kyc">Complete KYC to withdraw →</Link></>
            )}
          </div>
        </div>
      )}

      {/* Balance pill */}
      <div className="withdraw-balance-card">
        <div className="withdraw-balance-left">
          <span className="withdraw-balance-label">Available to withdraw</span>
          <span className="withdraw-balance-value">₱{Number(user?.balance ?? 0).toFixed(2)}</span>
        </div>
        <div className="withdraw-balance-right">
          <span className="withdraw-min-note">Min ₱50 · Max ₱5,000</span>
        </div>
      </div>

      {/* Request form */}
      <section className="card">
        <h2 className="card-title">New withdrawal request</h2>
        <form onSubmit={(e) => { void handleSubmit(e); }} noValidate className="withdraw-form">
          <div className="withdraw-method-grid">
            {['gcash', 'paypal'].map((m) => (
              <label key={m} className={`withdraw-method-option${form.method === m ? ' withdraw-method-option--active' : ''}`}>
                <input
                  type="radio"
                  name="method"
                  value={m}
                  checked={form.method === m}
                  onChange={() => setForm((f) => ({ ...f, method: m }))}
                  className="sr-only"
                />
                <span className="withdraw-method-icon"><MethodIcon method={m} /></span>
                <span className="withdraw-method-label">{m.toUpperCase()}</span>
              </label>
            ))}
          </div>

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
                min={50} max={5000} step={1}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={submitting || !form.amount || kycBlocked}
          >
            {submitting ? 'Submitting…' : 'Request withdrawal'}
          </button>
        </form>
      </section>

      {/* History */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Withdrawal history</h2>
        </div>

        {history.length === 0 ? (
          <div className="empty-state">
            <p>No withdrawals yet.</p>
          </div>
        ) : (
          <div className="earnings-list">
            {history.map((w) => (
              <div key={w.id} className="earning-row">
                <div className="earning-row-icon">
                  <MethodIcon method={w.method} />
                </div>
                <div className="earning-row-body">
                  <p className="earning-row-title">{w.method.toUpperCase()} Withdrawal</p>
                  <div className="earning-row-meta">
                    <span className={`status-dot status-dot--${w.status}`}>
                      {STATUS_LABEL[w.status] ?? w.status}
                    </span>
                    <span className="earning-row-date">
                      {new Date(w.requested_at).toLocaleDateString('en-PH', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
                <span className="earning-row-amount" style={{ color: 'var(--text-heading)' }}>
                  ₱{Number(w.amount).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
