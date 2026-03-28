import { useEffect, useState } from 'react';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import type { Withdrawal } from '../../types/index.ts';

const STATUS_LABEL: Record<string, string> = {
  pending:    'Pending',
  processing: 'Processing',
  paid:       'Paid',
  rejected:   'Rejected',
};

export default function Withdraw() {
  const { user, fetchMe }       = useAuth();
  const [form, setForm]         = useState({ amount: '', method: 'gcash' });
  const [history, setHistory]   = useState<Withdrawal[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage]   = useState({ type: '', text: '' });

  async function loadHistory() {
    try {
      const { data } = await api.get<{ data: Withdrawal[] }>('/withdrawals');
      setHistory(data.data);
    } catch { /* silent */ }
  }

  useEffect(() => { loadHistory(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    const amount = Number(form.amount);

    if (amount < 50)   { setMessage({ type: 'error', text: 'Minimum withdrawal is ₱50' }); return; }
    if (amount > 5000) { setMessage({ type: 'error', text: 'Maximum withdrawal is ₱5,000 per request' }); return; }
    if (amount > Number(user?.balance ?? 0)) {
      setMessage({ type: 'error', text: 'Insufficient balance' }); return;
    }

    setSubmitting(true);
    try {
      await api.post('/withdrawals', { amount, method: form.method });
      setMessage({ type: 'success', text: 'Withdrawal request submitted. Processing within 24 hours.' });
      setForm({ amount: '', method: 'gcash' });
      await Promise.all([loadHistory(), fetchMe()]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setMessage({ type: 'error', text: msg ?? 'Request failed.' });
    } finally {
      setSubmitting(false);
    }
  }

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

      <div className="two-col">
        <section className="card">
          <h2 className="card-title">New request</h2>

          {message.text && (
            <div className={`alert alert--${message.type}`} role="alert">{message.text}</div>
          )}

          <form onSubmit={handleSubmit} noValidate>
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
              <label className="form-label" htmlFor="amount">
                Amount (₱50 – ₱5,000)
              </label>
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
              disabled={submitting || !form.amount}
            >
              {submitting ? 'Submitting…' : 'Request withdrawal'}
            </button>
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
