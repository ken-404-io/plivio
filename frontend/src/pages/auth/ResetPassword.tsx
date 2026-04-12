import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api.ts';
import type { AxiosError } from 'axios';

export default function ResetPassword() {
  const navigate              = useNavigate();
  const [searchParams]        = useSearchParams();
  const token                 = searchParams.get('token') ?? '';

  const [password,   setPassword]   = useState('');
  const [confirm,    setConfirm]    = useState('');
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [success,    setSuccess]    = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [tokenBad,   setTokenBad]   = useState(false);

  useEffect(() => {
    if (!token || token.length !== 64 || !/^[a-f0-9]+$/.test(token)) {
      setTokenBad(true);
    }
  }, [token]);

  function clearFieldError(name: string) {
    setFieldError((prev) => {
      if (!prev[name] && !prev.form) return prev;
      const next = { ...prev };
      delete next[name];
      delete next.form;
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};

    if (password.length < 8) {
      errs.password = 'Password must be at least 8 characters.';
    }
    if (password !== confirm) {
      errs.confirm = 'Passwords do not match.';
    }
    if (Object.keys(errs).length > 0) { setFieldError(errs); return; }

    setFieldError({});
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setSuccess(true);
      setTimeout(() => { navigate('/login'); }, 3000);
    } catch (err) {
      const axErr = err as AxiosError<{ error: string }>;
      setFieldError({ form: axErr.response?.data?.error ?? 'Reset failed. The link may have expired.' });
    } finally {
      setLoading(false);
    }
  }

  if (tokenBad) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="brand-name">Plivio</h1>
          </div>
          <div className="alert alert--error">
            Invalid or missing reset token. Please request a new reset link.
          </div>
          <p className="auth-footer">
            <Link to="/forgot-password" className="link">Request new link</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="brand-name">Plivio</h1>
          <p className="auth-subtitle">Choose a new password</p>
        </div>

        {success ? (
          <div className="alert alert--success" role="status">
            <strong>Password updated!</strong>
            <p style={{ margin: '6px 0 0', fontSize: '14px' }}>
              Redirecting you to the login page…
            </p>
          </div>
        ) : (
          <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="password">New password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className={`form-input${fieldError.password ? ' form-input--error' : ''}`}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  autoFocus
                />
                {fieldError.password && <p className="form-field-error" role="alert">{fieldError.password}</p>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="confirm">Confirm new password</label>
                <input
                  id="confirm"
                  name="confirm"
                  type="password"
                  className={`form-input${fieldError.confirm ? ' form-input--error' : ''}`}
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); clearFieldError('confirm'); }}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Repeat password"
                />
                {fieldError.confirm && <p className="form-field-error" role="alert">{fieldError.confirm}</p>}
                {fieldError.form && <p className="form-field-error" role="alert">{fieldError.form}</p>}
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={loading || !password || !confirm}
              >
                {loading ? 'Saving…' : 'Set new password'}
              </button>
            </form>
        )}

        <p className="auth-footer">
          <Link to="/login" className="link">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
