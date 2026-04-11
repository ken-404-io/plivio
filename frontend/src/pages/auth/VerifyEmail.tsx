import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api.ts';
import { useAuth } from '../../store/authStore.tsx';

type Status = 'verifying' | 'success' | 'error';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const { fetchMe }    = useAuth();
  const token          = searchParams.get('token') ?? '';

  const [status,  setStatus]  = useState<Status>('verifying');
  const [message, setMessage] = useState('');

  // Guard against React 19 StrictMode double-invoking the effect in dev,
  // which would cause the second call to fail ("token already used") even
  // though the first call succeeded.
  const calledRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No token found. Please use the link from your email.');
      return;
    }

    if (calledRef.current) return;
    calledRef.current = true;

    api.post<{ auto_login?: boolean }>('/auth/verify-email', { token })
      .then(async ({ data }) => {
        setStatus('success');
        // The backend now issues session cookies on successful verification
        // so the user is signed in automatically. Pull their profile, then
        // send them straight to the dashboard after a short celebration.
        if (data.auto_login) {
          try { await fetchMe(); } catch { /* ignore */ }
          setTimeout(() => navigate('/dashboard', { replace: true }), 1200);
        }
      })
      .catch((err: { response?: { data?: { error?: string } } }) => {
        setStatus('error');
        setMessage(err.response?.data?.error ?? 'Verification failed. The link may have expired.');
      });
  }, [token, fetchMe, navigate]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="brand-name">Plivio</h1>
          <p className="auth-subtitle">Email verification</p>
        </div>

        {status === 'verifying' && (
          <div className="verify-email-state">
            <div className="spinner spinner--lg" />
            <p className="text-muted" style={{ marginTop: 16 }}>Verifying your email…</p>
          </div>
        )}

        {status === 'success' && (
          <div className="alert alert--success" role="status">
            <strong>Email verified!</strong>
            <p style={{ margin: '6px 0 0', fontSize: '14px' }}>
              Your email address has been confirmed. Redirecting you to your dashboard…
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="alert alert--error" role="alert">
            <strong>Verification failed.</strong>
            <p style={{ margin: '6px 0 0', fontSize: '14px' }}>{message}</p>
          </div>
        )}

        <p className="auth-footer" style={{ marginTop: 20 }}>
          {status === 'success' ? (
            <Link to="/dashboard" className="link">Go to Dashboard</Link>
          ) : (
            <Link to="/dashboard" className="link">Back to Dashboard</Link>
          )}
        </p>
      </div>
    </div>
  );
}
