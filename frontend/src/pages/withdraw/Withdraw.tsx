import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import type { Withdrawal } from '../../types/index.ts';

const STATUS_LABEL: Record<string, string> = {
  pending:    'Pending',
  processing: 'Processing',
  paid:       'Paid',
  rejected:   'Rejected',
};

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

  const kycStatus = user?.kyc_status ?? 'none';
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
              <><strong>KYC under review.</strong> Withdrawals will be enabled once your identity is verified.</>
            ) : kycStatus === 'rejected' ? (
              <><strong>KYC rejected.</strong> Please resubmit your documents. <Link to="/kyc">Update KYC →</Link></>
            ) : (
              <><strong>Identity verification required.</strong> You must complete KYC before withdrawing. <Link to="/kyc">Verify now →</Link></>
            )}
          </div>
        </div>
      )}

      <div className="two-col">
        <section className="card">
          <h2 className="card-title">New request</h2>
          <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="method">Method</label>
              <select
                id="method"
                className="form-input"
                value={form.method}
                onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
              >
                <option value="gcash">GCash</option>
                <option value="paypal">PayPal</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="amount">Amount (₱50 – ₱5,000)</label>
              <input
                id="amount"
                type="number"
                className="form-input"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                min={50}
                max={5000}
                step={1}
                placeholder="0.00"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={submitting || !form.amount || kycBlocked}
            >
              {submitting ? 'Submitting…' : 'Request withdrawal'}
            </button>
            {kycBlocked && (
              <p className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>
                Complete KYC verification to enable withdrawals.
              </p>
            )}
          </form>
        </section>

        <section className="card">
          <h2 className="card-title">Withdrawal history</h2>
          {history.length === 0 ? (
            <p className="text-muted">No withdrawals yet.</p>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Method</th><th>Amount</th><th>Status</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {history.map((w) => (
                    <tr key={w.id}>
                      <td>{w.method.toUpperCase()}</td>
                      <td>₱{Number(w.amount).toFixed(2)}</td>
                      <td>
                        <span className={`status-dot status-dot--${w.status}`}>
                          {STATUS_LABEL[w.status] ?? w.status}
                        </span>
                      </td>
                      <td className="text-muted">
                        {new Date(w.requested_at).toLocaleDateString('en-PH')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
