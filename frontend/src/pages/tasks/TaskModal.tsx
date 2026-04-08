import { useEffect, useRef, useState } from 'react';
import { Play, Megaphone, X } from 'lucide-react';
import api from '../../services/api.ts';
import type { Task, StartTaskResponse, SubmitTaskResponse, SurveyQuestion } from '../../types/index.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

type ModalPhase = 'starting' | 'active' | 'auto-submitting' | 'submitting' | 'error';

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
    const id = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [active, remaining]);

  return remaining;
}

// ─── Video / Ad panel ───────────────────────────────────────────────────────

function VideoAdPanel({
  task,
  duration,
  embedCode,
  onTimerDone,
}: {
  task: Task;
  duration: number;
  embedCode?: string;
  onTimerDone: () => void;
}) {
  const remaining = useCountdown(duration, true);
  const isVideo   = task.type === 'video';
  const notified  = useRef(false);

  useEffect(() => {
    if (remaining <= 0 && !notified.current) {
      notified.current = true;
      onTimerDone();
    }
  }, [remaining, onTimerDone]);

  const pct = Math.round(((duration - remaining) / duration) * 100);

  // Wrap advertiser embed code in a minimal HTML document for the iframe
  const iframeSrc = embedCode
    ? `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh}</style></head><body>${embedCode}</body></html>`
    : null;

  return (
    <div className="task-modal-content">
      {iframeSrc ? (
        <div className="task-modal-ad-frame-wrap">
          <iframe
            srcDoc={iframeSrc}
            sandbox="allow-scripts allow-popups"
            className="task-modal-ad-frame"
            title="Advertisement"
            scrolling="no"
          />
          <div className="task-modal-ad-overlay-badge">Ad</div>
        </div>
      ) : (
        <div className={`task-modal-media ${isVideo ? 'task-modal-media--video' : 'task-modal-media--ad'}`}>
          {isVideo ? (
            <>
              <div className="task-modal-media-icon"><Play size={36} /></div>
              <p className="task-modal-media-label">Video playing…</p>
            </>
          ) : (
            <>
              <div className="task-modal-media-icon"><Megaphone size={36} /></div>
              <p className="task-modal-media-label">Viewing advertisement…</p>
            </>
          )}
        </div>
      )}

      <div className="task-modal-timer">
        <div className="task-modal-timer-track">
          <div className="task-modal-timer-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="task-modal-timer-label">
          {remaining > 0 ? `${remaining}s remaining` : 'Completed!'}
        </span>
      </div>

      {remaining > 0 && (
        <p className="task-modal-hint">
          {isVideo
            ? 'Watch the full video — do not close this window.'
            : 'Keep this window open until the ad finishes.'}
        </p>
      )}
    </div>
  );
}

// ─── Captcha panel ──────────────────────────────────────────────────────────

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

// ─── Survey panel ───────────────────────────────────────────────────────────

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
  const [phase,          setPhase]          = useState<ModalPhase>('starting');
  const [completionId,   setCompletionId]   = useState('');
  const [embedCode,      setEmbedCode]      = useState<string | undefined>();
  const [errorMsg,       setErrorMsg]       = useState('');

  // Captcha state
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaAnswer,   setCaptchaAnswer]   = useState('');

  // Survey state
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});

  const started          = useRef(false);
  const completionIdRef  = useRef('');         // stable ref for cleanup
  const timerDoneRef     = useRef(false);      // prevent double-fire

  const config   = task.verification_config ?? { type: task.type };
  const duration = config.duration_seconds ?? (task.type === 'video' ? 30 : 10);
  const isVideoAd = task.type === 'video' || task.type === 'ad_click';

  // ── Start the task immediately on mount ─────────────────────────────────
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        const { data } = await api.post<StartTaskResponse>(`/tasks/start/${task.id}`);
        setCompletionId(data.completion_id);
        completionIdRef.current = data.completion_id;

        if (task.type === 'captcha' && data.challenge) {
          setCaptchaQuestion(data.challenge.question);
        }
        if (data.embed_code) {
          setEmbedCode(data.embed_code);
        }

        setPhase('active');
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
        setErrorMsg(msg ?? 'Failed to start task. Please try again.');
        setPhase('error');
      }
    })();
  }, [task]);

  // ── Auto-submit when video/ad timer finishes ─────────────────────────────
  function handleTimerDone() {
    if (timerDoneRef.current) return;
    timerDoneRef.current = true;
    setPhase('auto-submitting');
    void submitProof({});
  }

  // ── Submit proof (called manually for captcha/survey, auto for video/ad) ─
  async function submitProof(proof: Record<string, unknown>) {
    try {
      const { data } = await api.post<SubmitTaskResponse>(`/tasks/submit/${task.id}`, {
        completion_id: completionIdRef.current || completionId,
        proof,
      });
      onComplete(data.message);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setErrorMsg(msg ?? 'Submission failed. Please try again.');
      setPhase('error');
    }
  }

  function handleManualSubmit() {
    setPhase('submitting');

    let proof: Record<string, unknown> = {};
    if (task.type === 'captcha') proof = { answer: captchaAnswer.trim() };
    if (task.type === 'survey')  proof = { answers: surveyAnswers };

    void submitProof(proof);
  }

  // ── Cancel if video/ad was exited before timer finished ──────────────────
  async function handleClose() {
    if (isVideoAd && phase === 'active' && completionIdRef.current) {
      try { await api.post(`/tasks/cancel/${task.id}`); } catch { /* ignore */ }
    }
    onClose();
  }

  // ── Can the user manually submit? ────────────────────────────────────────
  function isSubmittable(): boolean {
    if (task.type === 'captcha') return captchaAnswer.trim().length > 0;
    if (task.type === 'survey') {
      const questions = config.questions ?? [];
      return questions.every((q) => (surveyAnswers[q.id] ?? '').trim().length >= q.min_length);
    }
    return false;
  }

  // ── Lock body scroll while open ──────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="task-modal-overlay" onClick={handleClose}>
      <div className="task-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="task-modal-header">
          <div>
            <span className="badge">{task.type.replace('_', ' ')}</span>
            <h2 className="task-modal-title">{task.title}</h2>
          </div>
          <button className="task-modal-close" onClick={handleClose} aria-label="Close"><X size={18} /></button>
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
            {isVideoAd && (
              <VideoAdPanel
                task={task}
                duration={duration}
                embedCode={embedCode}
                onTimerDone={handleTimerDone}
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

        {(phase === 'auto-submitting' || phase === 'submitting') && (
          <div className="task-modal-loading">
            <div className="spinner" />
            <p>
              {phase === 'auto-submitting'
                ? 'Ad completed — crediting your reward…'
                : 'Verifying your submission…'}
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className="task-modal-error">
            <p className="task-modal-error-msg">{errorMsg}</p>
          </div>
        )}

        {/* Footer — only shown for manual-submit tasks */}
        {!isVideoAd && (
          <div className="task-modal-footer">
            <button
              className="btn btn-ghost"
              onClick={handleClose}
              disabled={phase === 'submitting'}
            >
              Cancel
            </button>

            {phase === 'active' && (
              <button
                className="btn btn-primary"
                onClick={handleManualSubmit}
                disabled={!isSubmittable()}
              >
                Submit for Verification
              </button>
            )}

            {phase === 'error' && (
              <button className="btn btn-primary" onClick={handleClose}>
                Close
              </button>
            )}
          </div>
        )}

        {/* Footer for video/ad — only show cancel before timer done, close on error */}
        {isVideoAd && (
          <div className="task-modal-footer">
            {phase === 'active' && (
              <button className="btn btn-ghost" onClick={handleClose}>
                Cancel (reward voided)
              </button>
            )}
            {phase === 'error' && (
              <button className="btn btn-primary" onClick={handleClose}>
                Close
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
