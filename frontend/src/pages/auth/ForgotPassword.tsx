import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api.ts';
import type { AxiosError } from 'axios';

export default function ForgotPassword() {
  const [email,      setEmail]      = useState('');
  const [sent,       setSent]       = useState(false);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [loading,    setLoading]    = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setEmail(e.target.value);
    if (fieldError.email || fieldError.form) {
      setFieldError({});
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Enter a valid email address';
    }
    if (Object.keys(errs).length > 0) { setFieldError(errs); return; }

    setFieldError({});
    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      const axErr = err as AxiosError<{ error: string }>;
      setFieldError({ form: axErr.response?.data?.error ?? 'Something went wrong. Please try again.' });
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
          <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="email">Email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className={`form-input${fieldError.email ? ' form-input--error' : ''}`}
                  value={email}
                  onChange={handleChange}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  autoFocus
                />
                {fieldError.email && <p className="form-field-error" role="alert">{fieldError.email}</p>}
                {fieldError.form && <p className="form-field-error" role="alert">{fieldError.form}</p>}
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={loading}
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
        )}

        <p className="auth-footer">
          Remember your password?{' '}
          <Link to="/login" className="link">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
