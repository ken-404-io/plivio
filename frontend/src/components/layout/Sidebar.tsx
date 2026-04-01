import { NavLink } from 'react-router-dom';
import { useAuth } from '../../store/authStore.tsx';
import {
  LayoutDashboard,
  CheckSquare,
  DollarSign,
  ArrowUpCircle,
  Star,
  UserPlus,
  BadgeCheck,
  User,
  Settings,
  Coins,
} from 'lucide-react';

type LucideIcon = React.ElementType;

interface NavItem {
  to:    string;
  label: string;
  Icon:  LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/tasks',     label: 'Tasks',     Icon: CheckSquare     },
  { to: '/earnings',  label: 'Earnings',  Icon: DollarSign      },
  { to: '/withdraw',  label: 'Withdraw',  Icon: ArrowUpCircle   },
  { to: '/coins',     label: 'Coins',     Icon: Coins           },
  { to: '/plans',     label: 'Plans',     Icon: Star            },
  { to: '/referrals', label: 'Referrals', Icon: UserPlus        },
  { to: '/kyc',       label: 'Verify ID', Icon: BadgeCheck      },
  { to: '/profile',   label: 'Profile',   Icon: User            },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Admin Panel', Icon: Settings },
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
        {items.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
          >
            <span className="nav-icon" aria-hidden="true"><Icon size={18} /></span>
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
