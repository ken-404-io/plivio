import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ListChecks,
  Banknote,
  ArrowUpFromLine,
  Star,
  UserPlus,
  ShieldCheck,
  UserCircle,
  Settings,
} from 'lucide-react';
import { useAuth } from '../../store/authStore.tsx';

interface NavItem {
  to:    string;
  label: string;
  icon:  React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard   size={18} /> },
  { to: '/tasks',     label: 'Tasks',     icon: <ListChecks        size={18} /> },
  { to: '/earnings',  label: 'Earnings',  icon: <Banknote          size={18} /> },
  { to: '/withdraw',  label: 'Withdraw',  icon: <ArrowUpFromLine   size={18} /> },
  { to: '/plans',     label: 'Plans',     icon: <Star              size={18} /> },
  { to: '/referrals', label: 'Referrals', icon: <UserPlus          size={18} /> },
  { to: '/kyc',       label: 'Verify ID', icon: <ShieldCheck       size={18} /> },
  { to: '/profile',   label: 'Profile',   icon: <UserCircle        size={18} /> },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Admin Panel', icon: <Settings size={18} /> },
];

interface SidebarProps {
  isAdmin?: boolean;
}

export default function Sidebar({ isAdmin = false }: SidebarProps) {
  const { user, logout } = useAuth();
  const items = isAdmin ? ADMIN_ITEMS : NAV_ITEMS;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-name">Plivio</span>
        <span className="brand-tagline">Get Paid To</span>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {items.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
          >
            <span className="nav-icon" aria-hidden="true">{icon}</span>
            <span className="nav-label">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <span className="user-name">{user?.username}</span>
          <span className={`plan-badge plan-badge--${user?.plan ?? 'free'}`}>
            {user?.plan?.toUpperCase() ?? 'FREE'}
          </span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={logout}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
