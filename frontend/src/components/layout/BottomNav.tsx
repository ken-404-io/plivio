import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CheckSquare,
  ArrowUpCircle,
  Settings,
  Coins,
  Menu,
  DollarSign,
  Star,
  UserPlus,
  BadgeCheck,
  User,
  X,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../store/authStore.tsx';

type LucideIcon = React.ElementType;

interface NavItem {
  to:    string;
  label: string;
  Icon:  LucideIcon;
  desc?: string;
}

// Primary bottom-bar items (always visible)
const NAV_PRIMARY: NavItem[] = [
  { to: '/dashboard', label: 'Home',     Icon: LayoutDashboard },
  { to: '/tasks',     label: 'Tasks',    Icon: CheckSquare     },
  { to: '/coins',     label: 'Coins',    Icon: Coins           },
  { to: '/withdraw',  label: 'Withdraw', Icon: ArrowUpCircle   },
];

// Grouped menu items for the full-screen "Menu" page
const MENU_GROUPS: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { to: '/earnings',  label: 'Earnings',   Icon: DollarSign, desc: 'View your earnings history'  },
      { to: '/plans',     label: 'Plans',      Icon: Star,       desc: 'Upgrade your membership'     },
    ],
  },
  {
    items: [
      { to: '/referrals', label: 'Referrals',  Icon: UserPlus,   desc: 'Invite friends & earn'       },
      { to: '/kyc',       label: 'Verify ID',  Icon: BadgeCheck, desc: 'Complete identity check'     },
    ],
  },
  {
    items: [
      { to: '/profile',   label: 'Profile',    Icon: User,       desc: 'Manage your account'         },
    ],
  },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Admin', Icon: Settings },
];

interface BottomNavProps {
  isAdmin?: boolean;
}

export default function BottomNav({ isAdmin = false }: BottomNavProps) {
  const [showMenu, setShowMenu] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  if (isAdmin) {
    const item = ADMIN_ITEMS[0];
    return (
      <nav className="bottom-nav" aria-label="Mobile navigation">
        <NavLink
          to={item.to}
          className={({ isActive }) => `bottom-nav-item${isActive ? ' bottom-nav-item--active' : ''}`}
        >
          <span className="bottom-nav-icon"><item.Icon size={22} /></span>
          <span className="bottom-nav-label">{item.label}</span>
        </NavLink>
      </nav>
    );
  }

  function handleMenuItem(to: string) {
    setShowMenu(false);
    navigate(to);
  }

  return (
    <>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {NAV_PRIMARY.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `bottom-nav-item${isActive ? ' bottom-nav-item--active' : ''}`
            }
          >
            <span className="bottom-nav-icon"><Icon size={22} /></span>
            <span className="bottom-nav-label">{label}</span>
          </NavLink>
        ))}

        <button
          className={`bottom-nav-item${showMenu ? ' bottom-nav-item--active' : ''}`}
          onClick={() => setShowMenu((v) => !v)}
          aria-label="Open menu"
          aria-expanded={showMenu}
        >
          <span className="bottom-nav-icon"><Menu size={22} /></span>
          <span className="bottom-nav-label">Menu</span>
        </button>
      </nav>

      {/* Full-screen menu overlay */}
      {showMenu && (
        <div className="menu-screen">
          {/* Header */}
          <div className="menu-screen-header">
            <h2 className="menu-screen-title">Menu</h2>
            <button
              className="menu-screen-close"
              onClick={() => setShowMenu(false)}
              aria-label="Close menu"
            >
              <X size={22} />
            </button>
          </div>

          <div className="menu-screen-body">
            {/* User profile row */}
            <button
              className="menu-profile-row"
              onClick={() => handleMenuItem('/profile')}
            >
              <div className="menu-profile-avatar-wrap">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="Profile" className="menu-profile-avatar" />
                ) : (
                  <div className="menu-profile-avatar menu-profile-avatar--initials">
                    {user?.username?.[0]?.toUpperCase() ?? 'U'}
                  </div>
                )}
              </div>
              <div className="menu-profile-meta">
                <span className="menu-profile-name">{user?.username}</span>
                <span className="menu-profile-sub">
                  {user?.plan ? `${user.plan} plan` : 'Free plan'} · View profile
                </span>
              </div>
              <ChevronRight size={18} className="menu-row-chevron" />
            </button>

            {/* Nav groups */}
            {MENU_GROUPS.map((group, gi) => (
              <div key={gi} className="menu-group">
                {group.title && <span className="menu-group-title">{group.title}</span>}
                <div className="menu-group-card">
                  {group.items.map(({ to, label, Icon, desc }, ii) => (
                    <button
                      key={to}
                      className={`menu-row${ii < group.items.length - 1 ? ' menu-row--bordered' : ''}`}
                      onClick={() => handleMenuItem(to)}
                    >
                      <span className="menu-row-icon"><Icon size={20} /></span>
                      <div className="menu-row-body">
                        <span className="menu-row-label">{label}</span>
                        {desc && <span className="menu-row-desc">{desc}</span>}
                      </div>
                      <ChevronRight size={16} className="menu-row-chevron" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
