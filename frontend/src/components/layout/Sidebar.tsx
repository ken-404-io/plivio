import { NavLink, Link } from 'react-router-dom';
import { Flame } from 'lucide-react';
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
        {/* User card */}
        <div className="sidebar-user-card">
          <Link to="/profile" className="sidebar-user-avatar-wrap" aria-label="Profile">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="Profile" className="sidebar-user-avatar" />
            ) : (
              <div className="sidebar-user-avatar sidebar-user-avatar--initials">
                {user?.username?.[0]?.toUpperCase() ?? 'U'}
              </div>
            )}
          </Link>
          <div className="sidebar-user-meta">
            <span className="sidebar-user-name">{user?.username}</span>
            <Link to="/plans" className="sidebar-user-plan">
              {user?.plan ?? 'Free'}
            </Link>
          </div>
        </div>

        {/* Stats row */}
        <div className="sidebar-stats-row">
          <Link to="/coins" className="sidebar-stat-item" aria-label="Streak">
            <Flame size={14} className="sidebar-stat-flame" />
            <span className="sidebar-stat-value">{user?.streak_count ?? 0}</span>
            <span className="sidebar-stat-label">streak</span>
          </Link>
          <div className="sidebar-stat-divider" />
          <Link to="/earnings" className="sidebar-stat-item" aria-label="Balance">
            <span className="sidebar-stat-currency">₱</span>
            <span className="sidebar-stat-value">
              {Number(user?.balance ?? 0).toLocaleString('en-PH', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="sidebar-stat-label">earned</span>
          </Link>
        </div>

        <button className="btn btn-ghost btn-sm" onClick={logout}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
