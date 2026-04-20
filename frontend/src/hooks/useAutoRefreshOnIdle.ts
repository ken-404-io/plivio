// Idle-based page reloads were removed — they caused unexpected logouts when
// the access token expired while the tab was in the background.
// Version updates are now handled by useVersionCheck (silent auto-reload).
export default function useAutoRefreshOnIdle(_idleMs?: number) {}
