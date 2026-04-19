import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api.ts';
import { useAuth } from '../../store/authStore.tsx';
import { useAchievement } from '../../components/common/Achievement.tsx';
import {
  MessageCircle, X, CheckCircle2, XCircle,
  ChevronRight, Trophy, Zap, BookOpen, Flame,
  Star, Crown,
} from 'lucide-react';

const STREAK_QUIZ_GOAL = 15;

// ─── Types ────────────────────────────────────────────────────────────────────

type DoneMode = 'upgrade' | 'earnings-capped' | 'bank-empty' | 'generic';

interface QuizStatus {
  success: boolean;
  plan: string;
  question_limit: number | null;
  total_answered: number;
  total_correct: number;
  questions_left: number | null;
  total_earned: number;
  today_earned: number;
  today_answered: number;
  daily_limit: number | null;
  daily_remaining: number | null;
  can_earn_more: boolean;
  free_lifetime_exhausted?: boolean;
  earnings_capped?: boolean;
}

interface QuizQuestion {
  id: number;
  question: string;
  category: string;
  choices: [string, string];
}

type Phase = 'loading' | 'question' | 'feedback' | 'done';

interface FeedbackState {
  correct: boolean;
  reward: number;
  correct_answer: string;
  selected: string;
}

interface Props {
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  math:        '#6366f1',
  science:     '#06b6d4',
  geography:   '#10b981',
  history:     '#f59e0b',
  philippines: '#f43f5e',
  technology:  '#8b5cf6',
  english:     '#3b82f6',
  sports:      '#f97316',
  food:        '#ec4899',
  general:     '#64748b',
};

function categoryColor(cat: string) {
  return CATEGORY_COLORS[cat.toLowerCase()] ?? '#64748b';
}

// ─── ChatTask ─────────────────────────────────────────────────────────────────

export default function ChatTask({ onClose }: Props) {
  const { fetchMe } = useAuth();
  const achievement = useAchievement();

  const [status,         setStatus]         = useState<QuizStatus | null>(null);
  const [question,       setQuestion]       = useState<QuizQuestion | null>(null);
  const [phase,          setPhase]          = useState<Phase>('loading');
  const [feedback,       setFeedback]       = useState<FeedbackState | null>(null);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionCount,   setSessionCount]   = useState(0);
  const [limitMsg,       setLimitMsg]       = useState('');
  const [doneMode,       setDoneMode]       = useState<DoneMode>('generic');
  const [submitting,     setSubmitting]     = useState(false);

  const streakTriggeredRef = useRef(false);

  const loadStatus = useCallback(async () => {
    const { data } = await api.get<QuizStatus>('/quiz/status');
    setStatus(data);
    return data;
  }, []);

  const loadNextQuestion = useCallback(async () => {
    setPhase('loading');
    setFeedback(null);
    try {
      const { data } = await api.get<{
        success: boolean; question?: QuizQuestion; message?: string; reason?: string;
      }>('/quiz/next');
      if (!data.success || !data.question) {
        if (data.reason === 'no_questions') {
          setDoneMode('bank-empty');
          setLimitMsg(data.message ?? 'No more questions available right now.');
        } else if (data.reason === 'free_lifetime_exhausted') {
          setDoneMode('upgrade');
          setLimitMsg(data.message ?? 'No more questions available.');
        } else if (data.reason === 'earnings_capped') {
          setDoneMode('earnings-capped');
          setLimitMsg(data.message ?? 'No more questions available.');
        } else if (data.reason === 'daily_limit_reached') {
          setDoneMode('generic');
          setLimitMsg(data.message ?? 'No more questions available.');
        } else {
          setDoneMode('generic');
          setLimitMsg(data.message ?? 'No more questions available.');
        }
        setPhase('done');
        return;
      }
      setQuestion(data.question);
      setPhase('question');
    } catch {
      setLimitMsg('Failed to load question. Please try again.');
      setPhase('done');
    }
  }, []);

  // Pick the right "done" screen + message for the given status
  const computeDoneState = useCallback((s: QuizStatus): { mode: DoneMode; msg: string } => {
    if (s.plan === 'free' && s.free_lifetime_exhausted) {
      return {
        mode: 'upgrade',
        msg:  `You've used all ${s.question_limit ?? 100} questions on the free plan. Upgrade to Premium or Elite to keep earning from the quiz bot.`,
      };
    }
    if (s.earnings_capped || (s.daily_limit !== null && (s.daily_remaining ?? 0) <= 0)) {
      return {
        mode: 'earnings-capped',
        msg:  s.plan === 'free'
          ? `Come back tomorrow — you've reached your ₱${s.daily_limit} daily limit.`
          : `Come back tomorrow — you've reached your ₱${s.daily_limit} daily quiz limit.`,
      };
    }
    if (s.questions_left !== null && s.questions_left <= 0) {
      return {
        mode: 'generic',
        msg:  `You've used your ${s.question_limit ?? 0} questions for today. Your quota resets at 12:00 AM PST.`,
      };
    }
    return { mode: 'generic', msg: 'No more questions available right now.' };
  }, []);

  // Init
  useEffect(() => {
    void (async () => {
      try {
        const s = await loadStatus();

        // If user already hit the streak goal today (from a previous session),
        // mark as triggered so we don't fire checkin again on re-open.
        if (s.today_answered >= STREAK_QUIZ_GOAL) {
          streakTriggeredRef.current = true;
        }

        if (!s.can_earn_more) {
          const { mode, msg } = computeDoneState(s);
          setDoneMode(mode);
          setLimitMsg(msg);
          setPhase('done');
          return;
        }
        await loadNextQuestion();
      } catch {
        setDoneMode('generic');
        setLimitMsg('Failed to load quiz.');
        setPhase('done');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleChoice(choice: string) {
    if (!question || submitting || phase !== 'question') return;
    setSubmitting(true);
    setPhase('loading');

    try {
      const { data } = await api.post<{
        success: boolean;
        is_correct: boolean;
        correct_answer: string;
        reward_earned: number;
      }>('/quiz/answer', { question_id: question.id, answer: choice });

      setFeedback({
        correct:        data.is_correct,
        reward:         data.reward_earned,
        correct_answer: data.correct_answer,
        selected:       choice,
      });
      setSessionCount((n) => n + 1);
      if (data.is_correct) setSessionCorrect((n) => n + 1);
      setPhase('feedback');

      // Real-time balance update for correct answers
      if (data.is_correct && data.reward_earned > 0) {
        void fetchMe();
      }

      // Refresh quiz status
      const s = await loadStatus();

      // Auto streak check-in at 15 questions today
      if (s.today_answered >= STREAK_QUIZ_GOAL && !streakTriggeredRef.current) {
        streakTriggeredRef.current = true;
        try {
          const { data: ci } = await api.post<{
            already_checked_in?: boolean;
            streak_count: number;
            bonus_day: boolean;
          }>('/coins/checkin');
          if (!ci.already_checked_in) {
            if (ci.bonus_day) {
              achievement.showAchievement({
                emoji:    '🏆',
                title:    '+50 Coins Bonus!',
                subtitle: `Day ${ci.streak_count} streak — weekly bonus earned!`,
                type:     'coins',
              });
            } else {
              achievement.showAchievement({
                emoji:    '🔥',
                title:    `Day ${ci.streak_count} Streak!`,
                subtitle: 'Answered 15 questions today — come back tomorrow!',
                type:     'streak',
              });
            }
            void fetchMe();
          }
        } catch { /* silent */ }
      }

      if (!s.can_earn_more || (s.questions_left !== null && s.questions_left <= 0)) {
        const { mode, msg } = computeDoneState(s);
        setDoneMode(mode);
        setLimitMsg(msg);
        // Stay on feedback for a moment then show done
        setTimeout(() => setPhase('done'), 2500);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setDoneMode('generic');
      setLimitMsg(msg ?? 'Failed to submit answer.');
      setPhase('done');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const todayEarned   = status?.today_earned  ?? 0;
  const todayAnswered = status?.today_answered ?? 0;
  const totalAnswered = status?.total_answered ?? 0;
  const isElite       = status?.plan === 'elite';
  const isFree        = status?.plan === 'free';
  const qLimit        = status?.question_limit ?? null;
  const qLeft         = status?.questions_left ?? null;
  // For free → lifetime progress; for premium → today's progress; for elite → no bar.
  const planPct = (() => {
    if (qLimit === null || qLimit === 0) return 0;
    const used = isFree ? totalAnswered : todayAnswered;
    return Math.min(100, (used / qLimit) * 100);
  })();
  const streakPct     = Math.min(100, (todayAnswered / STREAK_QUIZ_GOAL) * 100);
  const streakDone    = todayAnswered >= STREAK_QUIZ_GOAL;
  const progressUsed  = isFree ? totalAnswered : todayAnswered;

  // Choice button state helper
  function choiceState(choice: string): 'default' | 'correct' | 'wrong' | 'dim' {
    if (phase !== 'feedback' || !feedback) return 'default';
    const isCorrect = choice.toLowerCase() === feedback.correct_answer.toLowerCase();
    const isSelected = choice === feedback.selected;
    if (isCorrect) return 'correct';
    if (isSelected && !isCorrect) return 'wrong';
    return 'dim';
  }

  return (
    <div className="cq-overlay">
      <div className="cq-screen">

        {/* ── Header ── */}
        <div className="cq-header">
          <div className="cq-header-left">
            <div className="cq-bot-avatar"><MessageCircle size={20} /></div>
            <div>
              <div className="cq-title">Quizly</div>
              <div className="cq-subtitle">
                {status
                  ? qLeft === null
                    ? `${status.plan.toUpperCase()} · Unlimited questions`
                    : `${status.plan.toUpperCase()} · ${qLeft} questions left`
                  : 'Loading…'}
              </div>
            </div>
          </div>
          <div className="cq-header-right">
            <div className="cq-today-earn">
              <Trophy size={13} />
              ₱{todayEarned.toFixed(2)}{status?.daily_limit ? ` / ₱${status.daily_limit}` : ''}
            </div>
            <button className="cq-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        {/* ── Plan progress bar (hidden for elite = unlimited) ── */}
        {!isElite && qLimit !== null && (
          <div className="cq-progress-wrap">
            <span className="cq-progress-label">Progress</span>
            <div className="cq-progress-bar">
              <div className="cq-progress-fill" style={{ width: `${planPct}%` }} />
            </div>
            <span className="cq-progress-label">{progressUsed}/{qLimit}</span>
          </div>
        )}

        {/* ── Streak bar ── */}
        <div className="cq-streak-bar">
          <div className="cq-streak-bar-left">
            <Flame size={13} />
            <span>{streakDone ? 'Streak earned today! 🔥' : `${todayAnswered}/${STREAK_QUIZ_GOAL} for streak`}</span>
          </div>
          <div className="cq-streak-bar-track">
            <div className="cq-streak-bar-fill" style={{ width: `${streakPct}%` }} />
          </div>
          {sessionCorrect > 0 && (
            <span className="cq-session-earned">+₱{(sessionCorrect * 0.25).toFixed(2)}</span>
          )}
        </div>

        {/* ── Body ── */}
        <div className="cq-body">

          {/* Loading */}
          {phase === 'loading' && (
            <div className="cq-loader">
              <div className="cq-dots"><span /><span /><span /></div>
              <p>Loading…</p>
            </div>
          )}

          {/* Question + choices */}
          {(phase === 'question' || phase === 'feedback') && question && (
            <div className="cq-question-wrap">
              {/* Question card */}
              <div className="cq-question-card">
                <div
                  className="cq-category-tag"
                  style={{
                    background: categoryColor(question.category) + '22',
                    color:      categoryColor(question.category),
                  }}
                >
                  <BookOpen size={12} />
                  {question.category}
                </div>
                <p className="cq-question-text">{question.question}</p>
              </div>

              {/* Feedback banner */}
              {phase === 'feedback' && feedback && (
                <div className={`cq-feedback-banner ${feedback.correct ? 'cq-feedback-banner--correct' : 'cq-feedback-banner--wrong'}`}>
                  {feedback.correct ? (
                    <>
                      <CheckCircle2 size={18} />
                      <span>Correct! +₱{feedback.reward.toFixed(2)} earned</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={18} />
                      <span>Wrong! Correct: <strong>{feedback.correct_answer}</strong></span>
                    </>
                  )}
                </div>
              )}

              {/* 2 Choice buttons */}
              <div className="cq-choices">
                {question.choices.map((choice, i) => {
                  const state = choiceState(choice);
                  return (
                    <button
                      key={i}
                      className={`cq-choice cq-choice--${state}`}
                      onClick={() => { void handleChoice(choice); }}
                      disabled={phase === 'feedback' || submitting}
                    >
                      <span className="cq-choice-label">{i === 0 ? 'A' : 'B'}</span>
                      <span className="cq-choice-text">{choice}</span>
                      {state === 'correct' && <CheckCircle2 size={18} className="cq-choice-icon" />}
                      {state === 'wrong'   && <XCircle      size={18} className="cq-choice-icon" />}
                    </button>
                  );
                })}
              </div>

              {/* Next button (only after feedback) */}
              {phase === 'feedback' && (
                <button className="cq-next-btn" onClick={() => { void loadNextQuestion(); }}>
                  Next question <ChevronRight size={16} />
                </button>
              )}
            </div>
          )}

          {/* Done screen — Free plan lifetime exhausted → Upgrade prompt */}
          {phase === 'done' && doneMode === 'upgrade' && (
            <div className="cq-done cq-done--upgrade">
              <div className="cq-upgrade-badge">
                <Star size={28} />
              </div>
              <div className="cq-done-title">You've unlocked everything free!</div>
              <p className="cq-done-msg">{limitMsg}</p>

              <div className="cq-upgrade-benefits">
                <div className="cq-upgrade-benefit">
                  <Crown size={16} />
                  <span><strong>Premium:</strong> 100 questions / day &middot; ₱100 daily cap</span>
                </div>
                <div className="cq-upgrade-benefit">
                  <Star size={16} />
                  <span><strong>Elite:</strong> Unlimited questions, no daily cap</span>
                </div>
              </div>

              <Link to="/plans" className="btn btn-primary btn-full" onClick={onClose}>
                Upgrade now
              </Link>
              <button className="cq-close-btn" onClick={onClose}>Maybe later</button>
            </div>
          )}

          {/* Done screen — ₱20 cap hit (free) or daily quiz cap hit */}
          {phase === 'done' && doneMode === 'earnings-capped' && (
            <div className="cq-done">
              <div className="cq-done-icon">⏰</div>
              <div className="cq-done-title">Daily limit reached</div>
              <p className="cq-done-msg">{limitMsg}</p>
              {sessionCount > 0 && (
                <div className="cq-done-stats">
                  <div className="cq-done-stat">
                    <span className="cq-done-stat-val">{sessionCount}</span>
                    <span className="cq-done-stat-lbl">Answered</span>
                  </div>
                  <div className="cq-done-stat">
                    <span className="cq-done-stat-val">{sessionCorrect}</span>
                    <span className="cq-done-stat-lbl">Correct</span>
                  </div>
                  <div className="cq-done-stat">
                    <span className="cq-done-stat-val">₱{(sessionCorrect * 0.25).toFixed(2)}</span>
                    <span className="cq-done-stat-lbl">Earned</span>
                  </div>
                </div>
              )}
              {isFree && (
                <p className="cq-done-sub">
                  You can still earn referral bonuses — invite friends from the Referrals page.
                </p>
              )}
              <button className="cq-close-btn" onClick={onClose}>Close</button>
            </div>
          )}

          {/* Done screen — question bank temporarily empty (recycled too recently) */}
          {phase === 'done' && doneMode === 'bank-empty' && (
            <div className="cq-done">
              <div className="cq-done-icon">🔄</div>
              <div className="cq-done-title">All caught up!</div>
              <p className="cq-done-msg">
                You've gone through all available questions. New ones will be ready shortly — check back in a bit or tap retry.
              </p>
              {sessionCount > 0 && (
                <div className="cq-done-stats">
                  <div className="cq-done-stat">
                    <span className="cq-done-stat-val">{sessionCount}</span>
                    <span className="cq-done-stat-lbl">Answered</span>
                  </div>
                  <div className="cq-done-stat">
                    <span className="cq-done-stat-val">{sessionCorrect}</span>
                    <span className="cq-done-stat-lbl">Correct</span>
                  </div>
                  <div className="cq-done-stat">
                    <span className="cq-done-stat-val">₱{(sessionCorrect * 0.25).toFixed(2)}</span>
                    <span className="cq-done-stat-lbl">Earned</span>
                  </div>
                </div>
              )}
              <button className="btn btn-primary btn-full" style={{ marginBottom: '8px' }} onClick={() => { void loadNextQuestion(); }}>
                Retry
              </button>
              <button className="cq-close-btn" onClick={onClose}>Close</button>
            </div>
          )}

          {/* Done screen — generic (premium daily questions exhausted, etc.) */}
          {phase === 'done' && doneMode === 'generic' && (
            <div className="cq-done">
              <div className="cq-done-icon">🎉</div>
              <div className="cq-done-title">Session ended</div>
              <p className="cq-done-msg">{limitMsg}</p>
              {sessionCount > 0 && (
                <div className="cq-done-stats">
                  <div className="cq-done-stat">
                    <span className="cq-done-stat-val">{sessionCount}</span>
                    <span className="cq-done-stat-lbl">Answered</span>
                  </div>
                  <div className="cq-done-stat">
                    <span className="cq-done-stat-val">{sessionCorrect}</span>
                    <span className="cq-done-stat-lbl">Correct</span>
                  </div>
                  <div className="cq-done-stat">
                    <span className="cq-done-stat-val">₱{(sessionCorrect * 0.25).toFixed(2)}</span>
                    <span className="cq-done-stat-lbl">Earned</span>
                  </div>
                </div>
              )}
              <button className="cq-close-btn" onClick={onClose}>Close</button>
            </div>
          )}

        </div>

        {/* Session score footer */}
        {(phase === 'question' || phase === 'feedback') && sessionCount > 0 && (
          <div className="cq-footer">
            <Zap size={13} />
            Session: {sessionCorrect}/{sessionCount} correct
          </div>
        )}

      </div>
    </div>
  );
}
