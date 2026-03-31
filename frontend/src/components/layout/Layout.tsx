import { Outlet } from 'react-router-dom';
import Sidebar           from './Sidebar.tsx';
import BottomNav         from './BottomNav.tsx';
import NotificationBell  from '../common/NotificationBell.tsx';

interface LayoutProps {
  isAdmin?: boolean;
}

export default function Layout({ isAdmin = false }: LayoutProps) {
  return (
    <div className="app-shell">
      {/* Desktop: left sidebar */}
      <Sidebar isAdmin={isAdmin} />

      {/* Page content */}
      <main className="main-content">
        {/* Top bar with notification bell */}
        <div className="topbar">
          <div className="topbar-right">
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
