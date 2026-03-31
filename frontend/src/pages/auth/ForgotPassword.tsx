import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api.ts';
import type { AxiosError } from 'axios';

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      const axErr = err as AxiosError<{ error: string }>;
      // Show generic error — don't expose whether email exists
      setError(axErr.response?.data?.error ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="brand-name">Plivio</h1>
          <p className="auth-subtitle">Reset your password</p>
        </div>

        {sent ? (
          <div className="alert alert--success" role="status">
            <strong>Check your inbox.</strong>
            <p style={{ margin: '6px 0 0', fontSize: '14px' }}>
              If <strong>{email}</strong> is registered, you will receive a reset
              link within a few minutes. Check your spam folder if it does not arrive.
            </p>
            <p style={{ margin: '12px 0 0', fontSize: '14px' }}>
              The link expires in <strong>15 minutes</strong>.
            </p>
          </div>
        ) : (
          <>
            {error && <div className="alert alert--error" role="alert">{error}</div>}

            <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="email">Email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={loading || !email.trim()}
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        )}

        <p className="auth-footer">
          Remember your password?{' '}
          <Link to="/login" className="link">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
