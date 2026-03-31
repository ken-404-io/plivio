import { useState } from 'react';
import api from '../../services/api.ts';
import { useToast } from './Toast.tsx';

interface Props {
  email: string;
}

export default function EmailVerificationBanner({ email }: Props) {
  const toast              = useToast();
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);

  async function resend() {
    if (sending || sent) return;
    setSending(true);
    try {
      await api.post('/auth/verify-email/send');
      setSent(true);
      toast.success('Verification email sent! Check your inbox.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Could not send email. Please try again later.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="email-verify-banner" role="alert">
      <span className="email-verify-icon" aria-hidden="true">✉</span>
      <span className="email-verify-text">
        Please verify your email address{' '}
        <strong>{email}</strong> to unlock all features.
      </span>
      <button
        className="btn btn-sm email-verify-btn"
        onClick={() => { void resend(); }}
        disabled={sending || sent}
      >
        {sent ? 'Email sent ✓' : sending ? 'Sending…' : 'Resend email'}
      </button>
    </div>
  );
}
