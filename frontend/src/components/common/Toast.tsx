import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id:      number;
  type:    ToastType;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error:   (message: string) => void;
  warning: (message: string) => void;
  info:    (message: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

const ICON_SIZE = 16;

function ToastIcon({ type }: { type: ToastType }) {
  if (type === 'success') return <CheckCircle2  size={ICON_SIZE} />;
  if (type === 'error')   return <XCircle       size={ICON_SIZE} />;
  if (type === 'warning') return <AlertTriangle size={ICON_SIZE} />;
  return                         <Info          size={ICON_SIZE} />;
}

const AUTO_DISMISS_MS = 4000;

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter             = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback((type: ToastType, message: string) => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [dismiss]);

  // Memoize so consumers that list `toast` in useCallback deps don't infinite-loop
  const value = useMemo<ToastContextValue>(() => ({
    success: (msg) => add('success', msg),
    error:   (msg) => add('error',   msg),
    warning: (msg) => add('warning', msg),
    info:    (msg) => add('info',    msg),
  }), [add]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-stack" role="region" aria-label="Notifications" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast--${t.type}`}>
              <span className="toast-icon" aria-hidden="true"><ToastIcon type={t.type} /></span>
              <span className="toast-message">{t.message}</span>
              <button
                className="toast-close"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
