import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../../services/api.ts';
import { useAuth } from '../../store/authStore.tsx';
import { useAchievement } from '../../components/common/Achievement.tsx';
import {
  Bot, X, CheckCircle2, XCircle,
  ChevronRight, Trophy, Zap, BookOpen, Flame,
} from 'lucide-react';

const STREAK_QUIZ_GOAL = 15;

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuizStatus {
  success: boolean;
  plan: string;
  question_limit: number;
  total_answered: number;
  total_correct: number;
  questions_left: number;
  total_earned: number;
  today_earned: number;
  today_answered: number;
  daily_limit: number | null;
  daily_remaining: number | null;
  can_earn_more: boolean;
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
        success: boolean; question?: QuizQuestion; message?: string;
      }>('/quiz/next');
      if (!data.success || !data.question) {
        setLimitMsg(data.message ?? 'No more questions available.');
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
          setLimitMsg(
            s.questions_left === 0
              ? `You've used all ${s.question_limit} questions on the ${s.plan} plan. Upgrade to answer more!`
              : `Daily earning limit of ₱${s.daily_limit} reached. Come back tomorrow!`,
          );
          setPhase('done');
          return;
        }
        await loadNextQuestion();
      } catch {
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

      if (!s.can_earn_more || s.questions_left === 0) {
        setLimitMsg(
          s.questions_left === 0
            ? `You've used all ${s.question_limit} questions on the ${s.plan} plan. Upgrade to earn more!`
            : `Daily earning limit of ₱${s.daily_limit} reached. Come back tomorrow!`,
        );
        // Stay on feedback for a moment then show done
        setTimeout(() => setPhase('done'), 2500);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
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
  const qLimit        = status?.question_limit ?? 0;
  const qLeft         = status?.questions_left ?? 0;
  const planPct       = qLimit > 0 ? Math.min(100, (totalAnswered / qLimit) * 100) : 0;
  const streakPct     = Math.min(100, (todayAnswered / STREAK_QUIZ_GOAL) * 100);
  const streakDone    = todayAnswered >= STREAK_QUIZ_GOAL;

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
            <div className="cq-bot-avatar"><Bot size={20} /></div>
            <div>
              <div className="cq-title">Quiz Bot</div>
              <div className="cq-subtitle">
                {status ? `${status.plan.toUpperCase()} · ${qLeft} questions left` : 'Loading…'}
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

        {/* ── Plan progress bar ── */}
        <div className="cq-progress-wrap">
          <span className="cq-progress-label">Progress</span>
          <div className="cq-progress-bar">
            <div className="cq-progress-fill" style={{ width: `${planPct}%` }} />
          </div>
          <span className="cq-progress-label">{totalAnswered}/{qLimit}</span>
        </div>

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
            <span className="cq-session-earned">+₱{(sessionCorrect * 0.50).toFixed(2)}</span>
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

          {/* Done screen */}
          {phase === 'done' && (
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
                    <span className="cq-done-stat-val">₱{(sessionCorrect * 0.50).toFixed(2)}</span>
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
