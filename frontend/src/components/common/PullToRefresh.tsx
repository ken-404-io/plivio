import { useRef, useCallback, useEffect, useState } from 'react';

const THRESHOLD   = 80;   // px the user must pull before a refresh triggers
const MAX_PULL    = 130;  // visual cap so the indicator doesn't travel too far
const RESIST      = 0.45; // dampen the pull distance to feel natural

/**
 * Wraps a scrollable container and adds mobile pull-to-refresh.
 * When the user pulls down while already at the top of the scroll area
 * the page reloads (window.location.reload).
 *
 * Desktop viewports are ignored (pointer: fine / no touch).
 */
export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLElement>(null);
  const startY       = useRef(0);
  const pulling      = useRef(false);

  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing,   setRefreshing]  = useState(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const el = containerRef.current;
    if (!el || refreshing) return;
    // Only activate when scrolled to the very top
    if (el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, [refreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling.current || refreshing) return;
    const dy = (e.touches[0].clientY - startY.current) * RESIST;
    if (dy <= 0) { setPullDistance(0); return; }
    setPullDistance(Math.min(dy, MAX_PULL));
  }, [refreshing]);

  const handleTouchEnd = useCallback(() => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(THRESHOLD); // snap to threshold during reload
      window.location.reload();
      return;
    }
    setPullDistance(0);
  }, [pullDistance, refreshing]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('touchstart',  handleTouchStart, { passive: true });
    el.addEventListener('touchmove',   handleTouchMove,  { passive: true });
    el.addEventListener('touchend',    handleTouchEnd);
    el.addEventListener('touchcancel', handleTouchEnd);
    return () => {
      el.removeEventListener('touchstart',  handleTouchStart);
      el.removeEventListener('touchmove',   handleTouchMove);
      el.removeEventListener('touchend',    handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const showIndicator = pullDistance > 4;

  return (
    <main ref={containerRef} className="main-content">
      {/* Pull indicator */}
      {showIndicator && (
        <div
          className="ptr-indicator"
          style={{ transform: `translateY(${pullDistance - 44}px)` }}
        >
          <svg
            className={`ptr-spinner${refreshing ? ' ptr-spinner--active' : ''}`}
            viewBox="0 0 24 24"
            style={{ transform: `rotate(${progress * 270}deg)` }}
          >
            <circle
              cx="12" cy="12" r="10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeDasharray={`${progress * 63} 63`}
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
      {children}
    </main>
  );
}
