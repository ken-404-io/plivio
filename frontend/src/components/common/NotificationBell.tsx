import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api.ts';
import type { Notification } from '../../types/index.ts';

const POLL_INTERVAL_MS = 30_000;

export default function NotificationBell() {
  const navigate = useNavigate();

  const [open,        setOpen]        = useState(false);
  const [unread,      setUnread]      = useState(0);
  const [items,       setItems]       = useState<Notification[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Poll unread count every 30s
  const pollUnread = useCallback(async () => {
    try {
      const { data } = await api.get<{ count: number }>('/notifications/unread-count');
      setUnread(data.count);
    } catch { /* silent — user might not be logged in */ }
  }, []);

  useEffect(() => {
    void pollUnread();
    const timer = setInterval(() => { void pollUnread(); }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [pollUnread]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function openDropdown() {
    setOpen((prev) => !prev);
    if (!open) {
      setLoadingList(true);
      try {
        const { data } = await api.get<{ notifications: Notification[] }>('/notifications');
        setItems(data.notifications);
      } catch { /* silent */ } finally {
        setLoadingList(false);
      }
    }
  }

  async function markAllRead() {
    try {
      await api.put('/notifications/read-all');
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch { /* silent */ }
  }

  async function markRead(id: string, link: string | null) {
    try {
      await api.put(`/notifications/${id}/read`);
      setItems((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
      setUnread((prev) => Math.max(0, prev - 1));
    } catch { /* silent */ }
    if (link) {
      setOpen(false);
      navigate(link);
    }
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1)   return 'just now';
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  return (
    <div className="notif-bell" ref={dropdownRef}>
      <button
        className="notif-bell-btn"
        onClick={() => { void openDropdown(); }}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 22c1.1 0 2-.9 2-2h-4a2 2 0 002 2zm6-6V11a6 6 0 00-5-5.91V4a1 1 0 00-2 0v1.09A6 6 0 006 11v5l-2 2v1h16v-1l-2-2z"
            fill="currentColor"
          />
        </svg>
        {unread > 0 && (
          <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <span className="notif-dropdown-title">Notifications</span>
            {unread > 0 && (
              <button className="notif-mark-all" onClick={() => { void markAllRead(); }}>
                Mark all read
              </button>
            )}
          </div>

          <div className="notif-list">
            {loadingList ? (
              <div className="notif-empty"><div className="spinner spinner--sm" /></div>
            ) : items.length === 0 ? (
              <div className="notif-empty">
                <p className="text-muted">No notifications yet.</p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  className={`notif-item${n.is_read ? '' : ' notif-item--unread'}`}
                  onClick={() => { void markRead(n.id, n.link); }}
                >
                  {!n.is_read && <span className="notif-dot" aria-hidden="true" />}
                  <div className="notif-item-body">
                    <p className="notif-item-title">{n.title}</p>
                    <p className="notif-item-msg">{n.message}</p>
                    <p className="notif-item-time">{timeAgo(n.created_at)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
