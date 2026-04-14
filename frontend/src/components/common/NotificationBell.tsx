import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import api from '../../services/api.ts';
import { useAchievement } from './Achievement.tsx';
import type { Notification } from '../../types/index.ts';

const POLL_INTERVAL_MS = 30_000;

// Map notification type → achievement emoji
function notifEmoji(type: string): string {
  switch (type) {
    case 'task_approved':      return '✅';
    case 'withdrawal_paid':    return '💸';
    case 'withdrawal_rejected':return '❌';
    case 'referral_bonus':     return '👥';
    case 'kyc_approved':       return '🪪';
    case 'kyc_rejected':       return '⚠️';
    case 'email_verified':     return '📧';
    case 'admin_message':      return '📣';
    default:                   return '🔔';
  }
}

// ─── Notification detail modal ────────────────────────────────────────────────

function NotificationDetailModal({
  notification,
  onClose,
  onNavigate,
}: {
  notification: Notification;
  onClose: () => void;
  onNavigate: (link: string) => void;
}) {
  return (
    <div className="notif-detail-overlay" onClick={onClose}>
      <div className="notif-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="notif-detail-header">
          <span className="notif-detail-emoji" aria-hidden="true">
            {notifEmoji(notification.type)}
          </span>
          <h3 className="notif-detail-title">{notification.title}</h3>
          <button
            className="notif-detail-close"
            onClick={onClose}
            aria-label="Close notification"
          >
            <X size={18} />
          </button>
        </div>

        <p className="notif-detail-message">{notification.message}</p>

        <p className="notif-detail-time">
          {new Date(notification.created_at).toLocaleString('en-PH', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        </p>

        <div className="notif-detail-actions">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
          {notification.link && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => onNavigate(notification.link!)}
            >
              View Details
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NotificationBell() {
  const navigate    = useNavigate();
  const achievement = useAchievement();

  const [open,        setOpen]        = useState(false);
  const [unread,      setUnread]      = useState(0);
  const [items,       setItems]       = useState<Notification[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [detailItem,  setDetailItem]  = useState<Notification | null>(null);

  const dropdownRef  = useRef<HTMLDivElement>(null);
  const prevUnread   = useRef(0);
  const initialized  = useRef(false);

  // Poll unread count every 30s; show achievement popup when count goes up
  const pollUnread = useCallback(async () => {
    try {
      const { data } = await api.get<{ count: number; latest?: { type: string; title: string; message: string } }>(
        '/notifications/unread-count',
      );
      const newCount = data.count;
      setUnread(newCount);

      // On first load just record baseline, don't pop up
      if (!initialized.current) {
        initialized.current = true;
        prevUnread.current  = newCount;
        return;
      }

      // New notification arrived while the user is on the page
      if (newCount > prevUnread.current && data.latest) {
        const n = data.latest;
        achievement.showAchievement({
          emoji:    notifEmoji(n.type),
          title:    n.title,
          subtitle: n.message,
          type:     n.type === 'referral_bonus'     ? 'referral'
                  : n.type === 'task_approved'       ? 'task'
                  : n.type === 'withdrawal_paid'     ? 'coins'
                  : 'info',
        });
      }
      prevUnread.current = newCount;
    } catch { /* silent — user might not be logged in */ }
  }, [achievement]);

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

  async function handleNotifClick(item: Notification) {
    // Mark as read (fire-and-forget)
    if (!item.is_read) {
      try {
        await api.put(`/notifications/${item.id}/read`);
        setItems((prev) => prev.map((n) => n.id === item.id ? { ...n, is_read: true } : n));
        setUnread((prev) => Math.max(0, prev - 1));
      } catch { /* silent */ }
    }
    // Open detail modal
    setDetailItem(item);
    setOpen(false);
  }

  function handleDetailNavigate(link: string) {
    setDetailItem(null);
    navigate(link);
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
    <>
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
                    onClick={() => { void handleNotifClick(n); }}
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

      {detailItem && (
        <NotificationDetailModal
          notification={detailItem}
          onClose={() => setDetailItem(null)}
          onNavigate={handleDetailNavigate}
        />
      )}
    </>
  );
}
