import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/authStore.jsx';

export default function TwoFactor() {
  const { verify2FA } = useAuth();
  const navigate      = useNavigate();

  const [token, setToken]     = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (token.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await verify2FA(token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="brand-name">Plivio</h1>
          <p className="auth-subtitle">Two-factor authentication</p>
        </div>

        <p className="auth-desc">
          Open your authenticator app and enter the 6-digit code.
        </p>

        {error && <div className="alert alert--error" role="alert">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="totp">Authentication code</label>
            <input
              id="totp"
              type="text"
              className="form-input form-input--otp"
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading || token.length !== 6}>
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      </div>
    </div>
  );
}
