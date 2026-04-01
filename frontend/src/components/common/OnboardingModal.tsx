import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Coins,
  CheckSquare,
  ArrowUpCircle,
  Flame,
  BadgeCheck,
  ChevronRight,
  X,
  Zap,
} from 'lucide-react';
import api from '../../services/api.ts';

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = (userId: string) => `plivio_onboarded_${userId}`;

export function hasCompletedOnboarding(userId: string): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY(userId)) === '1';
  } catch {
    return true; // if localStorage is unavailable, don't block the user
  }
}

function markOnboardingDone(userId: string) {
  try {
    localStorage.setItem(STORAGE_KEY(userId), '1');
  } catch {
    // silently ignore storage errors
  }
}

// ─── Step definitions ────────────────────────────────────────────────────────

interface Step {
  id: string;
  title: string;
  body: React.ReactNode;
  cta: string;
  skip?: string;
}

function HowItWorksStep() {
  const items = [
    { Icon: CheckSquare, title: 'Complete Tasks',    desc: 'Finish captchas, videos, surveys and more to earn pesos.' },
    { Icon: Flame,       title: 'Build a Streak',   desc: 'Complete 5 tasks a day to earn your daily streak + bonus coins.' },
    { Icon: ArrowUpCircle, title: 'Cash Out',        desc: 'Withdraw your earnings to GCash once your ID is verified.' },
  ];

  return (
    <div className="onboard-how">
      {items.map(({ Icon, title, desc }) => (
        <div key={title} className="onboard-how-item">
          <span className="onboard-how-icon"><Icon size={20} /></span>
          <div>
            <p className="onboard-how-title">{title}</p>
            <p className="onboard-how-desc">{desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CoinsStep() {
  return (
    <div className="onboard-coins-info">
      <div className="onboard-coins-badge">
        <Coins size={32} className="onboard-coins-icon" />
      </div>
      <p className="onboard-coins-rate">1 Plivio Coin = ₱1</p>
      <p className="onboard-coins-desc">
        Earn bonus coins by keeping a daily streak. Every 7th day you get +50 coins.
        Convert coins to GCash anytime (7% fee applies).
      </p>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface OnboardingModalProps {
  userId:          string;
  username:        string;
  isEmailVerified: boolean;
  email:           string;
  onDone:          () => void;
}

export default function OnboardingModal({
  userId,
  username,
  isEmailVerified,
  email,
  onDone,
}: OnboardingModalProps) {
  const [step,        setStep]        = useState(0);
  const [resending,   setResending]   = useState(false);
  const [resendSent,  setResendSent]  = useState(false);
  const navigate = useNavigate();

  const steps: Step[] = [
    {
      id: 'welcome',
      title: `Welcome, ${username}!`,
      body: (
        <div className="onboard-welcome">
          <div className="onboard-welcome-icon">
            <Zap size={40} />
          </div>
          <p className="onboard-welcome-desc">
            Plivio pays you real money for completing simple online tasks.
            Watch videos, solve captchas, take surveys — and get paid directly to GCash.
          </p>
        </div>
      ),
      cta: 'How it works →',
    },
    {
      id: 'how',
      title: 'How to Earn',
      body: <HowItWorksStep />,
      cta: 'Got it →',
    },
    {
      id: 'coins',
      title: 'Plivio Coins',
      body: <CoinsStep />,
      cta: isEmailVerified ? 'Start Earning' : 'Next →',
    },
    ...(!isEmailVerified ? [{
      id: 'email',
      title: 'Verify Your Email',
      body: (
        <div className="onboard-email">
          <BadgeCheck size={36} className="onboard-email-icon" />
          <p className="onboard-email-desc">
            We sent a verification link to <strong>{email}</strong>.
            Check your inbox (and spam folder) to activate your account.
          </p>
          {resendSent ? (
            <p className="onboard-email-sent">Email sent! Check your inbox.</p>
          ) : (
            <button
              className="btn btn-ghost btn-sm"
              disabled={resending}
              onClick={async () => {
                setResending(true);
                try {
                  await api.post('/auth/resend-verification');
                  setResendSent(true);
                } catch {
                  // silent — user can try again later
                } finally {
                  setResending(false);
                }
              }}
            >
              {resending ? 'Sending…' : 'Resend email'}
            </button>
          )}
        </div>
      ),
      cta: 'Start Earning',
      skip: "I'll verify later",
    }] : []),
  ];

  const currentStep  = steps[step];
  const totalSteps   = steps.length;
  const isLastStep   = step === totalSteps - 1;

  const finish = useCallback(() => {
    markOnboardingDone(userId);
    onDone();
  }, [userId, onDone]);

  function handleCta() {
    if (isLastStep) {
      finish();
      navigate('/tasks');
    } else {
      setStep((s) => s + 1);
    }
  }

  function handleSkip() {
    finish();
  }

  return (
    <div className="onboard-overlay">
      <div className="onboard-modal" role="dialog" aria-modal="true" aria-label="Welcome to Plivio">

        {/* Close button */}
        <button className="onboard-close" onClick={handleSkip} aria-label="Skip onboarding">
          <X size={18} />
        </button>

        {/* Step dots */}
        <div className="onboard-dots" aria-label={`Step ${step + 1} of ${totalSteps}`}>
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={`onboard-dot${i === step ? ' onboard-dot--active' : i < step ? ' onboard-dot--done' : ''}`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="onboard-content">
          <h2 className="onboard-title">{currentStep.title}</h2>
          <div className="onboard-body">{currentStep.body}</div>
        </div>

        {/* Actions */}
        <div className="onboard-actions">
          <button className="btn btn-primary btn-full" onClick={handleCta}>
            {isLastStep ? (
              <>Start Earning <ChevronRight size={16} /></>
            ) : (
              currentStep.cta
            )}
          </button>
          {currentStep.skip && (
            <button className="btn btn-ghost btn-sm onboard-skip" onClick={handleSkip}>
              {currentStep.skip}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
