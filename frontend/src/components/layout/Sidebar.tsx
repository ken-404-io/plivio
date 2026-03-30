import { NavLink } from 'react-router-dom';
import { useAuth } from '../../store/authStore.tsx';

interface NavItem {
  to:    string;
  label: string;
  icon:  string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: '▦' },
  { to: '/tasks',     label: 'Tasks',     icon: '✓' },
  { to: '/earnings',  label: 'Earnings',  icon: '₱' },
  { to: '/withdraw',  label: 'Withdraw',  icon: '↑' },
  { to: '/plans',     label: 'Plans',     icon: '★' },
  { to: '/profile',   label: 'Profile',   icon: '◉' },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Admin Panel', icon: '⚙' },
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
