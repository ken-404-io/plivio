import { Link } from 'react-router-dom';

/**
 * Legacy route — we now verify emails by prompting the user for a 6-digit
 * OTP on the Register / Login screens instead of sending a click-to-verify
 * link. If anyone still arrives here from an old email we send them back
 * to the auth flow.
 */
export default function VerifyEmail() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="brand-name">Plivio</h1>
          <p className="auth-subtitle">Email verification</p>
        </div>

        <div className="alert alert--warning" role="alert">
          <strong>Verification now uses a 6-digit code.</strong>
          <p style={{ margin: '6px 0 0', fontSize: 14 }}>
            We no longer use click-to-verify links. Please sign in or create your
            account again to receive a fresh verification code by email.
          </p>
        </div>

        <p className="auth-footer" style={{ marginTop: 20 }}>
          <Link to="/login" className="link">Sign in</Link>
          {' · '}
          <Link to="/register" className="link">Create account</Link>
        </p>
      </div>
    </div>
  );
}
