import { useEffect } from 'react';

const DEFAULT_IDLE_MS = 10 * 60 * 1000;

export default function useAutoRefreshOnIdle(idleMs: number = DEFAULT_IDLE_MS) {
  useEffect(() => {
    let timer: number | undefined;

    const cancel = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const schedule = () => {
      cancel();
      timer = window.setTimeout(() => {
        if (document.hidden) window.location.reload();
      }, idleMs);
    };

    const onVisibilityChange = () => {
      if (document.hidden) schedule();
      else cancel();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    if (document.hidden) schedule();

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      cancel();
    };
  }, [idleMs]);
}
