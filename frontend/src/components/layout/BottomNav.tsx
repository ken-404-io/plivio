import { NavLink } from 'react-router-dom';

interface NavItem {
  to:    string;
  label: string;
  icon:  string;
}

// Five core actions shown in the mobile bottom tab bar.
// Plans and Referrals remain accessible on desktop via the sidebar.
const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Home',     icon: '▦' },
  { to: '/tasks',     label: 'Tasks',    icon: '✓' },
  { to: '/earnings',  label: 'Earnings', icon: '₱' },
  { to: '/withdraw',  label: 'Withdraw', icon: '↑' },
  { to: '/profile',   label: 'Profile',  icon: '◉' },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Admin', icon: '⚙' },
];

interface BottomNavProps {
  isAdmin?: boolean;
}

export default function BottomNav({ isAdmin = false }: BottomNavProps) {
  const items = isAdmin ? ADMIN_ITEMS : NAV_ITEMS;

  return (
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {items.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `bottom-nav-item${isActive ? ' bottom-nav-item--active' : ''}`
          }
        >
          <span className="bottom-nav-icon" aria-hidden="true">{icon}</span>
          <span className="bottom-nav-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
