import { useEffect, useRef, useState } from 'react';
import api from '../../services/api.ts';
import type { Task, StartTaskResponse, SubmitTaskResponse, SurveyQuestion } from '../../types/index.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

type ModalPhase = 'starting' | 'active' | 'submitting' | 'done' | 'error';

interface Props {
  task: Task;
  onClose: () => void;
  onComplete: (message: string) => void;
}

// ─── Countdown hook ─────────────────────────────────────────────────────────

function useCountdown(seconds: number, active: boolean) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (!active || remaining <= 0) return;
    const id = setInterval(() => setRemaining((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [active, remaining]);

  return remaining;
}

// ─── Task-specific content panels ───────────────────────────────────────────

function VideoAdPanel({
  task,
  duration,
  onReady,
}: {
  task: Task;
  duration: number;
  onReady: () => void;
}) {
  const remaining = useCountdown(duration, true);
  const isVideo   = task.type === 'video';

  useEffect(() => {
    if (remaining <= 0) onReady();
  }, [remaining, onReady]);

  const pct = Math.max(0, Math.round(((duration - remaining) / duration) * 100));

  return (
    <div className="task-modal-content">
      <div className={`task-modal-media ${isVideo ? 'task-modal-media--video' : 'task-modal-media--ad'}`}>
        {isVideo ? (
          <>
            <div className="task-modal-media-icon">▶</div>
            <p className="task-modal-media-label">Video playing…</p>
          </>
        ) : (
          <>
            <div className="task-modal-media-icon">📢</div>
            <p className="task-modal-media-label">Viewing advertisement…</p>
          </>
        )}
      </div>

      <div className="task-modal-timer">
        <div className="task-modal-timer-track">
          <div className="task-modal-timer-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="task-modal-timer-label">
          {remaining > 0
            ? `${remaining}s remaining`
            : 'Ready to submit!'}
        </span>
      </div>

      <p className="task-modal-hint">
        {isVideo
          ? 'Watch the full video to earn your reward.'
          : 'Stay on this page until the timer completes.'}
      </p>
    </div>
  );
}

function CaptchaPanel({
  question,
  answer,
  onChange,
}: {
  question: string;
  answer: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="task-modal-content">
      <div className="task-modal-captcha-box">
        <p className="task-modal-captcha-label">Solve this to prove you&apos;re human:</p>
        <p className="task-modal-captcha-question">{question}</p>
      </div>

      <label className="form-label" htmlFor="captcha-answer">Your answer</label>
      <input
        id="captcha-answer"
        className="form-input"
        type="number"
        value={answer}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter the number"
        autoFocus
      />

      <p className="task-modal-hint">Enter the correct answer to earn your reward.</p>
    </div>
  );
}

function SurveyPanel({
  questions,
  answers,
  onChange,
}: {
  questions: SurveyQuestion[];
  answers: Record<string, string>;
  onChange: (id: string, value: string) => void;
}) {
  return (
    <div className="task-modal-content">
      <p className="task-modal-hint task-modal-hint--top">
        Answer all questions honestly. Short or copied answers will be rejected.
      </p>
      {questions.map((q, i) => (
        <div key={q.id} className="task-modal-survey-question">
          <label className="form-label" htmlFor={`survey-${q.id}`}>
            {i + 1}. {q.text}
            <span className="task-modal-survey-min"> (min {q.min_length} chars)</span>
          </label>
          <textarea
            id={`survey-${q.id}`}
            className="form-input task-modal-survey-textarea"
            rows={3}
            value={answers[q.id] ?? ''}
            onChange={(e) => onChange(q.id, e.target.value)}
            placeholder="Type your answer here…"
          />
          <span className="task-modal-char-count">
            {(answers[q.id] ?? '').length} / {q.min_length} min
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main modal ─────────────────────────────────────────────────────────────

export default function TaskModal({ task, onClose, onComplete }: Props) {
  const [phase,         setPhase]         = useState<ModalPhase>('starting');
  const [completionId,  setCompletionId]  = useState('');
  const [errorMsg,      setErrorMsg]      = useState('');
  const [timerReady,    setTimerReady]    = useState(false);

  // Captcha state
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaAnswer,   setCaptchaAnswer]   = useState('');

  // Survey state
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});

  const started = useRef(false);

  const config   = task.verification_config ?? { type: task.type };
  const duration = config.duration_seconds ?? (task.type === 'video' ? 30 : 10);

  // ── Start the task immediately on mount ─────────────────────────────────
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        const { data } = await api.post<StartTaskResponse>(`/tasks/${task.id}/start`);
        setCompletionId(data.completion_id);

        if (task.type === 'captcha' && data.challenge) {
          setCaptchaQuestion(data.challenge.question);
        }

        setPhase('active');
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
        setErrorMsg(msg ?? 'Failed to start task. Please try again.');
        setPhase('error');
      }
    })();
  }, [task]);

  // ── Submit proof ─────────────────────────────────────────────────────────
  async function handleSubmit() {
    setPhase('submitting');

    let proof: Record<string, unknown> = {};

    if (task.type === 'captcha') {
      proof = { answer: captchaAnswer.trim() };
    } else if (task.type === 'survey') {
      proof = { answers: surveyAnswers };
    }

    try {
      const { data } = await api.post<SubmitTaskResponse>(`/tasks/${task.id}/submit`, {
        completion_id: completionId,
        proof,
      });
      onComplete(data.message);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setErrorMsg(msg ?? 'Submission failed. Please try again.');
      setPhase('error');
    }
  }

  // ── Can the user submit? ─────────────────────────────────────────────────
  function isSubmittable(): boolean {
    if (task.type === 'video' || task.type === 'ad_click') return timerReady;

    if (task.type === 'captcha') return captchaAnswer.trim().length > 0;

    if (task.type === 'survey') {
      const questions = config.questions ?? [];
      return questions.every((q) => (surveyAnswers[q.id] ?? '').trim().length >= q.min_length);
    }

    return false;
  }

  // ── Prevent background scroll while open ────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="task-modal-overlay" onClick={onClose}>
      <div className="task-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="task-modal-header">
          <div>
            <span className="badge">{task.type.replace('_', ' ')}</span>
            <h2 className="task-modal-title">{task.title}</h2>
          </div>
          <button className="task-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="task-modal-reward">
          Earn <strong>₱{Number(task.reward_amount).toFixed(2)}</strong> for completing this task
        </div>

        {/* Body */}
        {phase === 'starting' && (
          <div className="task-modal-loading">
            <div className="spinner" />
            <p>Starting task…</p>
          </div>
        )}

        {phase === 'active' && (
          <>
            {(task.type === 'video' || task.type === 'ad_click') && (
              <VideoAdPanel
                task={task}
                duration={duration}
                onReady={() => setTimerReady(true)}
              />
            )}

            {task.type === 'captcha' && (
              <CaptchaPanel
                question={captchaQuestion}
                answer={captchaAnswer}
                onChange={setCaptchaAnswer}
              />
            )}

            {task.type === 'survey' && (
              <SurveyPanel
                questions={config.questions ?? []}
                answers={surveyAnswers}
                onChange={(id, val) => setSurveyAnswers((prev) => ({ ...prev, [id]: val }))}
              />
            )}
          </>
        )}

        {phase === 'submitting' && (
          <div className="task-modal-loading">
            <div className="spinner" />
            <p>Verifying your submission…</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="task-modal-error">
            <p className="task-modal-error-msg">{errorMsg}</p>
          </div>
        )}

        {/* Footer */}
        <div className="task-modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={phase === 'submitting'}>
            Cancel
          </button>

          {phase === 'active' && (
            <button
              className="btn btn-primary"
              onClick={() => { void handleSubmit(); }}
              disabled={!isSubmittable()}
            >
              Submit for Verification
            </button>
          )}

          {phase === 'error' && (
            <button className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
