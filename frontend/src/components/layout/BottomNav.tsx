import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CheckSquare,
  ArrowUpCircle,
  User,
  Settings,
  Coins,
  MoreHorizontal,
  DollarSign,
  Star,
  UserPlus,
  BadgeCheck,
  X,
} from 'lucide-react';

type LucideIcon = React.ElementType;

interface NavItem {
  to:    string;
  label: string;
  Icon:  LucideIcon;
}

// Primary bottom-bar items (always visible)
const NAV_PRIMARY: NavItem[] = [
  { to: '/dashboard', label: 'Home',     Icon: LayoutDashboard },
  { to: '/tasks',     label: 'Tasks',    Icon: CheckSquare     },
  { to: '/coins',     label: 'Coins',    Icon: Coins           },
  { to: '/withdraw',  label: 'Withdraw', Icon: ArrowUpCircle   },
  { to: '/profile',   label: 'Profile',  Icon: User            },
];

// Overflow items shown in "More" drawer
const NAV_MORE: NavItem[] = [
  { to: '/earnings',  label: 'Earnings',  Icon: DollarSign  },
  { to: '/plans',     label: 'Plans',     Icon: Star        },
  { to: '/referrals', label: 'Referrals', Icon: UserPlus    },
  { to: '/kyc',       label: 'Verify ID', Icon: BadgeCheck  },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Admin', Icon: Settings },
];

interface BottomNavProps {
  isAdmin?: boolean;
}

export default function BottomNav({ isAdmin = false }: BottomNavProps) {
  const [showMore, setShowMore] = useState(false);
  const navigate = useNavigate();

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

  function handleMoreItem(to: string) {
    setShowMore(false);
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
          className={`bottom-nav-item${showMore ? ' bottom-nav-item--active' : ''}`}
          onClick={() => setShowMore((v) => !v)}
          aria-label="More navigation"
          aria-expanded={showMore}
        >
          <span className="bottom-nav-icon"><MoreHorizontal size={22} /></span>
          <span className="bottom-nav-label">More</span>
        </button>
      </nav>

      {/* More drawer */}
      {showMore && (
        <div className="more-drawer-overlay" onClick={() => setShowMore(false)}>
          <div className="more-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="more-drawer-header">
              <span className="more-drawer-title">More</span>
              <button
                className="more-drawer-close"
                onClick={() => setShowMore(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="more-drawer-grid">
              {NAV_MORE.map(({ to, label, Icon }) => (
                <button
                  key={to}
                  className="more-drawer-item"
                  onClick={() => handleMoreItem(to)}
                >
                  <span className="more-drawer-item-icon"><Icon size={24} /></span>
                  <span className="more-drawer-item-label">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
