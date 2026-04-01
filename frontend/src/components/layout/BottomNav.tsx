import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CheckSquare,
  DollarSign,
  ArrowUpCircle,
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
  { to: '/dashboard', label: 'Home',     Icon: LayoutDashboard },
  { to: '/tasks',     label: 'Tasks',    Icon: CheckSquare     },
  { to: '/coins',     label: 'Coins',    Icon: Coins           },
  { to: '/earnings',  label: 'Earnings', Icon: DollarSign      },
  { to: '/withdraw',  label: 'Withdraw', Icon: ArrowUpCircle   },
  { to: '/profile',   label: 'Profile',  Icon: User            },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Admin', Icon: Settings },
];

interface BottomNavProps {
  isAdmin?: boolean;
}

export default function BottomNav({ isAdmin = false }: BottomNavProps) {
  const items = isAdmin ? ADMIN_ITEMS : NAV_ITEMS;

  return (
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {items.map(({ to, label, Icon }) => (
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
    </nav>
  );
}
