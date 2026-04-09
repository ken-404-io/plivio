import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initTheme } from './store/themeStore.ts'

// ── Disable pinch-to-zoom on iOS ──────────────────────────────────────────────
// iOS Safari ignores user-scalable=no (removed in iOS 10 for accessibility).
// Blocking gesturestart/gesturechange is the only reliable way to prevent
// pinch-zoom on iOS. touchmove with >1 touch covers older Safari versions.
document.addEventListener('gesturestart',  (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gestureend',    (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e: TouchEvent) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
