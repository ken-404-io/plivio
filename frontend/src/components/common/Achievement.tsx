/**
 * Achievement popup — slides in from the top when the user earns something.
 * More prominent than a regular toast; used for task rewards, streak milestones,
 * plan upgrades, and new-notification previews.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AchievementType = 'task' | 'streak' | 'coins' | 'upgrade' | 'info' | 'referral';

export interface AchievementConfig {
  emoji:     string;
  title:     string;
  subtitle?: string;
  type:      AchievementType;
}

interface AchievementContextValue {
  showAchievement: (config: AchievementConfig) => void;
}

// ─── Context ───────────────────────────────────────────────────────────────────

const AchievementContext = createContext<AchievementContextValue | null>(null);

const DISPLAY_MS = 3800;

// ─── Provider ──────────────────────────────────────────────────────────────────

export function AchievementProvider({ children }: { children: React.ReactNode }) {
  const [current,   setCurrent]   = useState<(AchievementConfig & { id: number }) | null>(null);
  const [exiting,   setExiting]   = useState(false);
  const counterRef  = useRef(0);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setExiting(true);
    exitTimerRef.current = setTimeout(() => {
      setCurrent(null);
      setExiting(false);
    }, 350); // match CSS exit animation
  }, []);

  const showAchievement = useCallback((config: AchievementConfig) => {
    // Clear any pending timers from a previous achievement
    if (timerRef.current)    clearTimeout(timerRef.current);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);

    setExiting(false);
    setCurrent({ ...config, id: ++counterRef.current });

    timerRef.current = setTimeout(() => { dismiss(); }, DISPLAY_MS);
  }, [dismiss]);

  const value = useMemo(() => ({ showAchievement }), [showAchievement]);

  return (
    <AchievementContext.Provider value={value}>
      {children}
      {current && createPortal(
        <AchievementPopup
          key={current.id}
          config={current}
          exiting={exiting}
          onDismiss={dismiss}
          displayMs={DISPLAY_MS}
        />,
        document.body,
      )}
    </AchievementContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useAchievement(): AchievementContextValue {
  const ctx = useContext(AchievementContext);
  if (!ctx) throw new Error('useAchievement must be used within AchievementProvider');
  return ctx;
}

// ─── Popup component ───────────────────────────────────────────────────────────

interface PopupProps {
  config:    AchievementConfig;
  exiting:   boolean;
  onDismiss: () => void;
  displayMs: number;
}

function AchievementPopup({ config, exiting, onDismiss, displayMs }: PopupProps) {
  const typeClass = `achievement--${config.type}`;

  return (
    <div
      className={`achievement-popup ${typeClass}${exiting ? ' achievement-popup--exit' : ''}`}
      role="status"
      aria-live="polite"
    >
      {/* Progress bar that drains over DISPLAY_MS */}
      <div
        className="achievement-progress"
        style={{ animationDuration: `${displayMs}ms` }}
      />

      <span className="achievement-emoji" aria-hidden="true">{config.emoji}</span>

      <div className="achievement-body">
        <p className="achievement-title">{config.title}</p>
        {config.subtitle && (
          <p className="achievement-subtitle">{config.subtitle}</p>
        )}
      </div>

      <button
        className="achievement-close"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
