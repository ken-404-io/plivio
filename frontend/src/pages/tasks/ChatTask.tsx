import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../../services/api.ts';
import { MessageCircle, Send, X, ChevronRight, Trophy, Zap } from 'lucide-react';

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

interface QuizAnswer {
  success: boolean;
  is_correct: boolean;
  correct_answer: string;
  reward_earned: number;
  message: string;
}

type ChatMsg =
  | { type: 'bot'; text: string }
  | { type: 'user'; text: string }
  | { type: 'result'; correct: boolean; reward: number; correct_answer: string };

// ─── ChatTask ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export default function ChatTask({ onClose }: Props) {
  const [status,   setStatus]   = useState<QuizStatus | null>(null);
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const push = useCallback((msg: ChatMsg) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load status and first question on mount
  const init = useCallback(async () => {
    setLoading(true);
    try {
      const { data: s } = await api.get<QuizStatus>('/quiz/status');
      setStatus(s);

      push({ type: 'bot', text: `Hi! I'm your quiz bot. Let's test your knowledge!` });
      push({ type: 'bot', text: `You're on the ${s.plan.toUpperCase()} plan — ${s.questions_left} question${s.questions_left !== 1 ? 's' : ''} remaining (${s.total_answered}/${s.question_limit} answered). Earn ₱0.50 per correct answer.` });

      if (!s.can_earn_more) {
        if (s.questions_left === 0) {
          push({ type: 'bot', text: `You've reached your ${s.plan} plan limit of ${s.question_limit} questions. Upgrade to answer more!` });
        } else {
          push({ type: 'bot', text: `You've reached today's earning limit of ₱${s.daily_limit}. Come back tomorrow!` });
        }
        setDone(true);
        setLoading(false);
        return;
      }

      await loadNextQuestion();
    } catch {
      push({ type: 'bot', text: 'Failed to load quiz. Please try again.' });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadNextQuestion = useCallback(async () => {
    try {
      const { data } = await api.get<{ success: boolean; question?: QuizQuestion; reason?: string; message?: string }>('/quiz/next');
      if (!data.success || !data.question) {
        push({ type: 'bot', text: data.message ?? 'No more questions available.' });
        setDone(true);
        setQuestion(null);
        return;
      }
      setQuestion(data.question);
      push({ type: 'bot', text: `[${data.question.category}] ${data.question.question}` });
    } catch {
      push({ type: 'bot', text: 'Failed to load next question.' });
    }
  }, [push]);

  useEffect(() => { void init(); }, [init]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const answer = input.trim();
    if (!answer || !question || loading) return;

    setInput('');
    push({ type: 'user', text: answer });
    setLoading(true);

    try {
      const { data } = await api.post<QuizAnswer>('/quiz/answer', {
        question_id: question.id,
        answer,
      });

      push({
        type:           'result',
        correct:        data.is_correct,
        reward:         data.reward_earned,
        correct_answer: data.correct_answer,
      });

      // Refresh status
      const { data: s } = await api.get<QuizStatus>('/quiz/status');
      setStatus(s);

      if (!s.can_earn_more || s.questions_left === 0) {
        if (s.questions_left === 0) {
          push({ type: 'bot', text: `You've reached your ${s.plan} plan limit of ${s.question_limit} questions. Upgrade to answer more!` });
        } else {
          push({ type: 'bot', text: `You've reached today's earning limit of ₱${s.daily_limit}. Come back tomorrow!` });
        }
        setDone(true);
        setQuestion(null);
      } else {
        // Load next question after a short delay
        setTimeout(() => { void loadNextQuestion(); }, 600);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      push({ type: 'bot', text: msg ?? 'Failed to submit answer.' });
    } finally {
      setLoading(false);
    }
  }

  const questionsLeft = status?.questions_left ?? 0;
  const todayEarned   = status?.today_earned ?? 0;
  const totalEarned   = status?.total_earned ?? 0;

  return (
    <div className="chat-task-overlay">
      <div className="chat-task-modal">

        {/* Header */}
        <div className="chat-task-header">
          <div className="chat-task-header-left">
            <div className="chat-task-bot-avatar">
              <MessageCircle size={20} />
            </div>
            <div>
              <div className="chat-task-title">Quiz Bot</div>
              <div className="chat-task-subtitle">
                {status ? `${status.plan.toUpperCase()} · ${questionsLeft} left` : 'Loading…'}
              </div>
            </div>
          </div>
          <button className="chat-task-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Stats bar */}
        {status && (
          <div className="chat-task-stats">
            <div className="chat-task-stat">
              <Trophy size={13} />
              <span>Today: ₱{todayEarned.toFixed(2)}{status.daily_limit ? ` / ₱${status.daily_limit}` : ''}</span>
            </div>
            <div className="chat-task-stat">
              <Zap size={13} />
              <span>Total: ₱{totalEarned.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="chat-task-messages">
          {messages.map((msg, i) => {
            if (msg.type === 'bot') {
              return (
                <div key={i} className="chat-msg chat-msg--bot">
                  <div className="chat-msg-avatar"><MessageCircle size={14} /></div>
                  <div className="chat-msg-bubble">{msg.text}</div>
                </div>
              );
            }
            if (msg.type === 'user') {
              return (
                <div key={i} className="chat-msg chat-msg--user">
                  <div className="chat-msg-bubble">{msg.text}</div>
                </div>
              );
            }
            // result
            return (
              <div key={i} className={`chat-result ${msg.correct ? 'chat-result--correct' : 'chat-result--wrong'}`}>
                {msg.correct ? (
                  <span>Correct! +₱{msg.reward.toFixed(2)} added to your balance.</span>
                ) : (
                  <span>Wrong! The correct answer is: <strong>{msg.correct_answer}</strong></span>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="chat-msg chat-msg--bot">
              <div className="chat-msg-avatar"><MessageCircle size={14} /></div>
              <div className="chat-msg-bubble chat-typing">
                <span /><span /><span />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        {!done && question && (
          <form className="chat-task-input-row" onSubmit={handleSubmit}>
            <input
              className="chat-task-input"
              type="text"
              placeholder="Type your answer…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <button
              className="chat-task-send"
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send"
            >
              <Send size={18} />
            </button>
          </form>
        )}

        {done && (
          <div className="chat-task-done-bar">
            <ChevronRight size={14} />
            <span>Session complete — come back anytime to continue!</span>
          </div>
        )}

      </div>
    </div>
  );
}
