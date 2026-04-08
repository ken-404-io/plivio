import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../../services/api.ts';
import {
  Bot, Send, X, CheckCircle2, XCircle,
  ChevronRight, Trophy, Zap, BookOpen,
} from 'lucide-react';

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
  daily_limit: number | null;
  daily_remaining: number | null;
  can_earn_more: boolean;
}

interface QuizQuestion {
  id: number;
  question: string;
  category: string;
}

type Phase = 'loading' | 'question' | 'feedback' | 'done';
type FeedbackState = { correct: boolean; reward: number; correct_answer: string } | null;

interface Props {
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  math:          '#6366f1',
  science:       '#06b6d4',
  geography:     '#10b981',
  history:       '#f59e0b',
  philippines:   '#f43f5e',
  technology:    '#8b5cf6',
  english:       '#3b82f6',
  sports:        '#f97316',
  food:          '#ec4899',
  general:       '#64748b',
};

function categoryColor(cat: string) {
  return CATEGORY_COLORS[cat.toLowerCase()] ?? '#64748b';
}

// ─── ChatTask ─────────────────────────────────────────────────────────────────

export default function ChatTask({ onClose }: Props) {
  const [status,    setStatus]    = useState<QuizStatus | null>(null);
  const [question,  setQuestion]  = useState<QuizQuestion | null>(null);
  const [input,     setInput]     = useState('');
  const [phase,     setPhase]     = useState<Phase>('loading');
  const [feedback,  setFeedback]  = useState<FeedbackState>(null);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionCount,   setSessionCount]   = useState(0);
  const [limitMsg,  setLimitMsg]  = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const loadStatus = useCallback(async () => {
    const { data } = await api.get<QuizStatus>('/quiz/status');
    setStatus(data);
    return data;
  }, []);

  const loadNextQuestion = useCallback(async () => {
    setPhase('loading');
    setFeedback(null);
    setInput('');
    try {
      const { data } = await api.get<{
        success: boolean; question?: QuizQuestion; message?: string;
      }>('/quiz/next');
      if (!data.success || !data.question) {
        setLimitMsg(data.message ?? 'No more questions.');
        setPhase('done');
        return;
      }
      setQuestion(data.question);
      setPhase('question');
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch {
      setLimitMsg('Failed to load question.');
      setPhase('done');
    }
  }, []);

  // Init
  useEffect(() => {
    void (async () => {
      try {
        const s = await loadStatus();
        if (!s.can_earn_more) {
          setLimitMsg(
            s.questions_left === 0
              ? `You've used all ${s.question_limit} questions on the ${s.plan} plan. Upgrade to answer more!`
              : `Daily earning limit of ₱${s.daily_limit} reached. Come back tomorrow!`
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

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const answer = input.trim();
    if (!answer || !question || phase !== 'question') return;
    setPhase('loading');

    try {
      const { data } = await api.post<{
        success: boolean;
        is_correct: boolean;
        correct_answer: string;
        reward_earned: number;
      }>('/quiz/answer', { question_id: question.id, answer });

      setFeedback({
        correct:        data.is_correct,
        reward:         data.reward_earned,
        correct_answer: data.correct_answer,
      });
      setSessionCount((n) => n + 1);
      if (data.is_correct) setSessionCorrect((n) => n + 1);
      setPhase('feedback');

      // Refresh status silently
      const s = await loadStatus();
      if (!s.can_earn_more || s.questions_left === 0) {
        setTimeout(() => {
          setLimitMsg(
            s.questions_left === 0
              ? `You've used all ${s.question_limit} questions on the ${s.plan} plan. Upgrade to earn more!`
              : `Daily earning limit of ₱${s.daily_limit} reached. Come back tomorrow!`
          );
          setPhase('done');
        }, 2200);
        return;
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setLimitMsg(msg ?? 'Failed to submit answer.');
      setPhase('done');
    }
  }

  const todayEarned  = status?.today_earned ?? 0;
  const totalAnswered = status?.total_answered ?? 0;
  const qLimit        = status?.question_limit ?? 0;
  const qLeft         = status?.questions_left ?? 0;
  const pct           = qLimit > 0 ? Math.min(100, (totalAnswered / qLimit) * 100) : 0;

  return (
    <div className="cq-overlay">
      <div className="cq-screen">

        {/* ── Header ── */}
        <div className="cq-header">
          <div className="cq-header-left">
            <div className="cq-bot-avatar">
              <Bot size={22} />
            </div>
            <div>
              <div className="cq-title">Quiz Bot</div>
              <div className="cq-subtitle">
                {status ? `${status.plan.toUpperCase()} · ${qLeft} left` : 'Loading…'}
              </div>
            </div>
          </div>
          <div className="cq-header-right">
            <div className="cq-today-earn">
              <Trophy size={13} />
              ₱{todayEarned.toFixed(2)}{status?.daily_limit ? ` / ₱${status.daily_limit}` : ''}
            </div>
            <button className="cq-close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Progress bar ── */}
        <div className="cq-progress-wrap">
          <div className="cq-progress-bar">
            <div className="cq-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="cq-progress-label">{totalAnswered}/{qLimit}</span>
        </div>

        {/* ── Session score ── */}
        {sessionCount > 0 && (
          <div className="cq-session-score">
            <Zap size={13} />
            Session: {sessionCorrect}/{sessionCount} correct
            {sessionCorrect > 0 && (
              <span className="cq-session-earned">
                +₱{(sessionCorrect * 0.50).toFixed(2)}
              </span>
            )}
          </div>
        )}

        {/* ── Main area ── */}
        <div className="cq-body">

          {/* Loading */}
          {phase === 'loading' && (
            <div className="cq-loader">
              <div className="cq-dots"><span /><span /><span /></div>
              <p>Loading question…</p>
            </div>
          )}

          {/* Question */}
          {(phase === 'question' || phase === 'feedback') && question && (
            <div className="cq-question-card">
              <div
                className="cq-category-tag"
                style={{ background: categoryColor(question.category) + '22', color: categoryColor(question.category) }}
              >
                <BookOpen size={12} />
                {question.category}
              </div>
              <p className="cq-question-text">{question.question}</p>
            </div>
          )}

          {/* Feedback */}
          {phase === 'feedback' && feedback && (
            <div className={`cq-feedback ${feedback.correct ? 'cq-feedback--correct' : 'cq-feedback--wrong'}`}>
              {feedback.correct ? (
                <>
                  <CheckCircle2 size={28} className="cq-feedback-icon" />
                  <div className="cq-feedback-title">Correct!</div>
                  <div className="cq-feedback-sub">+₱{feedback.reward.toFixed(2)} added to your balance</div>
                </>
              ) : (
                <>
                  <XCircle size={28} className="cq-feedback-icon" />
                  <div className="cq-feedback-title">Wrong answer</div>
                  <div className="cq-feedback-sub">
                    Correct answer: <strong>{feedback.correct_answer}</strong>
                  </div>
                </>
              )}
              <button className="cq-next-btn" onClick={() => { void loadNextQuestion(); }}>
                Next question <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Done */}
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

        {/* ── Input ── */}
        {phase === 'question' && (
          <form className="cq-input-row" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              className="cq-input"
              type="text"
              placeholder="Type your answer and press Enter…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoComplete="off"
            />
            <button
              className="cq-send"
              type="submit"
              disabled={!input.trim()}
              aria-label="Submit"
            >
              <Send size={18} />
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
