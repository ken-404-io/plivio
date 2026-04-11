import { useRef, useState, type ChangeEvent, type KeyboardEvent, type ClipboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import type { AxiosError } from 'axios';

// ─── Password strength ────────────────────────────────────────────────────────
type StrengthLevel = 0 | 1 | 2 | 3 | 4;
const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'] as const;
const STRENGTH_COLORS = ['', '#ef4444', '#f59e0b', '#eab308', '#22c55e'] as const;

function getStrength(pw: string): StrengthLevel {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4) as StrengthLevel;
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

function EyeIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function FacebookLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" fill="#1877F2"/>
    </svg>
  );
}

function GitHubLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" fill="currentColor"/>
    </svg>
  );
}

/** Returns a persistent device UUID stored in localStorage. */
function getDeviceId(): string {
  const KEY = 'plivio_did';
  let id = localStorage.getItem(KEY);
  if (!id) {
    // crypto.randomUUID is available in all modern browsers
    id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(KEY, id);
  }
  return id;
}

export default function Register() {
  const { register, fetchMe, transition } = useAuth();
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({
    username: '', email: '', password: '',
    referral_code: searchParams.get('ref') ?? '',
  });
  const [showPass,   setShowPass]   = useState(false);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [loading,    setLoading]    = useState(false);

  // OTP verification screen state — shown after successful registration.
  const [verifyEmail,    setVerifyEmail]    = useState<string | null>(null);
  const [otpDigits,      setOtpDigits]      = useState<string[]>(['', '', '', '', '', '']);
  const [otpError,       setOtpError]       = useState('');
  const [otpSubmitting,  setOtpSubmitting]  = useState(false);
  const [resending,      setResending]      = useState(false);
  const [resent,         setResent]         = useState(false);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    // Clear field-level error as the user types
    if (fieldError[e.target.name]) {
      setFieldError((prev) => {
        const next = { ...prev };
        delete next[e.target.name];
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.username.trim())      errs.username = 'Username is required';
    if (!form.email.trim())         errs.email    = 'Email is required';
    if (form.password.length < 8)   errs.password = 'Password must be at least 8 characters';
    if (Object.keys(errs).length > 0) { setFieldError(errs); return; }

    setFieldError({});
    setLoading(true);
    try {
      const result = await register({ ...form, device_id: getDeviceId() });
      setVerifyEmail(result.email);
      // Auto-focus the first OTP input once the verify screen mounts
      setTimeout(() => otpInputRefs.current[0]?.focus(), 50);
    } catch (err) {
      const axErr = err as AxiosError<{ error: string }>;
      setFieldError({ form: axErr.response?.data?.error || 'Registration failed. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  // ── OTP input handlers ──────────────────────────────────────────────────
  function handleOtpChange(index: number, value: string) {
    // Accept only digits; take the last char if multiple typed
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    setOtpError('');
    // Auto-advance to the next field
    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
    // Auto-submit when all 6 digits are filled
    if (next.every((d) => d.length === 1)) {
      void submitOtp(next.join(''));
    }
  }

  function handleOtpKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0)  otpInputRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < 5) otpInputRefs.current[index + 1]?.focus();
  }

  function handleOtpPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = text.padEnd(6, '').split('').slice(0, 6);
    while (next.length < 6) next.push('');
    setOtpDigits(next);
    setOtpError('');
    const lastFilled = Math.min(text.length, 5);
    otpInputRefs.current[lastFilled]?.focus();
    if (text.length === 6) void submitOtp(text);
  }

  async function submitOtp(code: string) {
    if (!verifyEmail || otpSubmitting) return;
    setOtpSubmitting(true);
    setOtpError('');
    try {
      await api.post<{ auto_login?: boolean }>('/auth/verify-email', {
        email: verifyEmail, code,
      });
      await fetchMe();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const axErr = err as AxiosError<{ error: string }>;
      setOtpError(axErr.response?.data?.error || 'Invalid or expired code.');
      // Clear the inputs so the user can retry
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => otpInputRefs.current[0]?.focus(), 10);
    } finally {
      setOtpSubmitting(false);
    }
  }

  async function handleResend() {
    if (!verifyEmail || resending || resent) return;
    setResending(true);
    setOtpError('');
    try {
      await api.post('/auth/verify-email/resend', { email: verifyEmail });
      setResent(true);
      setTimeout(() => setResent(false), 30_000);
    } catch (err) {
      const axErr = err as AxiosError<{ error: string }>;
      setOtpError(axErr.response?.data?.error || 'Could not send code. Try again later.');
    } finally {
      setResending(false);
    }
  }

  function socialLogin(provider: 'google' | 'facebook' | 'github') {
    // Pass referral code through state if present
    const ref = form.referral_code;
    window.location.href = `${API_BASE}/auth/${provider}${ref ? `?ref=${ref}` : ''}`;
  }

  // ── Post-registration OTP screen ─────────────────────────────────────
  if (verifyEmail) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="brand-name">Plivio</h1>
            <p className="auth-subtitle">Enter your verification code</p>
          </div>

          <p className="text-muted" style={{ fontSize: 14, marginBottom: 18, textAlign: 'center' }}>
            We sent a 6-digit code to<br />
            <strong style={{ color: 'var(--text)' }}>{verifyEmail}</strong>
          </p>

          <div className="otp-input-row" role="group" aria-label="One-time code">
            {otpDigits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { otpInputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                className={`otp-input${otpError ? ' otp-input--error' : ''}`}
                value={d}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                onPaste={handleOtpPaste}
                disabled={otpSubmitting}
                aria-label={`Digit ${i + 1}`}
              />
            ))}
          </div>

          {otpError && (
            <p className="form-field-error" role="alert" style={{ marginTop: 10, textAlign: 'center' }}>
              {otpError}
            </p>
          )}

          {otpSubmitting && (
            <p className="text-muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 12 }}>
              Verifying…
            </p>
          )}

          <p className="text-muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 18 }}>
            Didn't get a code? Check your spam folder or
          </p>
          <button
            type="button"
            className="btn btn-outline btn-full"
            onClick={() => { void handleResend(); }}
            disabled={resending || resent}
            style={{ marginTop: 6 }}
          >
            {resending ? 'Sending…' : resent ? 'Code sent — try again in 30s' : 'Resend code'}
          </button>

          <p className="auth-footer" style={{ marginTop: 20 }}>
            Wrong email?{' '}
            <button
              type="button"
              className="link"
              onClick={() => {
                setVerifyEmail(null);
                setOtpDigits(['', '', '', '', '', '']);
                setOtpError('');
              }}
            >
              Start over
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      {/* Auth transition overlay */}
      {transition && (
        <div className="auth-transition-overlay">
          <div className="auth-transition-content">
            <div className="auth-transition-spinner" />
            <p className="auth-transition-text">
              {transition === 'logging-in' ? 'Logging in...' : 'Logging out...'}
            </p>
          </div>
        </div>
      )}

      <div className="auth-card">
        <div className="auth-header">
          <h1 className="brand-name">Plivio</h1>
          <p className="auth-subtitle">Create your free account</p>
        </div>

        {fieldError.form && (
          <p className="form-field-error" role="alert" style={{ marginBottom: 12 }}>
            {fieldError.form}
          </p>
        )}

        <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="username">Username</label>
            <input
              id="username" name="username" type="text"
              className={`form-input${fieldError.username ? ' form-input--error' : ''}`}
              value={form.username} onChange={handleChange}
              autoComplete="username" placeholder="myusername"
              minLength={3} maxLength={50}
            />
            {fieldError.username && <p className="form-field-error">{fieldError.username}</p>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email" name="email" type="email"
              className={`form-input${fieldError.email ? ' form-input--error' : ''}`}
              value={form.email} onChange={handleChange}
              autoComplete="email" placeholder="you@example.com"
            />
            {fieldError.email && <p className="form-field-error">{fieldError.email}</p>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <div className="input-password-wrap">
              <input
                id="password" name="password"
                type={showPass ? 'text' : 'password'}
                className={`form-input${fieldError.password ? ' form-input--error' : ''}`}
                value={form.password} onChange={handleChange}
                autoComplete="new-password" placeholder="Min. 8 characters"
                minLength={8}
              />
              <button
                type="button"
                className="input-password-toggle"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Hide password' : 'Show password'}
              >
                <EyeIcon visible={showPass} />
              </button>
            </div>
            {form.password.length > 0 && (() => {
              const s = getStrength(form.password);
              return (
                <div className="pw-strength">
                  <div className="pw-strength-track">
                    {[1, 2, 3, 4].map((seg) => (
                      <div
                        key={seg}
                        className="pw-strength-seg"
                        style={{ background: s >= seg ? STRENGTH_COLORS[s] : 'var(--border)', transition: 'background 0.2s' }}
                      />
                    ))}
                  </div>
                  <span className="pw-strength-label" style={{ color: STRENGTH_COLORS[s] }}>
                    {STRENGTH_LABELS[s]}
                  </span>
                </div>
              );
            })()}
            {fieldError.password && <p className="form-field-error">{fieldError.password}</p>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="referral_code">
              Referral code <span className="form-optional">(optional)</span>
            </label>
            <input
              id="referral_code" name="referral_code" type="text"
              className="form-input"
              value={form.referral_code} onChange={handleChange}
              placeholder="XXXXXXXX" maxLength={8}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="auth-divider"><span>or sign up with</span></div>

        <div className="social-login-group">
          <button className="btn-social btn-social--google"   onClick={() => socialLogin('google')}>
            <GoogleLogo />   Google
          </button>
          <button className="btn-social btn-social--facebook" onClick={() => socialLogin('facebook')}>
            <FacebookLogo /> Facebook
          </button>
          <button className="btn-social btn-social--github"   onClick={() => socialLogin('github')}>
            <GitHubLogo />   GitHub
          </button>
        </div>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" className="link">Sign in</Link>
        </p>

        <p className="auth-terms">
          By creating an account you agree to our{' '}
          <Link to="/terms" className="link">Terms of Service</Link> and{' '}
          <Link to="/privacy" className="link">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
