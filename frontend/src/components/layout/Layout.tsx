import { Link, Outlet } from 'react-router-dom';
import { Flame } from 'lucide-react';
import Sidebar           from './Sidebar.tsx';
import BottomNav         from './BottomNav.tsx';
import NotificationBell  from '../common/NotificationBell.tsx';
import { useAuth }       from '../../store/authStore.tsx';

interface LayoutProps {
  isAdmin?: boolean;
}

export default function Layout({ isAdmin = false }: LayoutProps) {
  const { user } = useAuth();

  const balance = Number(user?.balance ?? 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="app-shell">
      {/* Desktop: left sidebar */}
      <Sidebar isAdmin={isAdmin} />

      {/* Page content */}
      <main className="main-content">
        <div className="topbar">
          {/* Mobile-only: avatar + plan badge (left) */}
          <div className="topbar-mobile-left">
            <Link to="/profile" className="topbar-avatar-wrap" aria-label="Profile">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="Profile" className="topbar-avatar" />
              ) : (
                <div className="topbar-avatar topbar-avatar--initials">
                  {user?.username?.[0]?.toUpperCase() ?? 'U'}
                </div>
              )}
            </Link>
            <Link to="/plans" className="topbar-plan-badge" aria-label="My plan">
              {user?.plan ?? 'Free'}
            </Link>
          </div>

          {/* Desktop-only: brand text */}
          <span className="topbar-brand">Plivio</span>

          {/* Right side */}
          <div className="topbar-right">
            {/* Mobile-only: streak + balance pills */}
            <div className="topbar-stats">
              <Link to="/coins" className="topbar-stat-pill topbar-stat-pill--streak">
                <Flame size={13} />
                <span>{user?.streak_count ?? 0}</span>
              </Link>
              <Link to="/earnings" className="topbar-stat-pill topbar-stat-pill--balance">
                <span className="topbar-stat-currency">₱</span>
                <span>{balance}</span>
              </Link>
            </div>
            <NotificationBell />
          </div>
        </div>

        <Outlet />
      </main>

      {/* Mobile: bottom tab bar */}
      <BottomNav isAdmin={isAdmin} />
    </div>
  );
}
