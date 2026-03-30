import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../store/authStore.tsx';
import type { AxiosError } from 'axios';

export default function Register() {
  const { register }   = useAuth();
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();

  // Pre-fill referral code from URL: /register?ref=ABCD1234
  const [form, setForm] = useState({
    username: '', email: '', password: '',
    referral_code: searchParams.get('ref') ?? '',
  });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await register(form);
      navigate('/dashboard');
    } catch (err) {
      const axErr = err as AxiosError<{ error: string }>;
      setError(axErr.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="brand-name">Plivio</h1>
          <p className="auth-subtitle">Create your free account</p>
        </div>

        {error && <div className="alert alert--error" role="alert">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              className="form-input"
              value={form.username}
              onChange={handleChange}
              required
              autoComplete="username"
              placeholder="myusername"
              minLength={3}
              maxLength={50}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              className="form-input"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              className="form-input"
              value={form.password}
              onChange={handleChange}
              required
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              minLength={8}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="referral_code">
              Referral code <span className="form-optional">(optional)</span>
            </label>
            <input
              id="referral_code"
              name="referral_code"
              type="text"
              className="form-input"
              value={form.referral_code}
              onChange={handleChange}
              placeholder="XXXXXXXX"
              maxLength={8}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" className="link">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
