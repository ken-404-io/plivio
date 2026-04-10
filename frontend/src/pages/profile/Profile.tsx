import { useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import BackButton from '../../components/common/BackButton.tsx';

type Tab = 'account' | 'security' | 'email';
type TwoFaPhase = 'idle' | 'scanning' | 'disabling';

// ─── 2FA Section ─────────────────────────────────────────────────────────────

interface TwoFaSectionProps {
  has2fa:    boolean;
  onToggled: () => void;
}

function TwoFaSection({ has2fa, onToggled }: TwoFaSectionProps) {
  const toast = useToast();

  const [phase,  setPhase]  = useState<TwoFaPhase>('idle');
  const [qrUrl,  setQrUrl]  = useState('');
  const [secret, setSecret] = useState('');
  const [token,  setToken]  = useState('');
  const [busy,   setBusy]   = useState(false);

  async function handleSetup() {
    setBusy(true);
    try {
      const { data } = await api.post<{ qr: string; secret: string }>('/auth/2fa/setup');
      setQrUrl(data.qr);
      setSecret(data.secret);
      setPhase('scanning');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Could not start 2FA setup.');
    } finally {
      setBusy(false);
    }
  }

  async function handleEnable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/2fa/enable', { token });
      toast.success('2FA is now active on your account.');
      setPhase('idle');
      setToken('');
      onToggled();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Invalid verification code.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/2fa/disable', { token });
      toast.success('2FA has been removed from your account.');
      setPhase('idle');
      setToken('');
      onToggled();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Invalid code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="security-item">
      <div className="security-item-header">
        <div>
          <h3 className="security-item-title">Two-Factor Authentication</h3>
          <p className="security-item-desc">
            Add a second layer of security using an authenticator app.
          </p>
        </div>
        <span className={`badge ${has2fa ? 'badge--success' : ''}`}>
          {has2fa ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {phase === 'idle' && !has2fa && (
        <button className="btn btn-primary btn-sm" onClick={() => { void handleSetup(); }} disabled={busy}>
          {busy ? 'Setting up…' : 'Enable 2FA'}
        </button>
      )}

      {phase === 'idle' && has2fa && (
        <button className="btn btn-ghost btn-sm" onClick={() => setPhase('disabling')}>
          Disable 2FA
        </button>
      )}

      {phase === 'scanning' && (
        <div className="twofa-setup">
          <p className="security-item-desc">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.),
            then enter the 6-digit code to confirm.
          </p>
          <div className="qr-wrapper">
            <img src={qrUrl} alt="2FA QR code" className="qr-image" />
          </div>
          <details className="secret-reveal">
            <summary>Can't scan? Enter key manually</summary>
            <code className="secret-key">{secret}</code>
          </details>
          <form onSubmit={(e) => { void handleEnable(e); }} className="twofa-confirm-form">
            <input
              type="text"
              inputMode="numeric"
              className="form-input form-input--otp"
              placeholder="000000"
              value={token}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setToken(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              maxLength={6}
              required
            />
            <div className="twofa-confirm-actions">
              <button type="submit" className="btn btn-primary" disabled={busy || token.length !== 6}>
                {busy ? 'Verifying…' : 'Confirm & Enable'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { setPhase('idle'); setToken(''); }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {phase === 'disabling' && (
        <form onSubmit={(e) => { void handleDisable(e); }} className="twofa-confirm-form">
          <p className="security-item-desc">
            Enter your current authenticator code to confirm removal.
          </p>
          <input
            type="text"
            inputMode="numeric"
            className="form-input form-input--otp"
            placeholder="000000"
            value={token}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setToken(e.target.value.replace(/\D/g, '').slice(0, 6))
            }
            maxLength={6}
            required
          />
          <div className="twofa-confirm-actions">
            <button type="submit" className="btn btn-ghost" disabled={busy || token.length !== 6}>
              {busy ? 'Disabling…' : 'Confirm Disable'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => { setPhase('idle'); setToken(''); }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Password strength helper ─────────────────────────────────────────────────

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

// ─── Change Password Section ──────────────────────────────────────────────────

function ChangePasswordSection() {
  const toast = useToast();

  const [form, setForm] = useState({
    current_password: '',
    new_password:     '',
    confirm_password: '',
  });
  const [busy,    setBusy]    = useState(false);
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showCon, setShowCon] = useState(false);

  const strength = getStrength(form.new_password);
  const mismatch = form.confirm_password.length > 0 && form.new_password !== form.confirm_password;

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.new_password !== form.confirm_password) {
      toast.error('New passwords do not match.');
      return;
    }
    if (form.new_password.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await api.put('/users/me/password', {
        current_password: form.current_password,
        new_password:     form.new_password,
      });
      toast.success('Password updated successfully.');
      setForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Could not update password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="security-item">
      <div className="security-item-header">
        <div>
          <h3 className="security-item-title">Change Password</h3>
          <p className="security-item-desc">
            Use a strong, unique password you don't use anywhere else.
          </p>
        </div>
      </div>

      <form onSubmit={(e) => { void handleSubmit(e); }} className="password-form" noValidate>
        {/* Current password */}
        <div className="form-group">
          <label className="form-label" htmlFor="current_password">Current password</label>
          <div className="pw-input-wrap">
            <input
              id="current_password"
              name="current_password"
              type={showCur ? 'text' : 'password'}
              className="form-input"
              value={form.current_password}
              onChange={handleChange}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="pw-toggle"
              onClick={() => setShowCur((v) => !v)}
              aria-label={showCur ? 'Hide password' : 'Show password'}
            >
              {showCur ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* New password + strength meter */}
        <div className="form-group">
          <label className="form-label" htmlFor="new_password">New password</label>
          <div className="pw-input-wrap">
            <input
              id="new_password"
              name="new_password"
              type={showNew ? 'text' : 'password'}
              className="form-input"
              value={form.new_password}
              onChange={handleChange}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <button
              type="button"
              className="pw-toggle"
              onClick={() => setShowNew((v) => !v)}
              aria-label={showNew ? 'Hide password' : 'Show password'}
            >
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Strength bar */}
          {form.new_password.length > 0 && (
            <div className="pw-strength">
              <div className="pw-strength-track">
                {[1, 2, 3, 4].map((seg) => (
                  <div
                    key={seg}
                    className="pw-strength-seg"
                    style={{
                      background: strength >= seg
                        ? STRENGTH_COLORS[strength]
                        : 'var(--border)',
                      transition: 'background 0.2s',
                    }}
                  />
                ))}
              </div>
              <span className="pw-strength-label" style={{ color: STRENGTH_COLORS[strength] }}>
                {STRENGTH_LABELS[strength]}
              </span>
            </div>
          )}
        </div>

        {/* Confirm password */}
        <div className="form-group">
          <label className="form-label" htmlFor="confirm_password">Confirm new password</label>
          <div className="pw-input-wrap">
            <input
              id="confirm_password"
              name="confirm_password"
              type={showCon ? 'text' : 'password'}
              className={`form-input${mismatch ? ' form-input--error' : ''}`}
              value={form.confirm_password}
              onChange={handleChange}
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              className="pw-toggle"
              onClick={() => setShowCon((v) => !v)}
              aria-label={showCon ? 'Hide password' : 'Show password'}
            >
              {showCon ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {mismatch && (
            <p className="form-error-hint">Passwords don't match.</p>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !form.current_password || !form.new_password || !form.confirm_password || mismatch}
        >
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}

// ─── Avatar Upload ─────────────────────────────────────────────────────────────

function AvatarUpload({ avatarUrl, username, onUploaded }: {
  avatarUrl: string | null;
  username: string;
  onUploaded: () => void;
}) {
  const toast     = useToast();
  const inputRef  = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  // Cloudinary URLs are absolute; legacy local paths are relative
  const src = avatarUrl
    ? (avatarUrl.startsWith('http') ? avatarUrl : avatarUrl)
    : null;

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Avatar must be JPEG, PNG or WEBP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Avatar must be under 2 MB.');
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    setBusy(true);
    try {
      await api.post('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Avatar updated.');
      onUploaded();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="avatar-upload-section">
      <div
        className="avatar-upload-btn"
        onClick={() => !busy && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Change profile photo"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      >
        {src ? (
          <img src={src} alt="Your avatar" className="avatar-img" />
        ) : (
          <div className="avatar-placeholder">
            {username.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="avatar-overlay">
          {busy ? <div className="spinner spinner--sm" /> : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
                stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <p className="avatar-hint">Tap to change photo · JPEG, PNG, WEBP · 2 MB max</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="kyc-file-input"
        onChange={(e) => { void handleFile(e); }}
      />
    </div>
  );
}

// ─── Email Change Section ─────────────────────────────────────────────────────

function EmailChangeSection() {
  const toast = useToast();
  const [newEmail, setNewEmail] = useState('');
  const [busy,     setBusy]     = useState(false);
  const [sent,     setSent]     = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!newEmail.includes('@')) {
      toast.error('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/users/me/change-email', { new_email: newEmail });
      setSent(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Could not send email change request.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="security-item">
        <div className="alert alert--success">
          A confirmation link has been sent to <strong>{newEmail}</strong>.
          Click the link to confirm your new email address. It expires in 1 hour.
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setSent(false); setNewEmail(''); }}>
          Change a different email
        </button>
      </div>
    );
  }

  return (
    <div className="security-item">
      <div className="security-item-header">
        <div>
          <h3 className="security-item-title">Change Email Address</h3>
          <p className="security-item-desc">
            A confirmation link will be sent to your new address to verify the change.
          </p>
        </div>
      </div>
      <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
        <div className="form-group">
          <label className="form-label" htmlFor="new_email">New email address</label>
          <input
            id="new_email"
            type="email"
            className="form-input"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            maxLength={254}
            required
            autoComplete="email"
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !newEmail}
        >
          {busy ? 'Sending…' : 'Send confirmation link'}
        </button>
      </form>
    </div>
  );
}

// ─── Profile Page ─────────────────────────────────────────────────────────────

export default function Profile() {
  const { user, fetchMe } = useAuth();

  const [tab,    setTab]    = useState<Tab>('account');
  const [copied, setCopied] = useState(false);

  const joinDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-PH', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : '—';

  function copyReferralCode() {
    if (!user?.referral_code) return;
    void navigator.clipboard.writeText(user.referral_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <BackButton />
          <h1 className="page-title">Profile</h1>
          <p className="page-subtitle">Manage your account details and security settings</p>
        </div>
      </header>

      <div className="profile-hero card">
        <AvatarUpload
          avatarUrl={user?.avatar_url ?? null}
          username={user?.username ?? '?'}
          onUploaded={() => { void fetchMe(); }}
        />
        <div className="profile-hero-info">
          <p className="profile-username">{user?.username}</p>
          <p className="profile-email">{user?.email}</p>
          <div className="profile-hero-meta">
            <span className={`plan-badge plan-badge--${user?.plan ?? 'free'}`}>
              {user?.plan?.toUpperCase() ?? 'FREE'}
            </span>
            {user?.is_verified && (
              <span className="badge badge--success">Verified</span>
            )}
            {user?.kyc_status === 'approved' && (
              <span className="badge badge--success">KYC</span>
            )}
          </div>
          <span className="profile-join-date">Joined {joinDate}</span>
        </div>
        <div className="profile-balance-row">
          <span className="profile-balance-label">Balance</span>
          <span className="profile-balance-value">₱{Number(user?.balance ?? 0).toFixed(2)}</span>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab-btn${tab === 'account' ? ' tab-btn--active' : ''}`}
          onClick={() => setTab('account')}
        >
          Account
        </button>
        <button
          className={`tab-btn${tab === 'security' ? ' tab-btn--active' : ''}`}
          onClick={() => setTab('security')}
        >
          Security
        </button>
        <button
          className={`tab-btn${tab === 'email' ? ' tab-btn--active' : ''}`}
          onClick={() => setTab('email')}
        >
          Email
        </button>
      </div>

      {tab === 'account' && (
        <div className="profile-sections">
          <div className="card">
            <h2 className="card-title">Account details</h2>
            <dl className="detail-list">
              <div className="detail-row">
                <dt className="detail-label">Username</dt>
                <dd className="detail-value">{user?.username}</dd>
              </div>
              <div className="detail-row">
                <dt className="detail-label">Email</dt>
                <dd className="detail-value">
                  {user?.email}
                  {user?.is_email_verified
                    ? <span className="badge badge--success ml-2">Verified</span>
                    : <span className="badge ml-2">Unverified</span>
                  }
                </dd>
              </div>
              <div className="detail-row">
                <dt className="detail-label">KYC status</dt>
                <dd className="detail-value">
                  <span className={`badge ${
                    user?.kyc_status === 'approved' ? 'badge--success' :
                    user?.kyc_status === 'pending'  ? 'badge--warning' :
                    user?.kyc_status === 'rejected' ? 'badge--error'   : ''
                  }`}>
                    {user?.kyc_status === 'approved' ? 'Approved' :
                     user?.kyc_status === 'pending'  ? 'Pending review' :
                     user?.kyc_status === 'rejected' ? 'Rejected' : 'Not submitted'}
                  </span>
                </dd>
              </div>
              <div className="detail-row">
                <dt className="detail-label">Current plan</dt>
                <dd className="detail-value">
                  <span className={`plan-badge plan-badge--${user?.plan ?? 'free'}`}>
                    {user?.plan?.toUpperCase() ?? 'FREE'}
                  </span>
                  {user?.sub_expires_at && (
                    <span className="text-muted" style={{ marginLeft: 8, fontSize: 13 }}>
                      · expires {new Date(user.sub_expires_at).toLocaleDateString('en-PH')}
                    </span>
                  )}
                </dd>
              </div>
              <div className="detail-row">
                <dt className="detail-label">Member since</dt>
                <dd className="detail-value">{joinDate}</dd>
              </div>
            </dl>
          </div>

          <div className="card">
            <h2 className="card-title">Referral code</h2>
            <p className="text-muted" style={{ fontSize: 14, marginBottom: 16 }}>
              Share this code to earn a bonus when friends sign up.
            </p>
            <div className="referral-field">
              <span className="referral-code">{user?.referral_code ?? '—'}</span>
              <button
                className={`btn btn-sm ${copied ? 'btn-outline' : 'btn-ghost'}`}
                onClick={copyReferralCode}
                disabled={!user?.referral_code}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="profile-sections">
          <ChangePasswordSection />
          <TwoFaSection
            has2fa={user?.has_2fa ?? false}
            onToggled={() => { void fetchMe(); }}
          />
        </div>
      )}

      {tab === 'email' && (
        <div className="profile-sections">
          <EmailChangeSection />
        </div>
      )}
    </div>
  );
}
